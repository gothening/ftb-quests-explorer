# FTB Quests 2101.1.x Fixtures

This directory contains two fixture sets:

- `real/`: unmodified files copied from the current Gothening modpack instance at
  `config/ftbquests/quests`.
- `synthetic/`: a small, deliberately broad fixture for structures that the
  current instance contains no examples of, especially chapter images and quest
  links.

## Real Fixture

The copied files are:

- `real/data.snbt`
- `real/chapter_groups.snbt`
- `real/lang/zh_cn.snbt`
- `real/lang/en_us.snbt`
- `real/chapters/0b07eb66101f01b1.snbt`
- `real/chapters/23a713ec9c0e1129.snbt`
- `real/chapters/51d361ee9eb8d4d4.snbt`
- `real/chapters/0edcdada1a29519d.snbt`
- `real/reward_tables/0e67f3886a865a97.snbt`

The full source quest directory was scanned on 2026-09-25. Its current shape is:

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

Phase 1 note: the live `config/ftbquests/quests` directory was rewritten on
2026-09-25 02:11:49 after the Phase 0 scan. The Phase 0 historical baseline is
preserved in `tools/phase0-audit-counts.json`. The current live directory is
reported separately by `tools/audit-summary.json`; it currently contains 1657
quests, 1971 tasks, 1373 quest rewards, 6 quest links, 916 translation entries,
and 25 typed arrays. The copied `real/` fixture remains the Phase 0 snapshot.

The first selected real chapter contains actual item-component data and
typed-array data. The additional chapters include cross-chapter dependencies
and repeatable quests. The selected reward table contains actual 1.21
component items. The Chinese language file is the authoritative source for the
current chapter, quest, task, reward, reward-table, and chapter-group titles.

Notable real-data properties:

- All 38 chapter files omit embedded `title`, `subtitle`, and `description`.
- All 1660 quests omit embedded `title`, `subtitle`, and `description`.
- Dependency references include 10 cross-chapter references.
- Two dependency references currently point at missing quest IDs.
- There are no duplicate or malformed 16-character hexadecimal IDs in the
  scanned chapter, task, reward, link, image, group, or reward-table IDs.
- The dependency graph contains no detected cycles.

## Synthetic Fixture

`synthetic/` covers the following cases in one small book:

- one chapter group and one chapter;
- root, branching, merging, and orphan quests;
- one and multiple dependencies;
- dependency condition variants;
- hidden quest and hidden dependency settings;
- exclusive-branching `max_completable_dependents`;
- repeat cooldown and invisible-until-tasks settings;
- item task with 1.21 item components and typed arrays;
- optional task;
- multiple tasks and multiple rewards;
- item, command, XP-level, and loot-table rewards;
- chapter image with dependency and text-layout fields;
- quest link;
- Chinese text and escaped Unicode/string cases;
- unknown fields at data, group, chapter, image, link, quest, task, reward, and
  reward-table levels.

The synthetic file is intentionally schema-oriented. It is not a claim that
every unknown field is accepted by FTB Quests; it is a preservation and rendering
fixture for the external editor.

## Expected Round Trip

For Phase 1 and later, each fixture must satisfy:

```text
parse -> serialize -> parse
```

The second parse must be semantically equal to the first parse for:

- all known fields;
- all unknown fields;
- item IDs, counts, and components;
- typed arrays;
- numeric widths and suffixes;
- list and string values;
- translation-table values.

The real fixture currently passes this check with
`ftb-quests-editor/snbt.js`. The synthetic fixture exposes a known current
parser defect: `\uXXXX` escapes are decoded as literal `uXXXX` text instead of
Unicode code points.
