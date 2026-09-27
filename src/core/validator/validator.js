import { isValidHexId } from "../model/common.js";

export const SEVERITY = Object.freeze({
  ERROR: "ERROR",
  WARNING: "WARNING",
  INFO: "INFO"
});

export const KNOWN_TASK_TYPES = new Set([
  "item",
  "custom",
  "xp",
  "dimension",
  "stat",
  "kill",
  "location",
  "checkmark",
  "advancement",
  "observation",
  "biome",
  "structure",
  "gamestage",
  "fluid"
]);

export const KNOWN_REWARD_TYPES = new Set([
  "item",
  "choice",
  "all_table",
  "random",
  "loot",
  "command",
  "custom",
  "xp",
  "xp_levels",
  "advancement",
  "toast",
  "gamestage",
  "currency"
]);

export class ValidationResult {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.infos = [];
  }

  add(severity, code, message, context = {}) {
    const issue = { severity, code, message, ...context };
    if (severity === SEVERITY.ERROR) this.errors.push(issue);
    else if (severity === SEVERITY.WARNING) this.warnings.push(issue);
    else this.infos.push(issue);
  }

  get valid() {
    return this.errors.length === 0;
  }

  toJSON() {
    return {
      valid: this.valid,
      errors: this.errors,
      warnings: this.warnings,
      infos: this.infos
    };
  }
}

function checkIds(result, items, label) {
  const seen = new Map();
  for (const item of items) {
    const id = item.id ?? "";
    if (!id) {
      result.add(SEVERITY.ERROR, "MISSING_ID", `${label} is missing an ID`, {
        objectType: label,
        sourceFile: item.sourceFile ?? null
      });
      continue;
    }
    if (!isValidHexId(id)) {
      result.add(SEVERITY.WARNING, "INVALID_ID", `${label} has a non-standard ID: ${id}`, {
        objectType: label,
        id,
        sourceFile: item.sourceFile ?? null
      });
    }
    if (seen.has(id)) {
      result.add(SEVERITY.ERROR, "DUPLICATE_ID", `Duplicate ${label} ID: ${id}`, {
        objectType: label,
        id,
        firstFile: seen.get(id),
        sourceFile: item.sourceFile ?? null
      });
    } else {
      seen.set(id, item.sourceFile ?? null);
    }
  }
}

function checkItem(result, item, owner, sourceFile) {
  if (!item || !item.raw) return;
  if (!item.isValid) {
    result.add(SEVERITY.WARNING, "INVALID_ITEM_STACK", `${owner} contains an invalid ItemStack`, {
      owner,
      itemId: item.id,
      count: item.count,
      sourceFile
    });
  }
}

