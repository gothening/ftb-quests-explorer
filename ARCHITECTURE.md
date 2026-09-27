# FTB Quests Explorer Architecture Audit

Status: Phase 0 audit only. No production viewer/editor implementation has been
migrated yet.

Phase 1 implementation status is recorded in `PHASE1_REPORT.md`.

## 1. Evidence Baseline

Audited sources:

| Source | Revision | Purpose |
| --- | --- | --- |
| `reference/ftb-quests-editor` | `3e080b682fa74eb0ef611cb4a7e7cc041cde1351` | Current browser UI/editor base |
| `reference/qbedit` | `65f0a71a3b1075d8d4aece99ec4bd60a9393295e` | Go SNBT/model/batch/color reference |
| `reference/FTB-Quests-2101.1.35` | `fec6887e92cd9d908a6752d3683b90d84b6509a5` | FTB Quests target source |

Target environment:

| Item | Value |
| --- | --- |
| Minecraft | 1.21.1 |
| Loader | NeoForge 21.1.248 |
| FTB Quests installed in the scanned instance | 2101.1.34 |
| FTB Quests source target | 2101.1.35 |
| FTB Quests data version | 13 |

The scanned quest book is at:

`..\config\ftbquests\quests`

The audit helper at `tools/audit-snbt.mjs` parsed all 59 `.snbt` files with
`ftb-quests-editor/snbt.js` and produced the following counts:

| Item | Count |
| --- | ---: |
| SNBT files | 59 |
| Chapters | 38 |
| Quests | 1660 |
| Tasks | 1983 |
| Quest rewards | 1371 |
| Quest links | 0 |
| Chapter images | 0 |
| Chapter groups | 5 |
| Reward tables | 17 |
| Reward-table entries | 209 |
| Translation entries | 920 |
| Typed arrays | 27 (`I`: 22, `L`: 5) |
| Item references | 3069 |
| Item references with `components` | 163 |

The dependency scanner found 698 dependency references, 10 cross-chapter
references, 2 missing dependency IDs, no duplicate IDs, and no detected cycles.

Phase 1 note: the live quest directory was rewritten on 2026-09-25 02:11:49
after this Phase 0 snapshot. The historical Phase 0 counts are preserved in
`tools/phase0-audit-counts.json`. The current core audit reports 1657 quests,
1971 tasks, 1373 quest rewards, 6 quest links, 25 typed arrays, 12
cross-chapter dependency edges, and 2 missing dependencies. Phase 1 tests use
the live directory explicitly and also retain the copied Phase 0 fixtures.

## 2. Current Base Editor Data Model

`reference/ftb-quests-editor/app.js` does not have a real intermediate model.
Its state is:

```text
state.files: Map<path, {
    path, handle, text, data, dirty
}>
state.chapters: decoded chapter compounds[]
state.groups: chapter_groups[] from chapter_groups.snbt
state.data: decoded data.snbt compound
state.selectedChapter
state.selectedQuestId
```

Chapter, quest, task, reward, image, and link data remain generic decoded SNBT
objects. The UI mutates those objects in place. There are no typed
`QuestBook`, `Chapter`, `Quest`, `Task`, or `Reward` classes.

This is the main architectural problem: UI behavior and persistence are coupled
directly to raw JavaScript objects. It happens to preserve unknown fields, but
it cannot separate known fields from unknown fields, cannot apply
version-specific defaults safely, and cannot validate before writing.

## 3. SNBT Parser Audit

The base parser is `reference/ftb-quests-editor/snbt.js`.

### Supported Today

- compound and list values;
- double-quoted and single-quoted strings;
- boolean literals;
- integer, short, long, float, and double suffixes;
- `0b`, `1b`, `123s`, `123L`, `1.0f`, `1.0d`;
- `[B; ...]`, `[I; ...]`, and `[L; ...]`;
- nested typed arrays and compounds;
- commas and whitespace as separators;
- line comments beginning with `//` or `#`;
- raw spelling for parsed numeric nodes via the `raw` property.

The parser successfully parsed all 59 files in the real fixture without a
parse error. A full `parse -> serialize -> parse` semantic check passed for all
59 files.

### Defects Relevant to 1.21.1

1. `\uXXXX` is not decoded. In `string()`, a backslash followed by `u` falls
   through to `out += e`, so `"\u4e2d\u6587"` becomes `u4e2du6587`.
   The synthetic fixture exposes this directly.
