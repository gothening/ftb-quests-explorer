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
  readBoolean,
  readInteger,
  readNumber,
  readString
} from "./common.js";

const KNOWN_IMAGE_KEYS = new Set([
  "id",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "image",
  "color",
  "alpha",
  "order",
  "click_action",
  "dev",
  "corner",
  "dependency",
  "position_locked",
  "text_on_image",
  "text_shadow",
  "text_inset",
  "text_h_align",
  "text_v_align",
  "icon",
  "tags",
  "hover",
  "click"
]);

export class ChapterImage {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.id = isCompound(raw) ? normalizeId(readString(raw, "id")) : "";
    this.x = isCompound(raw) ? readNumber(raw, "x", 0) : 0;
    this.y = isCompound(raw) ? readNumber(raw, "y", 0) : 0;
    this.width = isCompound(raw) ? readNumber(raw, "width", 1) : 1;
    this.height = isCompound(raw) ? readNumber(raw, "height", 1) : 1;
    this.rotation = isCompound(raw) ? readNumber(raw, "rotation", 0) : 0;
    this.image = isCompound(raw) ? readString(raw, "image") : "";
    this.alpha = isCompound(raw) ? readInteger(raw, "alpha", 255) : 255;
    this.order = isCompound(raw) ? readInteger(raw, "order", 0) : 0;
    this.clickAction = isCompound(raw) ? readString(raw, "click_action") : "";
    this.dependencyId = isCompound(raw) ? normalizeId(readString(raw, "dependency")) : "";
    this.dev = isCompound(raw) ? readBoolean(raw, "dev", false) : false;
    this.corner = isCompound(raw) ? readBoolean(raw, "corner", false) : false;
    this.positionLocked = isCompound(raw) ? readBoolean(raw, "position_locked", false) : false;
    this.textOnImage = isCompound(raw) ? readBoolean(raw, "text_on_image", false) : false;
    this.textShadow = isCompound(raw) ? readBoolean(raw, "text_shadow", false) : false;
    this.textInset = isCompound(raw) ? readInteger(raw, "text_inset", 0) : 0;
    this.textHorizontalAlign = isCompound(raw) ? readString(raw, "text_h_align") : "";
    this.textVerticalAlign = isCompound(raw) ? readString(raw, "text_v_align") : "";
    this.unknownFields = isCompound(raw) ? collectUnknownFields(raw, KNOWN_IMAGE_KEYS) : new Map();
  }

  syncToRaw() {
    if (!isCompound(this.raw)) return;
    this.raw.set("id", new SnbtString(this.id));
    this.raw.set("x", numberNode(this.x, "double"));
    this.raw.set("y", numberNode(this.y, "double"));
    this.raw.set("width", numberNode(this.width, "double"));
    this.raw.set("height", numberNode(this.height, "double"));
    this.raw.set("rotation", numberNode(this.rotation, "double"));
    this.raw.set("image", new SnbtString(this.image));
    if (this.alpha !== 255 || this.raw.has("alpha")) this.raw.set("alpha", numberNode(this.alpha, "int"));
    if (this.order !== 0 || this.raw.has("order")) this.raw.set("order", numberNode(this.order, "int"));
    if (this.clickAction || this.raw.has("click_action")) this.raw.set("click_action", new SnbtString(this.clickAction));
    if (this.dependencyId || this.raw.has("dependency")) this.raw.set("dependency", new SnbtString(this.dependencyId));
  }

  toJSON() {
    return {
      id: this.id,
      image: this.image,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      dependencyId: this.dependencyId,
      sourceFile: this.sourceFile,
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
