import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const requiredSnippets = [
  '<canvas id="mapCanvas"',
  'id="workspaceShell"',
  'id="mapGallery"',
  'id="mapOpenLibraryBtn"',
  'data-map-card-action="more"',
  'id="pinList"',
  'id="pinEditorPanel"',
  'id="mapStatusStrip"',
  'id="mapScaleChip"',
  'class="label-value"',
  'workspace-tab-header',
  'Open & Link',
  'Export Copy',
  'function normalizePin(',
  'function parseMapPayload(',
  'function getRenderColors(',
  'function getViewSettings(',
  'function updateScaleChip(',
  'function fitViewToPins(',
  'function fitViewToCrop(',
  'function getPinActionItems(',
  'function clearSelectedPin(',
  'function clearPinSearchAndFilters(',
  'function setActiveContextMenuItem(',
  'id="pinEditorHelpBtn"',
  'id="pinEditorSaveBtn"',
  'id="pinEditorSaveText"',
  'function drawPinEditorTether(',
  'const firstLineText = view.showCoords',
  'const titleCoordGap = "  ";',
  'function getPinEditorDraft(',
  'function isPinEditorDraftDirty(',
  'function updatePinEditorState(',
  'role", "menuitem"',
  'async function importMapFromFile(',
  'async function openMapFromDisk(',
  'function collectSettingsSnapshot(',
  'function applySettingsSnapshot(',
  'function renderMapGallery(',
  'function getStoredMapSummary(',
  'function selectMapByName(',
  'function saveSelectedMapToDisk(',
  'function exportMapByName(',
  'function getMapCardActionItems(',
  'function showMapCardMenu(',
  'function touchMapMeta(',
  'function formatRelativeDate(',
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));

if (missing.length > 0) {
  console.error("Smoke check failed. Missing expected app surface:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

const scriptOpenTags = (html.match(/<script\b/g) || []).length;
const scriptCloseTags = (html.match(/<\/script>/g) || []).length;
if (scriptOpenTags !== scriptCloseTags) {
  console.error(
    `Smoke check failed. Script tag mismatch: ${scriptOpenTags} open, ${scriptCloseTags} close.`,
  );
  process.exit(1);
}

const inlineScripts = [
  ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
].map((match) => match[1]);
for (const [index, script] of inlineScripts.entries()) {
  try {
    new Function(script);
  } catch (error) {
    console.error(`Smoke check failed. Inline script ${index + 1} has invalid syntax.`);
    console.error(error.message);
    process.exit(1);
  }
}

console.log("Smoke check passed.");
