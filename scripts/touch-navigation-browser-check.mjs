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
  await page.addInitScript(() => {
    window.touchAcceptance = { pointers: [], captureLosses: 0 };
    window.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && event.target.id === "mapCanvas") touchAcceptance.pointers.push(event.pointerId);
    }, true);
    for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, (event) => {
      touchAcceptance.pointers = touchAcceptance.pointers.filter((id) => id !== event.pointerId);
    }, true);
    window.addEventListener("lostpointercapture", (event) => {
      if (event.target.id !== "mapCanvas") return;
      touchAcceptance.captureLosses++;
      if (touchAcceptance.pointers.includes(event.pointerId)) touchAcceptance.lossCamera = { zoom, offsetX, offsetY };
    }, true);
  });
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
    assert.ok(await page.evaluate(() => [[100, 250], [200, 250]].every(([x, y]) => document.elementFromPoint(x, y)?.id === "mapCanvas")), "Pinch starts on exposed canvas, not an editing panel");
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
  // Real browser touch movement previews on contact and appends once on release.
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    await setup(); await page.locator('[data-canvas-tool="path"]').click();
    const before = await read();
    await page.evaluate(() => {
      window.ghostMarks = 0;
      const strokeRect = CanvasRenderingContext2D.prototype.strokeRect;
      window.restoreGhostProbe = () => { CanvasRenderingContext2D.prototype.strokeRect = strokeRect; };
      CanvasRenderingContext2D.prototype.strokeRect = function (x, y, width, height) {
        if (this.canvas.id === "mapCanvas" && width === 12 && height === 12) ghostMarks++;
        return strokeRect.call(this, x, y, width, height);
      };
    });
    await touch("touchStart", [[1, 100, 300]]);
    assert.ok(await page.evaluate(() => ghostMarks > 0), "Contact renders a ghost vertex even before the first accepted point");
    await touch("touchMove", [[1, 160, 330]]);
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 0 points");
    assert.equal((await read()).pending, false, "Contact preview is not saved draft geometry");
    await page.screenshot({ path: resolve(output, `${theme}-draft-contact.png`) });
    await release();
    await page.evaluate(() => restoreGhostProbe());
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 1 points");
    await page.locator("#mapCanvas").dispatchEvent("click", { clientX: 160, clientY: 330 });
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 1 points", "Compatibility click cannot duplicate release placement");
    assert.equal((await read()).history, before.history);
    assert.equal((await read()).raw, before.raw);
    assert.equal((await read()).offsetX, before.offsetX, "A drawing swipe does not pan");
    await page.locator("#undoBtn").click();
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 0 points");
    await page.locator("#redoBtn").click();
    for (const interruption of ["cancel", "capture", "blur"]) {
      await touch("touchStart", [[1, 180, 340]]);
      await touch("touchMove", [[1, 190, 350]]);
      if (interruption === "cancel") await touch("touchCancel", []);
      else {
        await page.evaluate((kind) => {
          if (kind === "blur") window.dispatchEvent(new Event("blur"));
          else {
            const canvas = document.getElementById("mapCanvas");
            canvas.releasePointerCapture(touchAcceptance.pointers[0]);
          }
        }, interruption);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await release();
      }
      assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 1 points", `${interruption} drops only the candidate`);
    }
    await page.touchscreen.tap(200, 360);
    await touch("touchStart", [[1, 160, 330]]);
    await touch("touchMove", [[1, 175, 345]]);
    assert.equal(await page.locator("#drawingFinish").isDisabled(), true, "Cannot finish during a vertex gesture");
    assert.equal((await read()).history, before.history);
    assert.equal((await read()).raw, before.raw);
    await page.screenshot({ path: resolve(output, `${theme}-draft-vertex-drag.png`) });
    await release();
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 2 points", "Moving an accepted vertex does not append");
    await page.locator("#undoBtn").click();
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 2 points", "Undo reverses the move before removing points");
    await page.touchscreen.tap(160, 330);
    assert.equal(await page.locator("#redoBtn").isEnabled(), true, "Selecting a vertex without moving preserves Redo");
    await page.locator("#redoBtn").click();
    await touch("touchStart", [[1, 175, 345]]);
    await touch("touchMove", [[1, 190, 355]]);
    await touch("touchCancel", []);
    await touch("touchStart", [[1, 175, 345]]);
    await touch("touchMove", [[1, 185, 350]]);
    await touch("touchStart", [[1, 185, 350], [2, 285, 350]]);
    await release();
    assert.equal(await page.locator("#drawingProgress").textContent(), "Path: 2 points", "Cancelled moves and pinch takeover preserve accepted vertices");
    await page.locator("#drawingFinish").click();
    assert.deepEqual(await page.evaluate(() => drawings.at(-1).points), [{ x: 75, z: 95 }, { x: 100, z: 110 }], "Finish includes the moved vertex and excludes interrupted previews");
    assert.equal((await read()).history, before.history + 1, "Finish remains one committed operation");
    await page.evaluate(() => workspaceState.select(null));
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

  // Release actual browser capture rather than merely dispatching a synthetic loss event.
  const acceptance = [];
  for (const fingers of [1, 2]) {
    await setup();
    await page.evaluate(() => { selectedPinIndex = 0; updatePinListHighlight(); draw(); });
    if (fingers === 2) await pinch();
    else {
      await touch("touchStart", [[1, 100, 250]]);
      await touch("touchMove", [[1, 70, 260]]);
    }
    const beforeLoss = await read();
    const losses = await page.evaluate(() => touchAcceptance.captureLosses);
    await page.evaluate(() => {
      const canvas = document.getElementById("mapCanvas");
      const id = touchAcceptance.pointers.find((value) => canvas.hasPointerCapture(value));
      if (id === undefined) throw new Error("Expected a live captured canvas pointer");
      canvas.releasePointerCapture(id);
    });
    await touch("touchMove", fingers === 2 ? [[1, 60, 270], [2, 240, 270]] : [[1, 60, 270]]);
    assert.ok(await page.evaluate((count) => touchAcceptance.captureLosses > count, losses), "Browser emitted capture loss");
    const afterLoss = await read();
    // Another finger's move can arrive before the released pointer's loss event.
    const lossCamera = await page.evaluate(() => touchAcceptance.lossCamera);
    for (const key of ["zoom", "offsetX", "offsetY"]) assert.equal(afterLoss[key], lossCamera[key], `Capture loss freezes ${key} at delivery`);
    for (const key of ["selection", "history", "raw", "drawings"]) assert.deepEqual(afterLoss[key], beforeLoss[key], `Capture loss preserves ${key}`);
    await touch("touchMove", fingers === 2 ? [[1, 50, 280], [2, 250, 280]] : [[1, 50, 280]]);
    const continued = await read();
    for (const key of ["zoom", "offsetX", "offsetY"]) assert.equal(continued[key], afterLoss[key], "Cancelled gesture cannot resume on later moves");
    assert.equal(afterLoss.dragging, false);
    await release();
    assert.equal(await page.evaluate(() => touchNavigation.active()), false);
    await setup(); await pinch(); assert.ok((await read()).zoom > 1, "Next gesture works after capture loss"); await release();
    acceptance.push({ case: `${fingers}-finger capture loss`, passed: true });
  }

  await setup();
  const coincidentBefore = await read();
  await touch("touchStart", [[1, 100, 250]]);
  await touch("touchStart", [[1, 100, 250], [2, 100, 250]]);
  await touch("touchMove", [[1, 90, 250], [2, 110, 250]]);
  const separated = await read();
  await touch("touchMove", [[1, 70, 250], [2, 130, 250]]);
  const widened = await read();
  assert.ok([widened.zoom, widened.offsetX, widened.offsetY].every(Number.isFinite));
  assert.ok(widened.zoom > separated.zoom && widened.zoom <= 5, "Coincident fingers recover to bounded zoom once separated");
  await release();
  const coincidentAfter = await read();
  for (const key of ["selection", "history", "raw", "drawings"]) assert.deepEqual(coincidentAfter[key], coincidentBefore[key], `Coincident gesture preserves ${key}`);
  assert.equal(await page.evaluate(() => touchNavigation.active()), false);
  assert.equal(coincidentAfter.dragging, false);
  acceptance.push({ case: "coincident fingers", passed: true });
  await writeFile(resolve(output, "gesture-acceptance.json"), JSON.stringify(acceptance, null, 2));

  // A second finger rolls back a live vertex preview rather than committing it.
  await setup();
  await page.evaluate(() => { workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); });
  await page.locator("#drawingGeometry > summary").click();
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
  // Keep panel focus checks at a consistent page scale after emulated touch sequences.
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  const focusAudit = [];
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) for (const width of [320, 390, 901, 1440]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["maps", "objects", "map-view", "settings", "inspector"]) {
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
      focusAudit.push({ theme, width, tab, candidates: results });
    }
  }
  await writeFile(resolve(output, "focus-audit.json"), JSON.stringify(focusAudit, null, 2));
  assert.deepEqual(focusAudit.filter((entry) => entry.candidates.length), [], "Focus rings clear scroll containers across tabs, inspector and themes");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => setWorkspaceTab("layers", { persist: false, openPanel: true }));
    await page.keyboard.press("Tab");
    await page.locator("#objectSearch").focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `amber-terminal-focus-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log("Touch navigation and three-theme panel/inspector focus-clearance checks passed.");
} finally { await browser.close(); }
