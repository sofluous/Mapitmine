import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/coordinate-rulers.js", import.meta.url), "utf8"), context);
const { ticks, intersects } = context.globalThis.MapitMineRulers;
const base = ticks(0, 400, 200, 1);
assert.equal(JSON.stringify(base.map((tick) => tick.value)), "[-200,-100,0,100,200]");
assert.equal(base[0].position, 0);
assert.equal(base.at(-1).position, 400);
assert.equal(ticks(0, 400, 200, 5)[0].step, 20, "Zoom changes the world interval");
assert.equal(ticks(0, 400, 300, 1)[0].value, -300, "Pan uses the camera offset and sign");
assert.equal(ticks(0, 400, 0, 1000)[3].label, "0.3", "Fractional labels avoid floating point tails");
assert.equal(new Set(ticks(0, 800, 1e12, 1).map((tick) => tick.label)).size, 9, "Large values stay distinguishable");
for (const scale of [0.25, 1, 5, 1000]) {
  const values = ticks(12, 1440, -123.5, scale, 90);
  for (let i = 0; i < values.length; i++) {
    assert.ok(values[i].position >= 12 - 0.001 && values[i].position <= 1440.001);
    assert.ok(Math.abs((values[i].position + 123.5) / scale - values[i].value) < 1e-8);
    if (i) assert.ok(values[i].position - values[i - 1].position >= 90 - 0.001);
    assert.notEqual(values[i].label, "-0");
  }
}
for (const invalid of [0, -1, NaN, Infinity]) assert.equal(ticks(0, 100, 0, invalid).length, 0);
assert.equal(ticks(100, 0, 0, 1).length, 0);
assert.equal(ticks(0, 100, Infinity, 1).length, 0);
assert.ok(ticks(0, 1e9, 0, 1, 0.001).length <= 512);
assert.equal(intersects({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 9, right: 20, top: 0, bottom: 10 }), true);
assert.equal(intersects({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 20, right: 30, top: 0, bottom: 10 }), false);
console.log("Coordinate ruler tick and collision checks passed.");
