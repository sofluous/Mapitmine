import assert from "node:assert/strict";
import "../src/touch-navigation.js";

const { pinchCamera } = globalThis.MapitMineTouchNavigation;
const camera = { zoom: 1, offsetX: -20, offsetY: 30 };
const start = { x: 100, y: 200, distance: 80 };
const enlarged = pinchCamera(camera, start, { x: 110, y: 220, distance: 160 });
assert.deepEqual(enlarged, { zoom: 2, offsetX: -130, offsetY: -120 });
for (const distance of [0, 1, 40, 160, 10000]) {
  const next = { x: -50, y: 300, distance };
  const result = pinchCamera(camera, start, next);
  assert.ok(result.zoom >= 0.25 && result.zoom <= 5);
  assert.equal((next.x - result.offsetX) / result.zoom, (start.x - camera.offsetX) / camera.zoom);
  assert.equal((next.y - result.offsetY) / result.zoom, (start.y - camera.offsetY) / camera.zoom);
}
assert.equal(pinchCamera(camera, { ...start, distance: 0 }, start), camera);
assert.equal(pinchCamera(camera, start, { ...start, distance: NaN }), camera);
console.log("Touch navigation camera checks passed.");
