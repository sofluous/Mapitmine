import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/map-data.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const {
  DEFAULT_LAYER_ID,
  MAP_DOCUMENT_VERSION,
  createDefaultLayer,
  formatRelativeDate,
  getUniqueMapName,
  normalizeMapDocument,
  normalizePin,
  parseMapPayload,
} = context.globalThis.MapitMineData;

const normalized = normalizePin({
  x: "-198",
  y: "72",
  z: "bad",
  id: 42,
  label: null,
  color: "not-a-color",
  tags: ["village", 7],
  timestamp: "2026-10-20T00:00:00.000Z",
});
assert.equal(normalized.x, -198);
assert.equal(normalized.y, 72);
assert.equal(normalized.z, 0);
assert.equal(normalized.id, "42");
assert.equal(normalized.label, "");
assert.equal(normalized.color, "");
assert.equal(normalized.layerId, DEFAULT_LAYER_ID);
assert.deepEqual(normalized.tags, ["village", "7"]);

const arrayPayload = parseMapPayload([{ x: 1, z: 2 }], "route.json");
assert.equal(arrayPayload.name, "route");
assert.equal(arrayPayload.pins.length, 1);
assert.equal(arrayPayload.settings, null);
assert.equal(arrayPayload.version, MAP_DOCUMENT_VERSION);
assert.equal(
  JSON.stringify(arrayPayload.layers),
  JSON.stringify([createDefaultLayer()]),
);
assert.equal(arrayPayload.pins[0].layerId, DEFAULT_LAYER_ID);

const objectPayload = parseMapPayload(
  { name: "Overworld", pins: [{ x: "3", z: "4", color: "#abc" }], settings: { zoom: 2 } },
  "fallback.json",
);
assert.equal(objectPayload.name, "Overworld");
assert.equal(objectPayload.pins[0].x, 3);
assert.equal(objectPayload.pins[0].color, "#abc");
assert.deepEqual(objectPayload.settings, { zoom: 2 });
assert.equal(parseMapPayload("invalid", "bad.json"), null);

const layered = normalizeMapDocument({
  version: 2,
  pins: [
    { x: 1, z: 2, layerId: "routes" },
    { x: 3, z: 4, layerId: "missing" },
  ],
  layers: [
    { id: "routes", label: "Routes", visible: false, locked: true },
    { id: "routes", label: "Duplicate" },
  ],
  drawings: [
    {
      id: "path-1",
      type: "path",
      layerId: "routes",
      points: [{ x: "5", z: "6" }, { x: "bad", z: 7 }],
      style: { width: 2 },
    },
  ],
});
assert.equal(layered.version, MAP_DOCUMENT_VERSION);
assert.equal(layered.layers.length, 2);
assert.equal(layered.pins[0].layerId, "routes");
assert.equal(layered.pins[1].layerId, DEFAULT_LAYER_ID);
assert.equal(layered.drawings[0].layerId, "routes");
assert.equal(
  JSON.stringify(layered.drawings[0].points),
  JSON.stringify([{ x: 5, z: 6 }]),
);

const existingNames = new Set(["Map", "Map-2"]);
assert.equal(getUniqueMapName("Map", (name) => existingNames.has(name)), "Map-3");
assert.equal(getUniqueMapName("New", (name) => existingNames.has(name)), "New");

const now = Date.parse("2026-10-20T12:00:00.000Z");
assert.equal(formatRelativeDate("2026-10-20T11:55:00.000Z", now), "Updated 5m ago");

const identities = normalizeMapDocument({ version: 2, pins: [
  { id: "village", uid: "same", x: 1, z: 2 },
  { id: "village", uid: "same", x: 3, z: 4 },
  { id: "mine", uid: "pin-legacy-2", x: 5, z: 6 },
  { id: "village", x: 7, z: 8 },
], drawings: [
  { id: "route", type: "line", name: "Market Road", points: [] },
  { id: "route", type: "path", points: [] },
] });
assert.equal(new Set(identities.pins.map((pin) => pin.uid)).size, 4);
assert.equal(identities.pins[2].uid, "pin-legacy-2");
assert.equal(identities.pins[1].id, "village");
assert.notEqual(identities.drawings[0].id, identities.drawings[1].id);
assert.equal(identities.drawings[0].name, "Market Road");
assert.equal(JSON.stringify(normalizeMapDocument(JSON.parse(JSON.stringify(identities)))), JSON.stringify(identities));
assert.equal(normalizeMapDocument({ version: 999, pins: [] }), null);
assert.equal(parseMapPayload({ version: 999, pins: [] }, "future.json"), null);

console.log("Map data contract check passed.");
