import {
  SnbtList,
  SnbtString,
  isCompound,
  isList,
  numberNode
} from "../parser/snbt.js";
import {
  collectUnknownFields,
  decimalIdFromHex,
  normalizeId,
  readBoolean,
  readInteger,
  readNumber,
  readString
} from "./common.js";
import { Reward } from "./reward.js";
import { TextValue } from "./translation.js";

const KNOWN_TABLE_KEYS = new Set([
  "id",
  "order_index",
  "loot_size",
  "empty_weight",
  "hide_tooltip",
  "use_title",
  "rewards",
  "loot_crate",
  "loot_table_id",
  "title",
  "icon",
  "tags"
]);

export class RewardTableEntry {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.reward = new Reward(raw, options);
    this.weight = this.reward.weight;
  }

  toJSON() {
    return {
      weight: this.weight,
      reward: this.reward.toJSON()
    };
  }
}

export class RewardTable {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.id = normalizeId(readString(raw, "id"));
    this.numericId = decimalIdFromHex(this.id);
    this.order = readInteger(raw, "order_index", 0);
    this.lootSize = readInteger(raw, "loot_size", 1);
    this.emptyWeight = readNumber(raw, "empty_weight", 0);
    this.hideTooltip = readBoolean(raw, "hide_tooltip", false);
    this.useTitle = readBoolean(raw, "use_title", false);
    this.entries = [];
    this.unknownFields = collectUnknownFields(raw, KNOWN_TABLE_KEYS);
    this.title = options.translationResolver
      ? options.translationResolver.resolveObjectText(
        "reward_table",
        this.id,
        "title",
        options.locale,
        raw.get("title") ?? null
      )
      : new TextValue({
        translationKey: `reward_table.${this.id}.title`,
        rawNode: raw.get("title") ?? null,
        resolvedValue: raw.get("title")?.value ?? `reward_table.${this.id}.title`,
        locale: options.locale
      });

    const rewardList = raw.get("rewards");
    if (isList(rewardList)) {
      for (const entry of rewardList.values) {
        this.entries.push(new RewardTableEntry(entry, {
          sourceFile: this.sourceFile,
          tableId: this.id,
          translationResolver: options.translationResolver,
          locale: options.locale
        }));
      }
    }
  }

  get rewards() {
    return this.entries.map((entry) => entry.reward);
  }

  syncToRaw() {
    if (!isCompound(this.raw)) return;
    this.raw.set("id", new SnbtString(this.id));
    this.raw.set("order_index", numberNode(this.order, "int"));
    this.raw.set("loot_size", numberNode(this.lootSize, "int"));
    if (this.emptyWeight !== 0 || this.raw.has("empty_weight")) {
      this.raw.set("empty_weight", numberNode(this.emptyWeight, "float"));
    }
    this.raw.set("rewards", new SnbtList(this.entries.map((entry) => entry.raw)));
  }

  toJSON() {
    return {
      id: this.id,
      sourceFile: this.sourceFile,
      order: this.order,
      lootSize: this.lootSize,
      emptyWeight: this.emptyWeight,
      title: this.title.toJSON(),
      entries: this.entries.map((entry) => entry.toJSON()),
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
