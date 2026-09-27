# qbedit Audit

Status: Phase 0 reference audit. `qbedit` is useful as a source of behavior and
algorithms, but it is not suitable as the architectural foundation for the
1.21.1 / FTB Quests 2101.1.x application.

## 1. Audited Revision

| Item | Value |
| --- | --- |
| Repository | `https://github.com/jmoiron/qbedit` |
| Audited commit | `65f0a71a3b1075d8d4aece99ec4bd60a9393295e` |
| Go version | `go 1.24.4` |
| License | MIT |

The clone is under `reference/qbedit`.

## 2. SNBT AST, Parser, and Serializer

### Data Representation

The parser is a PEG-generated parser built from `snbt/snbt.peg`. Its decoded
values are generic Go values:

```text
map[string]any
[]any
string
bool
int64
float64
snbt.Short
snbt.Long
snbt.FloatNum
snbt.Decimal
```

There is no lossless AST, no node identity, no source spans, and no generic
unknown-node wrapper. Unknown fields survive only because the top-level value
is a generic map. Any code that replaces a map or list field can still discard
unrepresented data.

### Grammar Coverage

The grammar supports:

- compounds and lists;
- double-quoted strings;
- JSON-style escapes;
- `\uXXXX` in the grammar;
- `false`, `true`, `0b`, and `1b`;
- signed integer, short, long, float, and double values;
- comments using `#` or `//`.

The grammar does not define:

- typed arrays such as `[I; 1, 2, 3]`;
- Minecraft's byte arrays with `[B; ...]`;
- any generic typed-array prefix;
- single-quoted strings;
- a generic raw scalar node.

This is a hard blocker for the real 1.21.1 fixture, which contains 27 typed
arrays (`[I; ...]`, `[L; ...]`).

### Number Preservation

`builder.go` preserves `Short`, `Long`, `FloatNum`, and `Decimal` spellings.
Plain integers become `int64` and plain decimals become `float64`. That means
the model cannot guarantee that all numeric widths and spellings survive a
load/edit/save cycle.

Examples of the model lose:

- byte versus plain integer intent;
- an untyped `1.0` versus `1.0d`;
- raw exponent spelling such as `1.0E-7f`;
- unknown numeric suffixes.

### Encoding

`encoder.go`:

- sorts compound keys;
- uses compact one-line formatting;
- quotes keys that are not identifiers;
- supports generic map/list/string/bool/numeric values;
- does not support typed-array nodes.

Sorted output is useful for Git-friendly saves, but the encoder is not
round-trip-safe for 1.21 item components or typed arrays.

## 3. Quest and Chapter Model

The model is split across `internal/app/quests.go`.

### Quest

`Quest` stores:

```text
raw map[string]any
ID
Title
Subtitle
Description
Chapter backlink
```

`NewQuest()` reads only `id`, `title`, `subtitle`, and `description`.
`GetTitle()` falls back to a first task's `item` or `id`.

`Quest.Sync()`:

- writes `title` back into the raw map;
- writes `subtitle` as a string;
- converts `description` to a list by splitting on newlines and trimming each
  line;
- deletes fields when the exported value is empty.

This is destructive for 1.21.1 because the real chapter files contain no text
fields. The text lives in `lang/zh_cn.snbt` and `lang/en_us.snbt`.

### Chapter

`Chapter` stores:

```text
Name
ID
Title
Filename
Icon
Subtitle
QuestLinks
GroupID
OrderIndex
Quests
raw map[string]any
```

`NewChapter()` reads the legacy text fields and `quest_links` as generic
values. It does not model chapter images or translation tables.

`Chapter.Sync()` calls `Sync()` on each quest and replaces `raw["quests"]`.
Other chapter fields are treated as read-only and remain in `raw`.

### Chapter Groups

`scanGroups()` reads `chapter_groups.snbt` and expects each group to contain
`id` and `title`. The real 1.21.1 book stores group titles in the language
table, so the current model loses group names.

### Item Stack Model

There is no 1.21 item-component model. `itemToString()` only understands a
string or a map with `id` or `item`. It does not understand:

```text
id
count
components
```

It also does not preserve a component tree as a first-class object.

## 4. File Loading and Saving

### Loading

`NewQuestBook()` expects:

```text
<root>/quests/chapter_groups.snbt
<root>/quests/chapters/*.snbt
```

`loadGroups()` returns an error if `chapter_groups.snbt` is absent.
`loadChapters()` returns on the first malformed chapter and does not build a
complete error report.

The router records only a parsed count; it does not track per-file failures or
present a structured validation result.

