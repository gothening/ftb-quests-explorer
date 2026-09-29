import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadQuestBook,
  validate
} from "../src/core/index.js";
import {
  buildViewerModel
} from "../src/viewer/view-model.js";
import {
  collectAssetRefs
} from "../src/viewer/resource-url.js";
import {
  createResourceResolver
} from "../src/server/resource-resolver.js";
import {
  createItemResolver
} from "../src/core/resolve/item-resolver.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "source");
const outputRoot = path.join(projectRoot, "public", "demo");
const cliArgs = new Set(process.argv.slice(2));
const reuseExisting = cliArgs.has("--reuse-existing");

function inferInstanceRoot(questRoot) {
  const resolved = path.resolve(questRoot);
  if (
    path.basename(resolved) === "quests"
    && path.basename(path.dirname(resolved)) === "ftbquests"
  ) {
    return path.resolve(resolved, "..", "..", "..");
  }
  return path.resolve(projectRoot, "..");
}

const questRoot = process.env.FTBQ_QUEST_ROOT
  ? path.resolve(process.env.FTBQ_QUEST_ROOT)
  : path.join(sourceRoot, "quests");
const instanceRoot = process.env.FTBQ_INSTANCE_ROOT
  ? path.resolve(process.env.FTBQ_INSTANCE_ROOT)
  : sourceRoot;

function directoryBytes(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? directoryBytes(target) : fs.statSync(target).size;
  }
  return total;
}

function readExistingDemo() {
  const requiredFiles = [
    path.join(outputRoot, "manifest.json"),
    path.join(outputRoot, "view-model.json"),
    path.join(outputRoot, "asset-map.json")
  ];
  const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`Existing Online Demo data is incomplete: ${missing.join(", ")}`);
  }

  const manifest = JSON.parse(fs.readFileSync(requiredFiles[0], "utf8"));
  const jsonBytes = requiredFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
  const assetsRoot = path.join(outputRoot, "assets");
  const assetFiles = fs.existsSync(assetsRoot)
    ? fs.readdirSync(assetsRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).length
    : 0;
  const assetBytes = fs.existsSync(assetsRoot) ? directoryBytes(assetsRoot) : 0;

  return {
    outputRoot,
    manifest,
    jsonBytes,
    assetFiles,
    assetBytes,
    totalBytes: jsonBytes + assetBytes,
    reusedExisting: true
  };
}

