const LEGACY_CODE_PATTERN = /[§&](?:[0-9a-fk-or]|#[0-9a-fA-F]{6})/g;
const LEGACY_CODE_TEST_PATTERN = /[§&](?:[0-9a-fk-or]|#[0-9a-fA-F]{6})/;

function stripLegacyCodes(value) {
  return String(value ?? "").replace(LEGACY_CODE_PATTERN, "");
}

function translationValueText(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => translationValueText(entry) ?? "").join("\n");
  }
  if (typeof value === "object") return null;
  return String(value);
}

function rawJsonTranslation(value) {
  const args = Array.isArray(value.with) ? value.with : [];
  const renderedArgs = args.map((arg) => {
    const nested = [];
    collectJsonText(arg, nested, null);
    return nested.join("");
  });
  let translated = String(value.translate ?? "");
  for (let index = 0; index < renderedArgs.length; index++) {
    translated = translated.replaceAll(`%${index + 1}$s`, renderedArgs[index]);
  }
  return translated;
}

function resolveJsonTranslation(value, resolveTranslation) {
  if (typeof value?.translate !== "string" || typeof resolveTranslation !== "function") return null;
  const template = translationValueText(resolveTranslation(value.translate));
  if (template == null) return null;

  const args = Array.isArray(value.with) ? value.with : [];
  const renderedArgs = args.map((arg) => {
    const nested = [];
    collectJsonText(resolveJsonComponent(arg, resolveTranslation), nested, resolveTranslation);
    return nested.join("");
  });

  let translated = template;
  for (let index = 0; index < renderedArgs.length; index++) {
    translated = translated.replaceAll(`%${index + 1}$s`, renderedArgs[index]);
  }
  return translated;
}

function collectJsonText(value, output, resolveTranslation) {
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
  if (Array.isArray(value.extra)) collectJsonText(value.extra, output, resolveTranslation);
  if (typeof value._resolvedTranslation === "string") {
    output.push(value._resolvedTranslation);
  } else if (typeof value.translate === "string") {
    const resolved = resolveJsonTranslation(value, resolveTranslation);
    output.push(resolved ?? rawJsonTranslation(value));
  }
}

function resolveJsonComponent(value, resolveTranslation) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => resolveJsonComponent(entry, resolveTranslation));
  if (typeof value !== "object") return value;

  const resolved = { ...value };
  if (typeof value.translate === "string") {
    const translated = resolveJsonTranslation(value, resolveTranslation);
    if (translated != null) resolved._resolvedTranslation = translated;
  }
  if (Array.isArray(value.extra)) {
    resolved.extra = value.extra.map((entry) => resolveJsonComponent(entry, resolveTranslation));
  }
  if (Array.isArray(value.with)) {
    resolved.with = value.with.map((entry) => resolveJsonComponent(entry, resolveTranslation));
  }
  return resolved;
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
    this.resolveTranslation = typeof options.resolveTranslation === "function"
      ? options.resolveTranslation
      : null;
    this.json = null;
    this.resolvedJson = null;
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
          this.resolvedJson = resolveJsonComponent(json, this.resolveTranslation);
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
          collectJsonText(resolveJsonComponent(json, this.resolveTranslation), jsonParts, this.resolveTranslation);
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
        this.resolvedJson = resolveJsonComponent(json, this.resolveTranslation);
        collectEvents(json, this);
        collectStyles(json, this.styles);
        const parts = [];
        collectJsonText(this.resolvedJson, parts, this.resolveTranslation);
        this.plainText = parts.join("");
      } else {
        this.kind = LEGACY_CODE_TEST_PATTERN.test(rawValue) ? "formatted" : "plain";
        this.plainText = stripLegacyCodes(rawValue);
      }
      return;
    }

    if (rawValue && typeof rawValue === "object") {
      this.kind = "json";
      this.json = rawValue;
      this.resolvedJson = resolveJsonComponent(rawValue, this.resolveTranslation);
      collectEvents(rawValue, this);
      collectStyles(rawValue, this.styles);
      const parts = [];
      collectJsonText(this.resolvedJson, parts, this.resolveTranslation);
      this.plainText = parts.join("");
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
      resolvedJson: this.resolvedJson,
      styles: this.styles,
      clickEvent: this.clickEvent,
      hoverEvent: this.hoverEvent
    };
  }
}
