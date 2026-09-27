import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQuestBook } from "../src/core/parser/ftbq-loader.js";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const fixturesRoot = path.join(projectRoot, "fixtures", "ftbquests-2101");
export const realFixture = path.join(fixturesRoot, "real");
export const syntheticFixture = path.join(fixturesRoot, "synthetic");
export const actualQuestRoot = path.resolve(projectRoot, "..", "config", "ftbquests", "quests");

export function loadRealFixture(options = {}) {
  return loadQuestBook(realFixture, options);
}

export function loadSyntheticFixture(options = {}) {
  return loadQuestBook(syntheticFixture, options);
}

export function loadActualBook(options = {}) {
  return loadQuestBook(actualQuestRoot, options);
}
