import { FTB_THEME } from "./ftb-theme.js";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function effectiveQuestSize(quest, chapter) {
  const value = number(quest.effectiveSize ?? quest.size, 0);
  return value > 0 ? value : number(chapter?.settings?.defaultQuestSize, 1);
}

export function effectiveQuestShape(quest, chapter) {
  return quest.effectiveShape || quest.shape || chapter?.settings?.defaultQuestShape || "circle";
}

export function computeChapterLayout({ quests, images, links, chapter }) {
  const baseSize = FTB_THEME.baseButtonSize;
  const baseSpacing = FTB_THEME.baseSpacing;

  const positionables = [
    ...quests.map((quest) => ({
      id: quest.id,
      kind: "quest",
      x: number(quest.x),
      y: number(quest.y),
      w: effectiveQuestSize(quest, chapter),
      h: effectiveQuestSize(quest, chapter)
    })),
    ...images.map((image) => ({
      id: image.id,
      kind: "image",
      x: number(image.x),
      y: number(image.y),
      w: Math.max(0.0625, number(image.width, 1)),
      h: Math.max(0.0625, number(image.height, 1))
    })),
    ...links.map((link) => ({
      id: link.id,
      kind: "link",
      x: number(link.x),
      y: number(link.y),
      w: Math.max(0.0625, number(link.size, 1)),
      h: Math.max(0.0625, number(link.size, 1))
    }))
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of positionables) {
    minX = Math.min(minX, item.x - item.w / 2);
    minY = Math.min(minY, item.y - item.h / 2);
    maxX = Math.max(maxX, item.x + item.w / 2);
    maxY = Math.max(maxY, item.y + item.h / 2);
  }

  if (!Number.isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }

  minX -= FTB_THEME.marginX;
  minY -= FTB_THEME.marginY;
  maxX += FTB_THEME.marginX;
  maxY += FTB_THEME.marginY;

  const scale = baseSize + baseSpacing;
  const worldWidth = Math.max(240, Math.ceil((maxX - minX) * scale));
  const worldHeight = Math.max(180, Math.ceil((maxY - minY) * scale));

  function positionFor(x, y, w, h) {
    const px = (number(x) - minX - number(w) / 2) * scale
      + baseSpacing / 2
      + baseSpacing * (number(w) - 1) / 2;
    const py = (number(y) - minY - number(h) / 2) * scale
      + baseSpacing / 2
      + baseSpacing * (number(h) - 1) / 2;
    return {
      x: px,
      y: py,
      width: Math.max(1, baseSize * number(w, 1)),
      height: Math.max(1, baseSize * number(h, 1)),
      centerX: px + Math.max(1, baseSize * number(w, 1)) / 2,
      centerY: py + Math.max(1, baseSize * number(h, 1)) / 2
    };
  }

  const questPositions = new Map();
  for (const quest of quests) {
    const size = effectiveQuestSize(quest, chapter);
    questPositions.set(quest.id, positionFor(quest.x, quest.y, size, size));
  }

  const imagePositions = new Map();
  for (const image of images) {
    imagePositions.set(image.id, positionFor(
      image.x,
      image.y,
      Math.max(0.0625, number(image.width, 1)),
      Math.max(0.0625, number(image.height, 1))
    ));
  }

  const linkPositions = new Map();
  for (const link of links) {
    const size = Math.max(0.0625, number(link.size, 1));
    linkPositions.set(link.id, positionFor(link.x, link.y, size, size));
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    worldWidth,
    worldHeight,
    questPositions,
    imagePositions,
    linkPositions,
    positionFor,
    baseSize,
    baseSpacing
  };
}

export function controlPointToWorld(point, layout, quest) {
  const size = effectiveQuestSize(quest, null);
  return layout.positionFor(point.x, point.y, size, size);
}

export function connectionPath(start, end, quest, dependencyId, layout) {
  const controlPoints = quest.depControlPoints?.[dependencyId];
  if (!controlPoints?.first || !controlPoints?.second) {
    return `M ${start.centerX} ${start.centerY} L ${end.centerX} ${end.centerY}`;
  }

  const control1 = layout.positionFor(
    controlPoints.second.x,
    controlPoints.second.y,
    effectiveQuestSize(quest, null),
    effectiveQuestSize(quest, null)
  );
  const control2 = layout.positionFor(
    controlPoints.first.x,
    controlPoints.first.y,
    effectiveQuestSize(quest, null),
    effectiveQuestSize(quest, null)
  );

  return [
    `M ${start.centerX} ${start.centerY}`,
    `C ${control1.centerX} ${control1.centerY}`,
    `${control2.centerX} ${control2.centerY}`,
    `${end.centerX} ${end.centerY}`
  ].join(" ");
}
