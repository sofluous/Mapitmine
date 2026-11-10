import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/mobile-layout.js", import.meta.url), "utf8"), context);
const { metrics } = context.globalThis.MapitMineMobileLayout;
assert.equal(metrics(844, 0, 844, 140).inset, 0);
assert.equal(metrics(844, 0, 844, 140).sheet, 844 * 0.55);
assert.equal(metrics(400, 0, 844, 140).inset, 444);
assert.equal(metrics(400, 20, 844, 140).inset, 424);
assert.equal(metrics(320, 0, 320, 160).sheet, 112);
assert.equal(metrics(200, 0, 200, 180).sheet, 12);
console.log("Mobile layout metrics checks passed.");
