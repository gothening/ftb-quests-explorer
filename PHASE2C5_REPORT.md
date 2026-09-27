# PHASE 2C.5 REPORT

## 1. Git Repository

```text
Repository: https://github.com/gothening/ftb-quests-explorer
Branch:     main
Remote:     https://github.com/gothening/ftb-quests-explorer.git
Release commit: a89336189ad862ff1b41e3628b51dbc028c59158
```

The repository was initialized inside `ftb-quests-explorer`, not inside the
parent Minecraft instance. The first release commit contains the Core, Viewer,
tests, tools, fixture data, workflow, and `public/demo/`.

`node_modules/`, `dist/`, `tmp/`, Minecraft directories, local logs, and
development caches are excluded. The nested reference checkouts are excluded
from the public repository because they are local development references, not
runtime dependencies.

## 2. GitHub Pages

```text
Public URL: https://gothening.github.io/ftb-quests-explorer/
Workflow:   .github/workflows/deploy-pages.yml
Run:        https://github.com/gothening/ftb-quests-explorer/actions/runs/36334639177
Status:     SUCCESS
```

GitHub Pages was initially disabled for the new repository, which caused the
first deployment attempt to fail with a real HTTP 404 from the deployment API.
Pages was then enabled with `build_type: workflow`; the failed deploy job was
rerun and completed successfully.

## 3. Build

Commands run before the release commit:

```text
npm test             54 passed / 0 failed
npm run smoke:viewer passed
npm run smoke:online passed
npm run build        passed
```

The local Online smoke ran under the repository subpath:

```text
http://127.0.0.1:<port>/ftb-quests-explorer/
```

## 4. Online Data

The deployed manifest reports:

```text
SNBT files       62
chapters         38
quests           1722
tasks            2126
rewards          1352
quest links      14
reward tables    20
translations     927
```

Source metadata:

```text
dataVersion:       13
ftbQuestsVersion:  2101.1.34
minecraftVersion:  1.21.1
sourceInstance:    [开拓者日志]As we trailblaze
sourceQuestRoot:   config/ftbquests/quests
locale:            zh_cn
```

The deployed diagnostics are preserved as data findings:

```text
ERROR 2
WARNING 3
INFO 1
```

## 5. Public Verification

Public HTTP checks against the actual Pages URL:

```text
/index.html              200 text/html
/app.js                  200 application/javascript
/style.css               200 text/css
/demo/manifest.json      200 application/json
/demo/view-model.json    200 application/json
/demo/asset-map.json     200 application/json
```

Public browser verification:

```text
Read-only badge        Online Demo / Read Only
Chapters rendered      38
Console errors         0
API requests           0
Failed responses       0
```

Chapter navigation was exercised for these chapter groups:

```text
开拓之路   初识世界
瓦尔特     科技发展建议
丹恒       丹恒的勘察建议
三月七     三月七的生活建议
姬子       姬子的生存建议
```

The public quest detail check selected `74F616408A19CFA1` (`更好的装备`) and
confirmed a visible detail panel, resolved title, description, 5 task buttons,
1 reward button, and 1 dependency.

Additional public checks:

```text
Search "forge_energy" results       6
Validator errors                    2
Validator warnings                  3
Quest Link target selection         PASS
Reward Table dialog                 PASS
Item Components                     PASS
Translation resolution              PASS
Chapter Image data                  count 0, broken 0
```

The live instance has no chapter image entries, so there is no real chapter
image to display on the public site. The image loading and rendering path is
covered by the synthetic fixture in the local viewer smoke test.

## 6. Known Limitations

- The public site is a generated snapshot. Regenerate `public/demo/`, commit
  the result, and push `main` to update it.
- The live data contains no chapter images. The UI keeps the Chapter Image
  path intact, but the current public dataset has nothing to render.
- Some model-based mod item textures may use the viewer fallback icon when no
  simple `item/` or `block/` texture is available.
- The full normalized model is served as one JSON resource. The current
  deployment loads successfully, but per-chapter lazy loading would be a
  future optimization if the dataset grows substantially.
- The Viewer remains read-only. No editing, Save, Delete, Add, Tauri, or
  installer functionality is included.

## Final Status

```text
Repository:
https://github.com/gothening/ftb-quests-explorer

Release commit:
a89336189ad862ff1b41e3628b51dbc028c59158

GitHub Pages:
https://gothening.github.io/ftb-quests-explorer/

Deployment:
PASS

npm test:
54 passed / 0 failed

npm run smoke:viewer:
PASS

npm run smoke:online:
PASS

npm run build:
PASS

Public verification:
HTTP 200
Console errors 0
/api requests 0

Data:
62 / 38 / 1722 / 2126 / 1352 / 14 / 20 / 927
```

PHASE 2C.5 COMPLETE
