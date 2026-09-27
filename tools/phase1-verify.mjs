import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  loadQuestBook,
  serializeQuestBook,
  summarizeBook,
  validate
} from "../src/core/index.js";

const root = process.argv[2] ?? path.resolve("..", "config", "ftbquests", "quests");
const start = performance.now();
const book = loadQuestBook(root, { locale: "zh_cn" });
const loadMs = performance.now() - start;
const validation = validate(book);
const serialized = serializeQuestBook(book);

function countCodes(issues) {
  const result = {};
  for (const issue of issues) result[issue.code] = (result[issue.code] || 0) + 1;
  return result;
}

console.log(JSON.stringify({
  root,
  loadMs: Number(loadMs.toFixed(2)),
  summary: summarizeBook(book),
  validation: {
    errors: validation.errors.length,
    warnings: validation.warnings.length,
    infos: validation.infos.length,
    errorCodes: countCodes(validation.errors),
    warningCodes: countCodes(validation.warnings),
    infoCodes: countCodes(validation.infos)
  },
  serializedFiles: serialized.size
}, null, 2));
