const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[bBsSlLfFdD]?$/;

export class SnbtParseError extends Error {
  constructor(message, position, source) {
    const before = source.slice(0, position);
    const line = before.split(/\r\n|\r|\n/).length;
    const lineStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r")) + 1;
    const column = position - lineStart + 1;
    super(`${message} at ${position} (line ${line}, column ${column})`);
    this.name = "SnbtParseError";
    this.position = position;
    this.line = line;
    this.column = column;
  }
}

export class SnbtNode {
  constructor(kind) {
    this.kind = kind;
  }
}

export class SnbtCompound extends SnbtNode {
  constructor(entries = []) {
    super("compound");
    this.entries = new Map(entries);
  }

  get(key) {
    return this.entries.get(key);
  }

  has(key) {
    return this.entries.has(key);
  }

  set(key, value) {
    this.entries.set(key, value);
    return this;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  keys() {
    return [...this.entries.keys()];
  }

  values() {
    return [...this.entries.values()];
  }
}

export class SnbtList extends SnbtNode {
  constructor(values = []) {
    super("list");
    this.values = values;
  }
}

export class SnbtTypedArray extends SnbtNode {
  constructor(elementType, values = []) {
    super("typed_array");
    this.elementType = elementType.toUpperCase();
    this.values = values;
  }
}

export class SnbtString extends SnbtNode {
  constructor(value) {
    super("string");
    this.value = String(value);
  }
}

export class SnbtBoolean extends SnbtNode {
  constructor(value) {
    super("boolean");
    this.value = Boolean(value);
  }
}

export class SnbtNumber extends SnbtNode {
  constructor({ kind, suffix, raw, value }) {
    super("number");
    this.kind = kind;
    this.suffix = suffix || "";
    this.raw = raw || "";
    this.value = value;
  }

  isInteger() {
    return this.kind === "byte" || this.kind === "short" || this.kind === "int" || this.kind === "long";
  }
}

export function isCompound(value) {
  return value instanceof SnbtCompound;
}

export function isList(value) {
  return value instanceof SnbtList;
}

export function isTypedArray(value) {
  return value instanceof SnbtTypedArray;
}

export function isNumber(value) {
  return value instanceof SnbtNumber;
}

export function isString(value) {
  return value instanceof SnbtString;
}

export function isBoolean(value) {
  return value instanceof SnbtBoolean;
}

export function numberNode(value, kind = "int", options = {}) {
  const suffixByKind = {
    byte: "b",
    short: "s",
    int: "",
    long: "l",
    float: "f",
    double: "d"
  };
  const suffix = options.suffix ?? suffixByKind[kind] ?? "";
  const raw = options.raw ?? `${formatNumericValue(value, kind)}${suffix}`;
  return new SnbtNumber({
    kind,
    suffix,
    raw,
    value: Number(value)
  });
}

export function stringNode(value) {
  return new SnbtString(value);
}

export function booleanNode(value) {
  return new SnbtBoolean(value);
}

export function compoundNode(entries = []) {
  return new SnbtCompound(entries);
}

export function listNode(values = []) {
  return new SnbtList(values);
}

export function numberValue(node, fallback = 0) {
  if (!isNumber(node)) return fallback;
  if (node.isInteger()) {
    const text = node.raw.replace(/[bBsSlL]$/, "");
    try {
      const bigint = BigInt(text);
      const numeric = Number(bigint);
      return Number.isFinite(numeric) ? numeric : fallback;
    } catch {
      return fallback;
    }
  }
  return Number.isFinite(node.value) ? node.value : fallback;
}

export function stringValue(node, fallback = "") {
  return isString(node) ? node.value : fallback;
}

export function booleanValue(node, fallback = false) {
  return isBoolean(node) ? node.value : fallback;
}

export function nodeToJs(node) {
  if (node == null) return null;
  if (isCompound(node)) {
    const result = {};
    for (const [key, value] of node.entries) result[key] = nodeToJs(value);
    return result;
  }
  if (isList(node)) return node.values.map(nodeToJs);
  if (isTypedArray(node)) return node.values.map((value) => numberValue(value, 0));
  if (isString(node)) return node.value;
  if (isBoolean(node)) return node.value;
  if (isNumber(node)) return numberValue(node, 0);
  return null;
}

function canonicalNumber(node) {
  if (node.isInteger()) {
    const text = node.raw.replace(/[bBsSlL]$/, "").replace(/^\+/, "");
    try {
      return `${node.kind}:${node.suffix.toLowerCase()}:${BigInt(text).toString()}`;
    } catch {
      return `${node.kind}:${node.suffix.toLowerCase()}:${text}`;
    }
  }
  return `${node.kind}:${node.suffix.toLowerCase()}:${String(numberValue(node, 0))}`;
}

export function semanticEquals(left, right) {
  if (left == null || right == null) return left === right;
  if (left.kind !== right.kind) return false;
  if (isNumber(left)) return canonicalNumber(left) === canonicalNumber(right);
  if (isString(left)) return left.value === right.value;
  if (isBoolean(left)) return left.value === right.value;
  if (isList(left)) {
    return left.values.length === right.values.length &&
      left.values.every((value, index) => semanticEquals(value, right.values[index]));
  }
  if (isTypedArray(left)) {
    return left.elementType === right.elementType &&
      left.values.length === right.values.length &&
      left.values.every((value, index) => semanticEquals(value, right.values[index]));
  }
  if (isCompound(left)) {
    if (left.entries.size !== right.entries.size) return false;
    for (const [key, value] of left.entries) {
      if (!right.entries.has(key) || !semanticEquals(value, right.entries.get(key))) return false;
    }
    return true;
  }
  return false;
}

function numberKindFromToken(token) {
  const suffix = token.match(/[bBsSlLfFdD]$/)?.[0]?.toLowerCase() || "";
  if (suffix === "b") return { kind: "byte", suffix };
  if (suffix === "s") return { kind: "short", suffix };
  if (suffix === "l") return { kind: "long", suffix };
  if (suffix === "f") return { kind: "float", suffix };
  if (suffix === "d") return { kind: "double", suffix };
  return /[.eE]/.test(token)
    ? { kind: "double", suffix: "" }
    : { kind: "int", suffix: "" };
}

export class SnbtParser {
  constructor(source) {
    this.source = String(source ?? "");
    this.length = this.source.length;
    this.position = 0;
  }

