import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const required = [
  'case "open":',
  'case "rename":',
  'case "duplicate":',
  'case "export":',
  'case "delete":',
  'mapGalleryEl?.addEventListener("dblclick"',
  'event.key === "Enter" || event.key === " "',
  'event.key === "Escape"',
  'clearSelectedPin()',
  'selectedPinIndex = found;',
  'item.addEventListener("dblclick"',
  'centerOnPin(pin)',
  'showContextMenu(getPinActionItems(index)',
  'parseMapPayload(data, file.name)',
  'saveMapAs(parsed.name, parsed)',
  'version: MAP_DOCUMENT_VERSION',
  '...getCurrentMapDocument(collectSettingsSnapshot())',
];

const missing = required.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  console.error("Workflow interaction coverage is missing expected behavior:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

const mappedPinSelection = html.indexOf("selectedPinIndex = found;");
const mappedPinCentering = html.indexOf("centerOnPin(pins[found])", mappedPinSelection);
if (mappedPinCentering !== -1) {
  console.error("Mapped pin selection must not recenter the canvas.");
  process.exit(1);
}

console.log("Workflow interaction check passed.");
