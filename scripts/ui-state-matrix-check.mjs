import { readFile } from "node:fs/promises";

const fixture = await readFile(new URL("../qa/ui-state-matrix.html", import.meta.url), "utf8");
const required = [
  "MapItMine UI State Matrix",
  '"paper-mint", "steel-night", "amber-terminal"',
  "item-card is-active",
  "item-card is-focused",
  "item-card is-hovered",
  "item-card is-selected",
  "Canvas Overlays",
  "Layers",
  "layer-fixture-row is-hidden",
  "map-pin-label",
  "minimap",
  "matrix-frame",
  "font-variant-numeric: tabular-nums",
];
const missing = required.filter((snippet) => !fixture.includes(snippet));
if (missing.length) {
  console.error("UI state matrix is missing expected coverage:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log("UI state matrix check passed.");
