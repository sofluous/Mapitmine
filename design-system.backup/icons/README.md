# Design System Icons Repository

This folder stores SVG source icons used across apps.

## Conventions
- `24x24` viewBox
- stroke-first icons by default:
  - `fill="none"`
  - `stroke="currentColor"`
  - `stroke-width="1.8"`
  - `stroke-linecap="round"`
  - `stroke-linejoin="round"`
- File naming: kebab-case, action-oriented (`search.svg`, `location-pin.svg`)

## Workflow
1. Track needed icon situations in Studio `Icons` tab.
2. Review the semantic alias, default guess, and candidate sources from `js/icon-registry.js`.
3. Prioritize via Hitlist score.
4. Override the default selection if a better source icon is found.
5. Export the alias manifest to preserve the chosen mapping.
6. Replace placeholders or vendor picks with final SVGs here.
7. Consume in apps via DS semantic aliases rather than vendor icon names directly.