  parse() {
    this.skipWhitespaceAndComments();
    const value = this.parseValue();
    this.skipWhitespaceAndComments();
    this.skipCommas();
    if (this.position < this.length) {
      this.error("Unexpected trailing content");
    }
    return value;
  }

  error(message) {
    throw new SnbtParseError(message, this.position, this.source);
  }

  peek(offset = 0) {
    return this.source[this.position + offset];
  }

  next() {
    return this.source[this.position++];
  }

  skipWhitespaceAndComments() {
    while (this.position < this.length) {
      const char = this.peek();
      if (/\s/.test(char)) {
        this.position++;
        continue;
      }
      if (char === "/" && this.peek(1) === "/") {
        this.position += 2;
        while (this.position < this.length && this.peek() !== "\n" && this.peek() !== "\r") this.position++;
        continue;
      }
      if (char === "#") {
        this.position++;
        while (this.position < this.length && this.peek() !== "\n" && this.peek() !== "\r") this.position++;
        continue;
      }
      break;
    }
  }

  skipCommas() {
    while (this.position < this.length && this.peek() === ",") {
      this.position++;
      this.skipWhitespaceAndComments();
    }
  }

  skipSeparators() {
    this.skipWhitespaceAndComments();
    this.skipCommas();
  }

  parseValue() {
    this.skipWhitespaceAndComments();
    const char = this.peek();
    if (char === "{") return this.parseCompound();
    if (char === "[") return this.parseListOrTypedArray();
    if (char === "\"" || char === "'") return this.parseString();
    return this.parseBareValue();
  }

  parseCompound() {
    this.next();
    const compound = new SnbtCompound();
    while (true) {
      this.skipSeparators();
      if (this.peek() === "}") {
        this.next();
        return compound;
      }
      if (this.position >= this.length) this.error("Unterminated compound");
      const key = this.parseKey();
      this.skipWhitespaceAndComments();
      if (this.next() !== ":") this.error("Expected ':' after compound key");
      const value = this.parseValue();
      compound.set(key, value);
    }
  }

  parseKey() {
    this.skipWhitespaceAndComments();
    const char = this.peek();
    if (char === "\"" || char === "'") return this.parseString().value;
    const start = this.position;
    while (this.position < this.length && !/[\s:{},[\]]/.test(this.peek())) this.position++;
    if (this.position === start) this.error("Expected compound key");
    return this.source.slice(start, this.position);
  }

  parseListOrTypedArray() {
    this.next();
    this.skipWhitespaceAndComments();
    const typeChar = this.peek();
    const type = ["B", "I", "L"].includes(typeChar?.toUpperCase()) ? typeChar.toUpperCase() : null;
    if (type && this.peek(1) === ";") {
      this.position += 2;
      const values = [];
      while (true) {
        this.skipSeparators();
        if (this.peek() === "]") {
          this.next();
          return new SnbtTypedArray(type, values);
        }
        const value = this.parseValue();
        if (!isNumber(value)) this.error(`Expected numeric value in [${type}; ...]`);
        values.push(value);
      }
    }

    const values = [];
    while (true) {
      this.skipSeparators();
      if (this.peek() === "]") {
        this.next();
        return new SnbtList(values);
      }
      values.push(this.parseValue());
    }
  }

