import { chooseObjectKind } from "./browser-controls.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Production acceptance suite, also available through qa:objects-editor-browser.
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) {
  throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE for optional browser QA.");
}
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/objects-editor/", import.meta.url));
await mkdir(output, { recursive: true });

async function checkPinLayout(page, width, height) {
  for (const [id, value] of [["pinEditorX", "-123456789"], ["pinEditorY", "72"], ["pinEditorZ", "987654321"]]) {
    const control = page.locator(`#${id}`);
    assert.equal(await control.inputValue(), value, "Opening preserves exact stored coordinates");
    const metrics = await control.evaluate(input => {
      const style = getComputedStyle(input), rect = input.getBoundingClientRect();
      const label = input.labels[0], caption = label.querySelector(".editor-field-label");
      const text = document.createElement("canvas").getContext("2d");
      text.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (style.letterSpacing !== "normal") text.letterSpacing = style.letterSpacing;
      return { label: caption.textContent, associated: label.htmlFor === input.id,
        textWidth: text.measureText(input.value).width,
        contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        captionY: caption.getBoundingClientRect().y, inputY: rect.y,
        captionVisible: caption.checkVisibility(), border: parseFloat(style.borderTopWidth) };
    });
    assert.equal(metrics.label, id.at(-1));
    assert.ok(metrics.associated && metrics.captionVisible && metrics.border > 0, "Outlined axes have persistent associated labels");
    assert.ok(metrics.captionY < metrics.inputY + 2, "Axis label sits at the outline");
    assert.ok(metrics.textWidth <= metrics.contentWidth + 1, `${width}px ${id}: full coordinate must fit (${metrics.textWidth} > ${metrics.contentWidth})`);
  }
  const layer = await page.locator("#pinEditorLayer").boundingBox();
  const type = await page.locator("#pinEditorID").boundingBox();
  assert.ok(Math.abs(layer.y - type.y) <= 1 && type.x >= layer.x + layer.width, "Layer and Type share a row");
  const name = page.locator("#pinEditorLabel");
  await name.fill(""); await name.focus();
  assert.equal(await name.evaluate(input => input.labels[0].querySelector(".editor-field-label").checkVisibility()), true, "Empty focused Name retains its label");
  await name.fill("Camp");
  await page.locator('#pinEditorPanel details').filter({ has: page.locator('summary', { hasText: /^Appearance$/ }) }).locator("summary").click();
  const swatch = await page.locator("#pinEditorColor").boundingBox();
  const icon = await page.locator("#pinEditorIcon").boundingBox();
  assert.ok(Math.abs(swatch.width - 44) <= 1 && Math.abs(swatch.height - 44) <= 1, "Color is a bounded 44px swatch");
  assert.ok(icon.width <= 105 && icon.height >= 44, "Icon picker is at most 104px with a touch-sized height");
  await page.locator("#pinEditorIcon").scrollIntoViewIfNeeded();
  const swatchVisible = await page.locator("#pinEditorColor").boundingBox();
  const footerTop = (await page.locator(".pin-editor-actions").boundingBox()).y;
  assert.ok(swatchVisible.y + swatchVisible.height <= footerTop + 1, "Appearance controls remain above the fixed commit footer");
  for (const id of ["pinEditorCancelBtn", "pinEditorSaveBtn"]) {
    const button = page.locator(`#${id}`);
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    const bottom = width <= 900 ? (await page.locator("#mobileDock").boundingBox()).y : height;
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= bottom + 1, "Editor footer remains scroll reachable above chrome");
  }
}

