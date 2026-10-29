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
      ...((selector === "input" && child.tag === "input") ? [child] : []),
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
  color: () => "#ffffff", redraw() {}, closePinEditor() {}, openLayers() {},
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
const ctx = {
  save() {}, restore() {}, setLineDash() {}, beginPath() {},
  moveTo() {}, lineTo() {}, fillRect() {}, stroke() { strokes++; },
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
await click(40, 40);
draftChoice = "keep";
assert.equal(await controller.leave(), false);
assert.equal(canFinishDraft, false, "A one-point draft cannot finish");
assert.equal(controller.active(), true);
draftChoice = "finish";
assert.equal(await controller.leave(), false, "Invalid geometry cannot be committed even if Finish is requested");
await click(50, 50);
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
console.log("Drawing controller and geometry checks passed.");