function readSourceManifest() {
  const filePath = path.join(sourceRoot, "manifest.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readSourceAssetManifest() {
  const filePath = path.join(sourceRoot, "assets", "manifest.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(manifest.items) ? manifest.items : [];
  } catch {
    return [];
  }
}

function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside project: ${resolvedTarget}`);
  }
}

function extensionForMime(mime) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  return ".png";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonCompact(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function stripOfflineOnlyFields(model) {
  for (const quest of model.quests) {
    delete quest.raw;
    delete quest.rawSnbt;
    for (const task of quest.tasks) {
      delete task.raw;
      delete task.rawSnbt;
      if (task.item) delete task.item.raw;
      if (task.icon) delete task.icon.raw;
    }
    for (const reward of quest.rewards) {
      delete reward.raw;
      if (reward.item) delete reward.item.raw;
      if (reward.icon) delete reward.icon.raw;
    }
  }
  for (const link of model.questLinks) delete link.raw;
  for (const image of model.images) delete image.raw;
  for (const table of model.rewardTables) {
    for (const entry of table.entries) {
      delete entry.reward.raw;
      if (entry.reward.item) delete entry.reward.item.raw;
      if (entry.reward.icon) delete entry.reward.icon.raw;
    }
  }
}

function applySourceProvenance(item) {
  const resolution = item?.resolution;
  if (!resolution?.itemId) return;
  const sourceEntry = sourceAssetByKey.get(`${resolution.itemId}|${resolution.iconRef ?? ""}`)
    ?? sourceAssetByKey.get(`${resolution.itemId}|`);
  if (!sourceEntry) return;
  resolution.status = sourceEntry.status ?? resolution.status;
  resolution.reason = sourceEntry.reason ?? resolution.reason;
  resolution.sourceType = sourceEntry.resourceType ?? resolution.sourceType;
  resolution.sourceMod = sourceEntry.sourceMod ?? resolution.sourceMod;
  resolution.modelPath = sourceEntry.modelPath ?? resolution.modelPath;
  resolution.modelPaths = sourceEntry.modelPaths ?? resolution.modelPaths;
  resolution.texturePath = sourceEntry.texturePath ?? resolution.texturePath;
  resolution.license = sourceEntry.license ?? null;
}

function enrichModelSourceProvenance(model) {
  for (const task of model.tasks) {
    applySourceProvenance(task.item);
    applySourceProvenance(task.icon);
  }
  for (const reward of model.rewards) {
    applySourceProvenance(reward.item);
    applySourceProvenance(reward.icon);
  }
  for (const table of model.rewardTables) {
    for (const entry of table.entries) {
      applySourceProvenance(entry.reward.item);
      applySourceProvenance(entry.reward.icon);
    }
  }
  for (const quest of model.quests) applySourceProvenance(quest.icon);
  for (const chapter of model.chapters) applySourceProvenance(chapter.icon);
}

assertInside(projectRoot, outputRoot);
if (!fs.existsSync(questRoot)) {
  if (reuseExisting) {
    console.log(JSON.stringify(readExistingDemo(), null, 2));
    process.exit(0);
  }
  throw new Error(
    `Quest root not found: ${questRoot}. Set FTBQ_QUEST_ROOT or use --reuse-existing with committed demo data.`
  );
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(outputRoot, "assets"), { recursive: true });

const book = loadQuestBook(questRoot, { locale: "zh_cn" });
if (book.metadata.parseErrors.length > 0) {
  throw new Error(`Quest data contains parse errors: ${JSON.stringify(book.metadata.parseErrors)}`);
}
const validation = validate(book);
const sourceManifest = readSourceManifest();
const sourceAssetItems = readSourceAssetManifest();
const sourceAssetByKey = new Map(sourceAssetItems.map((item) => [
  `${item.itemId}|${item.iconRef ?? ""}`,
  item
]));
const assetResolver = createResourceResolver(
  sourceRoot,
  sourceManifest?.minecraftVersion ?? "1.21.1",
  { assetRoots: [sourceRoot] }
);
const itemResolver = createItemResolver(assetResolver, {
  locale: "zh_cn",
  fallbackLocale: book.data?.fallbackLocale ?? "en_us"
});
const model = buildViewerModel(book, validation, {
  locale: "zh_cn",
  itemResolver,
  metadata: {
    instanceRoot: null,
    minecraftVersion: sourceManifest?.minecraftVersion ?? "1.21.1",
    ftbQuestsVersion: sourceManifest?.ftbQuestsVersion ?? null
  }
});
enrichModelSourceProvenance(model);
stripOfflineOnlyFields(model);

const assetMap = {};
const writtenAssets = new Map();
let assetBytes = 0;
function writeAsset(asset) {
  const hash = crypto.createHash("sha256").update(asset.data).digest("hex").slice(0, 24);
  const extension = extensionForMime(asset.mime);
  const filename = `${hash}${extension}`;
  const relativePath = `assets/${filename}`;
  const target = path.join(outputRoot, relativePath);
  if (!writtenAssets.has(filename)) {
    fs.writeFileSync(target, asset.data);
    writtenAssets.set(filename, asset.data.length);
    assetBytes += asset.data.length;
  }
  return relativePath;
}

for (const asset of collectAssetRefs(model)) {
  const resolved = asset.kind === "item"
    ? assetResolver.resolveItemIcon(asset.ref)
    : assetResolver.resolveImage(asset.ref);
  const data = resolved ?? assetResolver.fallbackImage();
  assetMap[`${asset.kind}:${asset.ref}`] = writeAsset(data);
}

const fallback = writeAsset(assetResolver.fallbackImage());
const itemEntries = new Map();
function addItemEntry(item) {
  if (!item?.id) return;
  const resolved = item.resolution ?? itemResolver.resolve(item);
  const sourceEntry = sourceAssetByKey.get(`${item.id}|${resolved.iconRef ?? ""}`)
    ?? sourceAssetByKey.get(`${item.id}|`);
  const resolution = sourceEntry
    ? {
      ...resolved,
      displayName: sourceEntry.displayName ?? resolved.displayName,
      status: sourceEntry.status ?? resolved.status,
      reason: sourceEntry.reason ?? resolved.reason,
      sourceType: sourceEntry.resourceType ?? resolved.sourceType,
      sourceMod: sourceEntry.sourceMod ?? resolved.sourceMod,
      modelPath: sourceEntry.modelPath ?? resolved.modelPath,
      modelPaths: sourceEntry.modelPaths ?? resolved.modelPaths,
      texturePath: sourceEntry.texturePath ?? resolved.texturePath
    }
    : resolved;
  const key = resolution.iconRef
    ? `${item.id}|${resolution.iconRef}`
    : item.id;
  if (!itemEntries.has(key)) {
    itemEntries.set(key, {
      item,
      resolution,
      sourceEntry: sourceEntry ?? null,
      taskIds: [],
      rewardIds: [],
      questIds: [],
      chapterIds: []
    });
  }
  return itemEntries.get(key);
}

for (const task of model.tasks) {
  const entry = addItemEntry(task.icon ?? task.item);
  if (entry) entry.taskIds.push(task.id);
}
for (const reward of model.rewards) {
  const entry = addItemEntry(reward.icon ?? reward.item);
  if (entry) entry.rewardIds.push(reward.id);
}
for (const table of model.rewardTables) {
  for (const entry of table.entries) {
    const itemEntry = addItemEntry(entry.reward.icon ?? entry.reward.item);
    if (itemEntry) itemEntry.rewardIds.push(entry.reward.id);
  }
}
for (const quest of model.quests) {
  const entry = addItemEntry(quest.icon);
  if (entry) entry.questIds.push(quest.id);
}
for (const chapter of model.chapters) {
  const entry = addItemEntry(chapter.icon);
  if (entry) entry.chapterIds.push(chapter.id);
}
const itemManifest = [];
for (const entry of [...itemEntries.values()].sort((left, right) => left.item.id.localeCompare(right.item.id))) {
  const { item, resolution } = entry;
  const iconPath = resolution.iconRef
    ? assetMap[`image:${resolution.iconRef}`]
    : assetMap[`item:${item.id}`];
  itemManifest.push({
    itemId: item.id,
    displayName: resolution.displayName,
    iconPath: iconPath ?? fallback,
    status: resolution.status,
    source: resolution.sourceType ?? null,
    namespace: resolution.namespace ?? null,
    sourceMod: resolution.sourceMod ?? null,
    modelPath: resolution.modelPath ?? null,
    modelPaths: resolution.modelPaths ?? [],
    texturePath: resolution.texturePath ?? null,
    reason: resolution.reason ?? null,
    license: entry.sourceEntry?.license ?? null,
    taskIds: [...new Set(entry.taskIds)].sort(),
    rewardIds: [...new Set(entry.rewardIds)].sort(),
    questIds: [...new Set(entry.questIds)].sort(),
    chapterIds: [...new Set(entry.chapterIds)].sort()
  });
}
const generatedAt = new Date().toISOString();
writeJsonCompact(path.join(outputRoot, "items", "manifest.json"), {
  generatedAt,
  items: itemManifest
});
const manifest = {
  generatedAt,
  dataVersion: book.data?.version ?? null,
  ftbQuestsVersion: sourceManifest?.ftbQuestsVersion ?? model.metadata.ftbQuestsVersion ?? null,
  minecraftVersion: sourceManifest?.minecraftVersion ?? model.metadata.minecraftVersion ?? "1.21.1",
  sourceInstance: sourceManifest?.sourceInstance ?? path.basename(instanceRoot),
  sourceQuestRoot: "source/quests",
  locale: "zh_cn",
  snbtFiles: book.metadata.fileCount,
  chapters: model.chapters.length,
  quests: model.quests.length,
  tasks: model.tasks.length,
  rewards: model.rewards.length,
  questLinks: model.questLinks.length,
  rewardTables: model.rewardTables.length,
  translations: model.metadata.counts.translations,
  assets: Object.keys(assetMap).length,
  itemResolution: {
    items: itemManifest.length,
    resolved: itemManifest.filter((entry) => entry.status === "resolved").length,
    missing: itemManifest.filter((entry) => entry.status === "missing").length,
    invalid: itemManifest.filter((entry) => entry.status === "invalid").length
  },
  validation: {
    errors: validation.errors.length,
    warnings: validation.warnings.length,
    infos: validation.infos.length
  }
};

model.metadata.root = "demo";
model.metadata.instanceRoot = null;
model.metadata.sourceInstance = manifest.sourceInstance;
model.metadata.generatedAt = manifest.generatedAt;
model.metadata.snbtFiles = manifest.snbtFiles;

writeJsonCompact(path.join(outputRoot, "view-model.json"), model);
writeJson(path.join(outputRoot, "manifest.json"), manifest);
writeJsonCompact(path.join(outputRoot, "asset-map.json"), {
  generatedAt: manifest.generatedAt,
  missing: fallback,
  assets: assetMap
});

const jsonBytes = [
  fs.statSync(path.join(outputRoot, "view-model.json")).size,
  fs.statSync(path.join(outputRoot, "manifest.json")).size,
  fs.statSync(path.join(outputRoot, "asset-map.json")).size
].reduce((sum, value) => sum + value, 0);

console.log(JSON.stringify({
  outputRoot,
  manifest,
  jsonBytes,
  assetFiles: writtenAssets.size,
  assetBytes,
  totalBytes: jsonBytes + assetBytes
}, null, 2));
