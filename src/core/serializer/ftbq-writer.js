import { serializeSnbt } from "../parser/snbt.js";

export class QuestBookSerializer {
  constructor(book, options = {}) {
    this.book = book;
    this.options = {
      sortKeys: options.sortKeys ?? false,
      syncModel: options.syncModel ?? false
    };
  }

  serializeNode(node) {
    return serializeSnbt(node, this.options);
  }

  serializeChapter(chapter) {
    return this.serializeNode(chapter.raw);
  }

  serializeChapterGroup(group) {
    return this.serializeNode(group.raw);
  }

  serializeRewardTable(table) {
    return this.serializeNode(table.raw);
  }

  serializeQuestBook(book = this.book) {
    if (this.options.syncModel) this.syncModel(book);
    const result = new Map();
    for (const [relativePath, file] of book.files) {
      if (!file.ast) continue;
      result.set(relativePath, this.serializeNode(file.ast));
    }
    return result;
  }

  serializeBook(book = this.book) {
    return this.serializeQuestBook(book);
  }

  syncModel(book = this.book) {
    for (const group of book.chapterGroups) group.syncToRaw?.();
    for (const chapter of book.chapters) {
      for (const quest of chapter.quests) {
        for (const task of quest.tasks) task.syncToRaw?.();
        for (const reward of quest.rewards) reward.syncToRaw?.();
        quest.syncToRaw?.();
      }
      for (const link of chapter.questLinks) link.syncToRaw?.();
      for (const image of chapter.images) image.syncToRaw?.();
      chapter.syncToRaw?.();
    }
    for (const table of book.rewardTables) table.syncToRaw?.();
  }
}

export function serializeChapter(chapter, options = {}) {
  return serializeSnbt(chapter.raw, options);
}

export function serializeRewardTable(table, options = {}) {
  return serializeSnbt(table.raw, options);
}

export function serializeQuestBook(book, options = {}) {
  return new QuestBookSerializer(book, options).serializeQuestBook(book);
}

export function serialize(book, options = {}) {
  return serializeQuestBook(book, options);
}
