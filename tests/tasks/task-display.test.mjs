import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  loadQuestBook,
  validate
} from "../../src/core/index.js";
import {
  createResourceResolver
} from "../../src/server/resource-resolver.js";
import {
  createItemResolver
} from "../../src/core/resolve/item-resolver.js";
import {
  buildViewerModel
} from "../../src/viewer/view-model.js";
import {
  createSearchIndex,
  searchViewer
} from "../../src/viewer/search.js";
import {
  projectRoot
} from "../helpers.mjs";

const sourceRoot = path.join(projectRoot, "source");
const questRoot = path.join(sourceRoot, "quests");

function viewerModel() {
  const book = loadQuestBook(questRoot, { locale: "zh_cn" });
  const assets = createResourceResolver(sourceRoot, "1.21.1", { assetRoots: [sourceRoot] });
  const itemResolver = createItemResolver(assets, {
    locale: "zh_cn",
    fallbackLocale: book.data?.fallbackLocale ?? "en_us"
  });
  return buildViewerModel(book, validate(book), {
    locale: "zh_cn",
    itemResolver,
    metadata: {
      instanceRoot: null,
      minecraftVersion: "1.21.1",
      ftbQuestsVersion: "2101.1.34"
    }
  });
}

test("ordinary item task display name comes from the item, not the task id", () => {
  const model = viewerModel();
  const task = model.tasks.find((entry) => entry.type === "item" && entry.item && !entry.hasCustomTitle);
  assert.ok(task);
  assert.equal(task.title, null);
  assert.equal(task.displayName, task.item.resolution.displayName);
  assert.notEqual(task.displayName, task.id);
  assert.notEqual(task.displayName, task.item.id);
});

test("explicit custom task and reward titles remain authoritative", () => {
  const model = viewerModel();
  const task = model.tasks.find((entry) => entry.hasCustomTitle && entry.title?.plainText);
  const reward = model.rewards.find((entry) => entry.hasCustomTitle && entry.title?.plainText);
  assert.ok(task);
  assert.ok(reward);
  assert.equal(task.title.plainText.startsWith("task."), false);
  assert.equal(reward.title.plainText.startsWith("reward."), false);
});

test("search indexes item display names and item ids together", () => {
  const model = viewerModel();
  const index = createSearchIndex(model);
  const task = model.tasks.find((entry) => entry.item?.resolution?.displayName);
  assert.ok(task);
  const byName = searchViewer(index, task.item.resolution.displayName, 50);
  const byId = searchViewer(index, task.item.id, 50);
  assert.equal(byName.some((result) => result.kind === "task"), true);
  assert.equal(byId.some((result) => result.kind === "task"), true);
});

test("unknown task types keep a visible fallback without inventing an item name", () => {
  const model = viewerModel();
  const task = model.tasks.find((entry) => entry.type === "forge_energy");
  assert.ok(task);
  assert.equal(task.title, null);
  assert.equal(task.displayName, "forge_energy");
});
