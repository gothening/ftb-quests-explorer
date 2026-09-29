const TEXTURE_KEY_ORDER = [
  "layer0",
  "texture",
  "all",
  "front",
  "side",
  "top",
  "end"
];

function parseResourceRef(ref, defaultNamespace = "minecraft") {
  const value = String(ref ?? "").trim();
  if (!value) return null;
  const colon = value.indexOf(":");
  if (colon < 0) {
    return {
      namespace: defaultNamespace,
      path: value.replace(/^\/+/, "")
    };
  }
  return {
    namespace: value.slice(0, colon).toLowerCase(),
    path: value.slice(colon + 1).replace(/^\/+/, "")
  };
}

function withPng(pathValue) {
  const value = String(pathValue ?? "").replace(/^\/+/, "");
  return value.toLowerCase().endsWith(".png") ? value : `${value}.png`;
}

function modelCandidates(modelPath) {
  const normalized = String(modelPath ?? "")
    .replace(/^\/+/, "")
    .replace(/\.json$/i, "");
  if (!normalized) return [];
  if (normalized.startsWith("models/")) return [`${normalized}.json`];
  return [
    `models/item/${normalized}.json`,
    `models/block/${normalized}.json`,
    `models/${normalized}.json`
  ];
}

function modelRefKey(namespace, modelPath) {
  return `${namespace}:${modelPath}`;
}

