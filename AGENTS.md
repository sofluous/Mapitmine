# MapitMine Development

Read [README](README.md) for runtime/setup/check commands and folder ownership.

- Preserve local-first map/pin/layer/drawing contracts, stable identities, guarded draft navigation, scoped undo/redo, and migration backups/version guards. File linking must retain JSON import/export fallback.
- Runtime source is in `index.html`, `src/`, `assets/`, and `design-system/`. Required checks live in `scripts/` and their HTML fixtures in `qa/`; normal checks must not depend on outer docs/prototypes.
- From this directory run `npm run qa` with Node/npm; it has no third-party dependencies. No separate build or lint command is configured. Optional browser checks require explicit Playwright module and Chromium executable paths as documented in README.
- Follow applicable parent instructions when present. Optional local context is at `../_docs/README.md`; it may be absent in clones. Keep essential setup/contracts/check inputs inside the repository.
- Preserve unrelated edits, including existing README changes. Report validation limits and existing failures; do not stage or reset automatically.
