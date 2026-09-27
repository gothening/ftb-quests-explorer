import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChapterLayout,
  connectionPath,
  effectiveQuestShape,
  effectiveQuestSize
} from "../../src/viewer/ftb-layout.js";

const chapter = {
  settings: {
    defaultQuestShape: "circle",
    defaultQuestSize: 1
  }
};

test("uses original quest coordinates with FTB Quests button metrics", () => {
  const quests = [
    { id: "A", x: 0, y: 0, size: 0, effectiveSize: 0, effectiveShape: "" },
    { id: "B", x: 5, y: 2, size: 0, effectiveSize: 0, effectiveShape: "" }
  ];
  const layout = computeChapterLayout({
    quests,
    images: [],
    links: [],
    chapter
  });

  const a = layout.questPositions.get("A");
  const b = layout.questPositions.get("B");
  assert.deepEqual({ x: a.x, y: a.y, width: a.width, height: a.height }, {
    x: 1122,
    y: 842,
    width: 24,
    height: 24
  });
  assert.equal(b.x - a.x, 140);
  assert.equal(b.y - a.y, 56);
});

test("reads effective shape and size defaults", () => {
  assert.equal(effectiveQuestShape({ shape: "", effectiveShape: "" }, chapter), "circle");
  assert.equal(effectiveQuestSize({ size: 0, effectiveSize: 0 }, chapter), 1);
  assert.equal(effectiveQuestShape({ shape: "hexagon" }, chapter), "hexagon");
  assert.equal(effectiveQuestSize({ size: 2 }, chapter), 2);
});

test("builds cubic Bezier paths from dep_control_pts", () => {
  const quest = {
    id: "B",
    x: 5,
    y: 2,
    size: 1,
    effectiveSize: 1,
    effectiveShape: "square",
    depControlPoints: {
      A: {
        first: { x: 1, y: 0 },
        second: { x: 4, y: 2 }
      }
    }
  };
  const layout = computeChapterLayout({
    quests: [
      { id: "A", x: 0, y: 0, size: 1, effectiveSize: 1, effectiveShape: "square" },
      quest
    ],
    images: [],
    links: [],
    chapter
  });
  const path = connectionPath(
    layout.questPositions.get("A"),
    layout.questPositions.get("B"),
    quest,
    "A",
    layout
  );
  assert.equal(path.startsWith("M "), true);
  assert.equal(path.includes(" C "), true);
});
