import test from "node:test";
import assert from "node:assert/strict";
import { normalizeId } from "../../src/core/model/common.js";
import { DependencyGraph } from "../../src/core/graph/dependency-graph.js";
import { loadActualBook, loadSyntheticFixture } from "../helpers.mjs";

function fakeBook(quests) {
  const questById = new Map(quests.map((quest) => [normalizeId(quest.id), quest]));
  return { quests, questById };
}

test("builds global dependency and dependent indexes", () => {
  const graph = new DependencyGraph(fakeBook([
    { id: "A", dependencies: ["B"], chapterId: "C1", sourceFile: "a.snbt" },
    { id: "B", dependencies: ["C"], chapterId: "C2", sourceFile: "b.snbt" },
    { id: "C", dependencies: [], chapterId: "C2", sourceFile: "c.snbt" }
  ]));
  assert.equal(graph.getDependencies("A")[0].id, "B");
  assert.equal(graph.getDependents("B")[0].id, "A");
  assert.equal(graph.getCrossChapterDependencies().length, 1);
  assert.deepEqual(graph.findCircularDependencies(), []);
});

test("detects a dependency cycle without failing graph construction", () => {
  const graph = new DependencyGraph(fakeBook([
    { id: "A", dependencies: ["B"], chapterId: "C1", sourceFile: "a.snbt" },
    { id: "B", dependencies: ["C"], chapterId: "C1", sourceFile: "b.snbt" },
    { id: "C", dependencies: ["A"], chapterId: "C1", sourceFile: "c.snbt" }
  ]));
  const cycles = graph.findCircularDependencies();
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 4);
  assert.equal(cycles[0][0], cycles[0][cycles[0].length - 1]);
});

test("reports missing dependencies and cross-chapter edges on real data", () => {
  const book = loadActualBook();
  const graph = book.dependencyGraph;
  assert.equal(graph.findMissingDependencies().length, 2);
  assert.equal(graph.getCrossChapterDependencies().length, 14);
  assert.equal(graph.getRootQuests().length > 0, true);
  assert.equal(graph.getLeafQuests().length > 0, true);
});

test("synthetic merge quest has multiple dependencies", () => {
  const book = loadSyntheticFixture();
  const dependencies = book.dependencyGraph.getDependencies("6666666666666666");
  assert.deepEqual(dependencies.map((quest) => quest.id), [
    "4444444444444444",
    "5555555555555555"
  ]);
});
