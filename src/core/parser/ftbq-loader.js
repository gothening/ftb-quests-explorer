import fs from "node:fs";
import path from "node:path";
import {
  isCompound,
  isList,
  parseSnbt,
  stringValue
} from "./snbt.js";
import { loadLanguageTables } from "./language-loader.js";
import {
  collectUnknownFields,
  mapNodesToObjects,
  normalizeId,
  readInteger,
  readString
} from "../model/common.js";
import { QuestBook } from "../model/quest-book.js";
import { ChapterGroup } from "../model/chapter-group.js";
import { Chapter } from "../model/chapter.js";
import { Quest } from "../model/quest.js";
import { Task } from "../model/task.js";
import { Reward } from "../model/reward.js";
import { RewardTable } from "../model/reward-table.js";
import { QuestLink } from "../model/quest-link.js";
import { ChapterImage } from "../model/chapter-image.js";
import { TranslationResolver } from "../model/translation.js";
import { DependencyGraph } from "../graph/dependency-graph.js";

const KNOWN_DATA_KEYS = new Set([
  "version",
  "default_reward_team",
  "default_consume_items",
  "default_autoclaim_rewards",
  "default_quest_shape",
  "default_quest_disable_jei",
  "emergency_items",
  "emergency_items_cooldown",
  "drop_loot_crates",
  "loot_crate_no_drop",
  "disable_gui",
  "grid_scale",
  "pause_game",
  "lock_message",
  "progression_mode",
  "detection_delay",
  "show_lock_icons",
  "drop_book_on_death",
  "hide_excluded_quests",
  "fallback_locale",
  "verify_on_load",
  "suppress_all_autoclaiming",
  "presets",
  "preset"
]);

export function resolveQuestRoot(inputPath) {
  const absolute = path.resolve(inputPath);
  const candidates = [
    absolute,
    path.join(absolute, "quests"),
    path.join(absolute, "config", "ftbquests", "quests")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "data.snbt"))) return candidate;
  }
  throw new Error(`Could not find data.snbt under ${absolute}`);
}

function classifyFile(relativePath) {
  if (relativePath === "data.snbt") return "data";
  if (relativePath === "chapter_groups.snbt") return "chapter_groups";
  if (relativePath.startsWith("chapters/")) return "chapter";
  if (relativePath.startsWith("reward_tables/")) return "reward_table";
  if (relativePath.startsWith("lang/")) return "language";
  return "other";
}

export function discoverQuestFiles(questRoot) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".snbt")) continue;
      const relativePath = path.relative(questRoot, fullPath).replaceAll("\\", "/");
      files.push({
        fullPath,
        relativePath,
        kind: classifyFile(relativePath)
      });
    }
  };
  walk(questRoot);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function parseFiles(files) {
  const fileRecords = new Map();
  const parseErrors = [];
  for (const file of files) {
    const text = fs.readFileSync(file.fullPath, "utf8");
    try {
      const ast = parseSnbt(text);
      fileRecords.set(file.relativePath, {
        ...file,
        text,
        ast,
        parseError: null
      });
    } catch (error) {
      const record = {
        ...file,
        text,
        ast: null,
        parseError: String(error.message || error)
      };
      fileRecords.set(file.relativePath, record);
      parseErrors.push({ file: file.relativePath, error: record.parseError });
    }
  }
  return { fileRecords, parseErrors };
}

function getNode(ast, key) {
  return isCompound(ast) ? ast.get(key) ?? null : null;
}

function readBookData(ast) {
  const version = readInteger(ast, "version", 0);
  const fallbackLocale = readString(ast, "fallback_locale", "en_us");
  return {
    raw: ast,
    sourceFile: "data.snbt",
    version,
    fallbackLocale,
    settings: mapNodesToObjects(ast),
    unknownFields: collectUnknownFields(ast, KNOWN_DATA_KEYS)
  };
}

