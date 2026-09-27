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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  : path.resolve(projectRoot, "..", "config", "ftbquests", "quests");
const instanceRoot = process.env.FTBQ_INSTANCE_ROOT
  ? path.resolve(process.env.FTBQ_INSTANCE_ROOT)
  : inferInstanceRoot(questRoot);

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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripOfflineOnlyFields(model) {
  for (const quest of model.quests) {
    delete quest.raw;
    delete quest.rawSnbt;
    for (const task of quest.tasks) {
      delete task.raw;
      delete task.rawSnbt;
      if (task.item) delete task.item.raw;
    }
    for (const reward of quest.rewards) {
      delete reward.raw;
      if (reward.item) delete reward.item.raw;
    }
  }
  for (const link of model.questLinks) delete link.raw;
  for (const image of model.images) delete image.raw;
  for (const table of model.rewardTables) {
    for (const entry of table.entries) {
      delete entry.reward.raw;
      if (entry.reward.item) delete entry.reward.item.raw;
    }
  }
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
const model = buildViewerModel(book, validation, { locale: "zh_cn" });
stripOfflineOnlyFields(model);
const resolver = createResourceResolver(
  model.metadata.instanceRoot ?? instanceRoot,
  model.metadata.minecraftVersion
);

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
    ? resolver.resolveItemIcon(asset.ref)
    : resolver.resolveImage(asset.ref);
  const data = resolved ?? resolver.fallbackImage();
  assetMap[`${asset.kind}:${asset.ref}`] = writeAsset(data);
}

const fallback = writeAsset(resolver.fallbackImage());
const manifest = {
  generatedAt: new Date().toISOString(),
  dataVersion: book.data?.version ?? null,
  ftbQuestsVersion: model.metadata.ftbQuestsVersion ?? null,
  minecraftVersion: model.metadata.minecraftVersion ?? "1.21.1",
  sourceInstance: path.basename(instanceRoot),
  sourceQuestRoot: path.relative(instanceRoot, questRoot).split(path.sep).join("/"),
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

writeJson(path.join(outputRoot, "view-model.json"), model);
writeJson(path.join(outputRoot, "manifest.json"), manifest);
writeJson(path.join(outputRoot, "asset-map.json"), {
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