  parseString() {
    const quote = this.next();
    let output = "";
    while (this.position < this.length) {
      const char = this.next();
      if (char === quote) return new SnbtString(output);
      if (char !== "\\") {
        output += char;
        continue;
      }
      if (this.position >= this.length) this.error("Unterminated escape sequence");
      const escaped = this.next();
      switch (escaped) {
        case "n": output += "\n"; break;
        case "r": output += "\r"; break;
        case "t": output += "\t"; break;
        case "b": output += "\b"; break;
        case "f": output += "\f"; break;
        case "/": output += "/"; break;
        case "\\": output += "\\"; break;
        case "\"": output += "\""; break;
        case "'": output += "'"; break;
        case "u": {
          const hex = this.source.slice(this.position, this.position + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.error("Invalid Unicode escape");
          output += String.fromCharCode(Number.parseInt(hex, 16));
          this.position += 4;
          break;
        }
        default:
          output += escaped;
      }
    }
    this.error("Unterminated string");
  }

  parseBareValue() {
    const start = this.position;
    while (this.position < this.length && !/[\s,\]}[\]]/.test(this.peek())) this.position++;
    const token = this.source.slice(start, this.position);
    if (!token) this.error("Expected value");
    if (token === "true") return new SnbtBoolean(true);
    if (token === "false") return new SnbtBoolean(false);
    if (NUMBER_PATTERN.test(token)) {
      const { kind, suffix } = numberKindFromToken(token);
      const numericText = token.replace(/[bBsSlLfFdD]$/, "");
      const numeric = Number(numericText);
      return new SnbtNumber({
        kind,
        suffix,
        raw: token,
        value: Number.isFinite(numeric) ? numeric : 0
      });
    }
    return new SnbtString(token);
  }
}

export function parseSnbt(source) {
  return new SnbtParser(source).parse();
}

function formatNumericValue(value, kind) {
  const number = Number(value);
  if (kind === "float" || kind === "double") {
    if (!Number.isFinite(number)) return "0.0";
    return Number.isInteger(number) ? number.toFixed(1) : String(number);
  }
  return String(Math.trunc(number));
}

function quoteSnbtString(value) {
  let output = "\"";
  for (const char of String(value)) {
    switch (char) {
      case "\\": output += "\\\\"; break;
      case "\"": output += "\\\""; break;
      case "\n": output += "\\n"; break;
      case "\r": output += "\\r"; break;
      case "\t": output += "\\t"; break;
      case "\b": output += "\\b"; break;
      case "\f": output += "\\f"; break;
      default:
        if (char < " ") output += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        else output += char;
    }
  }
  return `${output}"`;
}

function quoteKey(value) {
  return /^[A-Za-z_][A-Za-z0-9_.+-]*$/.test(value) ? value : quoteSnbtString(value);
}

function serializeNumber(node) {
  if (node.raw) return node.raw;
  const suffixByKind = {
    byte: "b",
    short: "s",
    int: "",
    long: "l",
    float: "f",
    double: "d"
  };
  const suffix = node.suffix || suffixByKind[node.kind] || "";
  return `${formatNumericValue(node.value, node.kind)}${suffix}`;
}

function serializeNode(node, indent, options) {
  const pad = "\t".repeat(indent);
  const childPad = "\t".repeat(indent + 1);
  if (isString(node)) return quoteSnbtString(node.value);
  if (isBoolean(node)) return node.value ? "true" : "false";
  if (isNumber(node)) return serializeNumber(node);
  if (isTypedArray(node)) {
    if (node.values.length === 0) return `[${node.elementType};]`;
    const values = node.values
      .map((value) => `${childPad}${serializeNode(value, indent + 1, options)}`)
      .join("\n");
    return `[${node.elementType};\n${values}\n${pad}]`;
  }
  if (isList(node)) {
    if (node.values.length === 0) return "[ ]";
    const values = node.values
      .map((value) => `${childPad}${serializeNode(value, indent + 1, options)}`)
      .join("\n");
    return `[\n${values}\n${pad}]`;
  }
  if (isCompound(node)) {
    if (node.entries.size === 0) return "{ }";
    const entries = [...node.entries.entries()];
    if (options.sortKeys) entries.sort(([left], [right]) => left.localeCompare(right));
    const body = entries
      .map(([key, value]) => `${childPad}${quoteKey(key)}: ${serializeNode(value, indent + 1, options)}`)
      .join("\n");
    return `{\n${body}\n${pad}}`;
  }
  throw new TypeError(`Unsupported SNBT node: ${String(node)}`);
}

export function serializeSnbt(node, options = {}) {
  return `${serializeNode(node, 0, { sortKeys: options.sortKeys ?? false })}\n`;
}
