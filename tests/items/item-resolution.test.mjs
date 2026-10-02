import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  loadQuestBook
} from "../../src/core/index.js";
import {
  createResourceResolver
} from "../../src/server/resource-resolver.js";
import {
  createItemResolver
} from "../../src/core/resolve/item-resolver.js";
import {
  projectRoot
} from "../helpers.mjs";

const sourceRoot = path.join(projectRoot, "source");
const questRoot = path.join(sourceRoot, "quests");

function resolverForSource() {
  const book = loadQuestBook(questRoot, { locale: "zh_cn" });
  const assets = createResourceResolver(sourceRoot, "1.21.1", { assetRoots: [sourceRoot] });
  return {
    book,
    resolver: createItemResolver(assets, {
      locale: "zh_cn",
      fallbackLocale: book.data?.fallbackLocale ?? "en_us"
    })
  };
}

test("resolves a normal item task from its item id to its display name and icon", () => {
  const { book, resolver } = resolverForSource();
  const task = book.tasks.find((entry) => entry.item?.id);
  assert.ok(task);
  const resolved = resolver.resolve(task.item);
  assert.equal(resolved.itemId, task.item.id);
  assert.equal(resolved.status, "resolved");
  assert.notEqual(resolved.displayName, task.id);
  assert.notEqual(resolved.displayName, task.item.id);
  assert.equal(Boolean(resolved.modelPaths.length), true);
  assert.equal(Boolean(resolved.texturePath), true);
});

test("resolves component-backed FTB Quests custom icons without treating them as task ids", () => {
  const { book, resolver } = resolverForSource();
  const task = book.tasks.find((entry) =>
    entry.icon?.id === "ftbquests:custom_icon"
    && entry.icon.getComponent("ftbquests:icon")
  );
  assert.ok(task);
  const resolved = resolver.resolve(task.icon);
  assert.equal(resolved.itemId, "ftbquests:custom_icon");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.sourceType, "component-icon");
  assert.equal(resolved.texturePath, "minecraft:textures/block/iron_ore.png");
  assert.equal(resolved.iconRef, "minecraft:block/iron_ore");
});

test("keeps a runtime-rendered item missing instead of inventing an approximate icon", () => {
  const { resolver } = resolverForSource();
  const resolved = resolver.resolve("chicken_roost:c_amethystshard");
  assert.equal(resolved.status, "missing");
  assert.equal(resolved.reason, "builtin model requires runtime rendering");
  assert.equal(resolved.texturePath, null);
});