2. There is no source span or AST node identity. Errors report a character
   offset, but unknown fields cannot be attached to a strongly typed node.
3. There is no schema validation. A malformed dependency, missing ID, wrong
   item shape, or bad typed array is accepted until later UI code happens to
   touch it.
4. The serializer uses object property insertion order rather than the
   deterministic key order used by FTB Quests. This is semantically valid but
   creates noisy Git diffs.
5. An object with a cyclic `__file` reference cannot be serialized. This is not
   only a parser issue; it breaks the base editor's save path (see section 8).
6. The parser accepts unquoted keys through a permissive token scan. It does
   not normalize or reject duplicate keys.

### Required Parser Shape for the New Core

The replacement should expose a lossless typed node model:

```text
SnbtCompound
  entries: ordered map<string, SnbtNode>

SnbtList
  entries: SnbtNode[]

SnbtTypedArray
  kind: B | I | L
  entries: SnbtNumber[]

SnbtNumber
  kind: byte | short | int | long | float | double
  suffix
  numeric value
  original raw spelling

SnbtString
SnbtBoolean
```

The serializer must preserve raw spelling for untouched numeric nodes and must
write deterministic compound keys. Unknown nodes remain in the tree untouched.

## 4. Chapter Loader

The base loader:

- accepts a directory selected through `showDirectoryPicker()`;
- recursively walks it for `.snbt` files;
- normalizes paths by removing the `config/ftbquests/quests/` prefix;
- detects `data.snbt`, `chapter_groups.snbt`, and files matching
  `chapters/*.snbt`;
- stores all decoded files in `state.files`;
- builds `state.chapters` by path convention.

There is no loader for:

- `lang/*.snbt`;
- reward-table files as first-class model objects;
- chapter group titles stored in the translation files;
- version detection from `data.snbt` or `mods/`;
- resource packs or mod assets.

Because the real 1.21.1 book stores titles, subtitles, and descriptions in
`lang/zh_cn.snbt`, the base loader sees no chapter title or quest title fields
in the chapter files. The audit found zero embedded `title`, `subtitle`, or
`description` fields in all 38 real chapters and all 1660 real quests.

## 5. Quest Loader and Dependency Graph

The base editor reads `chapter.quests` as a raw array and uses:

```js
const byId = new Map(quests.map((quest) => [quest.id, quest]));
```

inside `renderCanvas()`. Dependency lines are only drawn when the dependency ID
exists in the current chapter.

This is insufficient for the real book:

- the scan found 10 valid cross-chapter dependencies;
- the rest of the graph is global, not chapter-local;
- there is no dependent index;
- there is no locked/unavailable/completed preview state;
- there is no dependency analyzer;
- missing dependencies are silently ignored by the renderer.

The new core needs a global `QuestBook` index:

```text
questById
chapterById
groupId
dependenciesByQuest
dependentsByQuest
taskById
rewardById
rewardTableById
```

Graph operations must be performed on IDs and then mapped back to chapter
locations for rendering.

## 6. Rendering Audit

The current rendering pipeline is:

```text
renderAll
  renderHeader
  renderChapterList
  renderCanvas
    render images
    draw dependency lines
    render quest nodes
  renderInspector
```

The canvas uses a fixed 4000 x 4000 coordinate world, a 72 px grid, SVG
`<line>` elements, absolute-positioned DOM nodes, and CSS transforms for zoom
and pan.

Useful pieces to keep:

- the basic canvas/grid/sidebar/inspector layout;
- fit-to-chapter calculations;
- pointer drag and pan behavior;
- node selection and inspector flow;
- SVG line geometry as a first rendering backend.

Required replacement pieces:

- a global graph model rather than chapter-local ID maps;
- dependency and dependent highlighting;
- locked, unavailable, completed-preview, optional-task, and exclusive-branch
  indicators;
- real item/image/entity asset resolution;
- Minecraft text rendering with hex colors, JSON text, `clickEvent`, and
  `hoverEvent`;
- chapter-image and quest-link rendering;
- virtualization or batched rendering for a 1660-quest book.

The base editor's `colorFor()` swatches are placeholders, not an
`AssetResolver`. It derives a color from an item string and never reads an item
texture.

## 7. Description Rendering Audit

The base editor has no Minecraft text renderer. It strips `§`/`&` codes for a
few UI labels and otherwise displays plain text.

