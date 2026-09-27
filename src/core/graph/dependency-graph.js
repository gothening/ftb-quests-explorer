import { normalizeId } from "../model/common.js";

export class DependencyGraph {
  constructor(book) {
    this.book = book;
    this.nodes = new Map();
    this.edges = [];
    this.dependenciesByQuest = new Map();
    this.dependentsByQuest = new Map();
    this.missingDependencies = [];
    this.crossChapterDependencies = [];
    this.build();
  }

  build() {
    for (const quest of this.book.quests) {
      const id = normalizeId(quest.id);
      this.nodes.set(id, quest);
      this.dependenciesByQuest.set(id, []);
      this.dependentsByQuest.set(id, []);
    }

    for (const quest of this.book.quests) {
      const from = normalizeId(quest.id);
      for (const rawDependency of quest.dependencies) {
        const to = normalizeId(rawDependency);
        const target = this.book.questById.get(to);
        const edge = {
          from,
          to,
          fromChapterId: quest.chapterId,
          toChapterId: target?.chapterId ?? null,
          sourceFile: quest.sourceFile,
          crossChapter: Boolean(target && target.chapterId !== quest.chapterId)
        };
        this.edges.push(edge);
        if (!target) {
          this.missingDependencies.push({
            questId: from,
            dependencyId: to,
            chapterId: quest.chapterId,
            sourceFile: quest.sourceFile
          });
          continue;
        }
        this.dependenciesByQuest.get(from).push(target);
        this.dependentsByQuest.get(to).push(quest);
        if (edge.crossChapter) this.crossChapterDependencies.push(edge);
      }
    }
  }

  getDependencies(questId) {
    return this.dependenciesByQuest.get(normalizeId(questId)) ?? [];
  }

  getDependents(questId) {
    return this.dependentsByQuest.get(normalizeId(questId)) ?? [];
  }

  getRootQuests() {
    return this.book.quests.filter((quest) => this.getDependencies(quest.id).length === 0);
  }

  getLeafQuests() {
    return this.book.quests.filter((quest) => this.getDependents(quest.id).length === 0);
  }

  findMissingDependencies() {
    return [...this.missingDependencies];
  }

  findCircularDependencies() {
    const state = new Map();
    const stack = [];
    const cycles = [];

    const visit = (id) => {
      state.set(id, 1);
      stack.push(id);
      for (const dependency of this.dependenciesByQuest.get(id) ?? []) {
        const dependencyId = normalizeId(dependency.id);
        if (!this.nodes.has(dependencyId)) continue;
        if (state.get(dependencyId) === 1) {
          const index = stack.indexOf(dependencyId);
          if (index >= 0) cycles.push([...stack.slice(index), dependencyId]);
        } else if (!state.has(dependencyId)) {
          visit(dependencyId);
        }
      }
      stack.pop();
      state.set(id, 2);
    };

    for (const id of this.nodes.keys()) {
      if (!state.has(id)) visit(id);
    }
    return cycles;
  }

  getCrossChapterDependencies() {
    return [...this.crossChapterDependencies];
  }

  toJSON() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.length,
      missing: this.missingDependencies.length,
      crossChapter: this.crossChapterDependencies.length,
      cycles: this.findCircularDependencies()
    };
  }
}
