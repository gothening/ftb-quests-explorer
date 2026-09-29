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
  readLongId,
  readNumber,
  readString
} from "./common.js";
import { ItemStack } from "./item-stack.js";

const KNOWN_REWARD_KEYS = new Set([
  "id",
  "type",
  "item",
  "count",
  "random_bonus",
  "only_one",
  "xp",
  "xp_levels",
  "command",
  "permission_level",
  "silent",
  "feedback_message",
  "stage",
  "advancement",
  "toast",
  "table_id",
  "weight",
  "title",
  "team_reward",
  "auto",
  "exclude_from_claim_all",
  "ignore_reward_blocking",
  "disable_reward_screen_blur",
  "icon",
  "tags",
  "description"
]);

export class Reward {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.questId = options.questId ? normalizeId(options.questId) : null;
    this.tableId = options.tableId ? normalizeId(options.tableId) : null;
    this.isTableEntry = Boolean(options.tableId);
    this.unknownFields = new Map();
    this.data = isCompound(raw) ? raw : null;
    this.id = isCompound(raw) ? normalizeId(readString(raw, "id")) : "";
    this.type = isCompound(raw) ? readString(raw, "type", "item") : "unknown";
    this.weight = isCompound(raw) ? readNumber(raw, "weight", 1) : 1;
    this.tableId = isCompound(raw) ? readLongId(raw, "table_id") : null;
    this.item = isCompound(raw) && raw.has("item") ? new ItemStack(raw.get("item")) : null;
    this.icon = isCompound(raw) && raw.has("icon") ? new ItemStack(raw.get("icon")) : null;
    this.title = null;
    this.hasCustomTitle = false;

    if (isCompound(raw)) {
      this.unknownFields = collectUnknownFields(raw, KNOWN_REWARD_KEYS);
      const legacyTitle = raw.get("title") ?? null;
      this.hasCustomTitle = legacyTitle != null;
      if (options.translationResolver) {
        this.title = options.translationResolver.resolveOptionalObjectText(
          "reward",
          this.id,
          "title",
          options.locale,
          legacyTitle
        );
        this.hasCustomTitle = this.title != null;
      }
    }
  }

  get fieldKeys() {
    if (!isCompound(this.raw)) return [];
    return this.raw.keys().filter((key) => key !== "id" && key !== "type");
  }

  getData(key) {
    return isCompound(this.raw) ? this.raw.get(key) ?? null : null;
  }

  syncToRaw() {
    if (!isCompound(this.raw)) return;
    this.raw.set("id", new SnbtString(this.id));
    if (!this.isTableEntry || this.raw.has("type")) {
      this.raw.set("type", new SnbtString(this.type));
    }
    if (this.item?.raw) this.raw.set("item", this.item.raw);
    if (this.raw.has("weight") || this.weight !== 1) {
      this.raw.set("weight", numberNode(this.weight, "float"));
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      weight: this.weight,
      item: this.item?.toJSON() ?? null,
      icon: this.icon?.toJSON() ?? null,
      hasCustomTitle: this.hasCustomTitle,
      title: this.title?.toJSON() ?? null,
      sourceFile: this.sourceFile,
      unknownFields: [...this.unknownFields.keys()],
      fieldKeys: this.fieldKeys
    };
  }
}
