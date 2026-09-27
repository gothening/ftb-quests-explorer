# Phase 1 Report

## 1. Implemented Files

Core:

- `src/core/parser/snbt.js`
- `src/core/parser/ftbq-loader.js`
- `src/core/parser/language-loader.js`
- `src/core/adapter/ftb-quests-2101-adapter.js`
- `src/core/model/common.js`
- `src/core/model/minecraft-text.js`
- `src/core/model/translation.js`
- `src/core/model/item-stack.js`
- `src/core/model/quest-book.js`
- `src/core/model/chapter-group.js`
- `src/core/model/chapter.js`
- `src/core/model/quest.js`
- `src/core/model/task.js`
- `src/core/model/reward.js`
- `src/core/model/reward-table.js`
- `src/core/model/quest-link.js`
- `src/core/model/chapter-image.js`
- `src/core/graph/dependency-graph.js`
- `src/core/validator/validator.js`
- `src/core/serializer/ftbq-writer.js`
- `src/core/index.js`

Tests:

- `tests/snbt/parser.test.mjs`
- `tests/model/quest-book.test.mjs`
- `tests/translations/translation-resolver.test.mjs`
- `tests/components/item-stack.test.mjs`
- `tests/dependencies/dependency-graph.test.mjs`
- `tests/validation/validator.test.mjs`
- `tests/roundtrip/core-roundtrip.test.mjs`
- `tests/helpers.mjs`

Tooling:

- `tools/phase1-verify.mjs`
- `package.json`

## 2. Modified Files

- `tools/audit-snbt.mjs` now uses the new core SNBT parser.
- `tools/roundtrip-check.mjs` now uses the typed core parser and semantic
  comparator.
- `README.md` documents the Phase 1 Core API.
- `ARCHITECTURE.md` and `COMPATIBILITY.md` contain the live-data count
  correction described below.
- `fixtures/ftbquests-2101/README.md` records the Phase 0 snapshot versus the
  later live directory rewrite.
- `tools/phase0-audit-counts.json` preserves the historical Phase 0 baseline.

## 3. Parser Changes

`src/core/parser/snbt.js` now provides a typed lossless AST:

- `SnbtCompound`
- `SnbtList`
- `SnbtTypedArray`
- `SnbtString`
- `SnbtBoolean`
- `SnbtNumber`

Implemented syntax:

- byte, short, int, long, float, and double values;
- numeric suffix preservation;
- `[B; ...]`, `[I; ...]`, and `[L; ...]`;
- nested compounds and lists;
- quoted and escaped strings;
- `\uXXXX` Unicode escapes;
- comments and optional commas;
- semantic equality that ignores formatting and key order.

The previous Unicode defect is fixed:

```text
"\u4e2d\u6587" -> 中文
```

## 4. Model Changes

The Core now has a global `QuestBook` with:

```text
data
chapters
chapterGroups
quests
tasks
rewards
questLinks
images
rewardTables
translations
files
metadata
dependencyGraph
```

It also exposes fast lookup maps:

```text
chapterById
groupById
questById
taskById
rewardById
rewardTableById
```

Chapter, quest, task, reward, link, image, group, and reward-table models keep
their raw AST plus typed fields and `unknownFields`. `sourceFile` is always a
path string, never a file object, so no cyclic model references are possible.

## 5. Translation Implementation

`language-loader.js` auto-discovers `lang/*.snbt`.

`TranslationResolver` supports:

```text
requested locale
  -> configured fallback locale
  -> en_us
  -> raw translation key
```

`TextValue` preserves:

```text
translationKey
rawText / rawValue
rawNode
resolvedText
locale
resolvedLocale
missing
```

The resolver correctly resolves real Chinese text without replacing the stored
translation key or writing resolved text back into chapter SNBT.

## 6. Minecraft Text

`MinecraftText` preserves:

- plain text;
- legacy formatted text;
- JSON text;
- style data;
- `clickEvent`;
- `hoverEvent`;
- the original raw value.

It is a data model only. Rendering belongs to Phase 2.

## 7. Item Components

`ItemStack` models:

```text
id
count
components
unknownFields
legacy
```

Unknown component IDs and nested component values remain in the raw AST. No
1.21 component data is converted into legacy `tag`/`nbt` data.

## 8. Dependency Implementation

`DependencyGraph` builds a global graph across all chapters.

API:

```text
getDependencies(questId)
getDependents(questId)
getRootQuests()
getLeafQuests()
findMissingDependencies()
findCircularDependencies()
getCrossChapterDependencies()
```

Circular dependencies do not throw parser errors. They are reported only by the
validator.

## 9. Validator

`validate(book)` returns `ERROR`, `WARNING`, and `INFO` collections.

Checks include:

- missing, invalid, and duplicate IDs;
- missing chapter groups;
- missing dependencies;
- circular dependencies;
- missing Quest Link targets;
- missing Chapter Image dependencies;
- missing reward tables;
- invalid task and reward structures;
- unknown task and reward types;
- missing resolved title translations;
- invalid ItemStacks.

## 10. Live Data Correction

The Phase 0 historical counts are preserved in
`tools/phase0-audit-counts.json`:

```text
1660 quests
1983 tasks
1371 rewards
0 quest links
920 translation entries
27 typed arrays
```

The live `config/ftbquests/quests` directory was rewritten on
2026-09-25 02:11:49 after that snapshot. The current verified live data is:

```text
38 chapters
1657 quests
1971 tasks
1373 rewards
6 quest links
0 chapter images
17 reward tables
209 reward-table entries
916 translation entries
25 typed arrays
12 cross-chapter dependencies
2 missing dependencies
0 cycles
```

The copied `fixtures/ftbquests-2101/real` files remain the Phase 0 snapshot.
The full live directory is also exercised directly by the Phase 1 tests.

## 11. Test Count

Toolchain present for later phases:

```text
Node 26.4.0
npm 11.17.0
Rust 1.98.1
Cargo 1.98.1
Go 1.27.0
```

`npm test` runs 34 Core tests:

```text
34 passed
0 failed
```

Coverage includes:

- Unicode and escaped Unicode;
- typed numbers;
- byte/int/long arrays;
- Model round trips;
- translations and JSON text;
- Item Components;
- cross-chapter dependencies;
- Quest Links;
- Chapter Images;
- unknown task types;
- unknown reward types;
- unknown fields;
- reward tables;
- circular dependencies;
- missing dependencies;
- duplicate IDs.

## 12. Verification Results

Parser and semantic roundtrip:

```text
real fixture:       9/9
synthetic fixture:  5/5
live quest directory: 59/59
```

Model:

```text
live load: 38 chapters
           1657 quests
           1971 tasks
           1373 rewards
           17 reward tables
           916 translations
```

Phase 1 verification command:

```text
npm run verify
```

Observed live load time is approximately 200-230 ms in Node, below the 1 second
target.

Live validation output:

```text
ERROR: 2 missing dependency references
WARNING: 1 unknown task type (forge_energy)
INFO: 1 missing-title summary
```

## 13. Known Limitations

- Phase 2 UI, Canvas, Tauri, Electron, and Windows packaging are not
  implemented.
- Save planning, `.bak` creation, atomic replacement, UI conflict detection,
  and undo are intentionally deferred to the save phase.
- `MinecraftText` preserves render data but does not draw it yet.
- The exact 2101.1.34 source tag was not fetched during Phase 0; the installed
  jar metadata and the 2101.1.35 source/changelog were used.
- The live quest files changed after Phase 0, so live counts intentionally
  differ from the historical Phase 0 baseline. The Phase 0 fixture is
  unchanged and still available.

PHASE 1 COMPLETE