function readModel(assetResolver, namespace, modelPath) {
  for (const candidate of modelCandidates(modelPath)) {
    const model = assetResolver.readJsonAsset(namespace, candidate);
    if (model) {
      return {
        namespace,
        path: candidate.replace(/^models\//, "").replace(/\.json$/i, ""),
        assetPath: candidate,
        model
      };
    }
  }
  return null;
}

export function resolveModelGraph(assetResolver, namespace, modelRef, seen = new Set()) {
  const parsed = parseResourceRef(modelRef, namespace);
  if (!parsed) return null;
  if (parsed.path.startsWith("builtin/")) {
    return { builtin: true, models: [], textures: {}, root: null };
  }

  const key = modelRefKey(parsed.namespace, parsed.path);
  if (seen.has(key) || seen.size > 64) return null;
  seen.add(key);

  const root = readModel(assetResolver, parsed.namespace, parsed.path);
  if (!root) return null;

  const parentRef = root.model?.parent;
  let parent = null;
  if (typeof parentRef === "string") {
    const parsedParent = parseResourceRef(parentRef, parsed.namespace);
    parent = parsedParent?.path.startsWith("builtin/")
      ? { builtin: true, models: [], textures: {}, root: null }
      : resolveModelGraph(assetResolver, parsedParent?.namespace ?? parsed.namespace, parentRef, seen);
  }

  return {
    builtin: Boolean(parent?.builtin),
    models: [
      ...(parent?.models ?? []),
      root
    ],
    textures: {
      ...(parent?.textures ?? {}),
      ...(root.model?.textures ?? {})
    },
    root
  };
}

function resolveTextureRef(assetResolver, ref, textures, defaultNamespace, seen = new Set()) {
  if (typeof ref !== "string" || !ref) return null;
  if (ref.startsWith("#")) {
    const variable = ref.slice(1);
    if (seen.has(variable) || seen.size > 64) return null;
    seen.add(variable);
    return resolveTextureRef(assetResolver, textures[variable], textures, defaultNamespace, seen);
  }

  const parsed = parseResourceRef(ref, defaultNamespace);
  if (!parsed) return null;
  const texturePath = parsed.path.startsWith("textures/")
    ? parsed.path
    : `textures/${parsed.path}`;
  const assetPath = withPng(texturePath);
  const asset = assetResolver.resolveAsset(parsed.namespace, assetPath);
  if (!asset) return null;
  return {
    namespace: parsed.namespace,
    path: assetPath,
    assetPath,
    asset
  };
}

function textureKeys(textures) {
  const keys = Object.keys(textures);
  const numeric = keys
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
  const preferred = [
    ...TEXTURE_KEY_ORDER.filter((key) => key in textures),
    ...numeric,
    ...(keys.includes("particle") ? ["particle"] : []),
    ...keys.filter((key) => !TEXTURE_KEY_ORDER.includes(key) && !numeric.includes(key) && key !== "particle")
  ];
  return [...new Set(preferred)];
}

export function resolveModelTexture(assetResolver, graph) {
  if (!graph?.textures) return null;
  for (const key of textureKeys(graph.textures)) {
    const resolved = resolveTextureRef(
      assetResolver,
      graph.textures[key],
      graph.textures,
      graph.root?.namespace ?? "minecraft"
    );
    if (resolved) return { key, ...resolved };
  }
  return null;
}

function directTexture(assetResolver, namespace, itemPath) {
  const candidates = [
    `textures/item/${itemPath}.png`,
    `textures/block/${itemPath}.png`
  ];
  for (const candidate of candidates) {
    const asset = assetResolver.resolveAsset(namespace, candidate);
    if (asset) return { path: candidate, asset };
  }
  return null;
}

function definitionModelRef(assetResolver, namespace, itemPath) {
  const definition = assetResolver.readJsonAsset(namespace, `items/${itemPath}.json`);
  if (!definition) return null;
  const model = definition.model;
  if (model && typeof model === "object") {
    return model.model ?? model.base ?? null;
  }
  return definition.parent ?? null;
}

export function resolveItemIconDetailed(assetResolver, itemId) {
  const parsed = parseResourceRef(itemId);
  if (!parsed?.path) {
    return {
      itemId,
      status: "invalid",
      reason: "item id is empty"
    };
  }

  const definitionRef = definitionModelRef(assetResolver, parsed.namespace, parsed.path);
  const modelRef = definitionRef ?? parsed.path;
  const graph = resolveModelGraph(assetResolver, parsed.namespace, modelRef);
  if (graph) {
    const texture = resolveModelTexture(assetResolver, graph);
    if (texture) {
      return {
        itemId,
        namespace: parsed.namespace,
        itemPath: parsed.path,
        status: "resolved",
        sourceType: "model",
        modelPath: graph.root?.assetPath ?? null,
        modelPaths: graph.models.map((entry) => `${entry.namespace}:${entry.assetPath}`),
        models: graph.models.map((entry) => ({ namespace: entry.namespace, path: entry.assetPath })),
        texturePath: `${texture.namespace}:${texture.assetPath}`,
        texture: { namespace: texture.namespace, path: texture.assetPath },
        textureKey: texture.key,
        asset: texture.asset
      };
    }

    const fallback = directTexture(assetResolver, parsed.namespace, parsed.path);
    if (fallback) {
      return {
        itemId,
        namespace: parsed.namespace,
        itemPath: parsed.path,
        status: "resolved",
        sourceType: "texture-fallback",
        modelPath: graph.root?.assetPath ?? null,
        modelPaths: graph.models.map((entry) => `${entry.namespace}:${entry.assetPath}`),
        models: graph.models.map((entry) => ({ namespace: entry.namespace, path: entry.assetPath })),
        texturePath: `${parsed.namespace}:${fallback.path}`,
        texture: { namespace: parsed.namespace, path: fallback.path },
        asset: fallback.asset,
        reason: graph.builtin ? "builtin model has a direct texture" : "model has no usable texture"
      };
    }

    return {
      itemId,
      namespace: parsed.namespace,
      itemPath: parsed.path,
      status: "missing",
      modelPath: graph.root?.assetPath ?? null,
      modelPaths: graph.models.map((entry) => `${entry.namespace}:${entry.assetPath}`),
      models: graph.models.map((entry) => ({ namespace: entry.namespace, path: entry.assetPath })),
      reason: graph.builtin
        ? "builtin model requires runtime rendering"
        : "model has no static texture reference"
    };
  }

  const fallback = directTexture(assetResolver, parsed.namespace, parsed.path);
  if (fallback) {
    return {
      itemId,
      namespace: parsed.namespace,
      itemPath: parsed.path,
      status: "resolved",
      sourceType: "texture",
      texturePath: `${parsed.namespace}:${fallback.path}`,
      texture: { namespace: parsed.namespace, path: fallback.path },
      asset: fallback.asset
    };
  }

  return {
    itemId,
    namespace: parsed.namespace,
    itemPath: parsed.path,
    status: "missing",
    reason: "model and texture not found"
  };
}
