import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.ok(!/mapScaleChip|scale-chip|getScaleBarMetrics|updateScaleChip/.test(html), "Obsolete distance scale and consumers are removed");
assert.ok(html.includes('hud.append(historyTools, document.getElementById("workspaceTools"))'));
assert.ok(html.includes('hud.appendChild(document.getElementById("mapStatusStrip"))'));

const required = [
  'id="minimapDetail"',
  'data-detail="standard"',
  'class="minimap-readout"',
  'data-minimap-readout="view"',
  'data-minimap-readout="crop"',
  'data-minimap-readout="world"',
  '#minimapContainer[data-detail="minimal"] .minimap-readout',
  'status-chip status-chip-tool',
  'status-chip status-chip-history',
  'status-chip status-chip-zoom',
  'status-chip status-chip-cursor',
  'font-variant-numeric: tabular-nums',
  'overflow: hidden;',
];
const forbidden = [
  'class="minimap-label-group top"',
  'class="minimap-label-group bottom"',
  'class="minimap-label-group left"',
  'class="minimap-label-group right"',
];
const missing = required.filter((snippet) => !html.includes(snippet));
const presentForbidden = forbidden.filter((snippet) => html.includes(snippet));
if (missing.length || presentForbidden.length) {
  if (missing.length) {
    console.error("HUD layout coverage is missing expected behavior:");
    for (const snippet of missing) console.error(`- ${snippet}`);
  }
  if (presentForbidden.length) {
    console.error("HUD layout still contains external minimap labels:");
    for (const snippet of presentForbidden) console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log("HUD layout check passed.");
