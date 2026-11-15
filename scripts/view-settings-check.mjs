import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const context = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/view-settings.js", import.meta.url), "utf8"), context);
const { spacing, validSpacing, gridLines } = context.globalThis.MapitMineViewSettings;
for (const value of [-10, 0, "", " ", null, undefined, false, NaN, Infinity, "oops"]) {
  assert.equal(validSpacing(value), false);
  assert.equal(spacing(value, 125), 125);
}
for (const value of [0.25, 100, "12.5", Number.MIN_VALUE, Number.MAX_VALUE]) assert.equal(spacing(value), Number(value));
assert.equal(spacing(null, -1), 100);
assert.equal(JSON.stringify(gridLines(-5, 20, 10)), "[-10,0,10,20]");
assert.equal(gridLines(0, 10000, 0.001).length, 0);
assert.equal(gridLines(0, 10, Number.MIN_VALUE).length, 0);
assert.equal(gridLines(-Infinity, 10, 1).length, 0);
assert.equal(gridLines(0, 10, -1).length, 0);
assert.equal(gridLines(0, 10, 0.5).length, 21);
assert.equal(gridLines(-1e300, 1e300, 1).length, 0);
console.log("View settings checks passed: positive spacing, fallback and bounded grid work.");
