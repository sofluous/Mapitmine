import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = html.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === "{") depth += 1;
    if (html[index] === "}" && --depth === 0) {
      return html.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract function ${name}`);
}

const getScaleBarMetrics = new Function(
  `return (${extractFunction("getScaleBarMetrics")})`,
)();
const zoomedOut = getScaleBarMetrics(1);
const zoomedIn = getScaleBarMetrics(4);
assert.equal(zoomedOut.distance, 100);
assert.equal(zoomedIn.distance, 20);
assert.notEqual(zoomedOut.distance, zoomedIn.distance);
assert.ok(zoomedOut.pixelLength >= 60 && zoomedOut.pixelLength <= 130);
assert.ok(zoomedIn.pixelLength >= 60 && zoomedIn.pixelLength <= 130);
assert.equal(getScaleBarMetrics(0), null);

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
