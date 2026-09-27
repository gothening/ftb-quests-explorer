import {
  SnbtList,
  isCompound,
  isList,
  isString,
  numberNode
} from "../parser/snbt.js";
import {
  collectUnknownFields,
  normalizeId,
  readBoolean,
  readInteger,
  readNumber,
  readString,
  removeField,
  setBooleanField,
  setStringField,
  setStringListNode
} from "./common.js";
import { ItemStack } from "./item-stack.js";
import { TextValue } from "./translation.js";

export const KNOWN_QUEST_KEYS = new Set([
  "id",
  "x",
  "y",
  "size",
  "shape",
  "icon",
  "tags",
  "dependencies",
  "dep_control_pts",
  "tasks",
  "rewards",
  "title",
  "subtitle",
  "description",
  "guide_page",
  "hide_dependency_lines",
  "hide_dependent_lines",
  "min_required_dependencies",
  "disable_recipe_mod",
  "hide_until_deps_visible",
  "hide_until_deps_complete",
  "dependency_requirement",
  "hide_text_until_complete",
  "icon_scale",
  "optional",
  "min_width",
  "can_repeat",
  "invisible",
  "invisible_until_tasks",
  "ignore_reward_blocking",
  "progression_mode",
  "hide_details_until_startable",
  "require_sequential_tasks",
  "hide_lock_icon",
  "max_completable_dependents",
  "repeat_cooldown",
  "preset",
  "disable_toast",
  "entity_vis_idle_mode",
  "entity_vis_offset_x",
  "entity_vis_offset_y",
  "entity_vis_rotation",
  "entity_vis_silhouette_mode",
  "entity_vis_size",
  "entity_vis_spin_mode",
  "entity_vis_use_as_quest_icon",
  "entity_vis_walk_mode"
]);

function readDependencies(raw) {
  const node = raw.get("dependencies");
  if (!isList(node)) return [];
  return node.values
    .filter(isString)
    .map((entry) => normalizeId(entry.value))
    .filter(Boolean);
}

function readDependencyControlPoints(raw) {
  const node = raw.get("dep_control_pts");
  if (!isCompound(node)) return {};

  const points = {};
  for (const key of node.keys()) {
    const list = node.get(key);
    if (!isList(list) || list.values.length !== 4) continue;
    const values = list.values.map((entry) => Number(entry?.value));
    if (!values.every(Number.isFinite)) continue;
    points[normalizeId(key)] = {
      first: { x: values[0], y: values[1] },
      second: { x: values[2], y: values[3] }
    };
  }
  return points;
}

function fallbackText(id, key, resolver, locale, rawNode) {
  if (resolver) return resolver.resolveObjectText("quest", id, key, locale, rawNode);
  return new TextValue({
    translationKey: `quest.${normalizeId(id)}.${key}`,
    rawNode,
    resolvedValue: rawNode?.value ?? `quest.${normalizeId(id)}.${key}`,
    locale
  });
}

export class Quest {
  constructor(raw, options = {}) {
    this.raw = raw;
    this.sourceFile = options.sourceFile ?? null;
    this.chapterId = options.chapterId ? normalizeId(options.chapterId) : null;
    this.id = normalizeId(readString(raw, "id"));
    this.x = readNumber(raw, "x", 0);
    this.y = readNumber(raw, "y", 0);
    this.size = readNumber(raw, "size", 0);
    this.shape = readString(raw, "shape");
    this.icon = raw.has("icon") ? new ItemStack(raw.get("icon")) : null;
    this.dependencies = readDependencies(raw);
    this.depControlPoints = readDependencyControlPoints(raw);
    this.tasks = [];
    this.rewards = [];
    this.title = fallbackText(this.id, "title", options.translationResolver, options.locale, raw.get("title") ?? null);
    this.subtitle = fallbackText(this.id, "quest_subtitle", options.translationResolver, options.locale, raw.get("subtitle") ?? null);
    this.description = fallbackText(this.id, "quest_desc", options.translationResolver, options.locale, raw.get("description") ?? null);
    this.unknownFields = collectUnknownFields(raw, KNOWN_QUEST_KEYS);
    this.visibility = {
      hideDependencyLines: readBoolean(raw, "hide_dependency_lines", false),
      hideDependentLines: readBoolean(raw, "hide_dependent_lines", false),
      hideUntilDepsVisible: raw.has("hide_until_deps_visible")
        ? readBoolean(raw, "hide_until_deps_visible", false)
        : null,
      hideUntilDepsComplete: raw.has("hide_until_deps_complete")
        ? readBoolean(raw, "hide_until_deps_complete", false)
        : null,
      hideTextUntilComplete: raw.has("hide_text_until_complete")
        ? readBoolean(raw, "hide_text_until_complete", false)
        : null,
      hideDetailsUntilStartable: raw.has("hide_details_until_startable")
        ? readBoolean(raw, "hide_details_until_startable", false)
        : null,
      invisible: readBoolean(raw, "invisible", false),
      invisibleUntilTasks: readInteger(raw, "invisible_until_tasks", 0),
      hideLockIcon: readBoolean(raw, "hide_lock_icon", false)
    };
    this.settings = {
      guidePage: readString(raw, "guide_page"),
      minRequiredDependencies: readInteger(raw, "min_required_dependencies", 0),
      dependencyRequirement: readString(raw, "dependency_requirement", "all_completed"),
      iconScale: readNumber(raw, "icon_scale", 1),
      optional: readBoolean(raw, "optional", false),
      minWidth: readInteger(raw, "min_width", 0),
      canRepeat: raw.has("can_repeat") ? readBoolean(raw, "can_repeat", false) : null,
      ignoreRewardBlocking: readBoolean(raw, "ignore_reward_blocking", false),
      progressionMode: readString(raw, "progression_mode"),
      requireSequentialTasks: raw.has("require_sequential_tasks")
        ? readBoolean(raw, "require_sequential_tasks", false)
        : null,
      maxCompletableDependents: readInteger(raw, "max_completable_dependents", 0),
      repeatCooldown: readInteger(raw, "repeat_cooldown", 0),
      preset: readString(raw, "preset")
    };
  }

