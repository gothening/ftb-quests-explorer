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
  readString,
  setBooleanField
} from "./common.js";
import { ItemStack } from "./item-stack.js";

const KNOWN_TASK_KEYS = new Set([
  "id",
  "type",
  "optional_task",
  "icon",
  "tags",
  "item",
  "count",
  "consume_items",
  "only_from_crafting",
  "match_components",
  "task_screen_only",
  "value",
  "max_input",
  "points",
  "dimension",
  "biome",
  "structure",
  "entity",
  "entity_type",
  "entity_name",
  "entity_vis_idle_mode",
  "entity_vis_offset_x",
  "entity_vis_offset_y",
  "entity_vis_rotation",
  "entity_vis_silhouette_mode",
  "entity_vis_size",
  "entity_vis_spin_mode",
  "entity_vis_use_as_quest_icon",
  "entity_vis_walk_mode",
  "stat",
  "stage",
  "advancement",
  "criterion",
  "location",
  "observation_type",
  "observe_type",
  "to_observe",
  "timer",
  "fluid",
  "tag",
  "nbt",
  "nbt_filter",
  "permission_level"
]);

export class Task {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.questId = options.questId ? normalizeId(options.questId) : null;
    this.unknownFields = new Map();
    this.data = isCompound(raw) ? raw : null;
    this.id = isCompound(raw) ? normalizeId(readString(raw, "id")) : "";
    this.type = isCompound(raw) ? readString(raw, "type", "item") : "unknown";
    this.optional = isCompound(raw) ? readBoolean(raw, "optional_task", false) : false;
    this.item = isCompound(raw) && raw.has("item") ? new ItemStack(raw.get("item")) : null;
    this.icon = isCompound(raw) && raw.has("icon") ? new ItemStack(raw.get("icon")) : null;
    this.title = null;
    this.hasCustomTitle = false;

    if (isCompound(raw)) {
      this.unknownFields = collectUnknownFields(raw, KNOWN_TASK_KEYS);
      const legacyTitle = raw.get("title") ?? null;
      this.hasCustomTitle = legacyTitle != null;
      if (options.translationResolver) {
        this.title = options.translationResolver.resolveOptionalObjectText(
          "task",
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
    this.raw.set("type", new SnbtString(this.type));
    if (this.optional) setBooleanField(this.raw, "optional_task", true);
    else this.raw.delete("optional_task");
    if (this.item?.raw) this.raw.set("item", this.item.raw);
    if (this.raw.has("count")) this.raw.set("count", numberNode(this.raw.get("count")?.value ?? 1, "long"));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      optional: this.optional,
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