export function loadQuestBook(inputPath, options = {}) {
  const questRoot = resolveQuestRoot(inputPath);
  const files = discoverQuestFiles(questRoot);
  const { fileRecords, parseErrors } = parseFiles(files);
  const dataFile = fileRecords.get("data.snbt");
  const data = readBookData(dataFile?.ast ?? null);
  const language = loadLanguageTables(questRoot, parseSnbt);
  const translationResolver = new TranslationResolver(language.tables, data.fallbackLocale);
  const requestedLocale = options.locale ?? (language.tables.has("zh_cn") ? "zh_cn" : data.fallbackLocale);

  const metadata = {
    root: questRoot,
    version: data.version,
    fallbackLocale: data.fallbackLocale,
    locale: requestedLocale,
    fileCount: files.length,
    parseErrors: [...parseErrors, ...language.parseErrors]
  };
  const book = new QuestBook({
    data,
    files: fileRecords,
    translations: language.tables,
    metadata,
    resolver: translationResolver
  });

  const groupsFile = fileRecords.get("chapter_groups.snbt");
  const groupsNode = getNode(groupsFile?.ast, "chapter_groups");
  if (isList(groupsNode)) {
    for (const rawGroup of groupsNode.values) {
      if (!isCompound(rawGroup)) continue;
      book.addChapterGroup(new ChapterGroup(rawGroup, {
        sourceFile: groupsFile.relativePath,
        translationResolver,
        locale: requestedLocale
      }));
    }
  }

  for (const file of fileRecords.values()) {
    if (file.kind !== "chapter" || !isCompound(file.ast)) continue;
    const chapter = new Chapter(file.ast, {
      sourceFile: file.relativePath,
      translationResolver,
      locale: requestedLocale
    });
    if (!chapter.filename) chapter.filename = path.basename(file.relativePath, ".snbt");
    book.addChapter(chapter);

    const questsNode = getNode(file.ast, "quests");
    if (isList(questsNode)) {
      for (const rawQuest of questsNode.values) {
        if (!isCompound(rawQuest)) continue;
        const quest = new Quest(rawQuest, {
          sourceFile: file.relativePath,
          chapterId: chapter.id,
          translationResolver,
          locale: requestedLocale
        });
        chapter.addQuest(quest);
        book.addQuest(quest);

        const tasksNode = getNode(rawQuest, "tasks");
        if (isList(tasksNode)) {
          for (const rawTask of tasksNode.values) {
            if (!isCompound(rawTask)) continue;
            const task = new Task(rawTask, {
              sourceFile: file.relativePath,
              questId: quest.id,
              translationResolver,
              locale: requestedLocale
            });
            quest.tasks.push(task);
            book.addTask(task);
          }
        }

        const rewardsNode = getNode(rawQuest, "rewards");
        if (isList(rewardsNode)) {
          for (const rawReward of rewardsNode.values) {
            if (!isCompound(rawReward)) continue;
            const reward = new Reward(rawReward, {
              sourceFile: file.relativePath,
              questId: quest.id,
              translationResolver,
              locale: requestedLocale
            });
            quest.rewards.push(reward);
            book.addReward(reward);
          }
        }
      }
    }

    const linksNode = getNode(file.ast, "quest_links");
    if (isList(linksNode)) {
      for (const rawLink of linksNode.values) {
        if (!isCompound(rawLink)) continue;
        const link = new QuestLink(rawLink, { sourceFile: file.relativePath });
        chapter.addQuestLink(link);
        book.addQuestLink(link);
      }
    }

    const imagesNode = getNode(file.ast, "images");
    if (isList(imagesNode)) {
      for (const rawImage of imagesNode.values) {
        if (!isCompound(rawImage)) continue;
        const image = new ChapterImage(rawImage, { sourceFile: file.relativePath });
        chapter.addImage(image);
        book.addImage(image);
      }
    }
  }

  for (const file of fileRecords.values()) {
    if (file.kind !== "reward_table" || !isCompound(file.ast)) continue;
    book.addRewardTable(new RewardTable(file.ast, {
      sourceFile: file.relativePath,
      translationResolver,
      locale: requestedLocale
    }));
  }

  book.dependencyGraph = new DependencyGraph(book);
  metadata.counts = {
    chapterGroups: book.chapterGroups.length,
    chapters: book.chapters.length,
    quests: book.quests.length,
    tasks: book.tasks.length,
    rewards: book.rewards.length,
    questLinks: book.questLinks.length,
    images: book.images.length,
    rewardTables: book.rewardTables.length,
    rewardTableEntries: book.rewardTables.reduce((sum, table) => sum + table.entries.length, 0)
  };

  return book;
}

export async function loadQuestBookAsync(inputPath, options = {}) {
  return loadQuestBook(inputPath, options);
}

export function getFile(book, relativePath) {
  return book.files.get(relativePath.replaceAll("\\", "/")) ?? null;
}

export function getFileText(book, relativePath) {
  return getFile(book, relativePath)?.text ?? null;
}

export function getFileAst(book, relativePath) {
  return getFile(book, relativePath)?.ast ?? null;
}

export function summarizeBook(book) {
  return {
    ...book.toJSON(),
    dependencyGraph: book.dependencyGraph?.toJSON() ?? null
  };
}
