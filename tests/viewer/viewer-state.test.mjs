import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../../src/core/validator/validator.js";
import { buildViewerModel } from "../../src/viewer/view-model.js";
import { ViewerState } from "../../src/viewer/viewer-state.js";
import { loadActualBook } from "../helpers.mjs";

function state() {
  const book = loadActualBook();
  return new ViewerState(buildViewerModel(book, validate(book), { locale: "zh_cn" }));
}

test("chapter navigation and quest selection work from view state", () => {
  const viewer = state();
  const chapter = viewer.model.chapters[1];
  viewer.selectChapter(chapter.id);
  assert.equal(viewer.currentChapterId, chapter.id);
  const quest = viewer.model.quests.find((entry) => entry.chapterId === chapter.id);
  assert.equal(viewer.selectQuest(quest.id), true);
  assert.equal(viewer.selectedQuestId, quest.id);
  assert.equal(viewer.selectedQuest.chapterId, chapter.id);
});

test("dependency navigation jumps to a cross-chapter target", () => {
  const viewer = state();
  const crossEdge = viewer.model.edges.find((edge) => edge.crossChapter);
  assert.equal(Boolean(crossEdge), true);
  viewer.selectChapter(crossEdge.fromChapterId);
  viewer.selectQuest(crossEdge.from);
  assert.equal(viewer.selectDependency(crossEdge.to), true);
  assert.equal(viewer.selectedQuestId, crossEdge.to);
  assert.equal(viewer.currentChapterId, crossEdge.toChapterId);
});

test("search state is global and can select a result target", () => {
  const viewer = state();
  viewer.setSearch("进入末地");
  assert.equal(viewer.searchResults.length > 0, true);
  const questResult = viewer.searchResults.find((result) => result.kind === "quest");
  assert.equal(Boolean(questResult), true);
  viewer.selectQuest(questResult.questId);
  assert.equal(viewer.selectedQuestId, questResult.questId);
});

test("diagnostic selection can navigate to a broken dependency source", () => {
  const viewer = state();
  const issue = viewer.diagnostics.errors.find((entry) => entry.code === "MISSING_DEPENDENCY");
  assert.equal(Boolean(issue), true);
  viewer.selectDiagnostic(issue);
  assert.equal(viewer.selectedQuestId, issue.questId);
  assert.equal(viewer.currentChapterId, issue.chapterId);
});
