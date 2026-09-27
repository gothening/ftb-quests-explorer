# FTB Quests 2101.1.x Compatibility Notes

Status: Phase 0 compatibility audit. This document records the concrete
differences between the old browser editor's 1.20.1 assumptions and the
scanned 1.21.1 / FTB Quests 2101.1.x data format.

## 1. Version Baseline

| Item | Scanned value | Notes |
| --- | --- | --- |
| Minecraft | 1.21.1 | Required by FTB Quests 2101.1.0 and later |
| Loader | NeoForge 21.1.248 | Current instance |
| FTB Quests installed jar | 2101.1.34 | `mods/ftb-quests-neoforge-2101.1.34.jar` |
| FTB Quests source target | 2101.1.35 | Audited tag `v2101.1.35` |
| Data version | 13 | `data.snbt` and `BaseQuestFile.VERSION` |
| Old editor baseline | Minecraft 1.20.1 / Forge | `ftb-quests-editor` README |

The 2101.1.35 changelog describes only a permission-checking fix relative to
2101.1.34. The target adapter should still target the 1.21.1 data schema and
validate against the installed 2101.1.34 book.

Residual audit limitation: the local source checkout is the 2101.1.35 tag. The
exact 2101.1.34 source tag could not be fetched during this session because the
GitHub connection reset. The installed `ftb-quests-neoforge-2101.1.34.jar`
metadata was inspected directly, and the 2101.1.35 changelog was used to check
the version delta. Phase 1 should add a 2101.1.34 compatibility regression run
if that source tag becomes available locally.

## 2. Quest Book Layout

The relevant real layout is:

```text
config/ftbquests/quests/
├── data.snbt
├── chapter_groups.snbt
├── chapters/
│   └── *.snbt
├── reward_tables/
│   └── *.snbt
└── lang/
    ├── en_us.snbt
    └── zh_cn.snbt
```

The current instance contains 59 SNBT files:

- 1 `data.snbt`;
- 1 `chapter_groups.snbt`;
- 38 chapter files;
- 17 reward-table files;
- 2 language files.

There is also a `.snbt.bak` file in the source directory. It is not a live
quest file and must be ignored by loaders.

## 3. Translation System

This is the largest 1.20.1 to 1.21.1 change.

In 1.20.1 and earlier, titles, subtitles, and descriptions were embedded in
chapter, quest, and task compounds. In FTB Quests 2101.1.x, translatable text
is stored in `lang/<locale>.snbt` using keys formed from the object type, the
16-character uppercase hexadecimal ID, and the translation key.

Supported translation keys:

```text
chapter_group.<ID>.title
chapter.<ID>.title
chapter.<ID>.chapter_subtitle
quest.<ID>.title
quest.<ID>.quest_subtitle
quest.<ID>.quest_desc
task.<ID>.title
reward.<ID>.title
reward_table.<ID>.title
```

The values are either strings or lists of strings depending on the translation
key.

The Phase 0 snapshot's `lang/zh_cn.snbt` file has 920 entries. The current
live file has 916 unique entries:

| Prefix | Count |
| --- | ---: |
| `quest` | 768 |
| `task` | 67 |
| `chapter` | 39 |
| `reward` | 24 |
| `reward_table` | 17 |
| `chapter_group` | 5 |

The scanned chapter files contain zero embedded `title`, `subtitle`, or
`description` values. All 1660 quests also contain zero embedded text values.

Consequences:

- The editor must load `lang/*.snbt` before it can display meaningful names.
- Chapter and quest search must search the translation store, not only chapter
  compounds.
- Editing a title must update the active locale's translation table.
- A missing locale should fall back through `fallback_locale`, normally
  `en_us`.
- The editor should preserve translation entries for deleted or unknown
  objects instead of deleting them silently.

FTB Quests migrates legacy embedded text into `en_us` when reading old data.
That migration path should not be used as the normal 2101.1.x edit path.

## 4. ItemStack and Item Components

The old editor's generic `iconText()` logic assumes item data may look like:

```text
item
item.id
item.tag.Icon
```

