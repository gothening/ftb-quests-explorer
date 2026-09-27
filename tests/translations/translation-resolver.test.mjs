import test from "node:test";
import assert from "node:assert/strict";
import { MinecraftText } from "../../src/core/model/minecraft-text.js";
import {
  TranslationResolver,
  TranslationTable
} from "../../src/core/model/translation.js";
import { loadRealFixture, loadSyntheticFixture } from "../helpers.mjs";

test("resolves model text from the Chinese language table without replacing the key", () => {
  const book = loadRealFixture();
  const chapter = book.getChapter("0B07EB66101F01B1");
  assert.equal(chapter.title.translationKey, "chapter.0B07EB66101F01B1.title");
  assert.equal(chapter.title.resolvedText.plainText, "元素周期表");
  assert.equal(chapter.title.translationKey.includes("元素周期表"), false);
});

test("falls back from requested locale to fallback locale and then to the raw key", () => {
  const tables = new Map([
    ["en_us", new TranslationTable("en_us", new Map([
      ["demo.title", { value: "Fallback title", node: null }]
    ]))]
  ]);
  const resolver = new TranslationResolver(tables, "en_us");
  assert.equal(resolver.resolve("demo.title", "zh_cn"), "Fallback title");
  assert.equal(resolver.resolve("missing.title", "zh_cn"), "missing.title");
});

test("keeps JSON text structure instead of flattening it irreversibly", () => {
  const raw = "[\"\", { \"text\": \"悬赏板\", \"color\": \"green\", \"underlined\": true, \"clickEvent\": { \"action\": \"change_page\", \"value\": \"ABC\" } }]";
  const text = new MinecraftText(raw);
  assert.equal(text.kind, "json");
  assert.equal(text.plainText, "悬赏板");
  assert.equal(Array.isArray(text.json), true);
  assert.equal(text.clickEvent.action, "change_page");
  assert.equal(text.raw, raw);
});

test("translation resolver is available through the synthetic book", () => {
  const book = loadSyntheticFixture();
  const quest = book.getQuest("3333333333333333");
  assert.equal(quest.title.text, "Root Quest");
  assert.equal(quest.description.resolvedText.kind, "lines");
  assert.equal(quest.description.resolvedText.plainText.includes("中文测试"), true);
});
