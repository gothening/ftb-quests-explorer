# FTB Quests Explorer

Read-only FTB Quests viewer for
FTB Quests `2101.1.x`, Minecraft `1.21.1`, and NeoForge.

The project supports two separate data paths:

```text
Local Mode
  live FTB Quests SNBT
    -> FTBQ Core
    -> /api/load
    -> Viewer

Online Demo Mode
  live FTB Quests SNBT
    -> FTBQ Core
    -> static normalized JSON in public/demo
    -> static host
    -> Viewer
```

Both modes use the same parser, model, translations, dependency graph,
validator, and viewer adapter. The online mode does not need a Node runtime,
Minecraft, a local filesystem, or `/api/load`.

## Local Development

Requirements: Node.js and the project checkout.

```text
npm install
npm run dev
```

Open `http://127.0.0.1:4173/`.

`npm run dev` keeps the existing local behavior: the server reads
`config/ftbquests/quests` from the parent Minecraft instance and serves the
read-only viewer plus `/api/load`. The current development instance is:

```text
D:\06_Games_of_all_kinds\Games_Minecraft\.minecraft\versions\[开拓者日志]As we trailblaze
```

Do not double-click `frontend/index.html`. Local Mode uses ES modules and the
local `/api/load` service, so it must be opened through `npm run dev`.

## Online Demo

[Open FTB Quests Explorer Online](https://gothening.github.io/ftb-quests-explorer/)

The Online Demo is a completely static, read-only build. End users only need a
browser; they do not need Node.js, Minecraft, project source, or a local path.
This is a read-only online preview of the current
`[开拓者日志]As we trailblaze` FTB Quests data.

Generate the demo data from the live quest directory:

```text
npm run build:demo-data
```

The script scans the parent instance, parses the data with FTBQ Core, resolves
translations and assets, writes `public/demo/manifest.json`,
`public/demo/view-model.json`, `public/demo/asset-map.json`, and the referenced
images. It never writes to the Minecraft instance. A parse failure fails the
build.

Then build and preview the static site:

```text
npm run build
npm run preview
```

`npm run build` performs `build:demo-data` followed by `build:static`; the
result is in `dist/`. `npm run preview` serves `dist/` without using the local
FTB Quests API. The static build also works under a non-root base path such as
`/ftb-quests-explorer/`.

The generated manifest records the source instance, source quest root,
generation time, data version, FTB Quests version, Minecraft version, locale,
and all model counts. The current demo is generated from
`[开拓者日志]As we trailblaze`, not the older `Gothening modpack dev` instance.

## Verification

```text
npm test
npm run smoke:viewer
npm run smoke:online
```

`npm run smoke:viewer` checks the live local server. `npm run smoke:online`
starts the static `dist/` output under `/ftb-quests-explorer/`, verifies that
the manifest and model load, checks chapter selection and quest details,
searches, diagnostics, item components, quest links, reward tables, and
asserts that no `/api/` request or browser console error occurs.

## GitHub Pages

The published site is:

```text
https://gothening.github.io/ftb-quests-explorer/
```

`.github/workflows/deploy-pages.yml` builds and deploys `dist/` on pushes to
`main`. The repository contains only the generated demo data under
`public/demo/`; it must not contain the Minecraft instance, `mods/`, `saves/`,
`logs/`, `screenshots/`, `cache/`, or `node_modules/`.

GitHub Actions cannot read a local Minecraft instance. The Pages workflow
therefore runs `npm run build:demo-data:ci`, which reuses the committed
`public/demo/` snapshot when no `FTBQ_QUEST_ROOT` is available, then builds the
static site. To refresh what is published, regenerate demo data locally, commit
the resulting `public/demo/` changes, and push to `main`.

For a different local instance, set the source explicitly:

```powershell
$env:FTBQ_QUEST_ROOT = "D:\path\to\instance\config\ftbquests\quests"
npm run build:demo-data
```

## Project Phases

- `PHASE1_REPORT.md`: core parser, model, serializer, graph, validator, and
  round-trip verification.
- `PHASE2A_REPORT.md`: read-only web viewer.
- `PHASE2B_REPORT.md`: native FTB Quests visual adaptation.
- `PHASE2C_REPORT.md`: public static Online Demo mode.

Reference sources are kept under `reference/`:

| Directory | Source |
| --- | --- |
| `reference/ftb-quests-editor` | `Jasons-impart/ftb-quests-editor` |
| `reference/qbedit` | `jmoiron/qbedit` |
| `reference/FTB-Quests-2101.1.35` | `FTBTeam/FTB-Quests` tag `v2101.1.35` |

The viewer remains `Read Only`: no edit, delete, add, or save action is exposed.
