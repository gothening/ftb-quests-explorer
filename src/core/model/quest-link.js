import {
  isCompound
} from "../parser/snbt.js";
import {
  SnbtString,
  numberNode
} from "../parser/snbt.js";
import {
  collectUnknownFields,
  normalizeId,
  readNumber,
  readString
} from "./common.js";

const KNOWN_LINK_KEYS = new Set([
  "id",
  "linked_quest",
  "x",
  "y",
  "shape",
  "size",
  "icon",
  "tags"
]);

export class QuestLink {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.id = isCompound(raw) ? normalizeId(readString(raw, "id")) : "";
    this.targetId = isCompound(raw) ? normalizeId(readString(raw, "linked_quest")) : "";
    this.x = isCompound(raw) ? readNumber(raw, "x", 0) : 0;
    this.y = isCompound(raw) ? readNumber(raw, "y", 0) : 0;
    this.shape = isCompound(raw) ? readString(raw, "shape") : "";
    this.size = isCompound(raw) ? readNumber(raw, "size", 1) : 1;
    this.unknownFields = isCompound(raw) ? collectUnknownFields(raw, KNOWN_LINK_KEYS) : new Map();
  }

  syncToRaw() {
    if (!isCompound(this.raw)) return;
    this.raw.set("id", new SnbtString(this.id));
    this.raw.set("linked_quest", new SnbtString(this.targetId));
    this.raw.set("x", numberNode(this.x, "double"));
    this.raw.set("y", numberNode(this.y, "double"));
    if (this.shape || this.raw.has("shape")) this.raw.set("shape", new SnbtString(this.shape));
    if (this.size !== 1 || this.raw.has("size")) this.raw.set("size", numberNode(this.size, "double"));
  }

  toJSON() {
    return {
      id: this.id,
      targetId: this.targetId,
      x: this.x,
      y: this.y,
      shape: this.shape,
      size: this.size,
      sourceFile: this.sourceFile,
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
