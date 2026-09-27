import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../../src/core/validator/validator.js";
import { buildViewerModel } from "../../src/viewer/view-model.js";
import {
  createSearchIndex,
  searchViewer
} from "../../src/viewer/search.js";
import { loadActualBook } from "../helpers.mjs";

function index() {
  const book = loadActualBook();
  return createSearchIndex(buildViewerModel(book, validate(book), { locale: "zh_cn" }));
}

test("search finds translated chapter and quest titles", () => {
  const results = searchViewer(index(), "元素周期表");
  assert.equal(results.some((result) => result.kind === "chapter"), true);
});

test("search finds task types and item IDs across chapters", () => {
  const results = searchViewer(index(), "forge_energy", 50);
  assert.equal(results.some((result) => result.kind === "task" && result.label === "forge_energy"), true);
  assert.equal(results.every((result) => result.chapterId), true);
});

test("search finds translation keys and mod/item identifiers", () => {
  const translation = searchViewer(index(), "quest.07443A3474907A5A.title", 20);
  assert.equal(translation.some((result) => result.kind === "translation"), true);

  const item = searchViewer(index(), "minecraft:diamond", 20);
  assert.equal(item.length > 0, true);
});

test("search across all chapters can locate a result with chapter and quest context", () => {
  const results = searchViewer(index(), "进入末地", 20);
  const first = results.find((result) => result.kind === "quest");
  assert.equal(Boolean(first), true);
  assert.equal(Boolean(first.chapterId), true);
  assert.equal(Boolean(first.questId), true);
});
