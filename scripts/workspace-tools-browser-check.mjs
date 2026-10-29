import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Optional browser QA: normal application checks do not require Playwright.
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) {
  throw new Error("Set PLAYWRIGHT_MODULE to a Playwright module path and CHROMIUM_EXECUTABLE to a Chromium executable.");
}
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const appUrl = new URL("../index.html", import.meta.url).href;
const output = fileURLToPath(new URL("../_docs/data/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("map:Tools QA", JSON.stringify({
      version: 3,
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
      pins: [{ uid: "pin-qa", x: 0, z: 0, label: "Origin", layerId: "default" }],
      drawings: [],
    }));
  });
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const tool = (name) => page.locator(`[data-canvas-tool="${name}"]`);
  const choice = (name) => page.locator(`[data-draft-choice="${name}"]`);
  const state = () => page.evaluate(() => workspaceState.get());
  await tool("path").click();
  assert.equal((await state()).tool, "path");
  await page.locator("#mapCanvas").click({ position: { x: 700, y: 300 } });
  await tool("pan").click();
  assert.equal(await choice("finish").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal((await state()).tool, "path", "Escape in draft dialog keeps editing");
  await page.locator("#mapCanvas").click({ position: { x: 800, y: 350 } });
  await tool("pan").click();
  assert.equal(await choice("finish").isEnabled(), true);
  await choice("finish").click();
  await page.waitForFunction(() => workspaceState.get().tool === "pan");
  assert.equal(await page.evaluate(() => drawings.length), 1);
  const selected = (await state()).selection;
  const pinPosition = await page.evaluate(() => ({ x: offsetX, y: offsetY }));
  await page.mouse.dblclick(pinPosition.x, pinPosition.y);
  assert.deepEqual((await state()).selection, selected, "Pan does not select a mapped pin");
  assert.equal(await page.locator("#pinEditorPanel").isVisible(), false, "Pan does not open a pin editor");
  await page.locator("#mapCanvas").click({ position: { x: 650, y: 500 } });
  assert.deepEqual((await state()).selection, selected, "Pan clicks preserve selection");
  const beforePan = await page.evaluate(() => ({ x: offsetX, y: offsetY }));
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(750, 420, { steps: 4 });
  await page.mouse.up();
  assert.equal((await state()).tool, "pan", "Explicit Pan persists after dragging");
  assert.notDeepEqual(await page.evaluate(() => ({ x: offsetX, y: offsetY })), beforePan);
  await page.locator("#mapCanvas").dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9, clientX: 700, clientY: 400 });
  await page.locator("#mapCanvas").dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9 });
  assert.equal((await state()).tool, "pan", "Touch release also preserves explicit Pan");
  await tool("select").click();
  await page.locator("#drawingName").fill("Unapplied QA title");
  await page.mouse.move(650, 500);
  await page.mouse.down();
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-map-dragging")), false, "Pointer-down alone must not dim chrome");
  await page.mouse.move(652, 501);
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-map-dragging")), false, "Tiny pointer jitter is not a pan");
  await page.mouse.move(680, 520, { steps: 3 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-map-dragging")), true, "Chrome dims only during a real pan");
  assert.deepEqual((await state()).selection, selected, "Selection remains during a pan");
  await page.mouse.up();
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-map-dragging")), false);
  assert.deepEqual((await state()).selection, selected, "The click after a pan must not clear selection");
  assert.equal(await page.locator("#drawingName").inputValue(), "Unapplied QA title", "Panning preserves pending property edits");
  await page.locator("#mapCanvas").dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 10, clientX: 650, clientY: 500 });
  await page.locator("#mapCanvas").dispatchEvent("pointermove", { pointerType: "touch", pointerId: 10, clientX: 680, clientY: 520 });
  await page.locator("#mapCanvas").dispatchEvent("pointerup", { pointerType: "touch", pointerId: 10 });
  await page.locator("#mapCanvas").dispatchEvent("click", { clientX: 680, clientY: 520 });
  assert.deepEqual((await state()).selection, selected, "Post-touch-pan clicks preserve drawing selection");
  await page.keyboard.press("Escape");
  await choice("discard").click();
  await page.waitForFunction(() => workspaceState.get().selection === null);
  assert.equal((await state()).selection, null, "Escape deselects after panning");
  const cameraBeforePinEdit = await page.evaluate(() => ({ x: offsetX, y: offsetY, zoom }));
  await page.mouse.dblclick(cameraBeforePinEdit.x, cameraBeforePinEdit.y);
  assert.equal(await page.locator("#pinEditorPanel").isVisible(), true);
  assert.deepEqual(await page.evaluate(() => ({ x: offsetX, y: offsetY, zoom })), cameraBeforePinEdit, "Canvas pin double-click must not recenter");
  await page.locator("#pinEditorCancelBtn").click();
  const pinSelection = (await state()).selection;
  await page.mouse.move(650, 500);
  await page.mouse.down();
  await page.mouse.move(675, 520, { steps: 3 });
  await page.mouse.up();
  assert.deepEqual((await state()).selection, pinSelection, "Normal panning also preserves pin selection");
  await tool("pan").click();
  await page.keyboard.press("Escape");
  assert.equal((await state()).selection, null, "Escape deselects pins even with Pan active");
  await tool("select").click();
  await page.evaluate(() => workspaceState.select({ kind: "layer", id: "default" }));
  await page.keyboard.press("Escape");
  assert.equal((await state()).selection, null, "Escape also deselects layer objects");
  await page.evaluate(() => { setWorkspaceTab("pins"); offsetX += 55; offsetY += 30; draw(); });
  const cameraBeforePanelEdit = await page.evaluate(() => ({ x: offsetX, y: offsetY }));
  await page.locator('.pin-card[data-index="0"] .pin-label').dblclick();
  assert.notDeepEqual(await page.evaluate(() => ({ x: offsetX, y: offsetY })), cameraBeforePanelEdit, "Panel pin double-click still centers");
  await page.locator("#pinEditorCancelBtn").click();
  await page.evaluate(() => setWorkspaceTab("maps"));
  await tool("pin").click();
  await page.locator("#mapCanvas").click({ position: { x: 700, y: 400 } });
  await page.locator("#pinEditorLabel").fill("New QA pin");
  await tool("path").click();
  await choice("keep").click();
  assert.equal((await state()).tool, "pin");
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "New QA pin");
  await tool("path").click();
  await choice("finish").click();
  await page.waitForFunction(() => workspaceState.get().tool === "path");
  assert.equal(await page.evaluate(() => pins.length), 2, "Save pin then switch commits exactly once");
  await page.locator("#mapCanvas").click({ position: { x: 750, y: 450 } });
  await tool("select").click();
  await choice("discard").click();
  await page.waitForFunction(() => workspaceState.get().tool === "select");
  assert.equal(await page.evaluate(() => drawings.length), 1);
  await page.keyboard.press("p");
  await page.waitForFunction(() => workspaceState.get().tool === "pin");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => workspaceState.get().tool === "select");

  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    assert.equal(await page.evaluate(() => MapItTheme.getTheme()), theme);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 901, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      const box = await page.locator("#workspaceTools").boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0);
      assert.equal(await page.locator("#hud #workspaceTools").count(), 1);
      assert.equal(await page.locator("#hud #undoBtn").count(), 1);
      assert.equal(await page.locator("#hud #redoBtn").count(), 1);
      for (const button of await page.locator("#hud button").all()) {
        if (!await button.isVisible()) continue;
        const bounds = await button.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, "Toolbar buttons stay within the viewport");
      }
      const rail = await page.locator("#appRail").boundingBox();
      const panel = await page.locator("#workspacePanel").boundingBox();
      assert.ok(viewport.width > 900 ? Math.abs(rail.x + rail.width - panel.x) <= 1 : Math.abs(panel.y + panel.height - rail.y) <= 1, "Rail and panel share an edge");
      for (const name of ["select", "pin", "path", "pan"]) {
        const mask = await tool(name).locator("span").evaluate((element) => getComputedStyle(element, "::before").maskImage);
        assert.notEqual(mask, "none", `${name} icon must render`);
      }
      await page.screenshot({ path: resolve(output, `2026-10-29-workspace-tools-${theme}-${viewport.width}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tool("path").click();
  assert.equal(await page.locator("#hud #drawingToolStrip").count(), 1, "Drawing commands share the history toolbar");
  await page.screenshot({ path: resolve(output, "2026-10-29-workspace-tools-draw-mobile.png") });
  const toolbarBounds = await page.locator("#hud").boundingBox();
  const commandsBounds = await page.locator("#drawingToolStrip").boundingBox();
  assert.ok(commandsBounds.y >= toolbarBounds.y && commandsBounds.y + commandsBounds.height <= toolbarBounds.y + toolbarBounds.height);
  await page.locator("#drawingCancel").click();
  await tool("pin").click();
  await page.locator("#mapCanvas").click({ position: { x: 80, y: 300 } });
  await tool("pan").click();
  await choice("discard").click();
  await page.waitForFunction(() => workspaceState.get().tool === "pan");
  await tool("select").click();
  await page.evaluate(async () => { await selectWorkspaceObject({ kind: "drawing", id: drawings[0].id }); });
  await page.locator("#drawingName").fill("Guarded drawing");
  await page.locator("#mapCanvas").click({ position: { x: 80, y: 300 } });
  await choice("keep").click();
  assert.equal((await state()).selection.kind, "drawing", "Canvas navigation respects pending properties");
  await tool("pan").click();
  await choice("keep").click();
  assert.equal(await page.locator("#drawingName").inputValue(), "Guarded drawing");
  const outlineSwitch = page.evaluate(() => selectWorkspaceObject({ kind: "pin", id: "pin-qa" }));
  await choice("finish").click();
  await outlineSwitch;
  assert.equal(await page.evaluate(() => drawings[0].name), "Guarded drawing");
  assert.equal(await page.locator("#contextInspector #objectInspectorEdit").isVisible(), true);
  assert.equal(await page.locator("#workspacePanel").isVisible(), false, "Mobile inspector excludes the workspace sheet");
  assert.equal(await page.locator("#appRail").isVisible(), true);
  await page.locator("#objectInspectorEdit").click();
  assert.equal(await page.locator("#contextInspector #pinEditorPanel").isVisible(), true);
  await page.locator("#pinEditorLabel").fill("Keep this pin draft");
  await page.locator("#inspectorClose").click();
  await choice("keep").click();
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Keep this pin draft");
  assert.equal(await page.locator("#contextInspector").isVisible(), true);
  await page.locator("#inspectorClose").click();
  await choice("discard").click();
  await page.waitForFunction(() => workspaceState.get().selection === null);
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ["pin", "drawing", "layer"]) {
        await page.evaluate(async (kind) => {
          await selectWorkspaceObject({ kind, id: kind === "pin" ? "pin-qa" : kind === "drawing" ? drawings[0].id : "default" });
        }, kind);
        const inspector = page.locator("#contextInspector");
        assert.equal(await inspector.isVisible(), true);
        if (kind === "pin") await page.locator("#objectInspectorEdit").click();
        const bounds = await inspector.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900);
        await page.screenshot({ path: resolve(output, `2026-10-29-inspector-${kind}-${theme}-${width}.png`) });
        if (kind === "pin") await page.locator("#pinEditorCancelBtn").click();
      }
    }
  }
  await page.locator("#inspectorLayerLocked").check();
  assert.equal(await page.evaluate(() => layers[0].locked), true);
  await page.locator("#inspectorLayerLocked").uncheck();
  await page.locator("#inspectorLayerVisible").uncheck();
  assert.equal(await page.evaluate(() => layers[0].visible), false);
  await page.locator("#inspectorLayerVisible").check();
  await page.evaluate(() => { layers[0].locked = true; renderLayers(); });
  assert.equal(await tool("pin").isDisabled(), true);
  assert.equal(await tool("path").isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("Workspace browser checks passed: shared inspectors/mobile sheets, drawing edit guards, layer controls, draft resolution, pan/centering, merged toolbar, connected shell and three-theme responsive screenshots.");
} finally {
  await browser.close();
}
