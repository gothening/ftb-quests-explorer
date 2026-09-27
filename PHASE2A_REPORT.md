# Phase 2A Report

## 1. UI Architecture

Phase 2A is a read-only browser viewer backed by the Phase 1 Core.

```text
FTBQ Core
  -> buildViewerModel()
  -> read-only HTTP API
  -> ViewerState
  -> renderer
```

The dev server serves:

```text
GET  /
GET  /style.css
GET  /app.js
GET  /src/**
GET  /api/health
POST /api/load
POST /api/search
```

Default local URL: `http://127.0.0.1:4173`.

There are no write, save, edit, delete, or import endpoints.

The frontend receives a JSON view model. It never reads SNBT files or calls the
Core parser directly.

## 2. Files Changed

Frontend:

- `frontend/index.html`
- `frontend/style.css`
- `frontend/app.js`

Viewer adapter:

- `src/viewer/view-model.js`
- `src/viewer/search.js`
- `src/viewer/viewer-state.js`
- `src/viewer/minecraft-text-renderer.js`

Development server:

- `dev-server.mjs`
- `package.json`
- `package-lock.json`

Core support changes:

- `src/core/validator/validator.js`
- `src/core/graph/dependency-graph.js`

Tests and tools:

- `tests/viewer/view-model.test.mjs`
- `tests/viewer/search.test.mjs`
- `tests/viewer/minecraft-text-renderer.test.mjs`
- `tests/viewer/viewer-state.test.mjs`
- `tests/viewer/server.test.mjs`
- `tools/viewer-smoke.mjs`

Documentation:

- `README.md`
- `docs/README.md`
- `docs/phase2a-viewer.png`

## 3. Reused ftb-quests-editor Components

The old editor was used for visual and interaction ideas:

- three-panel workspace;
- chapter sidebar;
- fixed graph world with grid background;
- SVG dependency lines;
- absolute-positioned quest nodes;
- shape classes for circle, square, diamond, hexagon, and octagon;
- zoom, pan, and fit interactions;
- selected-node and detail-panel flow.

The old editor's data layer was not reused:

- no `chapter.__file` references;
- no current-chapter-only dependency map;
- no direct SNBT mutation;
- no save path;
- no old title/subtitle field assumptions.

## 4. Core/UI Boundary

`buildViewerModel()` converts the typed Core model into plain JSON for the
browser:

- chapters and groups with resolved titles;
- quests with tasks, rewards, dependencies, and dependents;
- item stacks with component maps;
- reward tables and entries;
- Quest Links;
- Chapter Images;
- global dependency edges;
- diagnostics.

`ViewerState` owns navigation, selection, search, zoom, pan, and diagnostics
selection. DOM elements are rendered from state and are never the source of
truth.

## 5. Rendering Implementation

`frontend/app.js` renders:

- chapter group tree and chapter counts;
- current-chapter quest graph only;
- quest icon placeholder, title, subtitle, and selection states;
- local dependency lines;
- cross-chapter external nodes and dashed lines;
- missing dependency lines;
- chapter image placeholders;
- Quest Link nodes;
- quest details;
- task entries;
- reward entries;
- ItemStack ID, count, and expandable components;
- reward-table dialogs;
- diagnostics.

`renderMinecraftText()` supports:

- plain text;
- `§` and `&` legacy colors;
- bold, italic, underline, strikethrough, and obfuscated;
- hex colors such as `&#12AB34`;
- JSON text structures;
- `clickEvent` and `hoverEvent`;
- explicit `[Missing translation]` fallback.

## 6. Search Implementation

Global search indexes:

- chapter titles and IDs;
- quest titles, subtitles, descriptions, IDs, dependencies, and dependents;
- task IDs, types, item IDs, component IDs, and raw data;
- reward IDs, types, item IDs, table IDs, and raw data;
- reward-table titles and entries;
- translation keys and values;
- source files.

The UI opens search with `Ctrl+F`. Results include chapter and quest context
and can navigate directly to the result.

The server also exposes `POST /api/search` for integrations and tests.

## 7. Graph Implementation

The graph renders the selected chapter only, while reading dependency and
dependent data from the global `DependencyGraph`.

Supported graph behavior:

- local dependency lines;
- cross-chapter external nodes;
- missing-reference lines;
- selected quest highlighting;
- dependency and dependent highlighting;
- zoom in/out;
- pan;
- fit to visible quest nodes;
- center on selected quest.

No player completion state is simulated.

## 8. Validator UI

The bottom status bar displays:

```text
ERROR 2 / WARNING 1 / INFO 1
```

Clicking `Diagnostics` opens the diagnostics panel. Error and warning entries
show their code, source file, and message. Entries with a quest or chapter
context are clickable and navigate the graph to that location.

The existing real diagnostics remain visible and are not auto-fixed:

- two missing dependency references;
- one unknown `forge_energy` task type;
- one missing-title summary info.

## 9. Real-Data Evidence

`npm run smoke:viewer` loaded the live quest directory through the HTTP API and
checked the real UI.

Observed evidence:

```text
chapters               38
initial graph nodes    104
initial graph edges    118
readonly badge         PREVIEW / READ ONLY
console errors         0
```

Chapter-group checks:

```text
开拓之路  -> 里程碑       1 node
瓦尔特    -> 元素周期表  47 nodes
丹恒      -> 末地         1 node
三月七    -> 厨房用具    28 nodes
姬子      -> 饰品         0 nodes
```

Functional checks:

```text
unknown task             visible
cross-chapter jump       passed
Quest Link jump          passed
Reward Table dialog      passed
global search            passed
diagnostics navigation   passed
```

Synthetic fixture checks:

```text
5 quest nodes
1 Chapter Image placeholder
1 Quest Link node
```

Layouts were verified with no document overflow at:

```text
1366x768
1920x1080
2560x1440
```

Visual smoke screenshot:

`docs/phase2a-viewer.png`

## 10. Tests

```text
npm test
51 passed / 0 failed

npm run test:viewer
17 passed / 0 failed

npm run smoke:viewer
passed
```

The test suite covers:

- real quest-book loading;
- chapter navigation;
- quest selection;
- translation rendering;
- JSON and legacy description rendering;
- dependency navigation;
- cross-chapter dependencies;
- global search;
- validator display and navigation;
- unknown task display;
- reward-table display;
- Quest Link navigation;
- Chapter Image placeholder;
- read-only HTTP API.

## 11. Known Limitations

- Item icons use a text/color placeholder; real Minecraft texture resolution
  and resource-pack/mod-jar asset lookup are not implemented yet.
- Chapter Images show a missing-image/path placeholder; image asset rendering
  is deferred.
- Minecraft JSON text rendering is an approximation and does not reproduce
  every client font, tooltip, or command behavior.
- Browser directory selection uses the local dev server path input; native
  desktop file dialogs are deferred to the Tauri phase.
- No editing, saving, backup, or write-back UI exists in Phase 2A.
- No Tauri or Windows packaging work was started.
- The live quest directory differs from the Phase 0 historical snapshot; the
  viewer displays the current live data.

PHASE 2A COMPLETE
