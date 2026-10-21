import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const required = [
  'function captureHistoryState(scope = "active-map")',
  'if (scope === "library")',
  "maps: getStoredMapsSnapshot()",
  "document: cloneMapDocumentState()",
  'pushHistoryState("Rename Map", "library")',
  'pushHistoryState("Delete Map", "library")',
  'pushHistoryState("Duplicate Map", "library")',
  'pushHistoryState("Create Map", "library")',
  'function loadMap(name, { preserveHistory = false } = {})',
  'if (!isApplyingHistory && !preserveHistory) resetHistoryState()',
  'loadMap(currentMapName, { preserveHistory: true })',
  'loadMap(duplicateName, { preserveHistory: true })',
  'snapshot: captureHistoryState(scope)',
  "entry.document || entry.pins || []",
  "snapshot.scope ||",
  '(Array.isArray(snapshot.maps) ? "library" : "active-map")',
];

const missing = required.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  console.error("Scoped history coverage is missing expected behavior:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log("Scoped history check passed.");
