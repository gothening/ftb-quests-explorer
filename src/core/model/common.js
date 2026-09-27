import {
  SnbtBoolean,
  SnbtCompound,
  SnbtList,
  SnbtNumber,
  SnbtString,
  booleanValue,
  isBoolean,
  isCompound,
  isList,
  isNumber,
  isString,
  isTypedArray,
  numberNode,
  numberValue,
  stringValue
} from "../parser/snbt.js";

export function normalizeId(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function decimalIdFromHex(value) {
  const normalized = normalizeId(value);
  if (!isValidHexId(normalized)) return null;
  try {
    return BigInt(`0x${normalized}`).toString(10);
  } catch {
    return null;
  }
}

export function normalizeLongId(value) {
  if (value == null || value === "") return null;
  try {
    const text = String(value).trim().replace(/[lL]$/, "");
    if (/^[+-]?\d+$/.test(text)) return BigInt(text).toString(10);
    if (/^[0-9a-fA-F]{16}$/.test(text)) return BigInt(`0x${text}`).toString(10);
  } catch {
    return String(value);
  }
  return String(value);
}

export function readLongId(compound, key) {
  const node = isCompound(compound) ? compound.get(key) : null;
  if (isNumber(node) && node.isInteger()) {
    return normalizeLongId(node.raw.replace(/[bBsSlL]$/, ""));
  }
  if (isString(node)) return normalizeLongId(node.value);
  return null;
}

export function isValidHexId(value) {
  return /^[0-9A-F]{16}$/.test(normalizeId(value));
}

export function readString(compound, key, fallback = "") {
  if (!isCompound(compound)) return fallback;
  return stringValue(compound.get(key), fallback);
}

export function readBoolean(compound, key, fallback = false) {
  if (!isCompound(compound)) return fallback;
  return booleanValue(compound.get(key), fallback);
}

export function readNumber(compound, key, fallback = 0) {
  if (!isCompound(compound)) return fallback;
  return numberValue(compound.get(key), fallback);
}

export function readInteger(compound, key, fallback = 0) {
  const value = readNumber(compound, key, fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function readStringList(compound, key) {
  const node = isCompound(compound) ? compound.get(key) : null;
  if (!isList(node)) return [];
  return node.values.filter(isString).map((value) => value.value);
}

export function readStringOrList(compound, key) {
  const node = isCompound(compound) ? compound.get(key) : null;
  if (isString(node)) return node.value;
  if (isList(node)) return node.values.filter(isString).map((value) => value.value);
  return null;
}

export function readCompound(compound, key) {
  const node = isCompound(compound) ? compound.get(key) : null;
  return isCompound(node) ? node : null;
}

export function readList(compound, key) {
  const node = isCompound(compound) ? compound.get(key) : null;
  return isList(node) ? node : null;
}

export function collectUnknownFields(compound, knownKeys) {
  const result = new Map();
  if (!isCompound(compound)) return result;
  for (const [key, value] of compound.entries) {
    if (!knownKeys.has(key)) result.set(key, value);
  }
  return result;
}

export function setField(compound, key, value) {
  if (!isCompound(compound)) return;
  compound.set(key, value);
}

export function setStringField(compound, key, value) {
  if (!isCompound(compound)) return;
  compound.set(key, new SnbtString(value));
}

export function setStringListNode(compound, key, values) {
  if (!isCompound(compound)) return;
  compound.set(key, new SnbtList(values.map((value) => new SnbtString(value))));
}

export function setBooleanField(compound, key, value) {
  if (!isCompound(compound)) return;
  compound.set(key, new SnbtBoolean(value));
}

export function setNumberField(compound, key, value, kind = "double") {
  if (!isCompound(compound)) return;
  compound.set(key, numberNode(value, kind));
}

export function removeField(compound, key) {
  if (isCompound(compound)) compound.delete(key);
}

export function mapNodesToObjects(node) {
  if (!isCompound(node)) return {};
  const result = {};
  for (const [key, value] of node.entries) {
    if (isCompound(value)) result[key] = mapNodesToObjects(value);
    else if (isList(value)) result[key] = value.values.map((entry) => mapNodesToObjects(entry));
    else if (isTypedArray(value)) result[key] = value.values.map((entry) => numberValue(entry, 0));
    else if (isString(value)) result[key] = value.value;
    else if (isBoolean(value)) result[key] = value.value;
    else if (isNumber(value)) result[key] = numberValue(value, 0);
    else result[key] = null;
  }
  return result;
}

export function knownFieldSet(keys) {
  return new Set(keys);
}

export function firstNode(list, predicate = () => true) {
  if (!isList(list)) return null;
  return list.values.find(predicate) ?? null;
}

export function ensureCompound(node) {
  return isCompound(node) ? node : new SnbtCompound();
}

export function createTextNode(value) {
  return new SnbtString(value);
}
