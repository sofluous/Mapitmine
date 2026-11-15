import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/mobile-layout.js", import.meta.url), "utf8"), context);
const { metrics } = context.globalThis.MapitMineMobileLayout;
assert.equal(metrics(844, 0, 844, 140).inset, 0);
assert.equal(metrics(844, 0, 844, 140).sheet, 844 - 140 - 8 - 844 * 0.35);
assert.equal(metrics(400, 0, 844, 140).inset, 444);
assert.equal(metrics(400, 20, 844, 140).inset, 424);
assert.equal(metrics(320, 0, 320, 160).sheet, 152);
assert.equal(metrics(200, 0, 200, 180).sheet, 12);
assert.equal(metrics(1000, 0, 1000, 100).sheet, 420);
for (const h of [0, 200, 320, 400, 844, 1000, NaN]) for (const dock of [0, 140, 250, 1000]) {
  const result = metrics(h, 0, h, dock);
  assert.ok(Number.isFinite(result.sheet) && result.sheet >= 0 && result.sheet <= 420);
  assert.ok(result.sheet <= Math.max(0, (Number.isFinite(h) ? h : 0) - dock - 8));
}
console.log("Mobile layout metrics checks passed.");
