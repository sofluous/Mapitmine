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

During path construction, expand Vertices in the drawing commands to edit accepted draft points. Focus a row and use Up/Down/Home/End to navigate; X/Z accept finite decimals on change or Enter. Escape restores the current field. Moves share draft Undo/Redo and do not save document history until Finish; Cancel discards the session. The list scrolls independently and remains collapsed by default.

Layer disclosure is before the label. Row click/tap or Enter/Space selects and toggles; the chevron and arrow keys expand independently. Row selection keeps the organization panel open, with explicit Properties available from the layer menu. Selected layers reveal quiet lock/visibility controls; hidden/locked indicators persist. New layer is the plus action beside object search/filter. Utility clicks and completed drags do not also toggle disclosure, and pending edits can cancel a row transition.

Map View spacing must be finite and greater than zero; fractions are supported. Invalid edits retain the last valid runtime/snapshot value and restore it on blur; invalid restored settings cannot replace valid spacing. src/view-settings.js bounds grid work per axis so dense grids cannot hide map annotations. Normal qa:hud includes its dependency-free validation tests.

Committed drawing vertices use one selectable coordinate list. Click/focus a row or use Arrow Up/Down, Home/End on the focused row; collapsing All vertices retains the current coordinates. Input arrow keys keep their normal numeric behavior. Canvas drawing selection preserves closed panels through refresh; double-click in Select mode or activate an outline item to inspect explicitly. Pending edits remain guarded.

Workspace rail selection follows panel visibility: collapsing clears selected tab styling while remembering the last panel for reopening. The disclosure control communicates expanded state without a persistent pressed treatment; keyboard focus remains independent.

On mobile, drawing options appear above anchored primary tools in their own bounded scroll area. Dock gaps expose the map, with token-backed controls, readouts and navigation. Desktop restores drawing commands to the HUD; responsive moves preserve the same control elements and drawing session.

Run `npm run qa` with Node.js. The normal checks have no third-party dependencies and cover syntax, data contracts, drawing/outline behavior and workflow/layout fixtures. There is no separate build or lint toolchain.

Optional production-browser checks use a separately installed Playwright or playwright-core module and compatible Chromium:

```powershell
$env:PLAYWRIGHT_MODULE = '<path-to-playwright-module-entry>'
$env:CHROMIUM_EXECUTABLE = '<path-to-compatible-chromium>'
npm run qa:browser
```

These checks use isolated browser storage, not the user's map library. Optional local [QA guidance](../_docs/QA.md) records remaining manual checks; that document may be absent in a clone. `smoke:browser` is an older browser-CLI diagnostic, not a substitute for interaction checks.

The individual suites remain available as `qa:workspace-browser`, `qa:pending-browser`, `qa:outline-browser`, `qa:layers-browser`, `qa:unload-browser`, `qa:vertices-browser`, `qa:mobile-browser`, `qa:rulers-browser`, `qa:touch-browser`, `qa:inspector-browser`, `qa:draft-history-browser`, `qa:menus-browser` and `qa:pin-list-browser` for focused changes.

Pin search is one field surface with an inset icon, stable 44px Clear slot and shared focus ring. Escape clears search without clearing pin selection. The filter number counts excluded types; the adjacent readout shows visible/total pins. Keyboard filter opening/closing and checkbox focus survive refresh. Pin rows are contiguous, retaining hover/selection and inset focus treatments. Search/filter navigation does not write map or history data.

Pin clicks select without opening a closed inspector; list clicks retain centering, and double-click/Edit opens editing. Named objects title their inspector. Committed pins/drawings share right-click and ContextMenu/Shift+F10 actions; Select-mode touch hold opens the same menu after 550ms, cancelling on movement/pinch/interruption. Draft holds cannot steal placement; draft right-click offers explicit Undo/Redo/Finish/Cancel rather than discarding immediately. Menu actions revalidate target identity and preserve pending-work guards. src/object-menu-gesture.js owns hold detection, with dependency-free tests in normal qa:workspace and real-touch coverage in qa:menus-browser.

While creating a line/path, Undo point and Redo point traverse accepted draft points without a discard prompt or document-history change. Undo to zero keeps the tool armed, and a new point clears draft Redo. Finish commits the current points as one drawing action; Cancel/reset/map changes clear that session. Keyboard history shortcuts respect native input/contenteditable undo and modal ownership. Existing map/tool navigation still protects pending drafts; mobile keyboard/sheet and broader confirmation refinements remain separate work.

