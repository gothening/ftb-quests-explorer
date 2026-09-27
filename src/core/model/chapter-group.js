import {
  collectUnknownFields,
  normalizeId,
  readString
} from "./common.js";
import { TextValue } from "./translation.js";

const KNOWN_GROUP_KEYS = new Set(["id", "title", "icon", "tags"]);

export class ChapterGroup {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.id = normalizeId(readString(raw, "id"));
    this.title = options.translationResolver
      ? options.translationResolver.resolveObjectText(
        "chapter_group",
        this.id,
        "title",
        options.locale,
        raw.get("title") ?? null
      )
      : new TextValue({
        translationKey: `chapter_group.${this.id}.title`,
        rawNode: raw.get("title") ?? null,
        resolvedValue: raw.get("title")?.value ?? `chapter_group.${this.id}.title`,
        locale: options.locale
      });
    this.unknownFields = collectUnknownFields(raw, KNOWN_GROUP_KEYS);
    this.chapters = [];
  }

  addChapter(chapter) {
    this.chapters.push(chapter);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title.toJSON(),
      sourceFile: this.sourceFile,
      chapterCount: this.chapters.length,
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
