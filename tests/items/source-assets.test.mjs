import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  projectRoot
} from "../helpers.mjs";

const sourceRoot = path.join(projectRoot, "source");
const manifestPath = path.join(sourceRoot, "manifest.json");
const assetManifestPath = path.join(sourceRoot, "assets", "manifest.json");

test("source manifest records the real quest statistics without a local absolute path", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.sourceInstance, "[开拓者日志]As we trailblaze");
  assert.equal(manifest.statistics.snbtFiles, 62);
  assert.equal(manifest.statistics.chapters, 38);
  assert.equal(manifest.statistics.quests, 1722);
  assert.equal(manifest.statistics.tasks, 2126);
  assert.equal(manifest.statistics.rewards, 1352);
  assert.equal(manifest.statistics.questLinks, 14);
  assert.equal(manifest.statistics.rewardTables, 20);
  assert.equal(manifest.statistics.translations, 927);
  assert.equal(JSON.stringify(manifest).includes("D:\\\\"), false);
  assert.equal(manifest.files.some((file) => file.path === "quests/data.snbt"), true);
});

test("source asset manifest records resolved and missing item provenance", () => {
  const manifest = JSON.parse(fs.readFileSync(assetManifestPath, "utf8"));
  assert.equal(Array.isArray(manifest.items), true);
  assert.equal(manifest.items.length >= 1900, true);

  const iron = manifest.items.find((item) => item.itemId === "minecraft:iron_ingot");
  assert.equal(iron.status, "resolved");
  assert.equal(iron.texturePath, "minecraft:textures/item/iron_ingot.png");
  assert.equal(iron.modelPath, "models/item/iron_ingot.json");

  const missing = manifest.items.find((item) => item.status === "missing");
  assert.ok(missing);
  assert.equal(missing.texturePath, null);
  assert.equal(typeof missing.reason, "string");
});
