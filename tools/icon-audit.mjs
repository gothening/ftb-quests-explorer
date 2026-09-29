import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadQuestBook,
  validate
} from "../src/core/index.js";
import { createResourceResolver } from "../src/server/resource-resolver.js";
import { createItemResolver } from "../src/core/resolve/item-resolver.js";
import { nodeToJs } from "../src/core/parser/snbt.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "source");
const sourceQuestRoot = path.join(sourceRoot, "quests");
const reportRoot = path.join(projectRoot, "reports");
const reportPath = path.join(reportRoot, "icon-audit.json");

if (!fs.existsSync(sourceQuestRoot)) {
  throw new Error(`Source quests are missing: ${sourceQuestRoot}. Run npm run sync:source first.`);
}

const book = loadQuestBook(sourceQuestRoot, { locale: "zh_cn" });
const validation = validate(book);
const sourceManifestPath = path.join(sourceRoot, "manifest.json");
const sourceManifest = fs.existsSync(sourceManifestPath)
  ? JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"))
  : {};
const resolver = createResourceResolver(
  sourceRoot,
  sourceManifest.minecraftVersion ?? "1.21.1",
  { assetRoots: [sourceRoot] }
);
const itemResolver = createItemResolver(resolver, {
  locale: "zh_cn",
  fallbackLocale: book.data?.fallbackLocale ?? "en_us"
});

function ownerKey(item) {
  const itemId = typeof item === "string" ? item : item?.id;
  if (!itemId) return null;
  const customIcon = typeof item === "object" ? nodeToJs(item.getComponent?.("ftbquests:icon")) : null;
  return `${itemId}|${typeof customIcon === "string" ? customIcon : ""}`;
}

function addOwner(map, item, field, id, context = {}) {
  const itemId = typeof item === "string" ? item : item?.id;
  if (!itemId) return;
  const key = ownerKey(item);
  const entry = map.get(key) ?? {
    itemId,
    item,
    taskIds: [],
    rewardIds: [],
    questIds: [],
    chapterIds: [],
    tableIds: []
  };
  entry[field].push(id);
  if (context.questId) entry.questIds.push(context.questId);
  if (context.chapterId) entry.chapterIds.push(context.chapterId);
  if (context.tableId) entry.tableIds.push(context.tableId);
  map.set(key, entry);
}

const owners = new Map();
for (const task of book.tasks) {
  const quest = book.getQuest(task.questId);
  addOwner(owners, task.icon ?? task.item, "taskIds", task.id, {
    questId: task.questId,
    chapterId: quest?.chapterId ?? null
  });
}
for (const reward of book.rewards) {
  const quest = book.getQuest(reward.questId);
  addOwner(owners, reward.icon ?? reward.item, "rewardIds", reward.id, {
    questId: reward.questId,
    chapterId: quest?.chapterId ?? null
  });
}
for (const table of book.rewardTables) {
  for (const entry of table.entries) {
    addOwner(owners, entry.reward.icon ?? entry.reward.item, "rewardIds", entry.reward.id, { tableId: table.id });
  }
}
for (const quest of book.quests) {
  addOwner(owners, quest.icon, "questIds", quest.id, { chapterId: quest.chapterId });
}
for (const chapter of book.chapters) {
  addOwner(owners, chapter.icon, "chapterIds", chapter.id);
}

const items = [...owners.values()]
  .sort((left, right) => left.itemId.localeCompare(right.itemId))
  .map((owner) => {
    const resolution = itemResolver.resolve(owner.item);
    return {
      itemId: owner.itemId,
      taskIds: [...new Set(owner.taskIds)].sort(),
      rewardIds: [...new Set(owner.rewardIds)].sort(),
      questIds: [...new Set(owner.questIds)].sort(),
      chapterIds: [...new Set(owner.chapterIds)].sort(),
      tableIds: [...new Set(owner.tableIds)].sort(),
      displayName: resolution.displayName,
      nameSource: resolution.nameSource,
      translationKey: resolution.translationKey,
      namespace: resolution.namespace,
      sourceMod: resolution.sourceMod,
      iconRef: resolution.iconRef ?? null,
      model: resolution.modelPath,
      models: resolution.modelPaths,
      texture: resolution.texturePath,
      status: resolution.status,
      sourceType: resolution.sourceType,
      reason: resolution.reason
    };
  });

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
}

const summary = {
  generatedAt: new Date().toISOString(),
  sourceInstance: sourceManifest.sourceInstance ?? null,
  ftbQuestsVersion: sourceManifest.ftbQuestsVersion ?? null,
  referencedItems: items.length,
  uniqueItemIds: new Set(items.map((item) => item.itemId)).size,
  resolved: items.filter((item) => item.status === "resolved").length,
  missing: items.filter((item) => item.status === "missing").length,
  invalid: items.filter((item) => item.status === "invalid").length,
  modelsResolved: items.filter((item) => Boolean(item.model)).length,
  modelsMissing: items.filter((item) => !item.model).length,
  texturesResolved: items.filter((item) => Boolean(item.texture)).length,
  texturesMissing: items.filter((item) => !item.texture).length,
  namespaces: countBy(items.map((item) => item.namespace ?? "unknown")),
  missingByNamespace: countBy(items.filter((item) => item.status !== "resolved").map((item) => item.namespace ?? "unknown"))
};

fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ summary, items }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  report: reportPath,
  summary,
  missingSample: items.filter((item) => item.status !== "resolved").slice(0, 20)
}, null, 2));