Touch contact previews a dashed candidate vertex, drag updates it, and release places one point at the final coordinates. Contact on an accepted draft handle instead selects it for mouse/pen/touch dragging, preserving the grab offset. Release records one reversible draft move; selection, no-op and interrupted moves preserve geometry/Redo. Pinch takeover, cancellation, capture loss and blur drop the preview while preserving accepted points. Append/move history remains local until Finish; live gestures block Finish/history and handled release suppresses duplicate compatibility clicks. Keyboard/list integration remains planned.

Drawing setup exposes shape and target layer before any points exist. Once points or recoverable Redo exist, the setup controls yield to Cancel and the primary Finish action; the target layer remains available in the progress tooltip/accessibility name. Re-clicking the active shape preserves the session, and leaving a genuinely empty setup is prompt-free. Nonempty/recoverable drafts and dirty pin/drawing fields still require resolution when changing context; explicit Cancel is not confirmed again. Committed drawing properties retain their separate Apply action.

Canvas touch navigation supports one-finger panning and two-finger pinch zoom within 0.25-5x, preserving the world point beneath the moving midpoint. A second finger takes ownership from drawing/vertex gestures: live vertex previews roll back, while selection, unfinished drawings and pin fields remain. Lifting one finger resumes panning without a camera jump. Cancellation/blur clean up navigation; pinch compatibility clicks cannot place pins/vertices. `src/touch-navigation.js` owns this coordination. Browser automation is not real-phone acceptance.

Coordinate rulers are visible by default along exposed horizontal X and vertical Z edges. Compact bands show major/minor marks independently of label filtering; mobile rulers stay at the screen edges while the minimap yields to them. Pan/zoom updates their values and intervals. Map View > Coordinate Rulers controls visibility independently of grid lines and snapping, with a browser-local preference and settings snapshot support. `src/coordinate-rulers.js` owns read-only layout and bounded tick generation; the separate distance scale is removed.

Undo/Redo precede canvas actions in one toolbar. Desktop telemetry is detached at the bottom; mobile telemetry is hidden. Drawing setup uses one Shape selector beside Layer. The minimap square anchors at the chosen corner with technical bounds inward; full detail remains keyboard-scrollable. Rulers have transparent bands. Hovering a pin dims other mapped pins without changing stored styles or selection; keyboard card focus provides equivalent emphasis. Layer pin counts sit inline, with row-scoped quiet utilities and persistent hidden/locked glyphs.

At narrow widths, commands and 44px navigation targets share a bottom dock; telemetry is hidden. Sheets sit above its measured height; short/keyboard-sized viewports allow command scrolling. The minimap moves upward and temporarily yields to editing when space is insufficient, without changing saved placement/visibility preferences. Desktop restores the original surfaces and placement. `src/mobile-layout.js` owns responsive composition/viewport measurement; physical-device acceptance remains separate from automation.

Mobile workspace sheets now shrink to their content instead of assigning every tab the same height. Shared limits cap long sheets at 420px and normally reserve map space; very short viewports prioritize editing reach. Focused controls are revealed by scrolling only their owning containers when focus/viewport geometry changes. Entering a drawing/pin tool closes the workspace once; search, rendering and ordinary tool-state synchronization no longer dismiss a panel you reopened. Native phone keyboards still require hands-on validation.

Select a line/path and use its inspector's Edit vertices toggle for direct handle dragging. The vertex selector and adjacent-segment insertion/deletion controls provide keyboard alternatives; exact X/Z fields retain Apply. Paths require two distinct points, and lines retain two endpoints. Drag previews commit once on release; Escape, pointer cancellation or blur rolls them back. Shared snapping is not included in this slice.

The inspector presents only the active vertex's original X/Z inputs by default. All vertices expands the remaining coordinates; Style holds color/width. Changing the active vertex or a disclosure does not apply or discard fields. Invalid hidden fields are revealed on Apply; locked geometry stays inspectable without becoming editable. Very narrow screens stack X/Z instead of shrinking the fields. All eleven view switches retain native keyboard focus/Space and visible track focus; an app-local compatibility rule bridges the older bundled Design System without replacing it.

During line/path creation, placed points have screen-sized markers, including the first endpoint. The latest point is larger; the moving preview has no marker and is never saved as an extra vertex.

Reload/close requests a native warning for pending pin/drawing edits, locally unpersisted map content or unsaved linked-file changes. Clean local maps need no file link. Unload does not save drafts; browser warnings are not guaranteed, especially during mobile/OS termination.