Required renderer support:

- `§` and `&` color/format codes;
- `&#RRGGBB` and any additional FTB Quests 2101.1.x color capabilities;
- bold, italic, underlined, strikethrough, obfuscated, reset;
- JSON text arrays and objects;
- `clickEvent` and `hoverEvent`;
- description substructures such as `{image:...}`, `{@pagebreak}`, and
  in-game command substitution text;
- safe fallback to plain text when a component cannot be interpreted.

The renderer must never throw during load. An unknown component becomes a
preserved raw value and a visible fallback.

## 8. Editing and Save Audit

The base editor edits the decoded chapter object directly. For example:

```js
field("标题", input(chapter.title || "", (v) => setValue(chapter, "title", v)))
```

This assumes the old 1.20.1 layout where text lives in chapter/quest compounds.
The 1.21.1 layout stores text in `lang/<locale>.snbt`.

The save path is:

```js
async function saveFile(file) {
  file.text = SNBT.stringify(file.data);
  ...
}
```

`indexProject()` assigns these enumerable links onto each decoded chapter:

```js
chapter.__file = file;
chapter.__path = file.path;
chapter.__name = ...
```

`file.data` points back to `chapter`, so `SNBT.stringify(file.data)` encounters
the cycle `chapter.__file.data === chapter`. A direct reproduction raises
`RangeError: Maximum call stack size exceeded`. The current base editor's save
and download paths are therefore broken after normal project indexing.

Even without the cycle, the save model is unsafe:

- no `.bak` backup;
- no temporary file;
- no atomic rename;
- no post-write validation;
- no text translation write path;
- no conflict detection if the file changed on disk;
- no undo or change-set model.

The new persistence layer must use a save plan:

```text
validate model
  -> generate changed file set
  -> create .bak
  -> write temporary file
  -> parse temporary file again
  -> validate semantic round trip
  -> atomic replace
```

## 9. Browser File System Access API

The base editor uses:

- `window.showDirectoryPicker({ mode: "readwrite" })`;
- recursive `FileSystemDirectoryHandle.entries()`;
- `FileSystemFileHandle.createWritable()`;
- a directory input fallback that downloads changed files.

This workaround is suitable only for a browser. The desktop shell should own
all filesystem access:

- choose instance root or quest directory;
- enumerate files;
- read and write with explicit UTF-8 encoding;
- create backups;
- perform atomic replacement;
- list changed files;
- read resource-pack and mod-jar assets.

The frontend should not depend on browser picker APIs in the Tauri build.

## 10. Hardcoded 1.20.1 / Forge Assumptions

The base editor hardcodes or assumes:

| Assumption | Required 2101.1.x change |
| --- | --- |
| README says 1.20.1 / Forge | Detect and report 1.21.1 / NeoForge |
| Text is stored in chapter and quest compounds | Load `lang/{locale}.snbt` |
| Text fields are `title`, `subtitle`, `description` | Use translation keys such as `quest.<ID>.title` |
| Item data is `item` + `tag` | Support `{ id, count, components }` |
| Item icons are colored placeholders | Add an asset resolver |
| No group title translation | Resolve `chapter_group.<ID>.title` |
| No reward-table model | Parse `reward_tables/*.snbt` and implicit item rewards |
| Dependencies are local to a chapter | Build a global dependency/dependent index |
| Deprecated `hide` handling is enough | Support `hide_until_deps_visible` and `hide_until_deps_complete` |
| No exclusive branching UI | Support `max_completable_dependents` |
| No repeat cooldown UI | Support `repeat_cooldown` |
| No visibility/task gating UI | Support `invisible`, `invisible_until_tasks`, `hide_lock_icon`, `hide_details_until_startable` |
| No dependency requirement UI | Support `dependency_requirement` |
| No item-component matching UI | Support `match_components` and `task_screen_only` |
| Task/reward editing is raw SNBT text | Use type registries with unknown-type fallback |

## 11. 2101.1.x Field Matrix

The following fields are defined by the FTB Quests 2101.1.35 source and must be
represented explicitly by the new model.

### Quest Book

Source: `BaseQuestFile.java`

