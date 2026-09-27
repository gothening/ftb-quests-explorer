export const FTB_THEME = Object.freeze({
  baseZoom: 16,
  baseButtonSize: 24,
  baseSpacing: 4,
  marginX: 40,
  marginY: 30,
  colors: {
    widgetBorder: "#1b1d1e",
    widgetBackground: "rgba(0, 0, 0, 0.267)",
    text: "#ffffff",
    hoverText: "#ffffa0",
    disabledText: "#999999",
    selectedHighlight1: "rgba(153, 153, 153, 0.376)",
    selectedHighlight2: "rgba(153, 153, 153, 0.157)",
    tasksText: "#5555ff",
    rewardsText: "#ffaa00",
    questViewTitle: "#aaaaaa",
    questCompleted: "rgba(86, 255, 86, 0.784)",
    questStarted: "rgba(0, 255, 255, 0.784)",
    questNotStarted: "rgba(255, 255, 255, 0.588)",
    questLocked: "#999999",
    dependencyCompleted: "#64dc64",
    dependencyUncompleted: "rgba(204, 163, 163, 0.706)",
    dependencyUnavailable: "rgba(204, 163, 163, 0.392)",
    dependencyRequires: "#00c8c8",
    dependencyRequiredFor: "#c8c800",
    danger: "#ff5555"
  }
});

export function questOutlineColor(quest) {
  if (quest.dependencies?.some((dependency) => !dependency.exists)) {
    return FTB_THEME.colors.danger;
  }
  if (quest.visibility?.invisible) {
    return FTB_THEME.colors.questLocked;
  }
  return FTB_THEME.colors.questNotStarted;
}