  get taskCount() {
    return this.tasks.length;
  }

  get rewardCount() {
    return this.rewards.length;
  }

  syncToRaw() {
    if (!this.raw) return;
    if (this.raw.has("x") || this.x !== 0) this.raw.set("x", numberNode(this.x, "double"));
    if (this.raw.has("y") || this.y !== 0) this.raw.set("y", numberNode(this.y, "double"));
    if (this.shape || this.raw.has("shape")) {
      if (this.shape) setStringField(this.raw, "shape", this.shape);
      else removeField(this.raw, "shape");
    }
    if (this.size !== 0 || this.raw.has("size")) this.raw.set("size", numberNode(this.size, "double"));
    if (this.dependencies.length > 0 || this.raw.has("dependencies")) {
      setStringListNode(this.raw, "dependencies", this.dependencies);
    }
    if (this.tasks.length > 0 || this.raw.has("tasks")) {
      this.raw.set("tasks", new SnbtList(this.tasks.map((task) => task.raw)));
    }
    if (this.rewards.length > 0 || this.raw.has("rewards")) {
      this.raw.set("rewards", new SnbtList(this.rewards.map((reward) => reward.raw)));
    }
    for (const [key, value] of Object.entries({
      hide_dependency_lines: this.visibility.hideDependencyLines,
      hide_dependent_lines: this.visibility.hideDependentLines,
      hide_until_deps_visible: this.visibility.hideUntilDepsVisible,
      hide_until_deps_complete: this.visibility.hideUntilDepsComplete,
      hide_text_until_complete: this.visibility.hideTextUntilComplete,
      hide_details_until_startable: this.visibility.hideDetailsUntilStartable,
      invisible: this.visibility.invisible,
      hide_lock_icon: this.visibility.hideLockIcon
    })) {
      if (value != null) setBooleanField(this.raw, key, value);
    }
    if (this.visibility.invisibleUntilTasks > 0 || this.raw.has("invisible_until_tasks")) {
      this.raw.set("invisible_until_tasks", numberNode(this.visibility.invisibleUntilTasks, "int"));
    }
    if (this.settings.minRequiredDependencies > 0 || this.raw.has("min_required_dependencies")) {
      this.raw.set("min_required_dependencies", numberNode(this.settings.minRequiredDependencies, "int"));
    }
    if (this.settings.dependencyRequirement && this.settings.dependencyRequirement !== "all_completed") {
      setStringField(this.raw, "dependency_requirement", this.settings.dependencyRequirement);
    }
    if (this.settings.optional || this.raw.has("optional")) setBooleanField(this.raw, "optional", this.settings.optional);
    if (this.settings.minWidth > 0 || this.raw.has("min_width")) {
      this.raw.set("min_width", numberNode(this.settings.minWidth, "int"));
    }
    if (this.settings.maxCompletableDependents > 0 || this.raw.has("max_completable_dependents")) {
      this.raw.set("max_completable_dependents", numberNode(this.settings.maxCompletableDependents, "int"));
    }
    if (this.settings.repeatCooldown > 0 || this.raw.has("repeat_cooldown")) {
      this.raw.set("repeat_cooldown", numberNode(this.settings.repeatCooldown, "int"));
    }
  }

  toJSON() {
    return {
      id: this.id,
      chapterId: this.chapterId,
      sourceFile: this.sourceFile,
      x: this.x,
      y: this.y,
      size: this.size,
      shape: this.shape,
      dependencies: [...this.dependencies],
      depControlPoints: this.depControlPoints,
      title: this.title.toJSON(),
      subtitle: this.subtitle.toJSON(),
      description: this.description.toJSON(),
      taskCount: this.tasks.length,
      rewardCount: this.rewards.length,
      visibility: this.visibility,
      settings: this.settings,
      unknownFields: [...this.unknownFields.keys()]
    };
  }
}
