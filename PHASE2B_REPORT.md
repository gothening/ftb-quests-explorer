# PHASE 2B REPORT

## Reference implementation

Phase 2B uses the installed FTB Quests `2101.1.34` JAR and the vendored
`FTB-Quests-2101.1.35` source tree as the visual and interaction reference.

Reviewed client classes:

- `dev.ftb.mods.ftbquests.client.gui.quests.QuestScreen`
- `dev.ftb.mods.ftbquests.client.gui.quests.ChapterPanel`
- `dev.ftb.mods.ftbquests.client.gui.quests.QuestPanel`
- `dev.ftb.mods.ftbquests.client.gui.quests.QuestButton`
- `dev.ftb.mods.ftbquests.client.gui.quests.QuestLinkButton`
- `dev.ftb.mods.ftbquests.client.gui.quests.TaskButton`
- `dev.ftb.mods.ftbquests.client.gui.quests.RewardButton`
- `dev.ftb.mods.ftbquests.client.gui.quests.ViewQuestPanel`
- `dev.ftb.mods.ftbquests.client.gui.quests.FTBQuestsTheme`
- `dev.ftb.mods.ftbquests.client.RenderUtil`

Reviewed JAR assets include `assets/ftbquests/textures/gui/*` and
`assets/ftbquests/textures/shapes/<shape>/{shape,background,outline}.png`.

## Viewer structure

The viewer now mirrors the native screen composition:

```text
QuestScreen
├── ChapterPanel
├── QuestPanel
└── ViewQuestPanel
```

- `ChapterPanel` is a compact chapter tree with chapter groups, collapse
  arrows, active-chapter highlighting, and auxiliary chapter search.
- `QuestPanel` is a free canvas using the original quest `x`/`y`, effective
  size, and effective shape.
- `ViewQuestPanel` is a centered quest detail panel opened by clicking a quest.
- Search, Diagnostics, and Validator remain auxiliary dialogs.

## Quest layout

The Web layout follows FTB Quests `QuestPanel.alignWidgets()`:

```text
buttonSize = 24
buttonSpacing = 4
x = (quest.x - minX - width / 2) * (buttonSize + buttonSpacing)
    + buttonSpacing / 2
    + buttonSpacing * (width - 1) / 2
y = (quest.y - minY - height / 2) * (buttonSize + buttonSpacing)
    + buttonSpacing / 2
    + buttonSpacing * (height - 1) / 2
```

The canvas supports pan, zoom, and fit. It does not use force-directed,
dagre, elk.js, or dependency-derived automatic layout.

## Renderers

- `QuestButton`: shape mask layers, item icon, selection, hover, missing
  dependency, hidden/locked status, and optional marker.
- `QuestLinkButton`: link icon and target navigation.
- Dependency renderer: SVG paths, straight or cubic Bezier when
  `dep_control_pts` exists, plus cross-chapter and missing-dependency styles.
- `ChapterImage`: real image resource rendered in the same quest coordinate
  system with rotation and opacity.
- `TaskButton`: real item texture when an item is present, quantity badge,
  optional marker, and tooltip.
- `RewardButton`: real item texture or type icon, quantity badge, reward-table
  navigation, and tooltip.
- `ViewQuestPanel`: title, subtitle, description, tasks, rewards, quest links,
  dependencies, and dependents, ordered like the native panel.

## Resource resolver

Added:

```text
src/server/resource-resolver.js
```

Classes:

- `ResourceResolver`
- `MinecraftAssetResolver`
- `ModJarAssetResolver`
- `FilesystemAssetResolver`
- `ZipArchive`

Resolution order:

1. Instance resource packs
2. Minecraft client JAR and asset objects
3. Mod JAR assets
4. FTB Quests fallback icon

New HTTP endpoints:

```text
GET /api/asset?ref=namespace:path
GET /api/item-icon?id=namespace:item
```

Both endpoints return a real PNG when available and a FTB hidden icon when the
referenced resource is missing.

## Verification

Commands:

```text
npm test
npm run smoke:viewer
```

`npm test` passes 54/54 tests, including the Phase 2B layout and Bezier tests.

`npm run smoke:viewer` verifies:

- reading the live Gothening quest book;
- chapter navigation;
- quest rendering;
- dependency path rendering;
- quest selection and `ViewQuestPanel`;
- task and reward icon loading;
- cross-chapter dependency rendering;
- quest-link navigation;
- reward-table dialog;
- unknown task rendering;
- search;
- diagnostics;
- 1366x768, 1920x1080, and 2560x1440 layouts;
- zero browser console errors.

It also loads the synthetic fixture to verify a real `ChapterImage`.

## Screenshot regression

```text
docs/phase2b-开拓之路.png
docs/phase2b-开拓之路-detail.png
docs/phase2b-瓦尔特.png
docs/phase2b-瓦尔特-detail.png
docs/phase2b-丹恒.png
docs/phase2b-丹恒-detail.png
docs/phase2b-三月七.png
docs/phase2b-三月七-detail.png
docs/phase2b-姬子.png
docs/phase2b-姬子-detail.png
docs/phase2b-chapter-image.png
```

## Known limitations

- The current live instance's chapter `images` arrays are all empty. Real
  ChapterImage rendering is verified with the synthetic fixture.
- Some mod item textures are model-based or absent from simple `item/` and
  `block/` texture paths. Those fall back to the FTB hidden icon.
- The quest files do not contain player `TeamData`. Locked/completed/claimed
  progress states therefore cannot be reconstructed from a static read-only
  book; the viewer shows structural availability, hidden, optional, and
  missing-dependency states instead.
- The Web viewer remains read-only. No edit, add, delete, save, or write
  action is exposed.
