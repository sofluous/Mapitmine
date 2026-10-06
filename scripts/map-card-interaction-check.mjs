import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const required = [
  'card.tabIndex = 0',
  'data-map-card-action="more"',
  "function getMapCardActionItems(",
  "function showMapCardMenu(",
  'event.key === "ArrowDown"',
  'event.key === "ArrowUp"',
  'event.key === "F2"',
  'event.key === "ContextMenu"',
  'event.key === "Delete"',
  "formatRelativeDate(meta.updatedAt)",
  "function touchMapMeta(",
  "updatedAt: new Date().toISOString()",
  'label: "Rename"',
  "Save Linked",
  'label: "Open & Link"',
  "let editingMapName = null",
  "function startMapCardRename(",
  "function stopMapCardRename(",
  "data-map-rename-input",
  ".map-gallery-card-footer",
  ".map-gallery-card-body",
  "item-card",
  "is-active",
  "card.focus()",
  'event.key === "Enter" || event.key === " "',
  "selectMapByName(card.dataset.mapName)",
];

const forbidden = [
  '<details class="map-card-menu">',
  'class="map-card-menu-popover"',
  "mapAdvancedDetails",
  "mapMetaSource",
  "mapMetaDetail",
  "mapMetaPins",
  "currentMapNameInput",
  "mapLinkBadge",
  'card.setAttribute("role", "button")',
  ">Selected<",
];

const missing = required.filter((snippet) => !html.includes(snippet));
const presentForbidden = forbidden.filter((snippet) => html.includes(snippet));

if (missing.length || presentForbidden.length) {
  if (missing.length) {
    console.error("Map card interaction coverage is missing expected behavior:");
    for (const snippet of missing) console.error(`- ${snippet}`);
  }
  if (presentForbidden.length) {
    console.error("Map card interaction coverage found removed legacy patterns:");
    for (const snippet of presentForbidden) console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log("Map card interaction check passed.");
