import fs from "node:fs";
import path from "node:path";
import {
  mapNodesToObjects,
  normalizeId
} from "../core/model/common.js";
import { nodeToJs, serializeSnbt } from "../core/parser/snbt.js";

function textToJson(text) {
  if (!text) return null;
  const json = text.toJSON();
  return {
    ...json,
    plainText: json.resolvedText?.plainText ?? "",
    resolvedText: json.resolvedText
  };
}

function itemToJson(item) {
  if (!item) return null;
  return {
    ...item.toJSON(),
    components: item.components ? mapNodesToObjects(item.components) : null,
    raw: item.raw ? nodeToJs(item.raw) : null
  };
}

function rawToJson(raw) {
  return raw ? nodeToJs(raw) : null;
}

function detectInstanceMetadata(questRoot) {
  let current = path.resolve(questRoot);
  let instanceRoot = null;
  for (let depth = 0; depth < 8; depth++) {
    if (fs.existsSync(path.join(current, "mods"))) {
      instanceRoot = current;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  let ftbQuestsVersion = null;
  if (instanceRoot) {
    const modsDirectory = path.join(instanceRoot, "mods");
    for (const file of fs.readdirSync(modsDirectory)) {
      if (!file.toLowerCase().includes("ftb-quests") || !file.toLowerCase().endsWith(".jar")) continue;
      const match = file.match(/(\d{4}\.\d+\.\d+(?:\.\d+)?)\.jar$/i);
      if (match) {
        ftbQuestsVersion = match[1];
        break;
      }
    }
  }

  return {
    instanceRoot,
    minecraftVersion: "1.21.1",
    ftbQuestsVersion
  };
}

function rewardToJson(reward, book) {
  const table = reward.tableId ? book.getRewardTable(reward.tableId) : null;
  return {
    id: reward.id,
    type: reward.type,
    questId: reward.questId,
    tableId: reward.tableId,
    rewardTableId: table?.id ?? null,
    rewardTableTitle: table ? textToJson(table.title) : null,
    weight: reward.weight,
    title: textToJson(reward.title),
    item: itemToJson(reward.item),
    data: mapNodesToObjects(reward.raw),
    raw: rawToJson(reward.raw),
    unknownFields: [...reward.unknownFields.keys()],
    sourceFile: reward.sourceFile
  };
}

function taskToJson(task, book) {
  return {
    id: task.id,
    type: task.type,
    questId: task.questId,
    optional: task.optional,
    title: textToJson(task.title),
    item: itemToJson(task.item),
    data: mapNodesToObjects(task.raw),
    raw: rawToJson(task.raw),
    rawSnbt: task.raw ? serializeSnbt(task.raw) : null,
    unknownFields: [...task.unknownFields.keys()],
    sourceFile: task.sourceFile
  };
}

function rewardTableToJson(table, book) {
  return {
    id: table.id,
    numericId: table.numericId,
    title: textToJson(table.title),
    order: table.order,
    lootSize: table.lootSize,
    emptyWeight: table.emptyWeight,
    hideTooltip: table.hideTooltip,
    useTitle: table.useTitle,
    sourceFile: table.sourceFile,
    unknownFields: [...table.unknownFields.keys()],
    entries: table.entries.map((entry) => ({
      id: entry.reward.id,
      weight: entry.weight,
      reward: rewardToJson(entry.reward, book)
    }))
  };
}

function questToJson(quest, book, chapter) {
  const dependencies = quest.dependencies.map((id) => {
    const target = book.getQuest(id);
    return {
      id,
      exists: Boolean(target),
      chapterId: target?.chapterId ?? null,
      title: target ? textToJson(target.title) : null
    };
  });
  const dependents = book.dependencyGraph.getDependents(quest.id).map((target) => ({
    id: target.id,
    chapterId: target.chapterId,
    title: textToJson(target.title)
  }));

  return {
    id: quest.id,
    chapterId: quest.chapterId,
    sourceFile: quest.sourceFile,
    x: quest.x,
    y: quest.y,
    size: quest.size,
    shape: quest.shape,
    effectiveSize: quest.size > 0 ? quest.size : (chapter?.settings?.defaultQuestSize || 1),
    effectiveShape: quest.shape || chapter?.settings?.defaultQuestShape || "circle",
    icon: itemToJson(quest.icon),
    title: textToJson(quest.title),
    subtitle: textToJson(quest.subtitle),
    description: textToJson(quest.description),
    dependencies,
    dependents,
    depControlPoints: quest.depControlPoints,
    visibility: quest.visibility,
    settings: quest.settings,
    unknownFields: [...quest.unknownFields.keys()],
    raw: rawToJson(quest.raw),
    rawSnbt: quest.raw ? serializeSnbt(quest.raw) : null,
    tasks: quest.tasks.map((task) => taskToJson(task, book)),
    rewards: quest.rewards.map((reward) => rewardToJson(reward, book))
  };
}

export function buildViewerModel(book, validation, options = {}) {
  const metadata = detectInstanceMetadata(book.metadata.root);
  const chapterMap = new Map(book.chapters.map((chapter) => [normalizeId(chapter.id), chapter]));

  const chapters = book.chapters.map((chapter) => ({
    id: chapter.id,
    filename: chapter.filename,
    groupId: chapter.groupId,
    order: chapter.order,
    title: textToJson(chapter.title),
    subtitle: textToJson(chapter.subtitle),
    sourceFile: chapter.sourceFile,
    settings: chapter.settings,
    unknownFields: [...chapter.unknownFields.keys()],
    questCount: chapter.quests.length,
    questIds: chapter.quests.map((quest) => quest.id),
    imageIds: chapter.images.map((image) => image.id),
    questLinkIds: chapter.questLinks.map((link) => link.id)
  }));

  const groups = book.chapterGroups.map((group) => ({
    id: group.id,
    title: textToJson(group.title),
    chapterIds: group.chapters.map((chapter) => chapter.id)
  }));
  const groupedChapterIds = new Set(groups.flatMap((group) => group.chapterIds));
  const ungroupedChapterIds = chapters
    .filter((chapter) => !groupedChapterIds.has(chapter.id))
    .map((chapter) => chapter.id);
  if (ungroupedChapterIds.length > 0) {
    groups.push({
      id: "",
      title: null,
      ungrouped: true,
      chapterIds: ungroupedChapterIds
    });
  }

  const quests = book.quests.map((quest) => questToJson(
    quest,
    book,
    chapterMap.get(normalizeId(quest.chapterId))
  ));
  const tasks = book.tasks.map((task) => taskToJson(task, book));
  const rewards = book.rewards.map((reward) => rewardToJson(reward, book));
  const rewardTables = book.rewardTables.map((table) => rewardTableToJson(table, book));
  const questLinks = book.questLinks.map((link) => {
    const target = book.getQuest(link.targetId);
    return {
      id: link.id,
      chapterId: book.chapters.find((chapter) => chapter.questLinks.includes(link))?.id ?? null,
      targetId: link.targetId,
      targetExists: Boolean(target),
      targetChapterId: target?.chapterId ?? null,
      targetTitle: target ? textToJson(target.title) : null,
      x: link.x,
      y: link.y,
      shape: link.shape,
      size: link.size,
      sourceFile: link.sourceFile,
      unknownFields: [...link.unknownFields.keys()],
      raw: rawToJson(link.raw)
    };
  });
  const images = book.images.map((image) => {
    const dependency = image.dependencyId ? book.getQuest(image.dependencyId) : null;
    return {
      id: image.id,
      chapterId: book.chapters.find((chapter) => chapter.images.includes(image))?.id ?? null,
      image: image.image,
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      rotation: image.rotation,
      dependencyId: image.dependencyId,
      dependencyExists: Boolean(dependency),
      dependencyTitle: dependency ? textToJson(dependency.title) : null,
      settings: {
        clickAction: image.clickAction,
        dev: image.dev,
        corner: image.corner,
        positionLocked: image.positionLocked,
        textOnImage: image.textOnImage,
        textShadow: image.textShadow,
        textInset: image.textInset,
        textHorizontalAlign: image.textHorizontalAlign,
        textVerticalAlign: image.textVerticalAlign
      },
      sourceFile: image.sourceFile,
      unknownFields: [...image.unknownFields.keys()],
      raw: rawToJson(image.raw)
    };
  });

  const edges = book.dependencyGraph.edges.map((edge) => ({
    ...edge,
    fromChapterId: edge.fromChapterId,
    toChapterId: edge.toChapterId
  }));
  const translations = [...book.translations.entries()].map(([locale, table]) => ({
    locale,
    entries: [...table.entries.entries()].map(([key, entry]) => ({
      key,
      value: entry.value
    }))
  }));

  return {
    readonly: true,
    metadata: {
      root: book.metadata.root,
      version: book.data?.version ?? null,
      fallbackLocale: book.data?.fallbackLocale ?? null,
      locale: options.locale ?? book.metadata.locale ?? null,
      locales: [...book.translations.keys()],
      minecraftVersion: metadata.minecraftVersion,
      ftbQuestsVersion: metadata.ftbQuestsVersion,
      instanceRoot: metadata.instanceRoot,
      counts: {
        ...book.metadata.counts,
        translations: [...book.translations.entries()].reduce((sum, [, table]) => sum + table.size, 0)
      }
    },
    chapters,
    groups,
    quests,
    tasks,
    rewards,
    rewardTables,
    questLinks,
    images,
    edges,
    translations,
    diagnostics: validation.toJSON()
  };
}

export function createViewerIndex(model) {
  const chapterById = new Map(model.chapters.map((chapter) => [normalizeId(chapter.id), chapter]));
  const questById = new Map(model.quests.map((quest) => [normalizeId(quest.id), quest]));
  const taskById = new Map(model.tasks.map((task) => [normalizeId(task.id), task]));
  const rewardById = new Map(model.rewards.map((reward) => [normalizeId(reward.id), reward]));
  const rewardTableById = new Map(model.rewardTables.map((table) => [normalizeId(table.id), table]));

  return {
    chapterById,
    questById,
    taskById,
    rewardById,
    rewardTableById,
    model
  };
}
