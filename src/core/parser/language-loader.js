import fs from "node:fs";
import path from "node:path";
import {
  isCompound,
  isList,
  isString,
  nodeToJs
} from "./snbt.js";
import { TranslationTable } from "../model/translation.js";

export function discoverLanguageFiles(questRoot) {
  const languageDirectory = path.join(questRoot, "lang");
  if (!fs.existsSync(languageDirectory)) return [];
  return fs.readdirSync(languageDirectory)
    .filter((name) => name.toLowerCase().endsWith(".snbt"))
    .sort()
    .map((name) => ({
      locale: name.slice(0, -".snbt".length).toLowerCase(),
      path: path.join(languageDirectory, name),
      relativePath: `lang/${name}`
    }));
}

export function loadLanguageTables(questRoot, parseSnbtFn) {
  const tables = new Map();
  const parseErrors = [];

  for (const file of discoverLanguageFiles(questRoot)) {
    let ast;
    try {
      ast = parseSnbtFn(fs.readFileSync(file.path, "utf8"));
    } catch (error) {
      parseErrors.push({ file: file.relativePath, error: String(error.message || error) });
      continue;
    }

    if (!isCompound(ast)) {
      parseErrors.push({ file: file.relativePath, error: "Language file is not a compound" });
      continue;
    }

    const table = new TranslationTable(file.locale);
    for (const [key, node] of ast.entries) {
      let value = null;
      if (isString(node)) value = node.value;
      else if (isList(node)) {
        value = node.values.map((entry) => (isString(entry) ? entry.value : nodeToJs(entry)));
      } else {
        value = nodeToJs(node);
      }
      table.set(key, value, node);
    }
    tables.set(file.locale, table);
  }

  return { tables, parseErrors };
}
