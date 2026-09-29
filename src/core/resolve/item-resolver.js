import {
  resolveItemIconDetailed
} from "./model-resolver.js";
import {
  createItemNameResolver
} from "./item-name-resolver.js";
import { nodeToJs } from "../parser/snbt.js";

function normalizeImageRef(ref) {
  const value = String(ref ?? "").trim();
  if (!value) return null;
  const colon = value.indexOf(":");
  const namespace = colon < 0 ? "minecraft" : value.slice(0, colon);
  const originalPath = (colon < 0 ? value : value.slice(colon + 1)).replace(/^\/+/, "");
  const pathValue = originalPath.startsWith("textures/")
    ? originalPath
    : `textures/${originalPath}`;
  return {
    namespace,
    path: pathValue.toLowerCase().endsWith(".png") ? pathValue : `${pathValue}.png`,
    ref: `${namespace}:${pathValue.toLowerCase().endsWith(".png") ? pathValue : `${pathValue}.png`}`
  };
}

function sourceModFromAsset(source) {
  if (!source) return null;
  const value = String(source);
  const modMatch = value.match(/(?:^|[\\/])mods[\\/](.+?\.jar)!/i);
  if (modMatch) return modMatch[1];
  if (/(?:^|[\\/])1\.21\.1\.jar!/i.test(value)) return "minecraft";
  if (/[\\/]assets[\\/]objects[\\/]/i.test(value)) return "minecraft";
  if (value.includes("!")) return value.split("!")[0].split(/[\\/]/).pop() || null;
  return value.split(/[\\/]/).pop() || null;
}

export class ItemResolver {
  constructor(assetResolver, options = {}) {
    this.assetResolver = assetResolver;
    this.nameResolver = createItemNameResolver(assetResolver, options);
    this.iconCache = new Map();
  }

  customIcon(itemOrId) {
    if (!itemOrId || typeof itemOrId !== "object") return null;
    const node = itemOrId.getComponent?.("ftbquests:icon");
    const ref = nodeToJs(node);
    if (typeof ref !== "string" || !ref.trim()) return null;
    const normalized = normalizeImageRef(ref);
    if (!normalized) return null;
    const asset = this.assetResolver.resolveImage?.(ref) ?? null;
    return {
      itemId: itemOrId.id,
      namespace: normalized.namespace,
      itemPath: normalized.path,
      displayName: null,
      nameSource: "component",
      status: asset ? "resolved" : "missing",
      reason: asset ? null : "component icon asset not found",
      sourceType: "component-icon",
      sourceMod: sourceModFromAsset(asset?.source),
      sourceAsset: asset?.source ?? null,
      modelPath: null,
      modelPaths: [],
      models: [],
      texturePath: normalized.ref,
      texture: normalized,
      textureKey: "ftbquests:icon",
      iconRef: ref,
      asset
    };
  }

  resolve(itemOrId) {
    const itemId = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
    if (!itemId) {
      return {
        itemId: "",
        status: "invalid",
        reason: "missing item id",
        displayName: "",
        namespace: null
      };
    }

    const componentIcon = this.customIcon(itemOrId);
    if (componentIcon) return componentIcon;

    const cached = this.iconCache.get(itemId);
    const icon = cached ?? resolveItemIconDetailed(this.assetResolver, itemId);
    if (!cached) this.iconCache.set(itemId, icon);
    const name = this.nameResolver.resolve(itemOrId);

    return {
      itemId,
      namespace: icon.namespace ?? itemId.split(":")[0] ?? "minecraft",
      itemPath: icon.itemPath ?? itemId.split(":").slice(1).join(":"),
      displayName: name.displayName,
      nameSource: name.source,
      nameLocale: name.locale ?? null,
      translationKey: name.translationKey ?? null,
      componentId: name.componentId ?? null,
      status: icon.status,
      reason: icon.reason ?? null,
      sourceType: icon.sourceType ?? null,
      sourceMod: sourceModFromAsset(icon.asset?.source),
      sourceAsset: icon.asset?.source ?? null,
      modelPath: icon.modelPath ?? null,
      modelPaths: icon.modelPaths ?? [],
      models: icon.models ?? [],
      texturePath: icon.texturePath ?? null,
      texture: icon.texture ?? null,
      textureKey: icon.textureKey ?? null,
      asset: icon.asset ?? null
    };
  }

  resolveIcon(itemId) {
    return this.resolve(itemId).asset;
  }
}

export function createItemResolver(assetResolver, options = {}) {
  return new ItemResolver(assetResolver, options);
}
