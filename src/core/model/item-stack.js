import {
  isCompound,
  isString
} from "../parser/snbt.js";
import {
  collectUnknownFields,
  readCompound,
  readInteger,
  readString
} from "./common.js";

const KNOWN_ITEM_KEYS = new Set([
  "id",
  "count",
  "Count",
  "components",
  "tag",
  "nbt",
  "NBT"
]);

export class ItemStack {
  constructor(node = null) {
    this.raw = node;
    this.id = "";
    this.count = 1;
    this.components = null;
    this.legacy = false;
    this.unknownFields = new Map();

    if (isString(node)) {
      this.id = node.value;
      this.legacy = true;
    } else if (isCompound(node)) {
      this.id = readString(node, "id");
      this.count = readInteger(node, "count", readInteger(node, "Count", 1));
      this.components = readCompound(node, "components");
      this.unknownFields = collectUnknownFields(node, KNOWN_ITEM_KEYS);
      this.legacy = node.has("Count") || node.has("tag") || node.has("nbt") || node.has("NBT");
    }
  }

  get componentIds() {
    return this.components ? this.components.keys() : [];
  }

  getComponent(id) {
    return this.components?.get(id) ?? null;
  }

  get isValid() {
    return Boolean(this.id) && Number.isFinite(this.count) && this.count >= 0;
  }

  toJSON() {
    return {
      id: this.id,
      count: this.count,
      legacy: this.legacy,
      components: this.components ? this.components.keys() : [],
      unknownFields: [...this.unknownFields.keys()],
      raw: this.raw
    };
  }
}
