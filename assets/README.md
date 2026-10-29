# Runtime Icons

`iconoir.css` is an application subset of Iconoir 7.11.0, distributed under the accompanying `iconoir-LICENSE.txt` (MIT). Upstream source: https://cdn.jsdelivr.net/npm/iconoir@7.11.0/css/iconoir.css.

The subset includes the common Iconoir base rules and selectors used by `index.html`. It was generated using the browser CSSOM parser, retaining the upstream SVG masks. To add an icon, regenerate from the pinned upstream CSS using all literal application icon names, and verify the requested name exists upstream. Keep assets local so icon-only controls work when the browser cannot reach a CDN. Do not replace the subset with an unpinned latest URL.

These are application runtime assets, independent from the prototype's separate QA subset. Canvas pin colors and drawing styles remain content data; icon color inherits the design-system UI tokens.

The Select and Pan tool icons (`cursor-pointer`, `drag-hand-gesture`) were copied from the pinned prototype subset into the runtime subset when the canvas tools shipped. Runtime code does not load QA assets.
