import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  resolveItemIconDetailed
} from "../../src/core/resolve/model-resolver.js";
import {
  createResourceResolver
} from "../../src/server/resource-resolver.js";
import {
  projectRoot
} from "../helpers.mjs";

const sourceRoot = path.join(projectRoot, "source");
const resolver = createResourceResolver(sourceRoot, "1.21.1", { assetRoots: [sourceRoot] });

test("resolves a vanilla item through model parent and texture variables", () => {
  const resolved = resolveItemIconDetailed(resolver, "minecraft:iron_ingot");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.sourceType, "model");
  assert.equal(resolved.modelPath, "models/item/iron_ingot.json");
  assert.equal(resolved.modelPaths.includes("minecraft:models/item/generated.json"), true);
  assert.equal(resolved.texturePath, "minecraft:textures/item/iron_ingot.png");
});

test("resolves a block-backed mod item through its item and block model chain", () => {
  const resolved = resolveItemIconDetailed(resolver, "farmersdelight:cooking_pot");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.sourceType, "model");
  assert.equal(resolved.modelPaths.includes("farmersdelight:models/block/cooking_pot.json"), true);
  assert.equal(resolved.texturePath, "farmersdelight:textures/block/cooking_pot_side.png");
});

test("reports a missing static texture for a runtime-rendered model", () => {
  const resolved = resolveItemIconDetailed(resolver, "chicken_roost:c_amethystshard");
  assert.equal(resolved.status, "missing");
  assert.equal(resolved.reason, "builtin model requires runtime rendering");
  assert.equal(resolved.texturePath, undefined);
});
