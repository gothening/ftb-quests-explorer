import test from "node:test";
import assert from "node:assert/strict";
import {
  isTypedArray,
  parseSnbt
} from "../../src/core/parser/snbt.js";
import { ItemStack } from "../../src/core/model/item-stack.js";
import { loadSyntheticFixture } from "../helpers.mjs";

test("models 1.21 item components without converting them to legacy nbt", () => {
  const node = parseSnbt(`{
    id: "minecraft:potion"
    count: 1
    components: {
      "minecraft:potion_contents": { potion: "minecraft:healing" }
      "futuremod:custom_component": { keep: "raw" }
    }
  }`);
  const stack = new ItemStack(node);
  assert.equal(stack.id, "minecraft:potion");
  assert.equal(stack.count, 1);
  assert.equal(stack.legacy, false);
  assert.equal(stack.componentIds.includes("minecraft:potion_contents"), true);
  assert.equal(stack.componentIds.includes("futuremod:custom_component"), true);
  assert.equal(stack.getComponent("futuremod:custom_component").get("keep").value, "raw");
  assert.equal(stack.raw, node);
});

test("loads a synthetic ItemTask with component and typed-array data", () => {
  const book = loadSyntheticFixture();
  const task = book.getTask("AAAA000000000001");
  assert.equal(task.type, "item");
  assert.equal(task.item.id, "minecraft:stone");
  assert.equal(task.item.components.has("minecraft:custom_data"), true);
  assert.equal(task.item.components.has("futuremod:component"), true);
  assert.equal(isTypedArray(task.raw.get("future_task_field").get("nested")), true);
});

test("reports invalid item stacks without throwing", () => {
  const stack = new ItemStack(parseSnbt("{ count: 2 }"));
  assert.equal(stack.isValid, false);
  assert.equal(stack.id, "");
  assert.equal(stack.count, 2);
});
