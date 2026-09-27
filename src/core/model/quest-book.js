import {
  decimalIdFromHex,
  normalizeId,
  normalizeLongId
} from "./common.js";

export class QuestBook {
  constructor(options = {}) {
    this.data = options.data ?? null;
    this.chapters = [];
    this.chapterGroups = [];
    this.rewardTables = [];
    this.translations = options.translations ?? new Map();
    this.files = options.files ?? new Map();
    this.metadata = options.metadata ?? {};
    this.resolver = options.resolver ?? null;

    this.quests = [];
    this.tasks = [];
    this.rewards = [];
    this.questLinks = [];
    this.images = [];

    this.chapterById = new Map();
    this.groupById = new Map();
    this.questById = new Map();
    this.taskById = new Map();
    this.rewardById = new Map();
    this.rewardTableById = new Map();
    this.dependencyGraph = null;
    this.validation = null;
  }

  addChapterGroup(group) {
    this.chapterGroups.push(group);
    this.groupById.set(normalizeId(group.id), group);
    return group;
  }

  addChapter(chapter) {
    this.chapters.push(chapter);
    this.chapterById.set(normalizeId(chapter.id), chapter);
    const group = this.groupById.get(normalizeId(chapter.groupId));
    if (group) group.addChapter(chapter);
    return chapter;
  }

  addQuest(quest) {
    this.quests.push(quest);
    this.questById.set(normalizeId(quest.id), quest);
    return quest;
  }

  addTask(task) {
    this.tasks.push(task);
    this.taskById.set(normalizeId(task.id), task);
    return task;
  }

  addReward(reward) {
    this.rewards.push(reward);
    this.rewardById.set(normalizeId(reward.id), reward);
    return reward;
  }

  addQuestLink(link) {
    this.questLinks.push(link);
    return link;
  }

  addImage(image) {
    this.images.push(image);
    return image;
  }

  addRewardTable(table) {
    this.rewardTables.push(table);
    const hexId = normalizeId(table.id);
    this.rewardTableById.set(hexId, table);
    const decimalId = table.numericId ?? decimalIdFromHex(hexId);
    if (decimalId) this.rewardTableById.set(decimalId, table);
    return table;
  }

  getQuest(id) {
    return this.questById.get(normalizeId(id)) ?? null;
  }

  getChapter(id) {
    return this.chapterById.get(normalizeId(id)) ?? null;
  }

  getGroup(id) {
    return this.groupById.get(normalizeId(id)) ?? null;
  }

  getTask(id) {
    return this.taskById.get(normalizeId(id)) ?? null;
  }

  getReward(id) {
    return this.rewardById.get(normalizeId(id)) ?? null;
  }

  getRewardTable(id) {
    const hex = normalizeId(id);
    return this.rewardTableById.get(hex)
      ?? this.rewardTableById.get(normalizeLongId(id))
      ?? null;
  }

  toJSON() {
    return {
      version: this.data?.version ?? null,
      chapterGroups: this.chapterGroups.length,
      chapters: this.chapters.length,
      quests: this.quests.length,
      tasks: this.tasks.length,
      rewards: this.rewards.length,
      questLinks: this.questLinks.length,
      images: this.images.length,
      rewardTables: this.rewardTables.length,
      translations: [...this.translations.entries()].map(([locale, table]) => [locale, table.size]),
      metadata: this.metadata
    };
  }
}
