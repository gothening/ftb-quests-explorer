# PHASE 2E REPORT

## 1. Root Causes

The previous viewer mixed object identity, item identity, and display text:

- Task and reward tooltips used the task/reward type or a generated title
  object as the title, so tasks without custom titles could show an ID or
  generic type instead of the referenced item name.
- Item icons were resolved by trying `textures/item/<item>.png` and
  `textures/block/<item>.png` before reading the item model. That bypassed
  model parents, texture variables, and model indirection.
- The old icon resolver used a hard-coded fallback icon when model resolution
  failed, which hid failures and could display a plausible but incorrect image.
- FTB Quests custom icons (`ftbquests:custom_icon` with the
  `ftbquests:icon` component) were not modeled in the viewer icon path.
- `public/demo/` was generated directly from the live instance and contained
  no committed source tree or provenance for future inspection.

The corrected chain is:

```text
Task/Reward object
  -> custom title or item display name
  -> item id
  -> item model
  -> model parent chain
  -> texture variable
  -> final icon
```

## 2. New Architecture

```text
source/quests + source/assets
  -> FTBQ Core
  -> ItemNameResolver / ItemResolver
  -> ModelResolver / TextureResolver
  -> public/demo JSON + item/icon manifest
  -> GitHub Pages
```

New resolver modules:

```text
src/core/resolve/model-resolver.js
src/core/resolve/item-name-resolver.js
src/core/resolve/item-resolver.js
```

New pipeline tools:

```text
tools/sync-source.mjs
tools/icon-audit.mjs
```

`npm run sync:source` is the only command that reads the live Minecraft
instance. `npm run build:demo-data` reads `source/` only and does not need
Minecraft, a local filesystem, or Node APIs at browser runtime.

## 3. Source Data Statistics

The committed source tree preserves the original SNBT structure:

```text
SNBT files       62
chapters         38
quests           1914
tasks            2356
rewards          1335
quest links      14
reward tables    20
translations     1002
```

`source/manifest.json` records the source instance, relative file paths,
SHA-256 hashes, byte counts, and statistics. It contains no local absolute
path.

## 4. Asset Statistics

The source asset extraction tracks referenced items and their model/texture
chains:

```text
Referenced item entries       2197
Unique item IDs               2171
Resolved icons                2119
Missing icons                   78
Invalid icons                    0
Models resolved               2161
Models missing                  36
Textures resolved             2121
Textures missing                76
```

Source assets are stored under `source/assets/<namespace>/...`.
`source/assets/manifest.json` records:

```text
itemId
namespace
sourceMod
resourceType
modelPath
modelPaths
texturePath
displayName
nameSource
translationKey
status
reason
license
provenance
```

The resolved public icon chain is also emitted in:

```text
public/demo/items/manifest.json
```

Example verified chain:

```text
trailblazer:chefs_certificate
  -> models/item/chefs_certificate.json
  -> minecraft:models/item/generated.json
  -> trailblazer:textures/item/chefs_certificate.png
  -> resolved icon asset
```

## 5. Namespace Statistics

The largest referenced namespaces are:

```text
flavor_immersed_daily   445
minecraft               243
primogemcraft           128
gan_delight_reborn      119
mekanism                114
chicken_roost           100
kaleidoscope_cookery     96
ae2lt                    77
farmersdelight            75
twilightforest            73
ae2                       71
chemlib                   70
oritech                   58
create                    52
moderndelight             47
artifacts                 45
```

The complete namespace table and per-item status are in:

```text
reports/icon-audit.json
```

## 6. License / Provenance

Minecraft client assets are marked:

```text
minecraft-eula
```

Mod assets are marked:

```text
unresolved-license
```

unless a license is explicitly known. The manifest still records the source
JAR and provenance so licensing can be reviewed later. No mod JAR is copied
into the repository; only the models, textures, and language files required by
the referenced Viewer items are extracted.

## 7. Tests

```text
npm test              72 passed / 0 failed
npm run smoke:viewer  PASS
npm run smoke:online  PASS
npm run build         PASS
npm run audit:icons   PASS
```

New tests:

```text
tests/items/item-resolution.test.mjs
tests/items/icon-resolution.test.mjs
tests/items/source-assets.test.mjs
tests/tasks/task-display.test.mjs
```

They cover vanilla items, mod items, model-parent chains, Item Components,
custom FTB Quests icons, ordinary item tasks, explicit custom titles, missing
items, missing icons, Quest icons, and source provenance.

## 8. Public Verification

The deployed GitHub Pages build was checked at:

```text
https://gothening.github.io/ftb-quests-explorer/
```

Results:

```text
HTTP status            200
Console errors         0
/api requests          0
Task icon loaded       true
Reward icon loaded     true
Search icon loaded     true
```

Verified public tooltip examples:

```text
trailblazer:chefs_certificate
  title: 厨师之证
  model: models/item/chefs_certificate.json
  texture: trailblazer:textures/item/chefs_certificate.png
  status: resolved
```

```text
ultramarine:plated_ham
  title: 盘装大腿肉
  model: models/item/plated_ham.json
  texture: ultramarine:textures/block/plated_ham.png
  status: resolved
```

`?iconDiagnostics=1` displays the same chain in the public Viewer. The
Viewer fetches Online Demo JSON with `cache: "no-store"` so a deployment update
does not leave stale item/icon metadata in the browser cache.

## 9. Known Unresolved Assets

The remaining missing entries are not replaced with approximate icons.
They are retained as `missing` with a reason.

The largest groups are:

```text
chicken_roost    28  builtin/entity runtime-rendered models
oritech          16  runtime or non-static model assets
fidworkblock     10  model assets not present in the extracted namespace
mekanism         10  runtime or model-specific assets
twilightforest    5  trophy models using builtin/entity
other namespaces 9  explicit missing component/model resource
```

These entries remain visible in the audit report with their item IDs, task
IDs, reward IDs, quest IDs, model paths, and failure reasons.

PHASE 2E COMPLETE
