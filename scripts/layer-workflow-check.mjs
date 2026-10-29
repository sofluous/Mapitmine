import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const required = [
  'data-workspace-tab="layers"',
  'data-workspace-panel="layers"',
  'id="createLayerBtn"',
  'id="layerList"',
  'id="pinEditorLayer"',
  "function renderLayers(",
  "function createLayer(",
  "function renameLayer(",
  "function moveLayer(",
  "function toggleLayerVisibility(",
  "function toggleLayerLock(",
  "function deleteLayer(",
  "function populatePinLayerOptions(",
  "function isPinVisible(",
  "function isPinLocked(",
  'commitLayerChange("Create Layer"',
  'pushHistoryState(label)',
  'async function commitLayerChange(',
  'mapName !== currentMapName || !valid()',
  'if (!isPinVisible(pin)) return false',
  'if (!isPinVisible(pins[i])) continue',
  'if (isPinLocked(pins[index]))',
  'if (layerId === DEFAULT_LAYER_ID)',
  "pin.layerId = DEFAULT_LAYER_ID",
  "drawing.layerId = DEFAULT_LAYER_ID",
  "layerId: draft.layerId",
  "pins.filter(isPinVisible)",
  'setWorkspaceTab("layers")',
];

const missing = required.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  console.error("Layer workflow coverage is missing expected behavior:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log("Layer workflow check passed.");
