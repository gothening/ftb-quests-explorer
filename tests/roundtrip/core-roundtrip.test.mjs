import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSnbt,
  semanticEquals,
  serializeSnbt
} from "../../src/core/parser/snbt.js";
import {
  serializeChapter,
  serializeQuestBook,
  serializeRewardTable
} from "../../src/core/serializer/ftbq-writer.js";
import {
  actualQuestRoot,
  loadActualBook,
  loadRealFixture,
  loadSyntheticFixture,
  realFixture,
  syntheticFixture
} from "../helpers.mjs";

function listSnbtFiles(root) {
  const output = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.toLowerCase().endsWith(".snbt")) output.push(fullPath);
    }
  };
  walk(root);
  return output;
}

function assertFileRoundtrip(root) {
  const files = listSnbtFiles(root);
  assert.equal(files.length > 0, true);
  for (const file of files) {
    const first = parseSnbt(fs.readFileSync(file, "utf8"));
    const second = parseSnbt(serializeSnbt(first));
    assert.equal(semanticEquals(first, second), true, `roundtrip failed: ${file}`);
  }
  return files.length;
}

test("real fixture files pass semantic roundtrip", () => {
  assert.equal(assertFileRoundtrip(realFixture), 9);
});

test("synthetic fixture files pass semantic roundtrip", () => {
  assert.equal(assertFileRoundtrip(syntheticFixture), 5);
});

test("full real quest directory passes semantic roundtrip", () => {
  assert.equal(assertFileRoundtrip(actualQuestRoot), 62);
});

test("QuestBook serializer preserves every loaded AST semantically", () => {
  const book = loadRealFixture();
  assert.equal(typeof serializeChapter(book.chapters[0]), "string");
  assert.equal(typeof serializeRewardTable(book.rewardTables[0]), "string");
  const output = serializeQuestBook(book);
  for (const [relativePath, text] of output) {
    const original = book.files.get(relativePath).ast;
    const reparsed = parseSnbt(text);
    assert.equal(semanticEquals(reparsed, original), true, `serialized model mismatch: ${relativePath}`);
  }
});

test("full real QuestBook can be loaded and serialized without count loss", () => {
  const book = loadActualBook();
  const output = serializeQuestBook(book);
  assert.equal(output.size, 62);
  const reparsed = [...output.entries()].map(([relativePath, text]) => [
    relativePath,
    parseSnbt(text)
  ]);
  assert.equal(reparsed.length, 62);
  assert.equal(book.quests.length, 1914);
  assert.equal(book.tasks.length, 2356);
  assert.equal(book.rewards.length, 1335);
});

test("synthetic unknown fields and item components survive model serialization", () => {
  const book = loadSyntheticFixture();
  const output = serializeQuestBook(book);
  const chapterText = output.get("chapters/2222222222222222.snbt");
  assert.equal(chapterText.includes("future_chapter_field"), true);
  assert.equal(chapterText.includes("futuremod:component"), true);
  assert.equal(chapterText.includes("future_task_type"), true);
  assert.equal(chapterText.includes("future_reward_type"), true);
});

test("explicit model sync writes edited coordinates while preserving unknown fields", () => {
  const book = loadSyntheticFixture();
  const quest = book.getQuest("3333333333333333");
  quest.x = 9.5;
  const output = serializeQuestBook(book, { syncModel: true });
  const reparsed = parseSnbt(output.get("chapters/2222222222222222.snbt"));
  const reparsedQuest = reparsed.get("quests").values.find((entry) => entry.get("id").value === "3333333333333333");
  assert.equal(reparsedQuest.get("x").value, 9.5);
  assert.equal(reparsedQuest.get("future_quest_field").has("escaped_unicode"), true);
});
