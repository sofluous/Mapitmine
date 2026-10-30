# Required QA Fixtures

These fixtures are repository-owned inputs to `npm run qa`, not runtime application pages.

| Fixture | Required check |
| --- | --- |
| `pin-card-layout.html` | `npm run qa:pin-cards` |
| `editor-maps-layout.html` | `npm run qa:ui-layout` |
| `ui-state-matrix.html` | `npm run qa:ui-states` |

Run commands from the repository root. Open the HTML directly for manual inspection; each uses `../design-system/theme.css`. Keep fixtures and theme assets in their existing relative locations. Static checks verify fixture coverage, not production interaction or visual correctness.

Optional local drawing prototypes and their icon subset/license remain in the outer workspace `_docs/qa/`; normal checks do not require them. Do not copy them into this directory without reviewing consumers. Development fixtures need not ship; review deployment inclusion separately from Git ignore rules.