FTB Quests 2101.1.x uses Minecraft 1.21 item-stack data:

```snbt
{
    id: "minecraft:potion"
    count: 1
    components: {
        "minecraft:potion_contents": {
            potion: "minecraft:healing"
        }
    }
}
```

The real quest book contains 3069 item references, of which 163 contain a
`components` compound.

Observed component IDs include:

| Component | Occurrences |
| --- | ---: |
| `ftbfiltersystem:filter` | 47 |
| `minecraft:potion_contents` | 28 |
| `minecraft:stored_enchantments` | 25 |
| `minecraft:block_entity_data` | 16 |
| `quark:tome_enchantments` | 10 |
| `ftbquests:missing_item` | 6 |
| `mekanism:chemicals` | 6 |
| `mekanism:owner` | 6 |
| `mekanism:energy` | 5 |
| `ae2lt:celestweave_modules` | 4 |
| `minecraft:enchantments` | 4 |
| `minecraft:custom_name` | 3 |
| `minecraft:custom_data` | 2 |
| `minecraft:lore` | 2 |

The audit also observed many one-off component IDs from AE2, Avaritia,
ProjectE, Quark, Sophisticated Storage, Twilight Forest, and other mods.

Required behavior:

- parse `id`, `count`, and `components`;
- preserve unknown component IDs and nested values;
- render a missing-resource placeholder when an item cannot be resolved;
- never convert a 1.21 component stack into an old `tag` structure;
- never drop components when editing an unrelated field;
- support typed arrays inside components.

The Phase 0 snapshot contained 27 typed arrays. The current live directory
contains 25 typed arrays:

- 22 `[I; ...]`;
- 5 `[L; ...]`.

The current base editor's parser supports typed arrays as generic nodes. The
qbedit parser does not.

## 5. Quest Book Properties

The real `data.snbt` is data version 13 and contains:

```text
default_autoclaim_rewards
default_consume_items
default_quest_disable_jei
default_quest_shape
default_reward_team
detection_delay
disable_gui
drop_book_on_death
drop_loot_crates
emergency_items_cooldown
fallback_locale
grid_scale
hide_excluded_quests
lock_message
loot_crate_no_drop
pause_game
presets
progression_mode
show_lock_icons
verify_on_load
version
```

The 2101.1.35 source also supports `emergency_items`,
`suppress_all_autoclaiming`, and `preset` under supported conditions.

The editor should model these as quest-book properties, not chapter properties.

## 6. Chapter Groups and Chapters

The real `chapter_groups.snbt` contains five group IDs and no embedded titles.
Group titles are in the language store.

Chapter files contain:

```text
id
group
order_index
filename
default_quest_shape
default_hide_dependency_lines
images
quest_links
quests
```

The scanned book also contains mod-created chapter fields:

```text
quest_enhance_decorative_lines
quest_enhance_hidden_dependency_lines
```

The 2101.1.35 source additionally supports chapter fields:

```text
always_invisible
default_quest_size
default_min_width
progression_mode
consume_items
hide_quest_details_until_startable
hide_quest_until_deps_visible
hide_quest_until_deps_complete
hide_text_until_complete
default_repeatable_quest
require_sequential_tasks
autofocus_id
preset
icon
tags
```

The editor must preserve unknown chapter fields such as the
`quest_enhance_*` entries.

## 7. Quest Fields

The real book contains these quest fields:

| Field | Occurrences |
| --- | ---: |
| `id` | 1660 |
| `x` | 1660 |
| `y` | 1660 |
| `tasks` | 1660 |
| `entity_vis_size` | 1660 |
| `rewards` | 1243 |
| `dependencies` | 582 |
| `hide_dependent_lines` | 142 |
| `invisible` | 142 |
| `hide_details_until_startable` | 139 |
| `hide_until_deps_complete` | 73 |
| `icon` | 59 |
| `size` | 57 |
| `hide_dependency_lines` | 56 |
| `optional` | 44 |
| `shape` | 29 |
| `can_repeat` | 25 |
| `dependency_requirement` | 4 |
| `disable_toast` | 2 |
| `hide_lock_icon` | 2 |
| `hide_until_deps_visible` | 2 |
| `ignore_reward_blocking` | 2 |
| `repeat_cooldown` | 2 |
| `progression_mode` | 1 |

