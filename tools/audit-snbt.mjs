import fs from "node:fs";
import path from "node:path";
import {
  isBoolean,
  isCompound as isAstCompound,
  isList as isAstList,
  isNumber,
  isString,
  isTypedArray,
  parseSnbt
} from "../src/core/parser/snbt.js";

const root = process.argv[2];
if (!root) {
  console.error("usage: node tools/audit-snbt.mjs <quests-directory>");
  process.exit(2);
}

const summary = {
  root: path.resolve(root),
  counts: {
    files: 0,
    parsed: 0,
    chapters: 0,
    quests: 0,
    tasks: 0,
    rewards: 0,
    questLinks: 0,
    images: 0,
    chapterGroups: 0,
    rewardTables: 0,
    rewardTableEntries: 0,
    langEntries: 0,
    typedArrays: 0,
    chaptersWithEmbeddedTitle: 0,
    chaptersWithEmbeddedSubtitle: 0,
    questsWithEmbeddedTitle: 0,
    questsWithEmbeddedSubtitle: 0,
    questsWithEmbeddedDescription: 0
  },
  errors: [],
  dataKeys: {},
  chapterKeys: {},
  questKeys: {},
  taskKeys: {},
  rewardKeys: {},
  linkKeys: {},
  imageKeys: {},
  groupKeys: {},
  taskTypes: {},
  rewardTypes: {},
  itemKeys: {},
  componentIds: {},
  typedArrayTypes: {},
  langValueKinds: {},
  langKeyPrefixes: {}
};

function bump(target, key) {
  const normalized = key == null ? "<missing>" : String(key);
  target[normalized] = (target[normalized] || 0) + 1;
}

function toLegacy(value) {
  if (isAstCompound(value)) {
    const result = {};
    for (const [key, child] of value.entries) result[key] = toLegacy(child);
    return result;
  }
  if (isAstList(value)) return value.values.map(toLegacy);
  if (isTypedArray(value)) {
    return {
      __snbt: "typed_array",
      type: value.elementType,
      value: value.values.map(toLegacy)
    };
  }
  if (isNumber(value)) {
    return {
      __snbt: "number",
      value: value.value,
      suffix: value.suffix,
      raw: value.raw
    };
  }
  if (isString(value)) return value.value;
  if (isBoolean(value)) return value.value;
  return null;
}

function isCompound(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    value.__snbt !== "number" && value.__snbt !== "typed_array";
}

function visitItem(value) {
  if (!isCompound(value)) return;
  for (const key of Object.keys(value)) bump(summary.itemKeys, key);
  if (isCompound(value.components)) {
    for (const id of Object.keys(value.components)) bump(summary.componentIds, id);
  }
}

function visitQuest(quest) {
  if (!isCompound(quest)) return;
  summary.counts.quests++;
  for (const key of Object.keys(quest)) bump(summary.questKeys, key);
  if (Object.hasOwn(quest, "title")) summary.counts.questsWithEmbeddedTitle++;
  if (Object.hasOwn(quest, "subtitle")) summary.counts.questsWithEmbeddedSubtitle++;
  if (Object.hasOwn(quest, "description")) summary.counts.questsWithEmbeddedDescription++;

  for (const task of quest.tasks || []) {
    summary.counts.tasks++;
    for (const key of Object.keys(task)) bump(summary.taskKeys, key);
    bump(summary.taskTypes, task.type);
    visitItem(task.item);
  }
  for (const reward of quest.rewards || []) {
    summary.counts.rewards++;
    for (const key of Object.keys(reward)) bump(summary.rewardKeys, key);
    bump(summary.rewardTypes, reward.type);
    visitItem(reward.item);
  }
}

function visitValue(value) {
  if (value?.__snbt === "typed_array") {
    summary.counts.typedArrays++;
    bump(summary.typedArrayTypes, value.type);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) visitValue(child);
    return;
  }
  if (isCompound(value)) {
    for (const child of Object.values(value)) visitValue(child);
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".snbt")) continue;

    summary.counts.files++;
    const relative = path.relative(root, fullPath).replaceAll("\\", "/");
    const text = fs.readFileSync(fullPath, "utf8");
    let value;
    try {
      value = toLegacy(parseSnbt(text));
      summary.counts.parsed++;
    } catch (error) {
      summary.errors.push({ file: relative, error: String(error.message || error) });
      continue;
    }

    if (!isCompound(value)) continue;
    visitValue(value);

    if (relative.startsWith("lang/")) {
      for (const [key, entryValue] of Object.entries(value)) {
        summary.counts.langEntries++;
        const prefix = key.split(".")[0];
        bump(summary.langKeyPrefixes, prefix);
        bump(summary.langValueKinds, Array.isArray(entryValue) ? "list" : typeof entryValue);
      }
      continue;
    }

    if (relative === "data.snbt") {
      for (const key of Object.keys(value)) bump(summary.dataKeys, key);
      continue;
    }

    if (relative === "chapter_groups.snbt") {
      summary.counts.chapterGroups = (value.chapter_groups || []).length;
      for (const group of value.chapter_groups || []) {
        for (const key of Object.keys(group)) bump(summary.groupKeys, key);
      }
      continue;
    }

    if (relative.startsWith("chapters/")) {
      summary.counts.chapters++;
      summary.counts.questLinks += (value.quest_links || []).length;
      summary.counts.images += (value.images || []).length;
    } else if (relative.startsWith("reward_tables/")) {
      summary.counts.rewardTables++;
    }

    if (relative.startsWith("chapters/")) {
      if (Object.hasOwn(value, "title")) summary.counts.chaptersWithEmbeddedTitle++;
      if (Object.hasOwn(value, "subtitle")) summary.counts.chaptersWithEmbeddedSubtitle++;
      for (const key of Object.keys(value)) bump(summary.chapterKeys, key);
      for (const quest of value.quests || []) visitQuest(quest);
      for (const link of value.quest_links || []) {
        for (const key of Object.keys(link)) bump(summary.linkKeys, key);
      }
      for (const image of value.images || []) {
        for (const key of Object.keys(image)) bump(summary.imageKeys, key);
      }
    }

    for (const tableEntry of value.entries || []) {
      if (!isCompound(tableEntry)) continue;
      summary.counts.rewardTableEntries++;
      bump(summary.rewardKeys, "reward_table_entry");
      bump(summary.rewardTypes, tableEntry.type);
      visitItem(tableEntry.item);
    }
    for (const tableEntry of value.rewards || []) {
      if (!isCompound(tableEntry)) continue;
      summary.counts.rewardTableEntries++;
      for (const key of Object.keys(tableEntry)) bump(summary.rewardKeys, key);
      visitItem(tableEntry.item);
    }
  }
}

walk(root);

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

for (const key of [
  "dataKeys", "chapterKeys", "questKeys", "taskKeys", "rewardKeys",
  "linkKeys", "imageKeys", "groupKeys", "taskTypes", "rewardTypes",
  "itemKeys", "componentIds", "typedArrayTypes", "langValueKinds", "langKeyPrefixes"
]) {
  summary[key] = sortObject(summary[key]);
}

const output = `${JSON.stringify(summary, null, 2)}\n`;
const outIndex = process.argv.indexOf("--out");
if (outIndex >= 0 && process.argv[outIndex + 1]) {
  fs.writeFileSync(process.argv[outIndex + 1], output);
  console.log(JSON.stringify(summary.counts, null, 2));
  if (summary.errors.length > 0) console.log(JSON.stringify({ errors: summary.errors }, null, 2));
} else {
  console.log(output);
}
