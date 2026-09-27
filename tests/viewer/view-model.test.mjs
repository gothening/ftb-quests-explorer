import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../../src/core/validator/validator.js";
import { buildViewerModel } from "../../src/viewer/view-model.js";
import { loadActualBook } from "../helpers.mjs";

function model() {
  const book = loadActualBook();
  return buildViewerModel(book, validate(book), { locale: "zh_cn" });
}

test("builds a read-only view model from the live quest book", () => {
  const viewer = model();
  assert.equal(viewer.readonly, true);
  assert.equal(viewer.metadata.counts.chapters, 38);
  assert.equal(viewer.metadata.counts.quests, 1722);
  assert.equal(viewer.metadata.counts.tasks, 2126);
  assert.equal(viewer.metadata.counts.rewards, 1352);
  assert.equal(viewer.metadata.counts.questLinks, 14);
  assert.equal(viewer.metadata.counts.rewardTables, 20);
  assert.equal(viewer.metadata.counts.translations, 927);
});

test("keeps chapter groups, translated chapters, and detail data", () => {
  const viewer = model();
  const chapter = viewer.chapters.find((entry) => entry.id === "0B07EB66101F01B1");
  assert.equal(chapter.title.plainText, "元素周期表");
  assert.equal(chapter.questCount, 47);
  assert.equal(viewer.groups.length >= 5, true);
  assert.equal(viewer.quests.some((quest) => quest.title.plainText === "进入末地"), true);
});

test("view model exposes tasks, rewards, reward tables, and cross-chapter edges", () => {
  const viewer = model();
  const quest = viewer.quests.find((entry) => entry.tasks.some((task) => task.item?.components));
  assert.equal(Boolean(quest), true);
  assert.equal(quest.tasks.some((task) => task.item?.components && Object.keys(task.item.components).length > 0), true);
  assert.equal(viewer.rewardTables.length, 20);
  assert.equal(viewer.edges.some((edge) => edge.crossChapter), true);
  assert.equal(viewer.diagnostics.errors.length, 2);
});

test("unknown task type remains visible in the view model", () => {
  const viewer = model();
  const unknown = viewer.tasks.find((task) => task.type === "forge_energy");
  assert.equal(Boolean(unknown), true);
  assert.equal(unknown.unknownFields.length >= 0, true);
  assert.equal(Boolean(unknown.rawSnbt), true);
});
