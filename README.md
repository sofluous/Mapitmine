# MapItMine

A local-first browser workspace for maps, pins, layers and line/path annotations.

## Run

Open [index.html](index.html) in a browser. No build, development server or dependency installation is required. Map documents stay in browser local storage unless exported or linked to a file. File System Access features require a supporting browser; JSON Import/Export is the fallback.

## Project Layout

- `index.html`: application shell, canvas rendering and workflow integration.
- `src/`: application-owned data, drawing, selection and outline modules.
- `assets/`: pinned runtime icons and upstream license.
- `design-system/`: vendored design-system package; retain its installation/version files and assets together.
- `scripts/`: application-specific automated checks.
- `qa/`: retained visual fixtures and the drawing workspace prototype; see [QA fixtures](qa/README.md).
- `_docs/`: product, roadmap, QA, migration and implementation records. Start at the [documentation index](_docs/README.md).
- `_docs/data/`: ignored generated reports/screenshots. Browser checks overwrite their named artifacts; retain useful evidence locally rather than committing every run.
- `_archive/` and `_docs/scratchpad.md`: ignored local history/working notes, not application or deployment inputs. Do not delete them as generated scratch work.

## Checks

Run `npm run qa` with Node.js. The normal checks have no third-party dependencies and cover syntax, data contracts, drawing/outline behavior and workflow/layout fixtures. There is no separate build or lint toolchain.

Optional production-browser checks use a separately installed Playwright or playwright-core module and compatible Chromium:

```powershell
$env:PLAYWRIGHT_MODULE = '<path-to-playwright-module-entry>'
$env:CHROMIUM_EXECUTABLE = '<path-to-compatible-chromium>'
npm run qa:browser
```

These checks use isolated browser storage, not the user's map library. See [QA guidance](_docs/QA.md) for scope and remaining manual checks. `smoke:browser` is an older browser-CLI diagnostic, not a substitute for interaction checks.

The individual suites remain available as `qa:workspace-browser`, `qa:pending-browser`, `qa:outline-browser` and `qa:layers-browser` for focused changes.
