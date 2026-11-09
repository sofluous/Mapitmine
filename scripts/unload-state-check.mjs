import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const body = html.indexOf("{", start);
  let depth = 0;
  for (let index = body; index < html.length; index++) {
    if (html[index] === "{") depth++;
    if (html[index] === "}" && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Unclosed function: ${name}`);
}
const fields = [{ value: "0", validity: { badInput: false } }, { value: "", validity: { badInput: false } }];
const document = { pins: [{ uid: "p", x: 0 }], layers: [{ id: "default" }], drawings: [] };
let stored = structuredClone(document);
const context = vm.createContext({
  document: { querySelectorAll: () => fields },
  pinEditorPanel: { style: { display: "none" } }, tempPin: null, currentEditIndex: null,
  pinEditorOriginalInputs: null, currentMapName: "A", currentFileHandle: null, __dirty: false,
  drawingTools: { hasPendingChanges: () => false },
  readStoredMapDocument: () => stored, getCurrentMapDocument: () => document,
});
for (const name of ["readPinEditorInputs", "hasPendingPinEdits", "hasUnpersistedMapChanges", "shouldWarnBeforeUnload"]) vm.runInContext(extract(name), context);
const warn = () => context.shouldWarnBeforeUnload();
assert.equal(warn(), false);
stored.pins[0].timestamp = "generated-on-read";
assert.equal(warn(), false, "Generated legacy timestamps are not editable content");
context.__dirty = true;
assert.equal(warn(), false, "Persisted local maps do not need a file link to leave safely");
context.currentFileHandle = {};
assert.equal(warn(), true);
context.__dirty = false;
assert.equal(warn(), false);
context.pinEditorPanel.style.display = "block";
context.currentEditIndex = 0;
context.pinEditorOriginalInputs = context.readPinEditorInputs();
assert.equal(warn(), false, "Opening an unchanged existing pin is not pending work");
fields[0].value = "";
assert.equal(warn(), true, "Invalid required coordinates still represent pending work");
fields[0].value = "0";
fields[1].validity.badInput = true;
assert.equal(warn(), true, "Invalid optional input must not disappear through normalized comparisons");
fields[1].validity.badInput = false;
assert.equal(warn(), false);
context.currentEditIndex = null;
context.tempPin = {};
assert.equal(warn(), true, "New pin placement is pending until saved or discarded");
context.pinEditorPanel.style.display = "none";
context.tempPin = null;
context.drawingTools.hasPendingChanges = () => true;
assert.equal(warn(), true);
context.drawingTools = null;
assert.equal(warn(), false);
stored = null;
assert.equal(warn(), true, "Missing local persistence is unsafe even without a file link");
stored = { ...document, pins: [] };
assert.equal(warn(), true);
context.readStoredMapDocument = () => { throw new Error("Storage denied"); };
assert.equal(warn(), true);
context.currentMapName = null;
assert.equal(warn(), false, "An empty workspace has no map to lose");
console.log("Unload state checks passed.");
