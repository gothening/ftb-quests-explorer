import { normalizeId } from "../core/model/common.js";
import {
  createSearchIndex,
  searchViewer
} from "./search.js";

export class ViewerState {
  constructor(model) {
    this.model = model;
    this.index = createSearchIndex(model);
    const localEdges = new Map();
    for (const edge of model.edges) {
      if (edge.fromChapterId && edge.fromChapterId === edge.toChapterId) {
        localEdges.set(edge.fromChapterId, (localEdges.get(edge.fromChapterId) || 0) + 1);
      }
    }
    this.currentChapterId = [...model.chapters]
      .sort((left, right) => {
        const edgeDelta = (localEdges.get(right.id) || 0) - (localEdges.get(left.id) || 0);
        if (edgeDelta !== 0) return edgeDelta;
        return right.questCount - left.questCount;
      })[0]?.id ?? null;
    this.selectedQuestId = null;
    this.searchQuery = "";
    this.searchResults = [];
    this.zoom = 1;
    this.pan = { x: 120, y: 90 };
    this.diagnostics = model.diagnostics;
    this.selectedDiagnostic = null;
    this.rewardTableId = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason = "change") {
    for (const listener of this.listeners) listener(this, reason);
  }

  get currentChapter() {
    return this.index.chapters.get(normalizeId(this.currentChapterId)) ?? null;
  }

  get selectedQuest() {
    return this.index.quests.get(normalizeId(this.selectedQuestId)) ?? null;
  }

  get selectedRewardTable() {
    if (!this.rewardTableId) return null;
    return this.model.rewardTables.find((table) => table.id === this.rewardTableId) ?? null;
  }

  get visibleQuests() {
    const chapter = this.currentChapter;
    if (!chapter) return [];
    return chapter.questIds
      .map((id) => this.index.quests.get(normalizeId(id)))
      .filter(Boolean);
  }

  selectChapter(chapterId, options = {}) {
    const chapter = this.model.chapters.find((entry) => entry.id === chapterId);
    if (!chapter) return;
    this.currentChapterId = chapter.id;
    if (options.clearSelection !== false && !chapter.questIds.includes(this.selectedQuestId)) {
      this.selectedQuestId = null;
    }
    this.emit("chapter");
  }

  selectQuest(questId, options = {}) {
    const quest = this.model.quests.find((entry) => entry.id === questId);
    if (!quest) return false;
    this.currentChapterId = quest.chapterId;
    this.selectedQuestId = quest.id;
    this.selectedDiagnostic = null;
    if (options.rewardTableId !== undefined) this.rewardTableId = options.rewardTableId;
    this.emit("quest");
    return true;
  }

  closeQuest() {
    this.selectedQuestId = null;
    this.emit("quest");
  }

  selectDependency(dependencyId) {
    return this.selectQuest(dependencyId);
  }

  selectDependent(dependentId) {
    return this.selectQuest(dependentId);
  }

  openRewardTable(tableId) {
    this.rewardTableId = tableId;
    this.emit("reward-table");
  }

  closeRewardTable() {
    this.rewardTableId = null;
    this.emit("reward-table");
  }

  setSearch(query) {
    this.searchQuery = query;
    this.searchResults = searchViewer(this.index, query);
    this.emit("search");
  }

  clearSearch() {
    this.setSearch("");
  }

  setZoom(zoom) {
    this.zoom = Math.min(1.75, Math.max(0.25, zoom));
    this.emit("viewport");
  }

  setPan(x, y) {
    this.pan = { x, y };
    this.emit("viewport");
  }

  selectDiagnostic(issue) {
    this.selectedDiagnostic = issue;
    if (issue?.questId) this.selectQuest(issue.questId);
    else if (issue?.chapterId) this.selectChapter(issue.chapterId);
    else this.emit("diagnostic");
  }

  getDependencyEdges() {
    const visibleIds = new Set(this.visibleQuests.map((quest) => quest.id));
    return this.model.edges.filter((edge) => visibleIds.has(edge.from));
  }

  getExternalDependencies() {
    const visibleIds = new Set(this.visibleQuests.map((quest) => quest.id));
    return this.model.edges.filter((edge) => visibleIds.has(edge.from) && !visibleIds.has(edge.to));
  }

  toJSON() {
    return {
      currentChapterId: this.currentChapterId,
      selectedQuestId: this.selectedQuestId,
      searchQuery: this.searchQuery,
      searchResults: this.searchResults,
      zoom: this.zoom,
      pan: this.pan,
      rewardTableId: this.rewardTableId,
      selectedDiagnostic: this.selectedDiagnostic
    };
  }
}
