const LEGACY_CODE_PATTERN = /[§&](?:[0-9a-fk-or]|#[0-9a-fA-F]{6})/g;
const LEGACY_CODE_TEST_PATTERN = /[§&](?:[0-9a-fk-or]|#[0-9a-fA-F]{6})/;

function stripLegacyCodes(value) {
  return String(value ?? "").replace(LEGACY_CODE_PATTERN, "");
}

function collectJsonText(value, output) {
  if (value == null) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonText(entry, output);
    return;
  }
  if (typeof value !== "object") return;

  if (typeof value.text === "string") output.push(value.text);
  if (Array.isArray(value.extra)) collectJsonText(value.extra, output);
  if (value.translate) {
    const args = Array.isArray(value.with) ? value.with : [];
    const renderedArgs = [];
    for (const arg of args) {
      const nested = [];
      collectJsonText(arg, nested);
      renderedArgs.push(nested.join(""));
    }
    let translated = String(value.translate);
    for (let index = 0; index < renderedArgs.length; index++) {
      translated = translated.replaceAll(`%${index + 1}$s`, renderedArgs[index]);
    }
    output.push(translated);
  }
}

function parseJsonText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectEvents(value, output) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectEvents(entry, output);
    return;
  }
  if (typeof value !== "object") return;
  if (value.clickEvent && !output.clickEvent) output.clickEvent = value.clickEvent;
  if (value.hoverEvent && !output.hoverEvent) output.hoverEvent = value.hoverEvent;
  if (Array.isArray(value.extra)) collectEvents(value.extra, output);
}

function collectStyles(value, output) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectStyles(entry, output);
    return;
  }
  if (typeof value !== "object") return;
  const style = {};
  for (const key of ["color", "bold", "italic", "underlined", "strikethrough", "obfuscated"]) {
    if (value[key] !== undefined) style[key] = value[key];
  }
  if (Object.keys(style).length > 0) output.push(style);
  if (Array.isArray(value.extra)) collectStyles(value.extra, output);
}

export class MinecraftText {
  constructor(rawValue, options = {}) {
    this.raw = Array.isArray(rawValue) ? [...rawValue] : rawValue;
    this.translationKey = options.translationKey ?? null;
    this.locale = options.locale ?? null;
    this.json = null;
    this.kind = "plain";
    this.styles = [];
    this.clickEvent = null;
    this.hoverEvent = null;

    this._inspect(rawValue);
  }

  _inspect(rawValue) {
    if (Array.isArray(rawValue)) {
      this.kind = "lines";
      for (const line of rawValue) {
        const json = parseJsonText(line);
        if (json != null) {
          this.json = json;
          this.kind = "json";
          collectEvents(json, this);
          collectStyles(json, this.styles);
          break;
        }
      }
      const plainParts = [];
      for (const line of rawValue) {
        const json = parseJsonText(line);
        if (json != null) {
          const jsonParts = [];
          collectJsonText(json, jsonParts);
          plainParts.push(jsonParts.join(""));
        } else {
          plainParts.push(stripLegacyCodes(line));
        }
      }
      this.plainText = plainParts.join("\n");
      return;
    }

    if (typeof rawValue === "string") {
      const json = parseJsonText(rawValue);
      if (json != null) {
        this.kind = "json";
        this.json = json;
        collectEvents(json, this);
        collectStyles(json, this.styles);
        const parts = [];
        collectJsonText(json, parts);
        this.plainText = parts.join("");
      } else {
        this.kind = LEGACY_CODE_TEST_PATTERN.test(rawValue) ? "formatted" : "plain";
        this.plainText = stripLegacyCodes(rawValue);
      }
      return;
    }

    this.kind = "empty";
    this.plainText = "";
  }

  get isEmpty() {
    return this.plainText.length === 0;
  }

  toJSON() {
    return {
      kind: this.kind,
      translationKey: this.translationKey,
      locale: this.locale,
      plainText: this.plainText,
      raw: this.raw,
      json: this.json,
      styles: this.styles,
      clickEvent: this.clickEvent,
      hoverEvent: this.hoverEvent
    };
  }
}
