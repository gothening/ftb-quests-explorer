const LEGACY_COLORS = {
  "0": "#000000",
  "1": "#0000AA",
  "2": "#00AA00",
  "3": "#00AAAA",
  "4": "#AA0000",
  "5": "#AA00AA",
  "6": "#FFAA00",
  "7": "#AAAAAA",
  "8": "#555555",
  "9": "#5555FF",
  a: "#55FF55",
  b: "#55FFFF",
  c: "#FF5555",
  d: "#FF55FF",
  e: "#FFFF55",
  f: "#FFFFFF"
};

const EMPTY_STYLE = Object.freeze({
  color: null,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  obfuscated: false
});

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function styleAttributes(style) {
  const styles = [];
  if (style.color) styles.push(`color:${style.color}`);
  if (style.bold) styles.push("font-weight:700");
  if (style.italic) styles.push("font-style:italic");
  if (style.underline) styles.push("text-decoration-line:underline");
  if (style.strike) styles.push("text-decoration-line:line-through");
  return styles.length > 0 ? ` style="${styles.join(";")}"` : "";
}

function classNames(style) {
  const classes = ["mc-text"];
  if (style.obfuscated) classes.push("mc-obfuscated");
  return classes.join(" ");
}

function legacyStateFromCode(state, code) {
  const next = { ...state };
  if (code === "r") return { ...EMPTY_STYLE };
  if (LEGACY_COLORS[code]) {
    return { ...EMPTY_STYLE, color: LEGACY_COLORS[code] };
  }
  if (code === "k") next.obfuscated = true;
  if (code === "l") next.bold = true;
  if (code === "m") next.strike = true;
  if (code === "n") next.underline = true;
  if (code === "o") next.italic = true;
  return next;
}

function renderLegacyLine(line) {
  const source = String(line ?? "");
  let state = { ...EMPTY_STYLE };
  let buffer = "";
  let output = "";

  const flush = () => {
    if (!buffer) return;
    output += `<span class="${classNames(state)}"${styleAttributes(state)}>${escapeHtml(buffer)}</span>`;
    buffer = "";
  };

  for (let index = 0; index < source.length;) {
    const char = source[index];
    if ((char === "§" || char === "&") && index + 1 < source.length) {
      if (source[index + 1] === "#" && /^[0-9a-fA-F]{6}/.test(source.slice(index + 2, index + 8))) {
        flush();
        state = { ...EMPTY_STYLE, color: `#${source.slice(index + 2, index + 8)}` };
        index += 8;
        continue;
      }
      const code = source[index + 1].toLowerCase();
      if (LEGACY_COLORS[code] || ["k", "l", "m", "n", "o", "r"].includes(code)) {
        flush();
        state = legacyStateFromCode(state, code);
        index += 2;
        continue;
      }
    }
    buffer += char;
    index++;
  }
  flush();
  return output;
}

function hoverText(hoverEvent) {
  if (hoverEvent == null) return "";
  if (typeof hoverEvent === "string") return hoverEvent;
  if (Array.isArray(hoverEvent)) return hoverEvent.map(hoverText).join(" ");
  if (typeof hoverEvent === "object") {
    if (hoverEvent.contents != null) return hoverText(hoverEvent.contents);
    if (hoverEvent.value != null) return hoverText(hoverEvent.value);
    if (hoverEvent.text != null) return hoverEvent.text;
    if (hoverEvent.translate != null) return hoverEvent.translate;
  }
  return "";
}

function renderJsonComponent(component) {
  if (component == null) return "";
  if (typeof component === "string") return renderLegacyLine(component);
  if (Array.isArray(component)) return component.map(renderJsonComponent).join("");
  if (typeof component !== "object") return escapeHtml(String(component));

  let text = "";
  if (typeof component.text === "string") text += renderLegacyLine(component.text);
  if (component.translate) {
    const args = Array.isArray(component.with) ? component.with.map(renderJsonComponent).join("") : "";
    text += `${escapeHtml(component.translate)}${args ? ` ${args}` : ""}`;
  }
  if (Array.isArray(component.extra)) text += component.extra.map(renderJsonComponent).join("");
  if (!text) text = escapeHtml(component.type ?? "");

  const style = {
    color: component.color ? (LEGACY_COLORS[component.color] ?? component.color) : null,
    bold: Boolean(component.bold),
    italic: Boolean(component.italic),
    underline: Boolean(component.underlined),
    strike: Boolean(component.strikethrough),
    obfuscated: Boolean(component.obfuscated)
  };
  const attributes = [];
  if (component.clickEvent?.action && component.clickEvent?.value != null) {
    attributes.push(`class="mc-clickable"`);
    attributes.push(`data-click-action="${escapeHtml(component.clickEvent.action)}"`);
    attributes.push(`data-click-value="${escapeHtml(component.clickEvent.value)}"`);
  }
  const hover = hoverText(component.hoverEvent);
  if (hover) attributes.push(`title="${escapeHtml(hover)}"`);
  const classes = attributes.find((attribute) => attribute.startsWith("class="));
  if (!classes) attributes.push(`class="${classNames(style)}"`);

  return `<span ${attributes.join(" ")}${styleAttributes(style)}>${text}</span>`;
}

export function renderMinecraftText(textValue) {
  if (!textValue) return "";
  const resolved = textValue.resolvedText ?? textValue;
  const missing = textValue.missing ? `<span class="missing-translation">[Missing translation]</span> ` : "";
  const key = textValue.translationKey && textValue.missing
    ? `<code class="translation-key">${escapeHtml(textValue.translationKey)}</code>`
    : "";

  if (resolved?.json != null) {
    return `${missing}${renderJsonComponent(resolved.json)}${key ? ` ${key}` : ""}`;
  }

  const raw = resolved?.raw ?? resolved?.rawText ?? textValue.raw ?? textValue.rawText;
  if (Array.isArray(raw)) {
    const lines = raw.map((line) => {
      if (typeof line === "string" && (line.trim().startsWith("[") || line.trim().startsWith("{"))) {
        try {
          return renderJsonComponent(JSON.parse(line));
        } catch {
          return renderLegacyLine(line);
        }
      }
      return renderLegacyLine(line);
    });
    return `${missing}${lines.join("<br>")}${key ? ` ${key}` : ""}`;
  }
  return `${missing}${renderLegacyLine(raw ?? resolved?.plainText ?? "")}${key ? ` ${key}` : ""}`;
}

export function plainMinecraftText(textValue) {
  if (!textValue) return "";
  return textValue.plainText ?? textValue.resolvedText?.plainText ?? String(textValue);
}
