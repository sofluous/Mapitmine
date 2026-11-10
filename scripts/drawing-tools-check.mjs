import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.value = "";
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.listeners = new Map();
    this.classList = { toggle() {} };
  }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }
  async emit(name, values = {}) {
    const event = { target: this, preventDefault() {}, stopImmediatePropagation() {}, ...values };
    for (const handler of this.listeners.get(name) || []) await handler(event);
  }
  setAttribute() {}
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  closest() { return null; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(((selector === "input" && child.tag === "input") || (selector === "[data-vertex]" && child.dataset.vertex !== undefined)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

const fields = new Map();
const panel = new Element();
panel.querySelector = (selector) => {
  if (!fields.has(selector)) fields.set(selector, new Element());
  return fields.get(selector);
};
const line = new Element("button");
line.dataset.drawTool = "line";
const path = new Element("button");
path.dataset.drawTool = "path";
panel.querySelectorAll = (selector) => selector === "[data-draw-tool]" ? [line, path] : [];
const canvas = new Element("canvas");
const window = new Element();
const context = { window, document: { createElement: (tag) => new Element(tag) }, crypto: { randomUUID } };
vm.runInNewContext(await readFile(new URL("../src/workspace-state.js", import.meta.url), "utf8"), context);
vm.runInNewContext(await readFile(new URL("../src/drawing-tools.js", import.meta.url), "utf8"), context);
const { hitTest, validPoints, install } = window.MapitMineDrawing;
assert.equal(hitTest([{ x: 0, z: 0 }, { x: 10, z: 0 }], { x: 5, z: 2 }, 3), true);
assert.equal(hitTest([{ x: 0, z: 0 }, { x: 10, z: 0 }], { x: 15, z: 0 }, 3), false);
assert.equal(validPoints([{ x: 1, z: 1 }, { x: 1, z: 1 }], "line"), false);
assert.equal(validPoints([{ x: 0, z: 0 }, { x: NaN, z: 1 }], "path"), false);
const layers = [{ id: "default", label: "Pins", visible: true, locked: false }];
const drawings = [];
const history = [];
let saves = 0;
let draftChoice = "discard";
let canFinishDraft = false;
let prepareAllowed = true;
let consumeClick = false;
const workspace = window.MapitMineWorkspace.create();
const controller = install({
  workspace,
  canvas, panel,
  drawings: () => drawings, layers: () => layers,
  hasMap: () => true, canSelect: () => true,
  camera: () => ({ zoom: 1, offsetX: 0, offsetY: 0 }),
  world: (x, z) => ({ x, z }),
  color: () => "#ffffff", markerBackground: () => "#000000", redraw() {}, closePinEditor() {}, openLayers() {},
  history: (label) => history.push(label), save: () => saves++, toast() {}, confirm: async () => allowDiscard,
  prepareTool: async () => prepareAllowed,
  consumeClick: () => { const consumed = consumeClick; consumeClick = false; return consumed; },
  resolveDraft: async (options) => { canFinishDraft = options.canFinish; return draftChoice; },
});
let allowDiscard = true;
const field = (id) => panel.querySelector(`#${id}`);
const click = (x, z) => canvas.emit("click", { clientX: x, clientY: z });
await line.emit("click");
await click(0, 0);
await click(10, 0);
assert.equal(drawings.length, 1);
assert.equal(workspace.get().selection.kind, "drawing");
assert.equal(drawings[0].points.length, 2);
assert.equal(controller.active(), false);
assert.equal(workspace.get().tool, "select");
const selectionBeforePanClick = workspace.get().selection;
consumeClick = true;
await click(500, 500);
assert.deepEqual(workspace.get().selection, selectionBeforePanClick, "Post-pan clicks must not clear drawing selection");
assert.equal(history.at(-1), "Add Drawing");
field("drawingWidth").value = "4";
await field("drawingApply").emit("click");
assert.equal(drawings[0].style.width, 4);
assert.equal(history.at(-1), "Edit Drawing");
await path.emit("click");
await click(1, 1);
await click(2, 3);
await click(4, 5);
await field("drawingFinish").emit("click");
assert.equal(drawings.length, 2);
assert.equal(drawings[1].points.length, 3);
await path.emit("click");
await click(8, 8);
allowDiscard = false;
draftChoice = "keep";
await line.emit("click");
assert.equal(workspace.get().tool, "path", "Declining discard keeps the original drawing tool");
assert.equal(controller.active(), true, "Declining discard preserves the draft");
allowDiscard = true;
draftChoice = "discard";
await field("drawingCancel").emit("click");
assert.equal(drawings.length, 2);
await line.emit("click");
await click(20, 20);
layers[0].locked = true;
await click(30, 30);
assert.equal(drawings.length, 2);
assert.equal(controller.active(), false);
layers[0].locked = false;
await click(10, 0);
await field("drawingDelete").emit("click");
assert.equal(drawings.length, 1);
assert.equal(history.at(-1), "Delete Drawing");
assert.equal(saves, 4);
await click(2, 3);
field("drawingName").value = "Pending rename";
assert.equal(controller.hasPendingEdits(), true);
draftChoice = "keep";
assert.equal(await controller.resolveEdits(), false);
assert.equal(field("drawingName").value, "Pending rename");
draftChoice = "finish";
field("drawingWidth").value = "0";
assert.equal(await controller.resolveEdits(), false, "Invalid property edits block leaving");
field("drawingWidth").value = "3";
assert.equal(await controller.resolveEdits(), true);
assert.equal(drawings[0].name, "Pending rename");
assert.equal(controller.hasPendingEdits(), false);
field("drawingName").value = "Discard this";
draftChoice = "discard";
assert.equal(await controller.resolveEdits(), true);
assert.equal(field("drawingName").value, "Pending rename");
let strokes = 0;
const markerRects = [];
const ctx = {
  save() {}, restore() {}, setLineDash() {}, beginPath() {},
  moveTo() {}, lineTo() {}, fillRect(...rect) { if (this.fillStyle === "#ffffff") markerRects.push(rect); }, stroke() { strokes++; },
};
controller.render(ctx);
assert.equal(strokes, 1);
layers[0].visible = false;
controller.render(ctx);
assert.equal(strokes, 1, "Hidden layers must not paint drawings");
layers[0].visible = true;
const moduleContext = { globalThis: {} };
vm.runInNewContext(await readFile(new URL("../src/map-data.js", import.meta.url), "utf8"), moduleContext);
const restored = moduleContext.globalThis.MapitMineData.normalizeMapDocument(
  JSON.parse(JSON.stringify({ version: 2, layers, drawings, pins: [] })),
);
assert.equal(JSON.stringify(restored.drawings), JSON.stringify(drawings));
controller.reset();
assert.equal(controller.active(), false);
prepareAllowed = false;
await controller.start("path");
assert.equal(controller.active(), false, "A rejected pin draft guard must block drawing");
prepareAllowed = true;
await controller.start("path");
assert.equal(controller.hasPendingChanges(), false, "An armed tool without placed points is not an unload risk");
await click(40, 40);
assert.equal(controller.hasPendingChanges(), true);
markerRects.length = 0;
controller.render(ctx);
assert.deepEqual(markerRects, [[34, 34, 12, 12]], "First placed point is visible without a segment");
await canvas.emit("mousemove", { clientX: 80, clientY: 80 });
markerRects.length = 0;
controller.render(ctx);
assert.deepEqual(markerRects, [[34, 34, 12, 12]], "Hover preview must not look like a placed point");
draftChoice = "keep";
assert.equal(await controller.leave(), false);
assert.equal(canFinishDraft, false, "A one-point draft cannot finish");
assert.equal(controller.active(), true);
draftChoice = "finish";
assert.equal(await controller.leave(), false, "Invalid geometry cannot be committed even if Finish is requested");
await click(50, 50);
markerRects.length = 0;
controller.render(ctx);
assert.deepEqual(markerRects, [[36, 36, 8, 8], [44, 44, 12, 12]], "Every accepted point is marked and the terminal point is larger");
draftChoice = "finish";
const beforeFinish = drawings.length;
assert.equal(await controller.leave(), true);
assert.equal(canFinishDraft, true);
assert.equal(drawings.length, beforeFinish + 1, "Finish saves exactly one drawing before switching");
await controller.start("path");
await click(60, 60);
draftChoice = "discard";
assert.equal(await controller.leave(), true);
assert.equal(drawings.length, beforeFinish + 1, "Discard does not save the draft");
assert.equal(controller.active(), false);
assert.equal(controller.hasPendingChanges(), false);
controller.reset();
workspace.select({ kind: "drawing", id: drawings[0].id });
controller.refresh();
await controller.editVertices();
assert.equal(workspace.get().tool, "vertices");
const original = JSON.stringify(drawings[0].points);
const point = drawings[0].points[0];
const beginDrag = () => canvas.emit("pointerdown", { button: 0, pointerId: 1, clientX: point.x, clientY: point.z });
let count = history.length;
await beginDrag();
await window.emit("pointermove", { pointerId: 1, clientX: -20, clientY: 30 });
assert.equal(JSON.stringify(drawings[0].points), original, "Preview must not mutate committed geometry");
assert.equal(controller.hasPendingChanges(), true);
await window.emit("pointercancel", { pointerId: 1 });
assert.equal(JSON.stringify(drawings[0].points), original);
assert.equal(history.length, count);
await beginDrag();
await window.emit("pointermove", { pointerId: 1, clientX: -20, clientY: 30 });
await window.emit("pointerup", { pointerId: 1 });
assert.equal(history.length, count + 1, "A move creates one history entry");
assert.equal(history.at(-1), "Move Vertex");
assert.equal(drawings[0].points[0].x, -20);
assert.equal(controller.hasPendingChanges(), false);
count = history.length;
await field("drawingVertexInsert").emit("click");
assert.equal(history.length, count + 1);
assert.equal(drawings[0].points.length, 4);
await field("drawingVertexDelete").emit("click");
assert.equal(drawings[0].points.length, 3);
await field("drawingVertexDelete").emit("click");
assert.equal(drawings[0].points.length, 2);
await field("drawingVertexDelete").emit("click");
assert.equal(drawings[0].points.length, 2, "A path cannot lose its minimum two vertices");
layers[0].locked = true;
count = history.length;
await field("drawingVertexInsert").emit("click");
assert.equal(history.length, count, "Locked geometry cannot change");
layers[0].locked = false;
assert.equal(window.MapitMineDrawing.nearestSegment([{ x: 0, z: 0 }, { x: 10, z: 0 }], { x: 4, z: 1 }, 2).point.x, 4);
assert.equal(window.MapitMineDrawing.nearestSegment([{ x: 0, z: 0 }, { x: 0, z: 0 }], { x: 0, z: 0 }, 2), null);
console.log("Drawing controller and geometry checks passed.");
