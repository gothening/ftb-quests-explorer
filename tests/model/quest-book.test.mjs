import test from "node:test";
import assert from "node:assert/strict";
import {
  loadActualBook,
  loadRealFixture,
  loadSyntheticFixture,
  syntheticFixture
} from "../helpers.mjs";
import {
  FtbQuests2101Adapter,
  FtbQuestsVersionAdapter
} from "../../src/core/adapter/ftb-quests-2101-adapter.js";

test("loads the real fixture into a global QuestBook model", () => {
  const book = loadRealFixture();
  assert.equal(book.metadata.parseErrors.length, 0);
  assert.equal(book.chapters.length, 4);
  assert.equal(book.quests.length, 74);
  assert.equal(book.tasks.length, 93);
  assert.equal(book.rewards.length, 39);
  assert.equal(book.chapterGroups.length, 5);
  assert.equal(book.rewardTables.length, 1);
  assert.equal(book.questById.size, book.quests.length);
  assert.equal(book.taskById.size, book.tasks.length);
  assert.equal(book.rewardById.size, book.rewards.length);
  assert.equal(book.getChapter("0B07EB66101F01B1").title.text, "元素周期表");
});

test("loads synthetic links, images, unknown fields, and unknown types", () => {
  const book = loadSyntheticFixture();
  assert.equal(book.chapters.length, 1);
  assert.equal(book.quests.length, 5);
  assert.equal(book.tasks.length, 6);
  assert.equal(book.rewards.length, 6);
  assert.equal(book.questLinks.length, 1);
  assert.equal(book.images.length, 1);
  assert.equal(book.rewardTables.length, 1);

  const root = book.getQuest("3333333333333333");
  assert.equal(root.unknownFields.has("future_quest_field"), true);
  assert.equal(root.tasks[0].type, "item");
  assert.equal(root.tasks[0].item.componentIds.includes("futuremod:component"), true);

  const merge = book.getQuest("6666666666666666");
  assert.equal(merge.tasks[0].type, "future_task_type");
  assert.equal(merge.rewards[0].type, "future_reward_type");

  const chapter = book.getChapter("2222222222222222");
  assert.equal(chapter.unknownFields.has("future_chapter_field"), true);
  assert.equal(book.questLinks[0].unknownFields.has("future_link_field"), true);
  assert.equal(book.images[0].unknownFields.has("future_image_field"), true);
});

test("loads the full real quest directory with global indexes", () => {
  const book = loadActualBook();
  assert.equal(book.chapters.length, 38);
  assert.equal(book.chapterGroups.length, 5);
  assert.equal(book.rewardTables.length, 20);
  assert.equal(book.quests.length, 1722);
  assert.equal(book.tasks.length, 2126);
  assert.equal(book.rewards.length, 1352);
  assert.equal(book.questLinks.length, 14);
  assert.equal(book.images.length, 0);
  assert.equal(book.metadata.parseErrors.length, 0);
  assert.equal(book.dependencyGraph.findMissingDependencies().length, 2);
  assert.equal(book.dependencyGraph.getCrossChapterDependencies().length, 12);
  assert.equal(
    book.getRewardTable("1038066006360480407").id,
    "0E67F3886A865A97"
  );
  const lootReward = book.rewards.find((reward) => reward.type === "loot" && reward.tableId);
  assert.equal(Boolean(lootReward), true);
  assert.equal(Boolean(book.getRewardTable(lootReward.tableId)), true);
});

test("model file references are strings, not cyclic file objects", () => {
  const book = loadRealFixture();
  for (const quest of book.quests) {
    assert.equal(typeof quest.sourceFile, "string");
    assert.notEqual(quest.sourceFile, "");
    assert.equal(quest.raw.__file, undefined);
  }
});

test("version adapter detects data version 13 and delegates loading", () => {
  const adapter = new FtbQuests2101Adapter();
  assert.equal(adapter.canLoad(syntheticFixture), true);
  assert.equal(adapter.load(syntheticFixture).data.version, 13);
  assert.equal(new FtbQuestsVersionAdapter().detect(syntheticFixture).id, "ftbquests-2101");
});