Fields include `version`, `default_reward_team`, `default_consume_items`,
`default_autoclaim_rewards`, `default_quest_shape`, `default_quest_disable_jei`,
`emergency_items`, `emergency_items_cooldown`, `drop_loot_crates`,
`loot_crate_no_drop`, `disable_gui`, `grid_scale`, `pause_game`, `lock_message`,
`progression_mode`, `detection_delay`, `show_lock_icons`,
`drop_book_on_death`, `hide_excluded_quests`, `fallback_locale`,
`verify_on_load`, `suppress_all_autoclaiming`, `presets`, and `preset`.

### Chapter Group

Source: `ChapterGroup.java`

Serialized fields are `id`, icon/tags, and translation-backed `title`.

### Chapter

Source: `Chapter.java`

Fields include `id`, `group`, `order_index`, `filename`, `always_invisible`,
`default_quest_shape`, `default_quest_size`, `default_hide_dependency_lines`,
`default_min_width`, `progression_mode`, `consume_items`,
`hide_quest_details_until_startable`, `hide_quest_until_deps_visible`,
`hide_quest_until_deps_complete`, `hide_text_until_complete`,
`default_repeatable_quest`, `require_sequential_tasks`, `autofocus_id`,
`preset`, `icon`, `tags`, `quests`, `quest_links`, and `images`.

### Quest

Source: `Quest.java`

Fields include `id`, `x`, `y`, `shape`, `guide_page`, `hide_dependency_lines`,
`hide_dependent_lines`, `min_required_dependencies`, `dependencies`,
`dep_control_pts`, `disable_recipe_mod`, `hide_until_deps_visible`,
`hide_until_deps_complete`, `dependency_requirement`, `hide_text_until_complete`,
`size`, `icon_scale`, `optional`, `min_width`, `can_repeat`, `invisible`,
`invisible_until_tasks`, `ignore_reward_blocking`, `progression_mode`,
`hide_details_until_startable`, `require_sequential_tasks`, `hide_lock_icon`,
`max_completable_dependents`, `repeat_cooldown`, `preset`, `tasks`, `rewards`,
`icon`, and `tags`.

The scan found mod-provided unknown quest fields that must survive:
`entity_vis_size`, `entity_vis_idle_mode`, `entity_vis_offset_x`,
`entity_vis_offset_y`, `entity_vis_rotation`, `entity_vis_silhouette_mode`,
`entity_vis_spin_mode`, `entity_vis_use_as_quest_icon`, `entity_vis_walk_mode`,
and chapter-level `quest_enhance_decorative_lines` and
`quest_enhance_hidden_dependency_lines`.

### Task

Source: `Task.java` and the concrete task classes.

Common fields are `id`, `type`, `optional_task`, icon, and tags.

Core task type IDs in 2101.1.35 include `item`, `custom`, `xp`, `dimension`,
`stat`, `kill`, `location`, `checkmark`, `advancement`, `observation`, `biome`,
`structure`, `gamestage`, and `fluid`.

The real book also contains `forge_energy`, `entity_type`, and `block` task
type IDs from integrations. They must be treated as unknown/plugin types when
the corresponding provider is not available.

### Reward

Source: `Reward.java` and the concrete reward classes.

Common fields are `id`, `type`, `team_reward`, `auto`,
`exclude_from_claim_all`, `ignore_reward_blocking`,
`disable_reward_screen_blur`, icon, tags, and translation-backed title.

Core reward type IDs include `item`, `choice`, `all_table`, `random`, `loot`,
`command`, `custom`, `xp`, `xp_levels`, `advancement`, `toast`, `gamestage`,
and `currency`.

Item rewards use 1.21 item stacks. Command rewards use `command`,
`permission_level`, `silent`, and `feedback_message`.

### Quest Link and Chapter Image

Sources: `QuestLink.java` and `ChapterImage.java`.

The real book has zero links and zero images, so both require synthetic
coverage.

Quest links serialize `id`, `linked_quest`, `x`, `y`, `shape`, `size`, icon,
and tags.

Chapter images serialize `id`, `x`, `y`, `width`, `height`, `rotation`, `image`,
`color`, `alpha`, `order`, `click_action`, `dev`, `corner`, `dependency`,
`position_locked`, `text_on_image`, `text_shadow`, `text_inset`,
`text_h_align`, `text_v_align`, icon, and tags.

### Reward Tables

Source: `RewardTable.java`.

Fields include `id`, `order_index`, `loot_size`, `empty_weight`,
`hide_tooltip`, `use_title`, `rewards`, `loot_crate`, and `loot_table_id`.
Each table reward has an `id`; item rewards omit `type` and therefore require
an implicit-item fallback.