try {
  for (const [width, height] of [[320, 900], [390, 900], [900, 900], [901, 900], [1199, 900], [1200, 900], [1440, 900], [390, 560]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("map:Objects acceptance", JSON.stringify({ version: 3,
        layers: [
          { id: "default", label: "Base", visible: true, locked: false },
          { id: "reference", label: "Reference", visible: false, locked: true },
        ],
        pins: [
          { uid: "camp", label: "Camp", x: -123456789, y: 72, z: 987654321, layerId: "default" },
          { uid: "reference-pin", label: "Reference pin", x: 10, z: 20, layerId: "reference" },
        ],
        drawings: [{ id: "route", name: "Route", type: "path", layerId: "default",
          points: [{ x: 0, z: 5 }, { x: 20, z: 5 }], style: { color: "#55bb99", width: 2 } }],
      }));
    });
    await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
    const row = id => page.locator(`#layerList [role="treeitem"][data-object-id="${id}"]`);
    const inspector = page.locator("#contextInspector");
    const snapshot = () => page.evaluate(() => ({
      document: JSON.stringify({ pins, drawings, layers }),
      raw: localStorage.getItem(mapKey(currentMapName)), undo: undoStack.length, redo: redoStack.length,
    }));
    const camera = () => page.evaluate(() => [offsetX, offsetY, zoom]);
    const openObjects = () => page.evaluate(() => setWorkspaceTab("objects", { persist: false, openPanel: true }));
    const screenshot = async (name, theme) => {
      if ([320, 390, 1440].includes(width) && height === 900) {
        await page.screenshot({ path: resolve(output, `${name}-${theme}-${width}.png`) });
      }
    };
    await openObjects();
    assert.equal(await page.locator('[data-workspace-tab="pins"], [data-workspace-tab="layers"], #pinList, #pinListPanel, #pinSearchInput').count(), 0, "Objects replaces the separate pin rail and panel");
    await page.evaluate(() => setWorkspaceTab("pins", { persist: false }));
    assert.equal(await page.evaluate(() => getActiveWorkspaceTab()), "objects");
    assert.equal(await page.locator("#objectFilter").inputValue(), "pin");
    await page.evaluate(() => setWorkspaceTab("layers", { persist: false }));
    assert.equal(await page.evaluate(() => getActiveWorkspaceTab()), "objects");
    assert.equal(await page.locator("#objectFilter").inputValue(), "all");
    const before = await snapshot();
    for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
      await page.evaluate(value => MapItTheme.setTheme(value), theme);
      await screenshot("objects", theme);
      assert.equal(await page.locator("#pinResultSummary").textContent(), "3/3", "Hidden/locked objects count toward shown and total");
      assert.equal(await row("reference-pin").isVisible(), true, "Hidden layers remain discoverable");
      await chooseObjectKind(page, 'drawing');
      assert.equal(await row("camp").count(), 0);
      assert.equal(await row("route").isVisible(), true);
      assert.equal(await row("default").isVisible(), true, "Filtering retains layer context");
      assert.equal(await page.locator("#pinResultSummary").textContent(), "1/1");
      await chooseObjectKind(page, 'all');
      await page.locator("#objectSearch").fill("Reference pin");
      assert.equal(await row("reference-pin").isVisible(), true);
      assert.equal(await page.locator("#pinResultSummary").textContent(), "1/3");
      await page.locator("#pinSearchClearBtn").click();
      await row("default").focus();
      const beforeTypeahead = await camera();
      await page.keyboard.press("c");
      assert.equal(await row("camp").evaluate(el => el === document.activeElement), true, "c is tree typeahead");
      assert.deepEqual(await camera(), beforeTypeahead, "Typeahead cannot center or edit");
      assert.equal(await inspector.isVisible(), false);
      await row("camp").locator(".btn-more").click();
      assert.equal(await page.locator('#contextMenu [role="menuitem"]').count() > 0, true, "Pin menu remains reachable from the unified tree");
      await page.keyboard.press("Escape");
      assert.equal(await row("camp").locator(".btn-copy-coords").count(), 1);
      for (const activation of ["click", "Space", "Enter", "F2", "doubleclick"]) {
        await page.evaluate(() => { offsetX += 123; offsetY += 45; draw(); });
        const previousCamera = await camera();
        if (activation === "click") await row("camp").locator(".pin-label").click();
        else if (activation === "doubleclick") await row("camp").locator(".pin-label").dblclick();
        else { await row("camp").focus(); await page.keyboard.press(activation); }
        await page.waitForFunction(() => workspaceState.get().selection?.id === "camp");
        await page.waitForFunction(previous => offsetX !== previous[0] || offsetY !== previous[1], previousCamera);
        assert.notDeepEqual(await camera(), previousCamera, `${activation} centers the pin`);
        const edits = ["Enter", "F2", "doubleclick"].includes(activation);
        assert.equal(await inspector.isVisible(), edits, `${activation} has explicit selection/edit behavior`);
        if (edits) {
          assert.equal(await page.locator("#pinEditorPanel").isVisible(), true);
          if (activation === "Enter") {
            await screenshot("pin", theme);
            await checkPinLayout(page, width, height);
            await screenshot("pin-appearance", theme);
          }
          if (width <= 900) assert.equal(await page.locator("#workspacePanel").isVisible(), false, "Phone sheets are exclusive");
          const bounds = await inspector.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
          await page.locator("#pinEditorCancelBtn").click();
          await openObjects();
        }
      }
      await row("route").click();
      assert.equal(await inspector.isVisible(), false, "Drawing click only selects");
      const beforeDrawingEdit = await camera();
      await row("route").focus(); await page.keyboard.press("Enter");
      assert.equal(await page.locator("#drawingEditor").isVisible(), true);
      assert.deepEqual(await camera(), beforeDrawingEdit, "Drawing editing cannot recenter");
      if (!await page.locator("#drawingGeometry").evaluate(el => el.open)) await page.locator("#drawingGeometry > summary").click();
      await screenshot("shape-vertices", theme);
      const drawingBefore = await snapshot();
      await page.locator("#drawingName").fill("Uncommitted route");
      assert.deepEqual(await snapshot(), drawingBefore, "Typing remains local until field completion");
      await page.locator("#drawingName").press("Escape");
      assert.equal(await page.locator("#drawingName").inputValue(), "Route");
      assert.deepEqual(await snapshot(), drawingBefore, "Escape discards unfinished input without history");
      await page.locator("#inspectorClose").click();
      await openObjects();
      await row("reference-pin").focus(); await page.keyboard.press("F2");
      assert.equal(await page.locator("#objectInspector").isVisible(), true, "Locked pin uses read-only inspection");
      assert.equal(await page.locator("#pinEditorPanel").isVisible(), false);
      assert.equal(await page.locator("#objectInspectorEdit").isDisabled(), true);
      await page.locator("#inspectorClose").click();
      await openObjects();
      assert.deepEqual(await snapshot(), before, "Browsing, opening and cancelling cannot mutate documents/history");
      assert.deepEqual(errors, []);
    }
    await row("camp").focus(); await page.keyboard.press("Enter");
    const beforePinCommit = await snapshot();
    await page.locator("#pinEditorLabel").fill("Committed camp");
    assert.deepEqual(await snapshot(), beforePinCommit, "Pin draft cannot write storage/history");
    await page.locator("#pinEditorSaveBtn").click();
    await page.waitForFunction(() => pins[0].label === "Committed camp");
    assert.equal(await page.evaluate(() => undoStack.length), beforePinCommit.undo + 1, "Pin Save creates one transaction");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(mapKey(currentMapName))).pins[0].label), "Committed camp");
    await page.evaluate(() => undoPinsChange());
    assert.equal(await page.evaluate(() => pins[0].label), "Camp");
    await page.evaluate(() => redoPinsChange());
    assert.equal(await page.evaluate(() => pins[0].label), "Committed camp");
    await openObjects();
    await row("route").focus(); await page.keyboard.press("Enter");
    const beforeShapeCommit = await snapshot();
    await page.locator("#drawingName").fill("Committed route");
    await page.locator("#drawingEditor").dispatchEvent("change");
    assert.equal(await page.evaluate(() => drawings[0].name), "Committed route");
    console.log(`Objects/editor acceptance passed at ${width}x${height} in all three themes.`);
    assert.equal(await page.evaluate(() => undoStack.length), beforeShapeCommit.undo + 1, "Shape field completion creates one transaction");
    await page.evaluate(() => undoPinsChange());
    assert.equal(await page.evaluate(() => drawings[0].name), "Route");
    await page.evaluate(() => redoPinsChange());
    assert.equal(await page.evaluate(() => drawings[0].name), "Committed route");
    await page.close();
  }
  console.log("Objects/editor acceptance passed: filters, hidden/locked discovery, typeahead, activation, centering, readonly inspection and responsive sheet bounds.");
} finally { await browser.close(); }
