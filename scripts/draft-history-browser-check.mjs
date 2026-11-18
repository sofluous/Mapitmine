import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/draft-history/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.draftPromptCount = 0;
      const showModal = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function (...args) {
        if (this.id === "draftResolutionDialog") window.draftPromptCount++;
        return showModal.apply(this, args);
      };
      for (const name of ["A", "B"]) localStorage.setItem(`map:${name}`, JSON.stringify({ version: 3, pins: [], drawings: [],
        layers: [{ id: "default", label: "Pins", visible: true, locked: false }, { id: "routes", label: "Routes", visible: true, locked: false }] }));
    });
    await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    const snapshot = () => page.evaluate(() => ({ undo: undoStack.length, redo: redoStack.length, drawings: JSON.stringify(drawings), raw: localStorage.getItem(mapKey(currentMapName)) }));
    const progress = (count) => page.waitForFunction((n) => document.getElementById("drawingProgress").textContent === `Path: ${n} points`, count);
    const noDialog = async () => assert.equal(await page.locator("#draftResolutionDialog").evaluate((e) => e.open), false);
    const start = async () => {
      await page.locator('[data-canvas-tool="path"]').click();
      await page.evaluate(() => { setWorkspaceCollapsed(true, false); offsetX = 0; offsetY = 0; zoom = 1; draw(); });
      await progress(0);
    };
    const x = width === 390 ? 90 : 600;
    const point = async (index) => {
      const position = { x: x + index * 25, y: 350 + index * 30 };
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, position), "mapCanvas");
      if (width === 390) await page.touchscreen.tap(position.x, position.y);
      else await page.mouse.click(position.x, position.y);
    };
    await start();
    assert.equal(await page.locator("#drawingLayer").isEnabled(), true);
    await page.locator("#drawingLayer").selectOption("routes");
    const setupHeight = (await page.locator("#drawingCommands").boundingBox()).height;
    const setupTools = await page.locator("#historyTools").boundingBox();
    const before = await snapshot();
    assert.equal(await page.locator("#undoBtn").isDisabled(), true);
    await point(0); await point(1); await point(2); await progress(3);
    assert.equal(await page.locator("#drawingShape").isVisible(), false, "Shape selector yields to placement actions");
    assert.equal(await page.locator('label[for="drawingLayer"]').isVisible(), false);
    const placementHeight = (await page.locator("#drawingCommands").boundingBox()).height;
    assert.ok(placementHeight <= setupHeight + 8, `Placement adds at most one spacing unit for the touch-sized vertex disclosure (${placementHeight}/${setupHeight})`);
    if (width === 390) {
      const placementTools = await page.locator("#historyTools").boundingBox();
      assert.ok(Math.abs(placementTools.y - setupTools.y) <= 1, "Primary tools stay anchored between setup and placement");
    }
    assert.equal(await page.locator("#drawingFinish").evaluate((e) => e.classList.contains("ds-btn-primary")), true);
    const repeatPrompts = await page.evaluate(() => draftPromptCount);
    await page.locator('[data-canvas-tool="path"]').click(); await progress(3); await noDialog();
    assert.equal(await page.evaluate(() => draftPromptCount), repeatPrompts, "Reselecting Draw is idempotent");
    assert.equal(await page.locator("#undoBtn").getAttribute("aria-label"), "Undo point");
    const disclosure = page.locator('#draftVertices summary');
    assert.equal(await page.locator('#draftVertices').evaluate(el => el.open), false, 'Draft vertices start collapsed');
    await disclosure.click();
    const draftRows = page.locator('#draftPoints [data-draft-vertex]');
    assert.equal(await draftRows.count(), 3);
    await draftRows.nth(2).focus();
    assert.equal(await draftRows.nth(2).evaluate(el => document.activeElement === el), true, 'Draft row receives keyboard focus');
    await page.keyboard.press('Home');
    assert.equal(await draftRows.nth(0).getAttribute('aria-current'), 'true');
    await page.keyboard.press('ArrowDown');
    assert.equal(await draftRows.nth(1).getAttribute('aria-current'), 'true');
    await page.keyboard.press('End');
    assert.equal(await draftRows.nth(2).getAttribute('aria-current'), 'true');
    const draftX = page.locator('#draftPoints input[data-draft-point="0"][data-axis="x"]');
    await draftX.fill('-123.5'); await draftX.press('Enter');
    assert.equal(await draftX.inputValue(), '-123.5');
    assert.deepEqual(await snapshot(), before, 'Numeric edits remain entirely in the draft');
    await page.locator('#undoBtn').click(); assert.equal(await draftX.inputValue(), String(x));
    await page.locator('#redoBtn').click(); assert.equal(await draftX.inputValue(), '-123.5');
    await page.locator('#undoBtn').click(); assert.equal(await draftX.inputValue(), String(x));
    await draftX.fill(''); await draftX.press('Tab');
    assert.equal(await draftX.inputValue(), String(x), 'Blank values restore accepted coordinates');
    await draftX.fill('1e309'); await draftX.press('Tab');
    assert.equal(await draftX.inputValue(), String(x), 'Nonfinite values restore accepted coordinates');
    await draftX.fill('777'); await draftX.press('Escape');
    assert.equal(await draftX.inputValue(), String(x), 'Escape reverts field text without cancelling draft');
    assert.equal(await page.evaluate(() => drawingTools.active()), true);
    if (width === 390) {
      const finish = await page.locator('#drawingFinish').boundingBox();
      const commands = await page.locator('#drawingCommands').boundingBox();
      assert.ok(finish.y + finish.height <= commands.y + commands.height + 1, 'Expanded draft list keeps Finish inside the command viewport');
      assert.ok((await disclosure.boundingBox()).height >= 44, 'Touch disclosure has a 44px target');
    }
    await page.screenshot({ path: resolve(output, `vertices-${theme}-${width}.png`) });
    await disclosure.click();
    if (width === 1440) {
      await page.mouse.move(x, 350);
      assert.equal(await page.locator("#mapCanvas").evaluate((element) => element.style.cursor), "grab");
      await page.mouse.down();
      await page.mouse.move(x + 12, 360, { steps: 3 });
      await page.mouse.up();
      await progress(3);
      await page.keyboard.press("Control+z"); await progress(3);
      await page.keyboard.press("Control+Shift+z"); await progress(3);
      await page.keyboard.press("Control+z"); await progress(3);
      assert.deepEqual(await snapshot(), before, "Mouse draft moves leave document data/history untouched");
    }
    await page.locator("#undoBtn").focus(); await page.keyboard.press("Enter"); await progress(2);
    await page.locator("#redoBtn").focus(); await page.keyboard.press("Space"); await progress(3);
    await page.locator("#undoBtn").click(); await progress(2); await noDialog();
    await page.keyboard.press("Control+z"); await progress(1);
    await page.keyboard.press("Control+Shift+z"); await progress(2);
    await page.keyboard.press("Control+y"); await progress(3);
    await page.keyboard.press("Meta+z"); await progress(2);
    await page.keyboard.press("Meta+Shift+z"); await progress(3);
    assert.deepEqual(await snapshot(), before, "Draft traversal does not write geometry, storage or committed history");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Control+z");
    await progress(0); await noDialog();
    assert.equal(await page.locator("#undoBtn").isDisabled(), true);
    assert.equal(await page.evaluate(() => drawingTools.active()), true);
    await page.locator("#redoBtn").click(); await progress(1);
    await point(3); await progress(2);
    assert.equal(await page.locator("#redoBtn").isDisabled(), true, "New point clears draft redo");
    await page.keyboard.press("Control+y"); await progress(2); await noDialog();

    // Native text editing must not consume or discard draft points.
    await page.evaluate(() => {
      const input = document.createElement("input"); input.id = "historyTextProbe"; input.type = "text";
      Object.assign(input.style, { position: "fixed", left: "40px", top: "40px", zIndex: "10000" });
      document.body.appendChild(input); input.focus();
    });
    await page.keyboard.type("native edit");
    await page.keyboard.press("Control+z");
    assert.notEqual(await page.locator("#historyTextProbe").inputValue(), "native edit", "Native text Undo changes the browser's text edit group");
    await page.evaluate(() => document.getElementById("historyTextProbe").remove());
    await progress(2); await noDialog();
    await page.evaluate(() => {
      const editor = document.createElement("div"); editor.id = "historyEditableProbe"; editor.contentEditable = "true";
      document.body.appendChild(editor); editor.focus();
    });
    await page.keyboard.type("editable"); await page.keyboard.press("Control+z");
    assert.notEqual(await page.locator("#historyEditableProbe").textContent(), "editable");
    await page.evaluate(() => { document.getElementById("historyEditableProbe").remove(); setWorkspaceCollapsed(true, false); });
    await progress(2); assert.deepEqual(await snapshot(), before);
    await page.screenshot({ path: resolve(output, `${theme}-${width}.png`) });
    await disclosure.click();
    await draftX.fill('-123.5'); await draftX.press('Enter');
    await page.locator("#drawingFinish").click();
    const finished = await snapshot();
    assert.equal(JSON.parse(finished.drawings).length, 1);
    assert.equal(JSON.parse(finished.drawings)[0].layerId, "routes");
    assert.deepEqual(JSON.parse(finished.drawings)[0].points, [{ x: -123.5, z: 350 }, { x: x + 75, z: 440 }]);
    assert.equal(finished.undo, before.undo + 1, "Finish creates one committed action");
    assert.equal(await page.locator("#undoBtn").getAttribute("aria-label"), "Undo");
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => drawings.length), 0);
    assert.equal(await page.locator("#redoBtn").isEnabled(), true);
    await start();
    assert.equal(await page.locator("#redoBtn").isDisabled(), true, "Draft owns Redo even when document Redo exists");
    await page.evaluate(() => redoPinsChange()); assert.equal(await page.evaluate(() => drawings.length), 0);
    await page.locator("#drawingCancel").click();
    let prompts = await page.evaluate(() => draftPromptCount);
    await start();
    await page.evaluate(() => requestWorkspaceTool("pan")); await noDialog();
    assert.equal(await page.evaluate(() => draftPromptCount), prompts, "Empty setup transitions do not ask to discard");
    await start(); await point(0);
    const guarded = page.evaluate(() => requestWorkspaceTool("pan"));
    await page.locator('[data-draft-choice="keep"]').waitFor({ state: "visible" });
    await page.evaluate(() => requestWorkspaceTool("select"));
    await page.locator('[data-draft-choice="keep"]').click(); await guarded;
    assert.equal(await page.evaluate(() => draftPromptCount), prompts + 1, "A nonempty transition resolves once, including repeated requests");
    await progress(1);
    await page.locator("#drawingCancel").click(); await noDialog();
    assert.equal(await page.evaluate(() => draftPromptCount), prompts + 1, "Cancel is a direct explicit discard");
    await page.evaluate(() => requestPinPlacement(100, 150, 10, 20));
    await page.locator("#pinEditorLabel").fill("Keep this pin");
    prompts = await page.evaluate(() => draftPromptCount);
    const keepPin = page.evaluate(() => requestWorkspaceTool("path"));
    await page.locator('[data-draft-choice="keep"]').click(); await keepPin;
    assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Keep this pin");
    assert.equal(await page.evaluate(() => draftPromptCount), prompts + 1);
    const discardPin = page.evaluate(() => requestWorkspaceTool("path"));
    await page.locator('[data-draft-choice="discard"]').click(); await discardPin;
    await progress(0); await noDialog();
    assert.equal(await page.evaluate(() => draftPromptCount), prompts + 2, "Pin-to-drawing transition has no follow-up discard dialog");
    await page.locator("#drawingCancel").click();
    await page.locator("#redoBtn").click(); assert.equal(await page.evaluate(() => drawings.length), 1);
    await start();
    const protectedDocument = await snapshot();
    await page.evaluate(() => undoPinsChange()); await noDialog();
    assert.deepEqual(await snapshot(), protectedDocument, "Zero-point Undo never crosses into committed history");
    await point(0); await page.locator("#undoBtn").click();
    const transition = page.evaluate(() => selectMapByName("B"));
    await page.locator('[data-draft-choice="keep"]').click(); await transition;
    assert.equal(await page.locator("#redoBtn").isEnabled(), true, "Keep Editing preserves draft redo");
    const leave = page.evaluate(() => selectMapByName("B"));
    await page.locator('[data-draft-choice="discard"]').click(); await leave;
    await start(); assert.equal(await page.locator("#redoBtn").isDisabled(), true, "Map changes cannot inherit draft history");
    await point(0); await page.locator("#drawingCancel").click(); await start();
    assert.equal(await page.locator("#undoBtn").isDisabled(), true, "Cancel resets the next drawing session");
    await page.locator("#drawingCancel").click();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Draft history browser checks passed: point traversal, native text Undo, history boundaries, Finish/Cancel and guarded map changes.");
} finally { await browser.close(); }
