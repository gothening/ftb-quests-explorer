import test from "node:test";
import assert from "node:assert/strict";
import { DependencyGraph } from "../../src/core/graph/dependency-graph.js";
import { normalizeId } from "../../src/core/model/common.js";
import { validate } from "../../src/core/validator/validator.js";
import { loadActualBook, loadSyntheticFixture } from "../helpers.mjs";

test("real data produces structural validation errors for known broken references", () => {
  const book = loadActualBook();
  const result = validate(book);
  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((issue) => issue.code === "MISSING_DEPENDENCY").length, 2);
  assert.equal(result.errors.some((issue) => issue.code === "CIRCULAR_DEPENDENCY"), false);
});

test("unknown task and reward types are warnings, not parser failures", () => {
  const book = loadSyntheticFixture();
  const result = validate(book);
  assert.equal(result.warnings.some((issue) => issue.code === "UNKNOWN_TASK_TYPE"), true);
  assert.equal(result.warnings.some((issue) => issue.code === "UNKNOWN_REWARD_TYPE"), true);
});

function fakeCyclicBook() {
  const quests = [
    { id: "AAAAAAAAAAAAAAAA", dependencies: ["BBBBBBBBBBBBBBBB"], chapterId: "C1", sourceFile: "a.snbt", tasks: [], rewards: [] },
    { id: "BBBBBBBBBBBBBBBB", dependencies: ["AAAAAAAAAAAAAAAA"], chapterId: "C1", sourceFile: "b.snbt", tasks: [], rewards: [] }
  ];
  const questById = new Map(quests.map((quest) => [normalizeId(quest.id), quest]));
  const book = {
    questById,
    chapters: [],
    chapterGroups: [],
    quests,
    tasks: [],
    rewards: [],
    questLinks: [],
    images: [],
    rewardTables: [],
    dependencyGraph: null,
    getGroup: () => null,
    getQuest: (id) => questById.get(normalizeId(id)) ?? null,
    getRewardTable: () => null
  };
  book.dependencyGraph = new DependencyGraph(book);
  return book;
}

test("circular dependencies are validator errors, not parse exceptions", () => {
  const result = validate(fakeCyclicBook());
  assert.equal(result.errors.some((issue) => issue.code === "CIRCULAR_DEPENDENCY"), true);
});

test("duplicate IDs are reported", () => {
  const book = {
    chapters: [],
    chapterGroups: [],
    quests: [
      { id: "AAAAAAAAAAAAAAAA", sourceFile: "a.snbt", dependencies: [], tasks: [], rewards: [] },
      { id: "AAAAAAAAAAAAAAAA", sourceFile: "b.snbt", dependencies: [], tasks: [], rewards: [] }
    ],
    tasks: [],
    rewards: [],
    questLinks: [],
    images: [],
    rewardTables: [],
    dependencyGraph: new DependencyGraph({ quests: [], questById: new Map() }),
    getGroup: () => null,
    getQuest: () => null,
    getRewardTable: () => null
  };
  const result = validate(book);
  assert.equal(result.errors.some((issue) => issue.code === "DUPLICATE_ID"), true);
});