The 2101.1.35 source additionally supports:

```text
guide_page
min_required_dependencies
dep_control_pts
disable_recipe_mod
hide_text_until_complete
icon_scale
min_width
invisible_until_tasks
require_sequential_tasks
max_completable_dependents
preset
```

The `entity_vis_*` fields are mod-provided unknown fields to the core FTB
Quests model but must survive load/edit/save.

Dependency requirements are one of:

```text
all_completed
one_completed
all_started
one_started
```

`max_completable_dependents` is the exclusive-branching control added in
2101.1.7. It must only be treated as a graph/validation hint; the desktop
program must not attempt to simulate actual team progress.

## 8. Task Compatibility

The real book contains these task type IDs:

| Type | Count |
| --- | ---: |
| `item` | 1776 |
| `checkmark` | 84 |
| `kill` | 43 |
| `structure` | 24 |
| `biome` | 19 |
| `gamestage` | 13 |
| `stat` | 9 |
| `advancement` | 6 |
| `dimension` | 4 |
| `observation` | 2 |
| `fluid` | 1 |
| `forge_energy` | 1 |
| `xp` | 1 |

The 2101.1.35 core also registers `custom`, `location`, and other task types.
The real book also contains integration-provided `entity_type` and `block`
types in the broader scan.

Task handling rules:

- known task types get typed editors where their fields are confirmed;
- unknown task types remain `UnknownTask` with raw data;
- `optional_task` is supported on every task;
- `ItemTask` must support `item`, `count`, `consume_items`,
  `only_from_crafting`, `match_components`, and `task_screen_only`;
- item tasks must preserve arbitrary components;
- task IDs and type IDs must be preserved.

The 1.21.1 item-task fields come from `ItemTask.writeData()`:

```text
item
count
consume_items
only_from_crafting
match_components
task_screen_only
```

## 9. Reward Compatibility

The real book contains these reward type IDs:

| Type | Count |
| --- | ---: |
| `item` | 1097 |
| `loot` | 145 |
| `random` | 53 |
| `xp` | 40 |
| `command` | 20 |
| `choice` | 11 |
| `toast` | 4 |
| `gamestage` | 1 |

The 2101.1.35 core also registers `all_table`, `custom`, `xp_levels`,
`advancement`, and `currency`.

Reward handling rules:

- known rewards get typed editors where confirmed;
- unknown rewards remain `UnknownReward` with raw data;
- item rewards use 1.21 item stacks;
- reward-table item entries may omit `type` and implicitly mean `item`;
- command rewards use `permission_level` instead of the old
  `elevate_perms` boolean;
- `exclude_from_claim_all`, `ignore_reward_blocking`,
  `disable_reward_screen_blur`, `team_reward`, and `auto` must be preserved.

The command reward migration is important:

```text
legacy elevate_perms: true -> permission_level: 2
```

The editor should preserve the legacy field if it exists, but edit the modern
`permission_level` field.

## 10. Quest Links and Chapter Images

The real book contains:

- 0 `quest_links`;
- 0 `images`.

The synthetic fixture adds both because they are part of the FTB Quests data
model and must not be forgotten.

Quest link fields:

```text
id
linked_quest
x
y
shape
size
icon
tags
```

Chapter image fields:

```text
id
x
y
width
height
rotation
image
color
alpha
order
click_action
dev
corner
dependency
position_locked
text_on_image
text_shadow
text_inset
text_h_align
text_v_align
icon
tags
```

Chapter images and quest links are not optional UI features; they are part of
the serialized chapter and must be preserved even when Preview Mode does not
render every visual effect.

## 11. Reward Tables

The real book has 17 reward-table files with 209 entries.

Reward-table files contain:

```text
id
order_index
loot_size
empty_weight
hide_tooltip
use_title
rewards
loot_crate
loot_table_id
```

