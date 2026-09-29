const runtime = {
  mode: "local",
  baseUrl: "",
  assetMap: new Map(),
  missing: "assets/missing.png"
};

const TASK_FALLBACKS = {
  checkmark: "minecraft:textures/item/knowledge_book.png",
  item: "ftbquests:textures/gui/chest.png",
  xp: "minecraft:textures/item/experience_bottle.png",
  xp_levels: "minecraft:textures/item/experience_bottle.png",
  advancement: "minecraft:textures/item/knowledge_book.png",
  dimension: "minecraft:textures/item/compass_16.png",
  biome: "minecraft:textures/item/compass_16.png",
  structure: "minecraft:textures/item/filled_map.png",
  location: "minecraft:textures/item/compass_16.png",
  kill: "minecraft:textures/item/iron_sword.png",
  stat: "minecraft:textures/item/paper.png",
  observation: "ftbquests:textures/gui/info.png",
  gamestage: "ftbquests:textures/gui/editor.png",
  fluid: "minecraft:textures/item/water_bucket.png",
  custom: "ftbquests:textures/gui/settings.png"
};

const REWARD_FALLBACKS = {
  item: "ftbquests:textures/gui/chest.png",
  choice: "ftbquests:textures/gui/chest.png",
  random: "ftbquests:textures/gui/chest.png",
  loot: "ftbquests:textures/gui/chest.png",
  all_table: "ftbquests:textures/gui/chest.png",
  command: "minecraft:textures/block/command_block_front.png",
  custom: "ftbquests:textures/gui/settings.png",
  xp: "minecraft:textures/item/experience_bottle.png",
  xp_levels: "minecraft:textures/item/experience_bottle.png",
  advancement: "minecraft:textures/item/knowledge_book.png",
  toast: "minecraft:textures/item/bell.png",
  gamestage: "ftbquests:textures/gui/editor.png",
  currency: "ftbquests:textures/gui/shop.png"
};

function documentBase() {
  return typeof document !== "undefined" && document.baseURI
    ? document.baseURI
    : "http://localhost/";
}

function apiUrl(pathname, params, baseUrl = documentBase()) {
  const url = new URL(pathname, baseUrl);
  url.search = params.toString();
  return url.toString();
}

function onlineUrl(ref) {
  const relative = runtime.assetMap.get(ref)
    ?? runtime.assetMap.get(`item:${ref}`)
    ?? runtime.assetMap.get(`image:${ref}`)
    ?? runtime.missing;
  return new URL(relative, runtime.baseUrl || documentBase()).toString();
}

export function configureResourceUrls(options = {}) {
  runtime.mode = options.mode === "online" ? "online" : "local";
  runtime.baseUrl = options.baseUrl ? new URL(options.baseUrl, documentBase()).toString() : "";
  runtime.assetMap = new Map(Object.entries(options.assetMap ?? {}));
  runtime.missing = options.missing ?? "assets/missing.png";
}

export function getResourceMode() {
  return runtime.mode;
}

export function assetUrl(ref, options = {}) {
  if (runtime.mode === "online") return onlineUrl(ref);
  const params = new URLSearchParams();
  if (options.path) params.set("path", options.path);
  if (options.locale) params.set("locale", options.locale);
  params.set("ref", ref);
  return apiUrl("api/asset", params);
}

export function itemIconUrl(itemId, options = {}) {
  if (runtime.mode === "online") return onlineUrl(itemId);
  const params = new URLSearchParams();
  if (options.path) params.set("path", options.path);
  if (options.locale) params.set("locale", options.locale);
  params.set("id", itemId);
  return apiUrl("api/item-icon", params);
}

export function taskIconRef(task) {
  const icon = task?.icon ?? task?.item;
  if (icon?.id && icon.resolution?.iconRef) {
    return { kind: "image", ref: icon.resolution.iconRef };
  }
  if (task?.icon?.id) return { kind: "item", ref: task.icon.id };
  if (task?.item?.id) return { kind: "item", ref: task.item.id };
  return { kind: "image", ref: TASK_FALLBACKS[task?.type] ?? "ftbquests:textures/gui/info.png" };
}

export function rewardIconRef(reward) {
  const icon = reward?.icon ?? reward?.item;
  if (icon?.id && icon.resolution?.iconRef) {
    return { kind: "image", ref: icon.resolution.iconRef };
  }
  if (reward?.icon?.id) return { kind: "item", ref: reward.icon.id };
  if (reward?.item?.id) return { kind: "item", ref: reward.item.id };
  return { kind: "image", ref: REWARD_FALLBACKS[reward?.type] ?? "ftbquests:textures/gui/chest.png" };
}

