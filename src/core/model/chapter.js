import {
  SnbtList,
  SnbtString,
  isList,
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
import { ItemStack } from "./item-stack.js";
import { TextValue } from "./translation.js";

export const KNOWN_CHAPTER_KEYS = new Set([
  "id",
  "filename",
  "group",
  "order_index",
  "icon",
  "tags",
  "title",
  "subtitle",
  "always_invisible",
  "default_quest_shape",
  "default_quest_size",
  "default_hide_dependency_lines",
  "default_min_width",
  "progression_mode",
  "consume_items",
  "hide_quest_details_until_startable",
  "hide_quest_until_deps_visible",
  "hide_quest_until_deps_complete",
  "hide_text_until_complete",
  "default_repeatable_quest",
  "require_sequential_tasks",
  "autofocus_id",
  "preset",
  "quests",
  "quest_links",
  "images",
  "quest_enhance_decorative_lines",
  "quest_enhance_hidden_dependency_lines"
]);

function chapterText(id, subKey, resolver, locale, legacyNode) {
  if (resolver) return resolver.resolveObjectText("chapter", id, subKey, locale, legacyNode);
  return new TextValue({
    translationKey: `chapter.${normalizeId(id)}.${subKey}`,
    rawNode: legacyNode,
    resolvedValue: legacyNode?.value ?? `chapter.${normalizeId(id)}.${subKey}`,
    locale
  });
}

export class Chapter {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.id = normalizeId(readString(raw, "id"));
    this.filename = readString(raw, "filename");
    this.groupId = normalizeId(readString(raw, "group"));
    this.order = readInteger(raw, "order_index", 0);
    this.icon = raw.has("icon") ? new ItemStack(raw.get("icon")) : null;
    this.title = chapterText(this.id, "title", options.translationResolver, options.locale, raw.get("title") ?? null);
    this.subtitle = chapterText(this.id, "chapter_subtitle", options.translationResolver, options.locale, raw.get("subtitle") ?? null);
    this.quests = [];
    this.images = [];
    this.questLinks = [];
    this.unknownFields = collectUnknownFields(raw, KNOWN_CHAPTER_KEYS);
    this.settings = {
      alwaysInvisible: readBoolean(raw, "always_invisible", false),
      defaultQuestShape: readString(raw, "default_quest_shape"),
      defaultQuestSize: readNumber(raw, "default_quest_size", 1),
      defaultHideDependencyLines: readBoolean(raw, "default_hide_dependency_lines", false),
      defaultMinWidth: readInteger(raw, "default_min_width", 0),
      progressionMode: readString(raw, "progression_mode"),
      consumeItems: raw.has("consume_items") ? readBoolean(raw, "consume_items", false) : null,
      hideQuestDetailsUntilStartable: readBoolean(raw, "hide_quest_details_until_startable", false),
      hideQuestUntilDepsVisible: readBoolean(raw, "hide_quest_until_deps_visible", false),
      hideQuestUntilDepsComplete: readBoolean(raw, "hide_quest_until_deps_complete", false),
      hideTextUntilComplete: readBoolean(raw, "hide_text_until_complete", false),
      defaultRepeatable: readBoolean(raw, "default_repeatable_quest", false),
      requireSequentialTasks: readBoolean(raw, "require_sequential_tasks", false),
      autofocusId: normalizeId(readString(raw, "autofocus_id")),
      preset: readString(raw, "preset")
    };
  }

  addQuest(quest) {
    this.quests.push(quest);
  }

  addImage(image) {
    this.images.push(image);
  }

  addQuestLink(link) {
    this.questLinks.push(link);
  }

  get questCount() {
    return this.quests.length;
  }

  syncToRaw() {
    if (this.filename || this.raw.has("filename")) this.raw.set("filename", new SnbtString(this.filename));
    if (this.groupId || this.raw.has("group")) this.raw.set("group", new SnbtString(this.groupId));
    if (this.order !== 0 || this.raw.has("order_index")) this.raw.set("order_index", numberNode(this.order, "int"));
    if (this.quests.length > 0 || this.raw.has("quests")) {
      this.raw.set("quests", new SnbtList(this.quests.map((quest) => quest.raw)));
    }
    if (this.images.length > 0 || this.raw.has("images")) {
      this.raw.set("images", new SnbtList(this.images.map((image) => image.raw)));
    }
    if (this.questLinks.length > 0 || this.raw.has("quest_links")) {
      this.raw.set("quest_links", new SnbtList(this.questLinks.map((link) => link.raw)));
    }
  }

  toJSON() {
    return {
      id: this.id,
      filename: this.filename,
      groupId: this.groupId,
      order: this.order,
      sourceFile: this.sourceFile,
      title: this.title.toJSON(),
      subtitle: this.subtitle.toJSON(),
      questCount: this.quests.length,
      imageCount: this.images.length,
      questLinkCount: this.questLinks.length,
      settings: this.settings,
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