Each entry has an ID. Item entries commonly omit `type`, so the parser must
default missing reward-table entry types to `item`.

The editor must not treat reward-table entries as quest rewards. They need
their own model and search/index path.

## 12. Dependency Differences

The real book's dependency scan found:

| Item | Count |
| --- | ---: |
| Dependency references | 698 (Phase 0); 695 (current live) |
| Same-chapter references | 686 (Phase 0); 683 (current live) |
| Cross-chapter references | 12 (current live directory; Phase 0 snapshot: 10) |
| Missing references | 2 |
| Duplicate IDs | 0 |
| Cycles | 0 |

The old editor only draws dependencies whose target is in the selected
chapter. This hides 10 real cross-chapter edges.

The desktop application must:

- resolve dependencies globally across all chapters;
- resolve dependents globally;
- show missing references as validation errors;
- never silently delete a dependency because its target is not in the current
  chapter;
- detect self dependencies and cycles in the validator.

## 13. Unknown-Field Preservation

The real book contains unknown or mod-specific data at several levels:

- chapter: `quest_enhance_decorative_lines`,
  `quest_enhance_hidden_dependency_lines`;
- quest: `entity_vis_*`;
- task: `entity_vis_*` and integration-specific fields;
- item components: many mod namespaces.

The safe rule is:

```text
load raw node
  -> attach typed view
  -> edit only known field
  -> write typed view's raw node back
  -> preserve every untouched key and value
```

The editor must not compute a new object from a fixed field list. A fixed-field
serializer would destroy future and mod-provided fields.

Unknown task/reward types should be displayed as `Unknown` and offered raw-data
inspection, but not deleted or normalized unless the user explicitly chooses a
confirmed replacement.

## 14. Formatting Compatibility

The real language file contains:

- legacy `&` color codes;
- `§` codes in some content;
- JSON text arrays;
- `{image:...}` and `{@pagebreak}` directives;
- `clickEvent` with the `change_page` action;
- Chinese text;
- mixed Unicode.

Examples from the real data include:

```snbt
"&6姬子的建议&r"
"[\"\", { \"text\": \"悬赏板\", \"color\": \"green\", \"underlined\": true, \"clickEvent\": { \"action\": \"change_page\", \"value\": \"64DC596F058FA8B1\" } }, \"上好像有这个奖励，去看看吧\" ]"
```

The renderer must prefer JSON text parsing for values that begin with `[` or
`{`, then fall back to legacy formatting, then fall back to plain escaped text.

## 15. Save Compatibility

The project must save the same split layout it loaded:

- quest properties to `data.snbt`;
- groups to `chapter_groups.snbt`;
- chapters to `chapters/*.snbt`;
- reward tables to `reward_tables/*.snbt`;
- translations to `lang/<locale>.snbt`.

Do not merge translation text back into chapter/quest compounds. That changes
the semantic location of the text and is not the 2101.1.x format.

Before writing:

1. parse every existing file;
2. apply changes to typed views over raw nodes;
3. validate IDs, dependencies, task/reward data, and item components;
4. create `.bak` copies;
5. write temp files;
6. parse and semantic-compare temp files;
7. replace atomically;
8. report changed files.

## 16. Version Adapter Boundary

Version checks must be centralized:

```text
FtbQuestsVersionAdapter
├── detect(instance)
├── locateQuestDirectory(instance)
├── readQuestBook(path)
├── readTranslations(path, locale)
├── createQuestDefault()
├── createTaskDefault(type)
├── createRewardDefault(type)
├── validate(model)
└── savePlan(model)
```

`FtbQuests2101Adapter` is the initial implementation. A future 2111 adapter
must not require UI rewrites.

## 17. Required Fixtures

The repository now contains:

- `fixtures/ftbquests-2101/real` with copied real 1.21.1 data;
- `fixtures/ftbquests-2101/synthetic` with images, links, branch structures,
  components, typed arrays, unknown types, and unknown fields.

The full real book scan currently has no images or links, so the synthetic
fixture is required for those branches.

See `fixtures/ftbquests-2101/README.md` for coverage and expected round-trip
behavior.
