import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const handlers = new Map(), timers = new Map(); let next = 0;
const global = {
  addEventListener(type, handler) { handlers.set(type, [...(handlers.get(type) || []), handler]); },
  setTimeout(handler) { timers.set(++next, handler); return next; }, clearTimeout(id) { timers.delete(id); },
};
vm.runInNewContext(await readFile(new URL("../src/object-menu-gesture.js", import.meta.url), "utf8"), { window: global });
const canvas = {}, target = { kind: "drawing", id: "route" }; let enabled = true, opened = 0, interrupted = 0;
global.MapitMineObjectMenuGesture.install({ canvas, enabled: () => enabled, targetAt: () => target,
  activate: (value) => { assert.equal(value, target); opened++; }, interrupt: () => interrupted++ });
const emit = (type, props = {}) => (handlers.get(type) || []).forEach((handler) => handler({ target: canvas, pointerType: "touch", pointerId: 1, clientX: 10, clientY: 10, ...props }));
const fire = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((handler) => handler()); };
emit("pointerdown"); fire(); assert.equal(opened, 1); assert.equal(interrupted, 1);
for (const event of ["pointerup", "pointercancel", "lostpointercapture", "blur", "wheel"]) { emit("pointerdown"); emit(event); fire(); }
emit("pointerdown"); emit("pointermove", { clientX: 14 }); fire();
emit("pointerdown"); emit("pointerdown", { pointerId: 2, isPrimary: false }); fire();
emit("pointerdown"); enabled = false; fire();
assert.equal(opened, 1, "Interrupted/moving/multi-pointer/ineligible holds cannot open a menu");
console.log("Object menu hold checks passed.");
