import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) {
  throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE for optional browser QA.");
}
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/vertices/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem("map:Vertices")) return;
    localStorage.setItem("map:Vertices", JSON.stringify({ version: 3,
      pins: [{ uid: "overlap", label: "Overlapping pin", x: 0, z: 0, layerId: "default" }],
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
      drawings: [
        { id: "route", name: "Route", type: "path", layerId: "default", points: [{ x: 0, z: 0 }, { x: 140, z: 80 }, { x: 250, z: 0 }], style: { color: "#55bb99", width: 3 } },
        { id: "line", name: "Line", type: "line", layerId: "default", points: [{ x: 0, z: 150 }, { x: 140, z: 150 }], style: { color: "#55bb99", width: 3 } },
      ],
    }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const canvas = page.locator("#mapCanvas");
  const points = () => page.evaluate(() => structuredClone(drawings.find((entry) => entry.id === "route").points));
  const camera = () => page.evaluate(() => [offsetX, offsetY, zoom]);
  const pixels = (x, y) => page.evaluate(({ x, y }) => {
    const context = document.getElementById("mapCanvas").getContext("2d");
    return Array.from(context.getImageData(x - 8, y - 8, 16, 16).data).join(",");
  }, { x, y });
  const enter = async (id = "route") => {
    await page.evaluate((value) => {
      setWorkspaceCollapsed(true, false);
      offsetX = 600; offsetY = 220; zoom = 1;
      workspaceState.select({ kind: "drawing", id: value });
      drawingTools.refresh(); draw();
    }, id);
    await page.locator("#drawingVertices").click();
    await page.waitForFunction(() => workspaceState.get().tool === "vertices");
  };
  const solidMarker = (x, y, size) => page.evaluate(({ x, y, size }) => {
    const probe = document.createElement("canvas"); probe.width = 1; probe.height = 1;
    const color = probe.getContext("2d");
    color.fillStyle = getRenderColors().pinTextColor; color.fillRect(0, 0, 1, 1);
    const expected = color.getImageData(0, 0, 1, 1).data;
    const actual = document.getElementById("mapCanvas").getContext("2d").getImageData(x - size / 2, y - size / 2, size, size).data;
    return Array.from(actual).every((value, index) => value === expected[index % 4]);
  }, { x, y, size });
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const x = width === 1440 ? 600 : 100;
      for (const scale of [0.25, 1, 5]) {
        await page.evaluate(({ x, scale }) => {
          setWorkspaceCollapsed(true, false); workspaceState.select(null);
          offsetX = x - 400 * scale; offsetY = 300 - 400 * scale; zoom = scale; draw();
        }, { x, scale });
        const before = await page.evaluate(() => ({ raw: localStorage.getItem(mapKey(currentMapName)), history: undoStack.length, count: drawings.length }));
        await page.evaluate(() => drawingTools.start("path"));
        const place = (a, b) => width === 390 ? page.touchscreen.tap(a, b) : page.mouse.click(a, b);
        await place(x, 300);
        await page.mouse.move(x + 80, 360);
        assert.equal(await solidMarker(x, 300, 12), true, `First point visible: ${theme}/${width}/${scale}`);
        assert.equal(await solidMarker(x + 80, 360, 8), false, "Live preview is not an accepted-point marker");
        await place(x + 40, 340);
        assert.equal(await solidMarker(x, 300, 8), true);
        assert.equal(await solidMarker(x, 300, 12), false, "Previous point is smaller than the terminal point");
        assert.equal(await solidMarker(x + 40, 340, 12), true);
        await place(x + 80, 300);
        await page.mouse.move(x + 100, 380);
        assert.equal(await solidMarker(x + 40, 340, 8), true);
        assert.equal(await solidMarker(x + 80, 300, 12), true);
        assert.deepEqual(await page.evaluate(() => ({ raw: localStorage.getItem(mapKey(currentMapName)), history: undoStack.length, count: drawings.length })), before, "Draft markers must not persist geometry or record history");
        if (scale === 1) await page.screenshot({ path: resolve(output, `2026-11-10-draft-${theme}-${width}.png`) });
        await page.locator("#drawingCancel").click();
        assert.equal(await solidMarker(x + 80, 300, 12), false, "Cancel removes temporary handles");
        assert.equal(await page.evaluate(() => drawingTools.active()), false);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => { MapItTheme.setTheme("paper-mint"); offsetX = 600; offsetY = 300; zoom = 1; draw(); });
  await page.evaluate(() => drawingTools.start("line"));
  await page.mouse.click(650, 400);
  assert.equal(await solidMarker(650, 400, 12), true, "A line's first endpoint is visible too");
  await page.mouse.click(750, 400);
  assert.equal(await page.evaluate(() => drawingTools.active()), false);
  assert.equal(await page.evaluate(() => drawings.at(-1).points.length), 2, "Finishing stores only accepted endpoints");
  await page.locator("#undoBtn").click();
  assert.equal(await page.evaluate(() => drawings.length), 2, "Line remains a single undoable action");
  await enter();
  const original = await points();
  const originalCamera = await camera();
  const historyCount = await page.evaluate(() => undoStack.length);
  const beforePreviewPixels = await pixels(570, 250);
  await page.mouse.move(600, 220); await page.mouse.down();
  await page.mouse.move(570, 250, { steps: 4 });
  assert.deepEqual(await points(), original, "Preview does not mutate the model");
  assert.notEqual(await pixels(570, 250), beforePreviewPixels, "Preview actually paints at the moved vertex");
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), true);
  assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("is-map-dragging")), false);
  await page.mouse.up();
  assert.deepEqual((await points())[0], { x: -30, z: 30 });
  assert.deepEqual(await camera(), originalCamera, "Moving a vertex does not pan");
  assert.equal(await page.evaluate(() => undoStack.length), historyCount + 1);
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), false);
  assert.equal(await page.locator("#pinEditorPanel").isVisible(), false, "Vertex handles take priority over overlapping pins");
  assert.deepEqual(await page.evaluate(() => workspaceState.get().selection), { kind: "drawing", id: "route" });
  await page.locator("#undoBtn").click();
  assert.deepEqual(await points(), original);
  await page.locator("#redoBtn").click();
  assert.deepEqual((await points())[0], { x: -30, z: 30 });
  await enter();
  let before = await points();
  let count = await page.evaluate(() => undoStack.length);
  const beforeCancelPixels = await pixels(580, 265);
  await page.locator('#drawingPoints input[data-point="0"][data-axis="x"]').focus();
  await page.mouse.move(570, 250); await page.mouse.down(); await page.mouse.move(580, 265);
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.deepEqual(await points(), before);
  assert.equal(await pixels(580, 265), beforeCancelPixels, "Cancelling restores canvas pixels as well as model geometry");
  assert.equal(await page.evaluate(() => undoStack.length), count);
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "vertices", "First Escape cancels only the drag");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "select");
  assert.equal(await page.evaluate(() => workspaceState.get().selection.id), "route");
  await enter();
  await page.mouse.move(570, 250); await page.mouse.down(); await page.mouse.move(580, 265);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.deepEqual(await points(), before);
  await canvas.dispatchEvent("pointerdown", { button: 0, isPrimary: true, pointerId: 44, pointerType: "pen", clientX: 570, clientY: 250 });
  await canvas.dispatchEvent("pointermove", { pointerId: 44, clientX: 560, clientY: 240 });
  await canvas.dispatchEvent("pointercancel", { pointerId: 44 });
  assert.deepEqual(await points(), before);
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), false);
  await page.locator("#drawingVertexSelect").selectOption("1");
  await page.locator("#drawingVertexInsert").focus(); await page.keyboard.press("Enter");
  assert.equal((await points()).length, 4);
  await page.locator("#drawingVertexDelete").focus(); await page.keyboard.press("Enter");
  assert.equal((await points()).length, 3);
  await page.locator("#drawingVertexDelete").click();
  assert.equal((await points()).length, 2);
  assert.equal(await page.locator("#drawingVertexDelete").isDisabled(), true);
  const touchPoint = await page.evaluate(() => {
    const p = drawings.find((entry) => entry.id === "route").points[0];
    return { x: offsetX + p.x * zoom, y: offsetY + p.z * zoom };
  });
  await canvas.dispatchEvent("pointerdown", { button: 0, isPrimary: true, pointerId: 51, pointerType: "touch", clientX: touchPoint.x + 14, clientY: touchPoint.y });
  await canvas.dispatchEvent("pointermove", { pointerId: 51, pointerType: "touch", clientX: touchPoint.x + 20, clientY: touchPoint.y + 10 });
  await canvas.dispatchEvent("pointerup", { pointerId: 51, pointerType: "touch" });
  assert.equal((await points())[0].z, before[0].z + 10, "Touch uses the larger screen-space target");
  await page.locator('#drawingPoints input[data-point="0"][data-axis="x"]').fill("-12.5");
  await page.locator("#drawingApply").click();
  await page.locator('#drawingPoints input[data-point="1"][data-axis="z"]').focus();
  assert.equal(await page.locator("#drawingVertexSelect").inputValue(), "1", "Coordinate focus follows the active vertex");
  assert.equal((await points())[0].x, -12.5, "Exact input retains fractions");
  await page.locator('#drawingPoints input[data-point="0"][data-axis="x"]').fill("");
  await page.locator("#drawingVertexInsert").click();
  assert.equal((await points()).length, 2, "Unapplied invalid fields block structural changes");
  const leaving = page.evaluate(() => requestWorkspaceTool("select"));
  await page.locator('[data-draft-choice="keep"]').click(); await leaving;
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "vertices");
  await page.locator('#drawingPoints input[data-point="0"][data-axis="x"]').fill("-12.5");
  await page.locator("#drawingApply").click();
  // High zoom must hit a fractional vertex without rounding it first.
  await page.evaluate(() => { zoom = 8; offsetX = 700; offsetY = 100; draw(); });
  const position = await page.evaluate(() => {
    const p = drawings.find((entry) => entry.id === "route").points[0];
    return { x: offsetX + p.x * zoom, y: offsetY + p.z * zoom };
  });
  count = await page.evaluate(() => undoStack.length);
  await page.mouse.move(position.x + 7, position.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), true, "Fractional handle is hit within a screen-space radius");
  await page.mouse.up();
  assert.equal(await page.evaluate(() => undoStack.length), count, "Click/no-op adds no history");
  await page.evaluate(() => { zoom = 0.25; offsetX = 700; offsetY = 220; draw(); });
  const distant = await page.evaluate(() => {
    const p = drawings.find((entry) => entry.id === "route").points[0];
    return { x: offsetX + p.x * zoom, y: offsetY + p.z * zoom };
  });
  await page.mouse.move(distant.x + 7, distant.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), true, "Low-zoom handle uses the same screen-space radius");
  await page.mouse.up();
  // Restore the camera, then insert exactly on a segment by double click.
  await page.evaluate(() => { offsetX = 600; offsetY = 220; zoom = 1; draw(); });
  const middle = await page.evaluate(() => {
    const [a, b] = drawings.find((entry) => entry.id === "route").points;
    return { x: offsetX + (a.x + b.x) / 2, y: offsetY + (a.z + b.z) / 2 };
  });
  await page.mouse.dblclick(middle.x, middle.y);
  assert.equal((await points()).length, 3);
  before = await points();
  await page.mouse.move(900, 500); await page.mouse.down(); await page.mouse.move(920, 510); await page.mouse.up();
  assert.deepEqual(await points(), before);
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "vertices", "Background pan restores vertex mode");
  await page.evaluate(() => { layers[0].locked = true; drawingTools.refresh(); draw(); });
  assert.equal(await page.locator("#drawingVertices").isDisabled(), true);
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "select");
  await page.evaluate(() => { layers[0].locked = false; drawingTools.refresh(); });
  await enter("line");
  assert.equal(await page.locator("#drawingVertexInsert").isDisabled(), true);
  assert.equal(await page.locator("#drawingVertexDelete").isDisabled(), true);
  const oldLine = await page.evaluate(() => structuredClone(drawings.find((entry) => entry.id === "line").points));
  await page.mouse.move(600, 370); await page.mouse.down(); await page.mouse.move(740, 370);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => drawings.find((entry) => entry.id === "line").points), oldLine, "Collapsed line geometry is rejected");
  await page.keyboard.press("Escape");
  await enter("route");
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const controls = page.locator(".vertex-tools");
      assert.equal(await controls.isVisible(), true);
      const bounds = await controls.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      for (const button of await controls.locator("button, select").all()) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 32 && box.height >= 28);
      }
      await page.screenshot({ path: resolve(output, `2026-11-10-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const saved = await points();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.deepEqual(await points(), saved, "Committed vertices survive reload");
  assert.deepEqual(errors, []);
  console.log("Vertex browser checks passed: draft point pixels across themes/zoom/mouse/touch, preview/commit, undo/redo, cancellation, numeric edits, insert/delete, guards, pan, locks, persistence and responsive controls.");
} finally { await browser.close(); }
