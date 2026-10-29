import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) {
  throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE for optional browser QA.");
}
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    const map = {
      version: 3,
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }, { id: "work", label: "Work", visible: true, locked: false }],
      pins: [{ uid: "source", label: "Original", x: 0, z: 0, layerId: "work" }],
      drawings: [{ id: "path", name: "Path", type: "path", layerId: "work", points: [{ x: 0, z: 10 }, { x: 10, z: 10 }], style: { color: "#55bb99", width: 2 } }],
    };
    localStorage.setItem("map:A", JSON.stringify(map));
    localStorage.setItem("map:B", JSON.stringify({ ...map, pins: [], drawings: [] }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const choice = (name) => page.locator(`[data-draft-choice="${name}"]`);
  const layer = (id) => page.locator(`.object-layer[data-object-id="${id}"]`);
  async function dragWorkBeforePins() {
    const source = await layer("work").locator(".layer-copy").boundingBox();
    const target = await layer("default").locator(".layer-row").first().boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 70, target.y + 3, { steps: 6 });
    assert.equal(await page.evaluate(() => document.body.classList.contains("is-layer-reordering")), true);
    await page.mouse.up();
  }
  const snapshot = () => page.evaluate(() => ({
    raw: localStorage.getItem("map:A"), document: getCurrentMapDocument(),
    selected: workspaceState.get().selection, tool: workspaceState.get().tool,
    undo: undoStack.length, redo: redoStack.length,
  }));
  await page.evaluate(() => editPin(0));
  await page.locator("#pinEditorLabel").fill("Pending pin");
  for (const action of ["lock", "visibility", "reorder", "rename", "create", "delete"]) {
    const before = await snapshot();
    const mutation = page.evaluate((action) => {
      if (action === "lock") return toggleLayerLock("work");
      if (action === "visibility") return toggleLayerVisibility("work");
      if (action === "reorder") return moveLayer("work", -1);
      if (action === "rename") return renameLayer("work");
      if (action === "create") return createLayer();
      return deleteLayer("work");
    }, action);
    if (["rename", "create"].includes(action)) {
      await page.locator("#textPromptInput").fill("Changed layer");
      await page.locator("#textPromptOk").click();
    }
    if (action === "delete") await page.locator("#confirmDialogOk").click();
    await choice("keep").click();
    assert.equal(await mutation, false);
    assert.deepEqual(await snapshot(), before, `Keeping edits cancels ${action} without history or storage changes`);
    assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Pending pin");
  }
  await page.evaluate(() => setWorkspaceTab("layers"));
  const beforeDrop = await snapshot();
  await dragWorkBeforePins();
  await choice("keep").click();
  assert.deepEqual(await snapshot(), beforeDrop, "A cancelled pointer drop preserves selection and pending work");
  let mutation = page.evaluate(() => toggleLayerLock("work"));
  await choice("finish").click();
  assert.equal(await mutation, true);
  assert.equal(await page.evaluate(() => pins[0].label), "Pending pin");
  assert.equal(await page.evaluate(() => getLayer("work").locked), true);
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => getLayer("work").locked), false);
  assert.equal(await page.evaluate(() => pins[0].label), "Pending pin", "Layer undo preserves the separately saved pin edit");
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => pins[0].label), "Original");
  await page.evaluate(() => editPin(0));
  await page.locator("#pinEditorLabel").fill("Saved before pointer drop");
  await dragWorkBeforePins();
  await choice("finish").click();
  await page.waitForFunction(() => layers[0].id === "work");
  assert.equal(await page.evaluate(() => pins[0].label), "Saved before pointer drop");
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => layers[0].id), "default");
  assert.equal(await page.evaluate(() => pins[0].label), "Saved before pointer drop", "Undoing a drop preserves the separately saved draft");
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => pins[0].label), "Original");
  const selectedBeforeDrag = await page.evaluate(() => workspaceState.get().selection);
  await dragWorkBeforePins();
  await page.waitForFunction(() => layers[0].id === "work");
  assert.deepEqual(await page.evaluate(() => workspaceState.get().selection), selectedBeforeDrag, "Dragging must not select the source layer");
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => layers[0].id), "default");
  const historyBeforeNoop = await page.evaluate(() => undoStack.length);
  assert.equal(await page.evaluate(() => reorderLayer("work", "default", "after")), false);
  assert.equal(await page.evaluate(() => undoStack.length), historyBeforeNoop);
  const sourceBounds = await layer("work").locator(".layer-copy").boundingBox();
  await page.mouse.move(sourceBounds.x + 20, sourceBounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(sourceBounds.x + 30, sourceBounds.y - 10);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.evaluate(() => undoStack.length), historyBeforeNoop, "Escape cancels drag without history");
  await page.mouse.move(sourceBounds.x + 20, sourceBounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(700, 300, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => undoStack.length), historyBeforeNoop, "Dropping outside the outline has no effect");
  await page.locator("#objectSearch").fill("Original");
  await layer("work").locator(".layer-copy").dispatchEvent("pointerdown", { pointerType: "mouse", button: 0, pointerId: 21, clientX: 100, clientY: 300 });
  await page.locator("#layerList").dispatchEvent("pointermove", { pointerType: "mouse", pointerId: 21, clientX: 100, clientY: 200 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-layer-reordering")), false, "Filtering disables drag reorder");
  await page.locator("#objectSearch").fill("");
  await layer("work").locator(".layer-copy").dispatchEvent("pointerdown", { pointerType: "touch", button: 0, pointerId: 22 });
  await page.locator("#layerList").dispatchEvent("pointermove", { pointerType: "touch", pointerId: 22, clientX: 100, clientY: 200 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-layer-reordering")), false, "Touch retains native scrolling and menu ordering");
  assert.deepEqual(await layer("default").locator(".layer-row-actions > button").evaluateAll((buttons) => buttons.map((button) => button.dataset.outlineAction)), ["more", "lock", "visibility", "expand"]);
  await layer("default").locator('[data-outline-action="more"]').click();
  const up = page.locator('#contextMenu [role="menuitem"]').filter({ hasText: "Move Up" });
  assert.equal(await up.getAttribute("aria-disabled"), "true");
  await up.click({ force: true });
  assert.equal(await page.evaluate(() => layers[0].id), "default");
  await page.locator('#contextMenu [role="menuitem"]').filter({ hasText: "Move Down" }).click();
  await page.waitForFunction(() => layers[0].id === "work");
  await page.evaluate(() => undoPinsChange());

  await page.evaluate(() => selectWorkspaceObject({ kind: "drawing", id: "path" }));
  await page.locator("#drawingName").fill("Applied path");
  mutation = page.evaluate(() => toggleLayerVisibility("work"));
  await choice("finish").click();
  assert.equal(await mutation, true);
  assert.equal(await page.evaluate(() => drawings[0].name), "Applied path");
  assert.equal(await page.evaluate(() => getLayer("work").visible), false);
  await page.evaluate(() => undoPinsChange());
  assert.equal(await page.evaluate(() => getLayer("work").visible), true);

  await page.evaluate(async () => {
    document.getElementById("drawingLayer").value = "work";
    await drawingTools.start("path");
  });
  await page.mouse.click(700, 300);
  await page.mouse.click(800, 350);
  mutation = page.evaluate(() => deleteLayer("work"));
  await page.locator("#confirmDialogOk").click();
  await choice("finish").click();
  assert.equal(await mutation, true);
  assert.equal(await page.evaluate(() => getLayer("work")), undefined);
  assert.equal(await page.evaluate(() => drawings.length), 2);
  assert.equal(await page.evaluate(() => [...pins, ...drawings].every((object) => object.layerId === "default")), true, "Finish saves geometry before deletion reassigns objects");
  await page.evaluate(() => undoPinsChange());
  assert.ok(await page.evaluate(() => getLayer("work")));

  mutation = page.evaluate(() => renameLayer("work"));
  await page.locator("#textPromptInput").fill("Stale rename");
  await page.evaluate(() => loadMap("B"));
  await page.locator("#textPromptOk").click();
  assert.equal(await mutation, false, "An old layer prompt cannot mutate a newly opened map");
  assert.equal(await page.evaluate(() => getLayer("work").label), "Work");
  const results = await page.evaluate(() => Promise.all([toggleLayerLock("work"), toggleLayerVisibility("work")]));
  assert.deepEqual(results, [true, false], "Overlapping mutations cannot bypass the shared guard");
  assert.equal(await page.evaluate(() => getLayer("work").visible), true);
  await page.evaluate(() => deleteLayer("default"));
  assert.ok(await page.evaluate(() => getLayer("default")), "Default layer remains protected");
  assert.equal(await page.evaluate(() => reorderLayer("work", "default", "before", "A")), false, "A stale drag cannot reorder a different map");
  await page.evaluate(() => { getLayer("work").label = "A very long layer label that must truncate before the action slots"; renderLayers(); });
  await layer("default").locator('[data-outline-action="expand"]').click();
  assert.equal(await layer("default").getAttribute("aria-expanded"), "false");
  assert.notEqual(await layer("default").locator(".layer-disclosure").evaluate((icon) => getComputedStyle(icon).transform), "none");
  await layer("default").locator('[data-outline-action="expand"]').click();
  assert.equal(await layer("default").locator(".layer-disclosure").evaluate((icon) => getComputedStyle(icon).transform), "none");
  const output = fileURLToPath(new URL("../_docs/data/", import.meta.url));
  await mkdir(output, { recursive: true });
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const width of [1440, 901, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { setWorkspaceTab("layers"); workspaceState.select({ kind: "layer", id: "default" }); document.getElementById("toastStack").replaceChildren(); });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const hud = await page.locator("#hud").boundingBox();
      const inspector = await page.locator("#contextInspector").boundingBox();
      assert.ok(hud.x >= 0 && hud.x + hud.width <= width);
      if (inspector) assert.ok(hud.x + hud.width <= inspector.x || hud.y + hud.height <= inspector.y || inspector.x + inspector.width <= hud.x);
      if (width === 1440) {
        const shell = await page.locator("#workspaceShell").boundingBox();
        assert.ok(Math.abs(hud.x + hud.width / 2 - (shell.x + shell.width + inspector.x) / 2) < 1, "Toolbar centers between the connected shell and inspector");
      }
      const visibility = layer("default").locator('[data-outline-action="visibility"]');
      await page.mouse.move(width / 2, 300);
      assert.equal(await visibility.evaluate((button) => getComputedStyle(button).backgroundColor), "rgba(0, 0, 0, 0)");
      await page.screenshot({ path: resolve(output, `2026-10-29-workspace-review-${theme}-${width}.png`) });
      if (width === 901) {
        await page.evaluate(() => workspaceState.setTool("path"));
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const expanded = await page.locator("#hud").boundingBox();
        const properties = await page.locator("#contextInspector").boundingBox();
        assert.ok(expanded.y + expanded.height <= properties.y, "Expanded drawing commands stay above the inspector when width is constrained");
        await page.screenshot({ path: resolve(output, `2026-10-29-workspace-review-${theme}-expanded-901.png`) });
        await page.evaluate(() => workspaceState.setTool("select"));
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log("Layer mutation browser checks passed: all commands guarded, Save/Apply/Finish ordering, independent Undo, reassignments, stale prompts and overlapping actions.");
} finally {
  await browser.close();
}
