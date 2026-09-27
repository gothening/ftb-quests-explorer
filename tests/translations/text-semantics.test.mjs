import test from "node:test";
import assert from "node:assert/strict";
import { Task } from "../../src/core/model/task.js";
import { Reward } from "../../src/core/model/reward.js";
import { Quest } from "../../src/core/model/quest.js";
import {
  TranslationResolver,
  TranslationTable
} from "../../src/core/model/translation.js";
import {
  SnbtString,
  parseSnbt
} from "../../src/core/parser/snbt.js";
import {
  renderMinecraftText,
  setMissingTranslationDiagnostics
} from "../../src/viewer/minecraft-text-renderer.js";
import {
  rewardDisplayName,
  taskDisplayName
} from "../../src/core/model/display-name.js";

function emptyResolver() {
  return new TranslationResolver(new Map(), "en_us");
}

test("ordinary tasks and rewards do not create a missing title state", () => {
  const resolver = emptyResolver();
  const task = new Task(
    parseSnbt('{ id: "AAAA000000000001" type: "item" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );
  const reward = new Reward(
    parseSnbt('{ id: "BBBB000000000001" type: "xp" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );

  assert.equal(task.hasCustomTitle, false);
  assert.equal(task.title, null);
  assert.equal(taskDisplayName(task.type), "Item");
  assert.equal(reward.hasCustomTitle, false);
  assert.equal(reward.title, null);
  assert.equal(rewardDisplayName(reward.type), "XP");
});

test("explicit task and reward titles are preserved", () => {
  const resolver = emptyResolver();
  const task = new Task(
    parseSnbt('{ id: "AAAA000000000002" type: "item" title: "Custom task" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );
  const reward = new Reward(
    parseSnbt('{ id: "BBBB000000000002" type: "command" title: "Custom reward" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );

  assert.equal(task.hasCustomTitle, true);
  assert.equal(task.title.text, "Custom task");
  assert.equal(task.title.missing, false);
  assert.equal(reward.hasCustomTitle, true);
  assert.equal(reward.title.text, "Custom reward");
  assert.equal(reward.title.missing, false);
});

test("task and reward titles resolve through the locale fallback chain", () => {
  const tables = new Map([
    ["en_us", new TranslationTable("en_us", new Map([
      ["task.AAAA000000000003.title", { value: "Fallback task", node: null }],
      ["reward.BBBB000000000003.title", { value: "Fallback reward", node: null }]
    ]))]
  ]);
  const resolver = new TranslationResolver(tables, "en_us");
  const task = new Task(
    parseSnbt('{ id: "AAAA000000000003" type: "item" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );
  const reward = new Reward(
    parseSnbt('{ id: "BBBB000000000003" type: "xp" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );

  assert.equal(task.hasCustomTitle, true);
  assert.equal(task.title.text, "Fallback task");
  assert.equal(task.title.resolvedLocale, "en_us");
  assert.equal(reward.hasCustomTitle, true);
  assert.equal(reward.title.text, "Fallback reward");
  assert.equal(reward.title.resolvedLocale, "en_us");
});

test("genuinely missing quest translations stay diagnostic but are hidden by default", () => {
  const resolver = emptyResolver();
  const quest = new Quest(
    parseSnbt('{ id: "CCCC000000000001" }'),
    { translationResolver: resolver, locale: "zh_cn" }
  );

  assert.equal(quest.title.missing, true);
  const normalHtml = renderMinecraftText(quest.title.toJSON());
  assert.equal(normalHtml.includes("[Missing translation]"), false);
  assert.equal(normalHtml.includes(quest.title.translationKey), false);

  setMissingTranslationDiagnostics(true);
  try {
    const diagnosticHtml = renderMinecraftText(quest.title.toJSON());
    assert.equal(diagnosticHtml.includes("[Missing translation]"), true);
    assert.equal(diagnosticHtml.includes(quest.title.translationKey), true);
  } finally {
    setMissingTranslationDiagnostics(false);
  }
});

test("JSON translate components resolve against fallback translation tables", () => {
  const tables = new Map([
    ["en_us", new TranslationTable("en_us", new Map([
      ["demo.fallback", { value: "Fallback %1$s", node: null }]
    ]))]
  ]);
  const resolver = new TranslationResolver(tables, "en_us");
  const raw = new SnbtString(JSON.stringify({
    translate: "demo.fallback",
    with: [{ text: "value" }]
  }));
  const text = resolver.resolveText("quest.DDDD000000000001.quest_desc", "zh_cn", raw);

  assert.equal(text.text, "Fallback value");
  assert.equal(text.resolvedText.plainText, "Fallback value");
  assert.equal(text.resolvedText.resolvedJson._resolvedTranslation, "Fallback value");
});
