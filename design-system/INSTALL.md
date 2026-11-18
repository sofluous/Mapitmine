# Theme package

Copy the complete design-system folder into your app. Load fonts.css before theme.css, then js/theme-registry.js and js/theme-selector.js in that order.
Use DS component classes or map your app properties to the --ds-* tokens. The distribution's example.html is beside the design-system folder; it is not inside the runtime folder.
Set data-ds-theme-storage on html to an app-specific key. Serve over HTTP(S); file URL persistence is browser-dependent. Storage denial does not prevent theme switching.
theme.css styles global html/body, links, headings, box sizing and focus as well as DS classes. Review host styles and load app overrides afterward. It is a full-app stylesheet, not an isolated widget skin.
Replace the entire app-owned runtime folder on upgrade instead of merging files. package.manifest.json identifies the exact file hashes and source revision; VERSION.txt records the preset revision for CLI builds.
The package includes all default themes and the exported custom theme. It does not need the Studio or its composer at runtime.
Theme tokens and CSS are snapshots; theme.recipe.json records the applied seven layers and exact manual overrides.
Load fonts.css before theme.css. Bundled local families: Inter, Space Mono, Baloo 2, Sora, Outfit, Archivo Black, Share Tech Mono, Chakra Petch. No font network service is required.
Other font families depend on the target device and use their declared fallback stacks. Keep the fonts directory, manifest and OFL notices when redistributing. Custom font overrides need their own licensed assets.
Regenerate the package after changing source presets or components. Keep app styles token-based for theme switching.
Approved icons: load design-system/js/icon-approved.js then design-system/js/icon-runtime.js. Use <span data-ds-icon="action.search"></span> inside a labeled control. Call DesignSystemIcons.render(container) after adding content.
Icon SVGs, semantic manifest, usage guidance and per-asset license notices live in design-system/icons. Only project-approved icons are included; browser candidate choices do not change the shared collection. Keep license notices when redistributing assets.