export function validate(book) {
  const result = new ValidationResult();

  checkIds(result, book.chapterGroups, "chapter group");
  checkIds(result, book.chapters, "chapter");
  checkIds(result, book.quests, "quest");
  checkIds(result, book.tasks, "task");
  checkIds(result, book.rewards, "reward");
  checkIds(result, book.questLinks, "quest link");
  checkIds(result, book.images, "chapter image");
  checkIds(result, book.rewardTables, "reward table");

  for (const chapter of book.chapters) {
    if (chapter.groupId && !book.getGroup(chapter.groupId)) {
      result.add(SEVERITY.ERROR, "MISSING_CHAPTER_GROUP", `Chapter ${chapter.id} references a missing group`, {
        chapterId: chapter.id,
        groupId: chapter.groupId,
        sourceFile: chapter.sourceFile
      });
    }
  }

  for (const issue of book.dependencyGraph?.findMissingDependencies() ?? []) {
    result.add(SEVERITY.ERROR, "MISSING_DEPENDENCY", `Quest ${issue.questId} depends on missing quest ${issue.dependencyId}`, issue);
  }

  for (const cycle of book.dependencyGraph?.findCircularDependencies() ?? []) {
    result.add(SEVERITY.ERROR, "CIRCULAR_DEPENDENCY", `Circular dependency: ${cycle.join(" -> ")}`, {
      cycle
    });
  }

  for (const link of book.questLinks) {
    if (!link.targetId || !book.getQuest(link.targetId)) {
      result.add(SEVERITY.ERROR, "MISSING_QUEST_LINK_TARGET", `Quest link ${link.id} points to a missing quest`, {
        linkId: link.id,
        targetId: link.targetId,
        sourceFile: link.sourceFile
      });
    }
  }

  for (const image of book.images) {
    if (image.dependencyId && !book.getQuest(image.dependencyId)) {
      result.add(SEVERITY.ERROR, "MISSING_IMAGE_DEPENDENCY", `Chapter image ${image.id} depends on a missing quest`, {
        imageId: image.id,
        dependencyId: image.dependencyId,
        sourceFile: image.sourceFile
      });
    }
  }

  for (const table of book.rewardTables) {
    for (const entry of table.entries) {
      const reward = entry.reward;
      checkItem(result, reward.item, `reward ${reward.id}`, reward.sourceFile);
      if (reward.type === "loot") {
        const targetId = reward.tableId;
        if (targetId && !book.getRewardTable(targetId)) {
          result.add(SEVERITY.ERROR, "MISSING_REWARD_TABLE", `Reward ${reward.id} references missing reward table ${targetId}`, {
            rewardId: reward.id,
            tableId: targetId,
            sourceFile: reward.sourceFile
          });
        }
      }
    }
  }

  for (const reward of book.rewards) {
    checkItem(result, reward.item, `reward ${reward.id}`, reward.sourceFile);
    if (reward.type === "loot") {
      const targetId = reward.tableId;
      if (targetId && !book.getRewardTable(targetId)) {
        result.add(SEVERITY.ERROR, "MISSING_REWARD_TABLE", `Reward ${reward.id} references missing reward table ${targetId}`, {
          rewardId: reward.id,
          tableId: targetId,
          sourceFile: reward.sourceFile
        });
      }
    }
  }

  for (const quest of book.quests) {
    checkItem(result, quest.icon, `quest ${quest.id}`, quest.sourceFile);
    for (const task of quest.tasks) {
      checkItem(result, task.item, `task ${task.id}`, task.sourceFile);
      if (!KNOWN_TASK_TYPES.has(task.type)) {
        result.add(SEVERITY.WARNING, "UNKNOWN_TASK_TYPE", `Unknown task type: ${task.type}`, {
          taskId: task.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          type: task.type,
          sourceFile: task.sourceFile
        });
      }
      if (!task.id || !task.type) {
        result.add(SEVERITY.ERROR, "INVALID_TASK", `Task ${task.id || "<missing>"} is not structurally valid`, {
          taskId: task.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          sourceFile: task.sourceFile
        });
      }
      if (task.hasCustomTitle && task.title?.missing) {
        result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Task ${task.id} has missing custom title text`, {
          taskId: task.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          sourceFile: task.sourceFile
        });
      }
    }
    for (const reward of quest.rewards) {
      checkItem(result, reward.item, `reward ${reward.id}`, reward.sourceFile);
      if (!KNOWN_REWARD_TYPES.has(reward.type)) {
        result.add(SEVERITY.WARNING, "UNKNOWN_REWARD_TYPE", `Unknown reward type: ${reward.type}`, {
          rewardId: reward.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          type: reward.type,
          sourceFile: reward.sourceFile
        });
      }
      if (!reward.id || !reward.type) {
        result.add(SEVERITY.ERROR, "INVALID_REWARD", `Reward ${reward.id || "<missing>"} is not structurally valid`, {
          rewardId: reward.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          sourceFile: reward.sourceFile
        });
      }
      if (reward.hasCustomTitle && reward.title?.missing) {
        result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Reward ${reward.id} has missing custom title text`, {
          rewardId: reward.id,
          questId: quest.id,
          chapterId: quest.chapterId,
          sourceFile: reward.sourceFile
        });
      }
    }
    if (quest.title?.missing && quest.title.rawText != null) {
      result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Quest ${quest.id} has missing resolved text`, {
        questId: quest.id,
        sourceFile: quest.sourceFile
      });
    }
  }

  for (const chapter of book.chapters) {
    if (chapter.title?.missing && chapter.title.rawText != null) {
      result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Chapter ${chapter.id} has missing resolved text`, {
        chapterId: chapter.id,
        sourceFile: chapter.sourceFile
      });
    }
  }

  for (const group of book.chapterGroups) {
    if (group.title?.missing && group.title.rawText != null) {
      result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Chapter group ${group.id} has missing resolved text`, {
        groupId: group.id,
        sourceFile: group.sourceFile
      });
    }
  }

  for (const table of book.rewardTables) {
    if (table.title?.missing && table.title.rawText != null) {
      result.add(SEVERITY.INFO, "MISSING_TRANSLATION", `Reward table ${table.id} has missing resolved text`, {
        tableId: table.id,
        sourceFile: table.sourceFile
      });
    }
  }

  const missingTitleCount = [
    ...book.chapters,
    ...book.chapterGroups,
    ...book.quests,
    ...book.rewardTables,
    ...book.tasks.filter((task) => task.hasCustomTitle),
    ...book.rewards.filter((reward) => reward.hasCustomTitle)
  ].filter((object) => object.title?.missing).length;
  if (missingTitleCount > 0) {
    result.add(SEVERITY.INFO, "MISSING_TRANSLATION_SUMMARY", `${missingTitleCount} objects have no translated title`, {
      count: missingTitleCount
    });
  }

  return result;
}
