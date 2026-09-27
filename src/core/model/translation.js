import {
  isList,
  isString,
  stringValue
} from "../parser/snbt.js";
import { MinecraftText } from "./minecraft-text.js";
import { normalizeId } from "./common.js";

function decodeTranslationNode(node) {
  if (isString(node)) return node.value;
  if (isList(node)) return node.values.filter(isString).map((value) => value.value);
  return null;
}

export class TranslationTable {
  constructor(locale, entries = new Map()) {
    this.locale = locale;
    this.entries = entries;
  }

  has(key) {
    return this.entries.has(key);
  }

  get(key) {
    return this.entries.get(key) ?? null;
  }

  set(key, value, node = null) {
    this.entries.set(key, { value, node });
  }

  get size() {
    return this.entries.size;
  }
}

export class TextValue {
  constructor({
    translationKey = null,
    rawText = null,
    rawNode = null,
    resolvedValue = null,
    locale = null,
    resolvedLocale = null,
    missing = false
  }) {
    this.translationKey = translationKey;
    this.rawText = rawText;
    this.rawValue = rawText;
    this.rawNode = rawNode;
    this.locale = locale;
    this.resolvedLocale = resolvedLocale;
    this.missing = missing;
    this.resolvedText = new MinecraftText(resolvedValue ?? rawText ?? translationKey, {
      translationKey,
      locale: resolvedLocale ?? locale
    });
  }

  get text() {
    return this.resolvedText.plainText;
  }

  toJSON() {
    return {
      translationKey: this.translationKey,
      rawText: this.rawText,
      rawValue: this.rawValue,
      resolvedText: this.resolvedText.toJSON(),
      locale: this.locale,
      resolvedLocale: this.resolvedLocale,
      missing: this.missing
    };
  }
}

export class TranslationResolver {
  constructor(tables = new Map(), fallbackLocale = "en_us") {
    this.tables = tables;
    this.fallbackLocale = fallbackLocale || "en_us";
  }

  get locales() {
    return [...this.tables.keys()];
  }

  table(locale) {
    return this.tables.get(locale) ?? null;
  }

  resolveEntry(key, locale) {
    const candidates = [];
    for (const candidate of [locale, this.fallbackLocale, "en_us"]) {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    }
    for (const candidate of candidates) {
      const table = this.table(candidate);
      const entry = table?.get(key);
      if (entry != null) {
        return { locale: candidate, value: entry.value, node: entry.node };
      }
    }
    return null;
  }

  resolve(key, locale, fallbackToKey = true) {
    const entry = this.resolveEntry(key, locale);
    if (entry != null) return entry.value;
    return fallbackToKey ? key : null;
  }

  resolveText(key, locale, legacyNode = null) {
    const entry = this.resolveEntry(key, locale);
    const legacyValue = decodeTranslationNode(legacyNode);
    const rawValue = entry?.value ?? legacyValue;
    const resolvedValue = entry?.value ?? legacyValue ?? key;
    return new TextValue({
      translationKey: key,
      rawText: rawValue,
      rawNode: entry?.node ?? legacyNode,
      resolvedValue,
      locale,
      resolvedLocale: entry?.locale ?? null,
      missing: entry == null && legacyValue == null
    });
  }

  resolveObjectText(type, id, subKey, locale, legacyNode = null) {
    return this.resolveText(this.makeKey(type, id, subKey), locale, legacyNode);
  }

  makeKey(type, id, subKey) {
    return `${type}.${normalizeId(id)}.${subKey}`;
  }
}
