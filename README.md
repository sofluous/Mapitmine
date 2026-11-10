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
- `qa/`: required repository-owned layout/state fixtures; see [QA fixtures](qa/README.md). Package checks consume these inputs.
- Optional outer workspace `../_docs/`: product/roadmap/QA/history and local drawing prototype. This context may be absent in clones and is not required by normal checks. Local archives/scratchpads remain historical/working material; do not delete them as generated scratch work.
- Repository `_docs/data/`: ignored output currently written by optional browser checks. Browser checks overwrite their named artifacts; retain useful evidence locally rather than committing every run. Output routing to outer evidence is a separate follow-up.

See [AGENTS.md](AGENTS.md) for product engineering guidance. No hosting provider configuration is supplied here; publish intended static runtime inputs and review exclusions for development fixtures/scripts separately from Git ignore rules.

## Checks

Run `npm run qa` with Node.js. The normal checks have no third-party dependencies and cover syntax, data contracts, drawing/outline behavior and workflow/layout fixtures. There is no separate build or lint toolchain.

Optional production-browser checks use a separately installed Playwright or playwright-core module and compatible Chromium:

```powershell
$env:PLAYWRIGHT_MODULE = '<path-to-playwright-module-entry>'
$env:CHROMIUM_EXECUTABLE = '<path-to-compatible-chromium>'
npm run qa:browser
```

These checks use isolated browser storage, not the user's map library. Optional local [QA guidance](../_docs/QA.md) records remaining manual checks; that document may be absent in a clone. `smoke:browser` is an older browser-CLI diagnostic, not a substitute for interaction checks.

The individual suites remain available as `qa:workspace-browser`, `qa:pending-browser`, `qa:outline-browser`, `qa:layers-browser`, `qa:unload-browser`, `qa:vertices-browser`, `qa:mobile-browser` and `qa:rulers-browser` for focused changes.

Coordinate rulers are visible by default along exposed horizontal X and vertical Z edges. Pan/zoom updates their values and intervals; panels and widgets reserve space or suppress obscured labels. Map View > Coordinate Rulers controls visibility independently of grid lines and snapping, with an explicit browser-local preference and settings snapshot/export support. `src/coordinate-rulers.js` owns read-only ruler layout and bounded tick generation.

At narrow widths, commands, a quiet mode/coordinate readout and 44px navigation targets share a bottom dock. Sheets sit above its measured height; short/keyboard-sized viewports allow command scrolling. The minimap moves upward and temporarily yields to editing when space is insufficient, without changing saved placement/visibility preferences. Desktop restores the original surfaces and placement. `src/mobile-layout.js` owns responsive composition/viewport measurement; physical-device acceptance remains separate from automation.

Select a line/path and use its inspector's Edit vertices toggle for direct handle dragging. The vertex selector and adjacent-segment insertion/deletion controls provide keyboard alternatives; exact X/Z fields retain Apply. Paths require two distinct points, and lines retain two endpoints. Drag previews commit once on release; Escape, pointer cancellation or blur rolls them back. Shared snapping is not included in this slice.

During line/path creation, placed points have screen-sized markers, including the first endpoint. The latest point is larger; the moving preview has no marker and is never saved as an extra vertex.

Reload/close requests a native warning for pending pin/drawing edits, locally unpersisted map content or unsaved linked-file changes. Clean local maps need no file link. Unload does not save drafts; browser warnings are not guaranteed, especially during mobile/OS termination.