### Saving

There are three direct-write paths:

- `Chapter.Save()` uses `os.WriteFile(path, ..., 0644)`;
- `colorsRecolor()` uses `os.WriteFile(path, ..., 0644)`;
- `colorsRecolorOne()` uses `os.WriteFile(path, ..., 0644)`.

There is no:

- backup creation;
- temp file;
- atomic rename;
- post-write parse;
- validation;
- conflict detection;
- structured changed-file report.

The qbedit `TODO.md` itself lists backup creation, conflict detection, undo,
and stable output as future work.

### Error Handling

`App.New()` ignores the error from `NewQuestBook()`:

```go
a.QB, _ = NewQuestBook(root)
```

`reload()` does the same. A failed parse or missing groups file can therefore
leave the application with a nil or partial quest book and a later panic.

## 5. Text Formatting

`internal/app/mcformat/mcformat.go` and
`internal/app/static/mcformat.js` support:

- standard `§0` through `§f` colors;
- `k`, `l`, `m`, `n`, `o`, and `r`;
- both `§` and `&` prefixes.

They do not support:

- hex colors such as `&#RRGGBB`;
- JSON text components;
- `clickEvent`;
- `hoverEvent`;
- component arrays;
- page-break and image description directives.

This renderer can be retained only as a legacy fallback. It cannot satisfy the
1.21.1 description-rendering requirements.

## 6. Batch Editor

The batch flow lives in `internal/app/app.go` and
`internal/app/templates/batch_edit.gohtml`.

It supports:

- a text query over title/subtitle/description;
- optional case sensitivity;
- missing-title/subtitle/description filters;
- chapter/group scope;
- pagination;
- per-quest edit forms;
- an AJAX save status.

It does not support:

- preview before apply;
- search/replace diffs;
- a change-set model;
- undo;
- rollback;
- multi-file transaction;
- validation after edit;
- translation-table editing.

The save endpoint re-parses the chapter from disk before writing, which is
better than writing a stale in-memory chapter. It still writes directly and
does not update the 1.21 language store.

## 7. Color Manager

The color manager:

- scans quest title, subtitle, and description strings;
- detects standard `§`/`&` color codes;
- groups occurrences by code;
- supports whole-term replacement and one-occurrence replacement.

Important limitations:

- only the 16 standard color codes are supported;
- no hex colors;
- no JSON text component coloring;
- no formatting-code preservation model;
- the replacement algorithm manipulates strings and can miss nested or
  multiline semantic cases;
- every successful recolor writes files immediately without backup;
- the UI preview is not a semantic diff.

The term-matching and occurrence-mapping ideas are worth porting into a typed
text model. The direct file-writing implementation is not.

## 8. Tests

The repository has tests for:

- typed numeric parsing;
- simple compounds and lists;
- unicode strings;
- decimal encoding;
- optional sample-file round trips;
- group scanning;
- top-item interleaving;
- legacy quest text sync.

The full sample round-trip test is skipped:

```go
t.Skip("round-trip of full sample temporarily disabled while decimal preservation is implemented")
```

There is no 1.21.1 item-component fixture, no typed-array fixture, no
translation fixture, and no real FTB Quests 2101.1.x regression suite.

## 9. Porting Recommendations

### Worth Porting Conceptually

- generic `map[string]any` helpers;
- chapter/group ordering logic;
- batch search/filter semantics;
- term and occurrence indexing for color management;
- legacy color/format renderer as a fallback;
- dark/light UI and sidebar concepts.

### Needs a New Implementation

- a typed, lossless SNBT AST;
- typed arrays and numeric kind preservation;
- a 1.21 item-component model;
- translation-store merging;
- a change-set and preview engine;
- safe save planning;
- dependency and validation analysis;
- JSON text and hex-color rendering.

### Do Not Port

- the generated PEG parser as the final 1.21 parser;
- `Quest.Sync()` / `Chapter.Sync()` semantics;
- direct `os.WriteFile` writes;
- nil-ignoring load/reload behavior;
- the HTML-template application shell as the final desktop UI.

## 10. Conclusion

`qbedit` has useful editor behavior and testing habits, but its data model is
fundamentally a 1.20-era generic-map editor. It cannot safely edit the scanned
1.21.1 book because:

1. it cannot parse typed arrays;
2. it does not model item components;
3. it reads text from the wrong files;
4. it saves without backups or validation;
5. it writes directly on multiple code paths.

Use it as a reference for batch/color workflows and generic parsing mechanics,
not as the final architecture.