## 12. Recommended Target Architecture

Use a TypeScript core plus a Tauri 2 desktop shell:

```text
frontend/
  app shell, chapter navigator, graph, inspector, search, validation panels

core/
  snbt/
    typed AST, parser, serializer, semantic comparator
  model/
    QuestBook, Chapter, ChapterGroup, Quest, Task, Reward, Link, Image
  adapter/
    FtbQuestsVersionAdapter
    FtbQuests2101Adapter
  translation/
    locale store and translation key resolver
  item/
    1.21 item stack and component model
  graph/
    dependency index, dependents, traversal, cycle detection
  validator/
    IDs, dependencies, types, required data, unknown fields
  assets/
    resource-pack, mod-jar, filesystem, fallback resolver

src-tauri/
  instance/quest-directory discovery
  file enumeration, UTF-8 reads, backups, atomic writes
  archive and asset access
  recent-instance storage

tests/
  snbt, model, translation, components, roundtrip, graph, fixtures
```

The Tauri shell is recommended over Electron because the target is a small
Windows single-file executable. Rustup/Cargo and Go were installed during Phase
1 preparation; the Phase 5 packaging toolchain is therefore present for later
desktop work, while Phase 1 itself remains Node-based.

## 13. Reuse Matrix

### Directly Reusable or Adaptable

- base editor's sidebar, canvas, zoom/pan, selection, and inspector layout;
- base editor's typed-array and numeric-suffix concepts;
- base editor's image and quest-node visual model;
- qbedit's generic map helpers and chapter/group traversal concepts;
- qbedit's batch search/filter concepts;
- qbedit's term-scanning color-management concepts;
- qbedit's legacy Minecraft color/format renderer as a fallback.

### Must Be Rewritten

- SNBT parser with Unicode escapes and typed AST nodes;
- serializer with deterministic keys and raw numeric preservation;
- Quest/Chapter/Task/Reward/Link/Image models;
- translation-file loading and editing;
- 1.21 item-stack and component handling;
- global dependency/dependent graph;
- asset resolver;
- safe save planner with backups and atomic replacement;
- validator, dependency analyzer, and batch change sets.

### Do Not Reuse Directly

- qbedit's generated Go parser as the new parser;
- qbedit's `Quest.Sync()` and text-field save behavior;
- qbedit's direct `os.WriteFile` persistence;
- base editor's raw `chapter.title` and `quest.title` edits;
- base editor's `chapter.__file` object links;
- base editor's save and download functions;
- either project's UI as a complete desktop application architecture.

## 14. License and Scope Notes

`qbedit` contains an MIT license. The cloned
`Jasons-impart/ftb-quests-editor` repository does not contain a license file at
the audited revision. Before copying substantial code from it into the final
product, the upstream license/permission situation must be confirmed.

FTB Quests itself is source-available but the mod metadata marks it as All
Rights Reserved. Use its source as a behavioral and schema reference; do not
vendor game code or assets into the desktop application.

## 15. Phase 1 Plan

Phase 1 should implement only the parser and model foundation.

1. Create a TypeScript package with `core/src/snbt/`.
2. Implement typed AST nodes, lexer, parser, and serializer.
3. Decode `\uXXXX`, `\n`, `\r`, `\t`, escaped quotes, and escaped backslashes.
4. Preserve numeric kind, suffix, and raw spelling for untouched values.
5. Preserve typed arrays as typed nodes.
6. Add deterministic compound-key output.
7. Implement `FtbQuests2101Adapter` for `data.snbt`, `chapter_groups.snbt`,
   chapters, reward tables, and `lang/*.snbt`.
8. Implement an item-stack model for `{ id, count, components }`.
9. Implement unknown-field retention through raw-node references.
10. Add `tests/snbt`, `tests/components`, `tests/quests`, `tests/chapters`,
    and `tests/roundtrip`.
11. Run every test against `fixtures/ftbquests-2101/real` and
    `fixtures/ftbquests-2101/synthetic`.
12. Require both `npm test` and the roundtrip semantic comparator to pass.

Phase 1 exit criteria:

- all real files parse;
- all real files round trip semantically;
- typed arrays survive;
- item components survive;
- unknown fields survive;
- translation keys resolve to chapter/quest/task/reward titles;
- no UI or save path is built yet.
