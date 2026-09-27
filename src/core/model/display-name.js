const TASK_TYPE_NAMES = Object.freeze({
  item: "Item",
  kill: "Kill",
  checkmark: "Checkmark",
  location: "Location",
  advancement: "Advancement",
  observation: "Observation",
  biome: "Biome",
  structure: "Structure",
  dimension: "Dimension",
  stat: "Stat",
  fluid: "Fluid",
  xp: "XP",
  custom: "Custom",
  gamestage: "Game Stage"
});

const REWARD_TYPE_NAMES = Object.freeze({
  item: "Item",
  choice: "Choice",
  random: "Random",
  loot: "Loot Table",
  all_table: "All Table",
  command: "Command",
  xp: "XP",
  xp_levels: "XP Levels",
  advancement: "Advancement",
  toast: "Toast",
  gamestage: "Game Stage",
  currency: "Currency",
  custom: "Custom"
});

function normalizedType(type) {
  return String(type ?? "").trim().toLowerCase();
}

export function taskDisplayName(type) {
  const normalized = normalizedType(type);
  return TASK_TYPE_NAMES[normalized] ?? (type || "Task");
}

export function rewardDisplayName(type) {
  const normalized = normalizedType(type);
  return REWARD_TYPE_NAMES[normalized] ?? (type || "Reward");
}
