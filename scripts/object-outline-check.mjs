import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/object-outline.js", import.meta.url), "utf8"), context);
const { navigate } = context.globalThis.MapitMineOutline;
const items = [
  { key: "layer:a", branch: true, expanded: true },
  { key: "pin:1", parentKey: "layer:a" },
  { key: "drawing:1", parentKey: "layer:a" },
  { key: "layer:b", branch: true, expanded: false },
];
assert.equal(navigate([], "", "Home"), null);
assert.equal(navigate(items, "layer:a", "ArrowUp").key, "layer:a");
assert.equal(navigate(items, "layer:a", "ArrowDown").key, "pin:1");
assert.equal(navigate(items, "layer:a", "ArrowRight").key, "pin:1");
assert.equal(navigate(items, "layer:a", "ArrowLeft").expanded, false);
assert.equal(navigate(items, "pin:1", "ArrowLeft").key, "layer:a");
assert.equal(navigate(items, "layer:b", "ArrowRight").expanded, true);
assert.equal(navigate(items, "pin:1", "Home").key, "layer:a");
assert.equal(navigate(items, "pin:1", "End").key, "layer:b");
assert.equal(navigate(items, "layer:b", "ArrowDown").key, "layer:b");
assert.equal(navigate([{ key: "empty", branch: true, expanded: true }], "empty", "ArrowRight").key, "empty");
assert.equal(navigate(items, "missing", "ArrowDown").key, "pin:1");
console.log("Object outline navigation checks passed.");
