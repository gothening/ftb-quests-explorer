import fs from "node:fs";
import path from "node:path";
import {
  parseSnbt,
  semanticEquals,
  serializeSnbt
} from "../src/core/parser/snbt.js";

const root = process.argv[2];
if (!root) {
  console.error("usage: node tools/roundtrip-check.mjs <quest-directory>");
  process.exit(2);
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.toLowerCase().endsWith(".snbt")) {
      files.push(fullPath);
    }
  }
}

walk(root);

const errors = [];
for (const file of files) {
  try {
    const first = parseSnbt(fs.readFileSync(file, "utf8"));
    const second = parseSnbt(serializeSnbt(first));
    if (!semanticEquals(second, first)) {
      throw new Error("semantic mismatch after serialize/parse");
    }
  } catch (error) {
    errors.push({ file, error: String(error.message || error) });
  }
}

console.log(JSON.stringify({
  root: path.resolve(root),
  files: files.length,
  passed: files.length - errors.length,
  failed: errors.length,
  errors
}, null, 2));

if (errors.length > 0) process.exit(1);