export function questIconRef(quest) {
  if (quest?.icon?.id && quest.icon.resolution?.iconRef) {
    return { kind: "image", ref: quest.icon.resolution.iconRef };
  }
  if (quest?.icon?.id) return { kind: "item", ref: quest.icon.id };
  const taskItem = quest?.tasks?.find((task) => task.item?.id);
  if (taskItem) return { kind: "item", ref: taskItem.item.id };
  return { kind: "image", ref: "ftbquests:textures/gui/quest_locked.png" };
}

export function chapterIconRef(chapter) {
  if (chapter?.icon?.id && chapter.icon.resolution?.iconRef) {
    return { kind: "image", ref: chapter.icon.resolution.iconRef };
  }
  if (chapter?.icon?.id) return { kind: "item", ref: chapter.icon.id };
  return { kind: "image", ref: "ftbquests:textures/item/book.png" };
}

export function shapeAssetRef(shape, layer) {
  const safeShape = String(shape || "circle").toLowerCase();
  return { kind: "image", ref: `ftbquests:textures/shapes/${safeShape}/${layer}.png` };
}

export function taskIconUrl(task, options = {}) {
  const asset = taskIconRef(task);
  return asset.kind === "item" ? itemIconUrl(asset.ref, options) : assetUrl(asset.ref, options);
}

export function rewardIconUrl(reward, options = {}) {
  const asset = rewardIconRef(reward);
  return asset.kind === "item" ? itemIconUrl(asset.ref, options) : assetUrl(asset.ref, options);
}

export function questIconUrl(quest, options = {}) {
  const asset = questIconRef(quest);
  return asset.kind === "item" ? itemIconUrl(asset.ref, options) : assetUrl(asset.ref, options);
}

export function chapterIconUrl(chapter, options = {}) {
  const asset = chapterIconRef(chapter);
  return asset.kind === "item" ? itemIconUrl(asset.ref, options) : assetUrl(asset.ref, options);
}

export function shapeAsset(shape, layer, options = {}) {
  return assetUrl(shapeAssetRef(shape, layer).ref, options);
}

export function collectAssetRefs(model) {
  const refs = new Map();
  const add = (kind, ref) => {
    if (!ref) return;
    refs.set(`${kind}:${ref}`, { kind, ref });
  };
  const addImage = (ref) => add("image", ref);
  const addItem = (item) => add("item", item?.id);

  for (const ref of [
    "ftblibrary:textures/gui/background_squares.png",
    "ftbquests:textures/item/book.png",
    "ftbquests:textures/gui/pin.png",
    "ftbquests:textures/gui/search.png",
    "ftbquests:textures/gui/quest_locked.png",
    "ftbquests:textures/gui/link.png",
    "ftbquests:textures/gui/hidden.png",
    "ftbquests:textures/gui/chest.png",
    "ftbquests:textures/gui/info.png",
    "ftbquests:textures/gui/editor.png",
    "ftbquests:textures/gui/settings.png",
    "ftbquests:textures/gui/shop.png",
    "minecraft:textures/block/command_block_front.png",
    "minecraft:textures/item/experience_bottle.png",
    "minecraft:textures/item/knowledge_book.png",
    "minecraft:textures/item/compass_16.png",
    "minecraft:textures/item/filled_map.png",
    "minecraft:textures/item/iron_sword.png",
    "minecraft:textures/item/paper.png",
    "minecraft:textures/item/water_bucket.png",
    "minecraft:textures/item/bell.png"
  ]) addImage(ref);

  for (const ref of Object.values(TASK_FALLBACKS)) addImage(ref);
  for (const ref of Object.values(REWARD_FALLBACKS)) addImage(ref);
  for (const shape of ["circle", "square", "rsquare", "diamond", "hexagon", "octagon", "gear", "heart", "pentagon", "none"]) {
    for (const layer of ["shape", "background", "outline"]) addImage(shapeAssetRef(shape, layer).ref);
  }

  for (const chapter of model.chapters) {
    addItem(chapter.icon);
    for (const image of model.images.filter((entry) => entry.chapterId === chapter.id)) addImage(image.image);
  }
  for (const quest of model.quests) {
    const icon = questIconRef(quest);
    add(icon.kind, icon.ref);
    for (const task of quest.tasks) {
      const taskAsset = taskIconRef(task);
      add(taskAsset.kind, taskAsset.ref);
    }
    for (const reward of quest.rewards) {
      const rewardAsset = rewardIconRef(reward);
      add(rewardAsset.kind, rewardAsset.ref);
    }
  }
  for (const rewardTable of model.rewardTables) {
    for (const entry of rewardTable.entries) {
      const rewardAsset = rewardIconRef(entry.reward);
      add(rewardAsset.kind, rewardAsset.ref);
    }
  }

  return [...refs.values()].sort((left, right) => `${left.kind}:${left.ref}`.localeCompare(`${right.kind}:${right.ref}`));
}
