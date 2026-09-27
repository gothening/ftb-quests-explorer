function collectStrings(value, output = []) {
  if (value == null) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output);
    return output;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) collectStrings(child, output);
  }
  return output;
}

function textValueText(value) {
  if (!value) return "";
  return value.plainText || value.resolvedText?.plainText || value.translationKey || "";
}

function addEntry(entries, entry) {
  const text = [...new Set(collectStrings(entry.fields))].join(" \n ");
  if (!text.trim()) return;
  entries.push({
    ...entry,
    text,
    lowerText: text.toLowerCase()
  });
}

export function createSearchIndex(model) {
  const entries = [];
  const chapters = new Map(model.chapters.map((chapter) => [chapter.id, chapter]));
  const quests = new Map(model.quests.map((quest) => [quest.id, quest]));
  const tasksByQuest = new Map();
  const rewardsByQuest = new Map();

  for (const task of model.tasks) {
    const list = tasksByQuest.get(task.questId) ?? [];
    list.push(task);
    tasksByQuest.set(task.questId, list);
  }
  for (const reward of model.rewards) {
    const list = rewardsByQuest.get(reward.questId) ?? [];
    list.push(reward);
    rewardsByQuest.set(reward.questId, list);
  }

  for (const chapter of model.chapters) {
    addEntry(entries, {
      kind: "chapter",
      id: chapter.id,
      chapterId: chapter.id,
      questId: null,
      label: textValueText(chapter.title) || chapter.id,
      match: "",
      fields: [
        chapter.id,
        chapter.filename,
        textValueText(chapter.title),
        textValueText(chapter.subtitle),
        chapter.title?.translationKey,
        chapter.sourceFile
      ]
    });
  }

  for (const quest of model.quests) {
    addEntry(entries, {
      kind: "quest",
      id: quest.id,
      chapterId: quest.chapterId,
      questId: quest.id,
      label: textValueText(quest.title) || quest.id,
      match: "",
      fields: [
        quest.id,
        textValueText(quest.title),
        textValueText(quest.subtitle),
        textValueText(quest.description),
        quest.title?.translationKey,
        quest.subtitle?.translationKey,
        quest.description?.translationKey,
        quest.sourceFile,
        quest.dependencies.map((dependency) => dependency.id),
        quest.dependencies.map((dependency) => textValueText(dependency.title)),
        quest.dependents.map((dependent) => dependent.id),
        quest.dependents.map((dependent) => textValueText(dependent.title)),
        quest.tasks,
        quest.rewards
      ]
    });

    for (const task of tasksByQuest.get(quest.id) ?? []) {
      addEntry(entries, {
        kind: "task",
        id: task.id,
        chapterId: quest.chapterId,
        questId: quest.id,
        label: task.type,
        match: task.type,
        fields: [
          task.id,
          task.type,
          task.sourceFile,
          textValueText(task.title),
          task.title?.translationKey,
          task.item?.id,
          task.item?.componentIds,
          task.data,
          task.unknownFields
        ]
      });
    }

    for (const reward of rewardsByQuest.get(quest.id) ?? []) {
      addEntry(entries, {
        kind: "reward",
        id: reward.id,
        chapterId: quest.chapterId,
        questId: quest.id,
        label: reward.type,
        match: reward.type,
        fields: [
          reward.id,
          reward.type,
          reward.sourceFile,
          textValueText(reward.title),
          reward.title?.translationKey,
          reward.item?.id,
          reward.item?.componentIds,
          reward.tableId,
          reward.rewardTableTitle,
          reward.data,
          reward.unknownFields
        ]
      });
    }
  }

  for (const rewardTable of model.rewardTables) {
    addEntry(entries, {
      kind: "reward_table",
      id: rewardTable.id,
      chapterId: null,
      questId: null,
      label: textValueText(rewardTable.title) || rewardTable.id,
      match: "",
      fields: [
        rewardTable.id,
        rewardTable.numericId,
        textValueText(rewardTable.title),
        rewardTable.title?.translationKey,
        rewardTable.entries,
        rewardTable.sourceFile
      ]
    });
  }

  for (const translation of model.translations) {
    for (const entry of translation.entries) {
      addEntry(entries, {
        kind: "translation",
        id: entry.key,
        chapterId: null,
        questId: null,
        label: entry.key,
        match: entry.value,
        fields: [entry.key, entry.value, translation.locale]
      });
    }
  }

  return {
    entries,
    chapters,
    quests
  };
}

function matchingSnippet(entry, query) {
  const lower = entry.lowerText;
  const index = lower.indexOf(query);
  if (index < 0) return entry.text.slice(0, 120);
  const start = Math.max(0, index - 40);
  return entry.text.slice(start, Math.min(entry.text.length, index + query.length + 80));
}

export function searchViewer(index, rawQuery, limit = 200) {
  const query = String(rawQuery ?? "").trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/).filter(Boolean);
  const priority = {
    quest: 0,
    chapter: 1,
    reward_table: 2,
    task: 3,
    reward: 4,
    translation: 5
  };

  return index.entries
    .filter((entry) => terms.every((term) => entry.lowerText.includes(term)))
    .sort((left, right) => {
      const kind = (priority[left.kind] ?? 99) - (priority[right.kind] ?? 99);
      if (kind !== 0) return kind;
      return left.label.localeCompare(right.label);
    })
    .slice(0, limit)
    .map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      chapterId: entry.chapterId,
      questId: entry.questId,
      label: entry.label,
      match: matchingSnippet(entry, query)
    }));
}
