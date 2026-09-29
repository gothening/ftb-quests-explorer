import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadQuestBook,
  validate
} from "../src/core/index.js";
import { buildViewerModel } from "../src/viewer/view-model.js";
import { collectAssetRefs } from "../src/viewer/resource-url.js";
import { createResourceResolver } from "../src/server/resource-resolver.js";
import { createItemResolver } from "../src/core/resolve/item-resolver.js";
import { nodeToJs } from "../src/core/parser/snbt.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instanceRoot = process.env.FTBQ_INSTANCE_ROOT
  ? path.resolve(process.env.FTBQ_INSTANCE_ROOT)
  : path.resolve(projectRoot, "..");
const questRoot = process.env.FTBQ_QUEST_ROOT
  ? path.resolve(process.env.FTBQ_QUEST_ROOT)
  : path.join(instanceRoot, "config", "ftbquests", "quests");
const sourceRoot = path.join(projectRoot, "source");
const sourceQuestRoot = path.join(sourceRoot, "quests");
const sourceAssetRoot = path.join(sourceRoot, "assets");
const locale = "zh_cn";
const fallbackLocale = "en_us";

function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside project: ${resolvedTarget}`);
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeAsset(relativePath, asset, records) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const target = path.resolve(sourceRoot, normalized);
  assertInside(sourceRoot, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, asset.data);
  }
  records.set(normalized, {
    path: normalized,
    bytes: asset.data.length,
    sha256: sha256(asset.data),
    kind: "asset"
  });
}

function copyQuestFiles(root, destination, records) {
  const walk = (directory, relativeDirectory = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      const target = path.join(destination, ...relative.split("/"));
      if (entry.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        walk(source, relative);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".snbt")) continue;
      const data = fs.readFileSync(source);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      const recordPath = `quests/${relative}`;
      records.set(recordPath, {
        path: recordPath,
        bytes: data.length,
        sha256: sha256(data),
        kind: "quest"
      });
    }
  };
  walk(root);
}

function itemKey(item) {
  if (!item?.id) return null;
  const customIcon = nodeToJs(item.getComponent?.("ftbquests:icon"));
  return `${item.id}|${typeof customIcon === "string" ? customIcon : ""}`;
}

function allItems(book) {
  const items = new Map();
  const add = (item) => {
    const key = itemKey(item);
    if (key && !items.has(key)) items.set(key, item);
  };
  for (const task of book.tasks) {
    add(task.icon);
    add(task.item);
  }
  for (const reward of book.rewards) {
    add(reward.icon);
    add(reward.item);
  }
  for (const table of book.rewardTables) {
    for (const entry of table.entries) {
      add(entry.reward.icon);
      add(entry.reward.item);
    }
  }
  for (const quest of book.quests) add(quest.icon);
  for (const chapter of book.chapters) add(chapter.icon);
  return [...items.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function assetRelativePath(namespace, resourcePath) {
  return path.posix.join("assets", namespace, resourcePath.replaceAll("\\", "/"));
}

function main() {
  assertInside(projectRoot, sourceRoot);
  if (!fs.existsSync(questRoot)) throw new Error(`Quest root not found: ${questRoot}`);

  fs.rmSync(sourceRoot, { recursive: true, force: true });
  fs.mkdirSync(sourceQuestRoot, { recursive: true });
  fs.mkdirSync(sourceAssetRoot, { recursive: true });

  const fileRecords = new Map();
  copyQuestFiles(questRoot, sourceQuestRoot, fileRecords);

  const book = loadQuestBook(questRoot, { locale });
  const validation = validate(book);
  const baseModel = buildViewerModel(book, validation, { locale });
  const liveResolver = createResourceResolver(instanceRoot, "1.21.1");
  const itemResolver = createItemResolver(liveResolver, {
    locale,
    fallbackLocale: book.data?.fallbackLocale ?? fallbackLocale
  });

  for (const ref of collectAssetRefs(baseModel)) {
    const asset = ref.kind === "item"
      ? liveResolver.resolveItemIcon(ref.ref)
      : liveResolver.resolveImage(ref.ref);
    if (!asset) continue;
    const parsed = ref.ref.includes(":")
      ? { namespace: ref.ref.slice(0, ref.ref.indexOf(":")), path: ref.ref.slice(ref.ref.indexOf(":") + 1) }
      : { namespace: "minecraft", path: ref.ref };
    if (ref.kind === "item") {
      const resolution = itemResolver.resolve(ref.ref);
      if (resolution.texture) {
        const textureAsset = liveResolver.resolveAsset(resolution.texture.namespace, resolution.texture.path);
        if (textureAsset) {
          writeAsset(assetRelativePath(resolution.texture.namespace, resolution.texture.path), textureAsset, fileRecords);
        }
      }
      continue;
    }
    const normalizedPath = parsed.path.startsWith("textures/") || parsed.path.startsWith("icons/")
      ? parsed.path
      : `textures/${parsed.path}`;
    writeAsset(assetRelativePath(parsed.namespace, normalizedPath.toLowerCase().endsWith(".png") ? normalizedPath : `${normalizedPath}.png`), asset, fileRecords);
  }

  const itemRecords = allItems(book);
  const itemIds = [...new Set(itemRecords.map((item) => item.id))].sort();
  const itemManifest = [];
  for (const item of itemRecords) {
    const itemId = item.id;
    const resolution = itemResolver.resolve(item);
    for (const model of resolution.models ?? []) {
      const asset = liveResolver.resolveAsset(model.namespace, model.path);
      if (asset) writeAsset(assetRelativePath(model.namespace, model.path), asset, fileRecords);
    }
    if (resolution.texture) {
      const asset = liveResolver.resolveAsset(resolution.texture.namespace, resolution.texture.path);
      if (asset) writeAsset(assetRelativePath(resolution.texture.namespace, resolution.texture.path), asset, fileRecords);
    }
    itemManifest.push({
      itemId,
      namespace: resolution.namespace,
      sourceMod: resolution.sourceMod,
      provenance: resolution.sourceMod ? `jar:${resolution.sourceMod}` : "resource-pack-or-unknown",
      resourceType: resolution.sourceType ?? "item",
      modelPath: resolution.modelPath,
      modelPaths: resolution.modelPaths,
      texturePath: resolution.texturePath,
      displayName: resolution.displayName,
      nameSource: resolution.nameSource,
      translationKey: resolution.translationKey,
      iconRef: resolution.iconRef ?? null,
      status: resolution.status,
      reason: resolution.reason,
      license: resolution.sourceMod === "minecraft" ? "minecraft-eula" : "unresolved-license"
    });
  }

  const namespaces = [...new Set(itemIds.map((itemId) => itemId.split(":")[0] ?? "minecraft"))].sort();
  for (const namespace of namespaces) {
    for (const languageLocale of ["zh_cn", "en_us", "ja_jp", "zh_tw", "ko_kr", "ru_ru"]) {
      const languagePath = `lang/${languageLocale}.json`;
      const asset = liveResolver.resolveAsset(namespace, languagePath);
      if (asset) writeAsset(assetRelativePath(namespace, languagePath), asset, fileRecords);
    }
  }

  const sourceFiles = [...fileRecords.values()].sort((left, right) => left.path.localeCompare(right.path));
  const resolved = itemManifest.filter((entry) => entry.status === "resolved").length;
  const missing = itemManifest.filter((entry) => entry.status === "missing").length;
  const invalid = itemManifest.filter((entry) => entry.status === "invalid").length;
  const manifest = {
    generatedAt: new Date().toISOString(),
    minecraftVersion: "1.21.1",
    ftbQuestsVersion: baseModel.metadata.ftbQuestsVersion ?? null,
    sourceInstance: path.basename(instanceRoot),
    sourceQuestRoot: "source/quests",
    locale,
    files: sourceFiles,
    statistics: {
      snbtFiles: book.metadata.fileCount,
      chapters: book.metadata.counts.chapters,
      quests: book.metadata.counts.quests,
      tasks: book.metadata.counts.tasks,
      rewards: book.metadata.counts.rewards,
      questLinks: book.metadata.counts.questLinks,
      rewardTables: book.metadata.counts.rewardTables,
      translations: [...book.translations.values()].reduce((sum, table) => sum + table.size, 0)
    },
    assets: {
      items: itemManifest.length,
      resolved,
      missing,
      invalid,
      files: sourceFiles.filter((entry) => entry.kind === "asset").length
    }
  };

  writeJson(path.join(sourceRoot, "manifest.json"), manifest);
  writeJson(path.join(sourceAssetRoot, "manifest.json"), {
    generatedAt: manifest.generatedAt,
    sourceInstance: manifest.sourceInstance,
    items: itemManifest
  });

  console.log(JSON.stringify({
    sourceRoot,
    statistics: manifest.statistics,
    assets: manifest.assets,
    itemNamespaces: Object.fromEntries(
      namespaces.map((namespace) => [
        namespace,
        itemManifest.filter((item) => item.namespace === namespace).length
      ])
    ),
    missing: missing,
    invalid: invalid
  }, null, 2));
}

main();
