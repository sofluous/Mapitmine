import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/touch-navigation/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("map:Touch", JSON.stringify({ version: 3,
    layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
    pins: [{ uid: "pin", label: "Pin", x: 0, z: 0, layerId: "default" }],
    drawings: [{ id: "route", name: "Route", type: "path", layerId: "default", points: [{ x: 0, z: 0 }, { x: 80, z: 50 }], style: { color: "#55bb99", width: 2 } }],
  })));
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const session = await page.context().newCDPSession(page);
  const touch = async (type, points) => {
    await session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const read = () => page.evaluate(() => ({ zoom, offsetX, offsetY, selection: workspaceState.get().selection,
    tool: workspaceState.get().tool, history: undoStack.length, raw: localStorage.getItem(mapKey(currentMapName)),
    drawings: JSON.stringify(drawings), pending: drawingTools.hasPendingChanges(), dragging: document.body.classList.contains("is-map-dragging") }));
  const setup = () => page.evaluate(() => { setWorkspaceCollapsed(true, false); offsetX = 100; offsetY = 250; zoom = 1; draw(); });
  const pinch = async () => {
    await touch("touchStart", [[1, 100, 250]]);
    await touch("touchStart", [[1, 100, 250], [2, 200, 250]]);
    await touch("touchMove", [[1, 70, 260], [2, 230, 260]]);
  };
  const release = () => touch("touchEnd", []);

  await setup();
  const panBefore = await read();
  await touch("touchStart", [[1, 250, 350]]);
  assert.equal((await read()).dragging, false, "Touching alone does not dim the UI");
  await touch("touchMove", [[1, 270, 370]]); await release();
  assert.ok(Math.abs((await read()).offsetX - panBefore.offsetX - 20) < 0.01, "Ordinary one-finger pan remains available");
  assert.equal((await read()).dragging, false);

  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    await setup();
    await page.evaluate(() => { selectedPinIndex = 0; updatePinListHighlight(); draw(); });
    const before = await read(); await pinch();
    const after = await read();
    assert.ok(Math.abs(after.zoom - 1.6) < 0.01, "Two real touch pointers enlarge the map");
    assert.ok(Math.abs((150 - after.offsetX) / after.zoom - 50) < 0.01, "Focal X preserved");
    assert.ok(Math.abs((260 - after.offsetY) / after.zoom) < 0.01, "Moving midpoint preserves focal Z");
    assert.deepEqual(after.selection, before.selection); assert.equal(after.dragging, false);
    await touch("touchEnd", [[2, 230, 260]]);
    const single = await read(); await touch("touchMove", [[1, 90, 280]]);
    const moved = await read();
    assert.ok(Math.abs(moved.offsetX - single.offsetX - 20) < 0.01, "Remaining finger pans without a jump");
    await touch("touchEnd", []);
    const final = await read();
    assert.deepEqual(final.selection, before.selection); assert.equal(final.raw, before.raw); assert.equal(final.history, before.history);
    assert.equal(final.dragging, false);
    await page.screenshot({ path: resolve(output, `${theme}-pinch.png`) });
  }
  // Pinching a live path must not add vertices or finish/cancel the draft.
  await setup(); await page.locator('[data-canvas-tool="path"]').click();
  await page.touchscreen.tap(100, 320);
  const progress = await page.locator("#drawingProgress").textContent(), draftBefore = await read();
  await pinch(); await release();
  assert.equal(await page.locator("#drawingProgress").textContent(), progress);
  assert.equal((await read()).tool, "path"); assert.equal((await read()).pending, true);
  assert.equal((await read()).history, draftBefore.history); assert.equal((await read()).raw, draftBefore.raw);
  await page.touchscreen.tap(200, 360);
  assert.notEqual(await page.locator("#drawingProgress").textContent(), progress, "Next deliberate tap still places a point");
  await page.locator("#drawingCancel").click();

  // Pending pin fields survive navigation; zoom bounds apply in both directions.
  await setup();
  await page.evaluate(() => requestPinPlacement(100, 250, 0, 0));
  await page.locator("#pinEditorLabel").fill("Unsaved touch pin");
  const pinBefore = await read();
  await pinch();
  await touch("touchMove", [[1, 149, 260], [2, 151, 260]]);
  assert.equal((await read()).zoom, 0.25);
  await touch("touchMove", [[1, 1, 260], [2, 389, 260]]);
  await release();
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Unsaved touch pin");
  assert.equal((await read()).history, pinBefore.history); assert.equal((await read()).raw, pinBefore.raw);
  await page.locator("#pinEditorCancelBtn").click();
  await setup();
  await page.evaluate(() => { zoom = 4; draw(); });
  await pinch(); assert.equal((await read()).zoom, 5); await release();

  // Extra pointers and a subsequent mouse gesture cannot leave navigation latched.
  await setup(); await pinch();
  await touch("touchStart", [[1, 70, 260], [2, 230, 260], [3, 300, 350]]);
  const third = await read();
  await touch("touchMove", [[1, 70, 260], [2, 230, 260], [3, 310, 360]]);
  assert.equal((await read()).zoom, third.zoom);
  await release();
  const mouseBefore = await read();
  await page.mouse.move(280, 350); await page.mouse.down(); await page.mouse.move(300, 370); await page.mouse.up();
  assert.ok(Math.abs((await read()).offsetX - mouseBefore.offsetX - 20) < 0.01);

  // A second finger rolls back a live vertex preview rather than committing it.
  await setup();
  await page.evaluate(() => { workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); });
  await page.locator("#drawingVertices").click();
  const vertexBefore = await read();
  await touch("touchStart", [[1, 100, 250]]); await touch("touchMove", [[1, 110, 260]]);
  await touch("touchStart", [[1, 110, 260], [2, 200, 250]]);
  await touch("touchMove", [[1, 70, 260], [2, 230, 260]]); await release();
  const vertexAfter = await read();
  assert.equal(vertexAfter.drawings, vertexBefore.drawings); assert.equal(vertexAfter.history, vertexBefore.history);
  assert.deepEqual(vertexAfter.selection, vertexBefore.selection); assert.equal(vertexAfter.tool, "vertices");

  for (const interruption of ["cancel", "blur"]) {
    await setup(); await pinch();
    if (interruption === "cancel") await touch("touchCancel", []);
    else { await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await touch("touchEnd", []); }
    assert.equal((await read()).dragging, false);
    assert.equal(await page.evaluate(() => touchNavigation.active()), false);
    await page.evaluate(() => drawingTools.reset());
    await page.touchscreen.tap(280, 380);
    assert.equal((await read()).dragging, false);
  }
  // Source review candidates are not automatically defects: retain measured focus audit output.
  const focusAudit = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["maps", "pins", "layers", "map-view", "settings", "inspector"]) {
      await page.evaluate((value) => {
        if (value !== "inspector") setWorkspaceTab(value, { persist: false, openPanel: true });
        else { setWorkspaceCollapsed(true, false); workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); }
      }, tab);
      await page.keyboard.press("Tab");
      const results = await page.evaluate((root) => {
        return [...document.querySelector(root).querySelectorAll('button, input, select, textarea, [tabindex="0"]')]
          .filter((element) => element.checkVisibility() && !element.disabled).map((element) => {
            element.focus(); element.scrollIntoView({ block: "nearest" });
            const r = element.getBoundingClientRect(), s = getComputedStyle(element);
            const ring = Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset));
            const clips = []; let parent = element.parentElement;
            while (parent && parent !== document.body) {
              const p = getComputedStyle(parent), b = parent.getBoundingClientRect();
              if (/(hidden|auto|scroll|clip)/.test(p.overflowX) && (r.left - ring < b.left - 1 || r.right + ring > b.right + 1)) clips.push(parent.id || parent.className);
              if (/(hidden|auto|scroll|clip)/.test(p.overflowY) && (r.top - ring < b.top - 1 || r.bottom + ring > b.bottom + 1)) clips.push(parent.id || parent.className);
              parent = parent.parentElement;
            }
            return { control: element.id || element.getAttribute("aria-label") || element.textContent.trim().slice(0, 50), ring, clips };
          }).filter((entry) => entry.ring > 0 && entry.clips.length);
      }, tab === "inspector" ? "#contextInspector" : "#workspacePanel");
      focusAudit.push({ width, tab, candidates: results });
    }
  }
  await writeFile(resolve(output, "focus-audit.json"), JSON.stringify(focusAudit, null, 2));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => setWorkspaceTab("layers", { persist: false, openPanel: true }));
    await page.keyboard.press("Tab");
    await page.locator("#objectSearch").focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `amber-terminal-focus-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log("Touch navigation browser checks passed; focus clipping candidates retained for visual confirmation.");
} finally { await browser.close(); }
