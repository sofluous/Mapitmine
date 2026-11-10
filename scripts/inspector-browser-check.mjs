import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/inspector/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("map:Inspector", JSON.stringify({ version: 3,
    layers: [{ id: "default", label: "Pins", visible: true, locked: false }], pins: [],
    drawings: [{ id: "route", name: "Long route", type: "path", layerId: "default",
      points: Array.from({ length: 100 }, (_, i) => ({ x: -123456789.125 + i, z: 987654321.25 + i })),
      style: { color: "#55bb99", width: 2 } }],
  })));
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const select = async () => {
    await page.evaluate(() => { setWorkspaceCollapsed(true, false); workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); });
    await settle();
  };
  const xInput = (index) => page.locator(`#drawingPoints input[data-point="${index}"][data-axis="x"]`);
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const width of [320, 390, 901, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await select();
      assert.equal(await page.locator("#drawingPoints input:visible").count(), 2, "Only active coordinates are shown by default");
      assert.equal(await page.locator("#drawingStyle").getAttribute("open"), null);
      const count = await page.evaluate(() => undoStack.length);
      await page.locator("#drawingVertexSelect").selectOption("24");
      assert.equal(await xInput(24).inputValue(), "-123456765.125");
      assert.equal(await page.evaluate(() => drawingTools.hasPendingEdits()), false);
      assert.equal(await page.evaluate(() => undoStack.length), count);
      const box = await xInput(24).boundingBox();
      const nameBox = await page.locator("#drawingName").boundingBox();
      assert.ok(box.width >= 100 && box.y < nameBox.y, "Readable coordinates precede name/style fields");
      const zBox = await page.locator('#drawingPoints input[data-point="24"][data-axis="z"]').boundingBox();
      assert.ok(zBox.y > box.y, "Long coordinates stack without shrinking field text");
      await page.locator(".drawing-points-toggle").focus(); await page.keyboard.press("Enter");
      assert.notEqual(await page.locator(".drawing-points-toggle .io").evaluate((e) => getComputedStyle(e, "::before").maskImage), "none", "Disclosure uses an installed icon");
      assert.equal(await page.locator("#drawingPoints input:visible").count(), 200);
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#drawingPoints input:visible").count(), 2);
      await page.locator("#drawingVertexSelect").selectOption("0");
      await page.screenshot({ path: resolve(output, `${theme}-${width}.png`) });
      if (![390, 1440].includes(width)) continue;
      await page.evaluate(() => { workspaceState.select(null); setWorkspaceTab("map-view", { persist: false, openPanel: true }); });
      const ids = await page.locator(".ds-switch input").evaluateAll((elements) => elements.map((e) => e.id));
      assert.equal(ids.length, 11, "Inventory includes every production DS switch");
      for (const id of ids) {
        const input = page.locator(`#${id}`), label = page.locator(`.ds-switch:has(#${id})`);
        const name = await label.getAttribute("aria-label");
        assert.equal(await page.getByRole("checkbox", { name, exact: true }).count(), 1, "Switch has a native accessible name");
        const checked = await input.isChecked();
        await input.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement.id), id, "Native Tab sequence reaches switch");
        await page.keyboard.press("Space"); assert.equal(await input.isChecked(), !checked);
        const outline = await label.locator(".ds-switch-track").evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, width: parseFloat(getComputedStyle(e).outlineWidth) }));
        assert.ok(outline.style !== "none" && outline.width >= 2, "Keyboard switch focus paints a track outline");
        await page.keyboard.press("Space"); assert.equal(await input.isChecked(), checked);
        if (width === 390) {
          assert.ok((await label.boundingBox()).height >= 44, "Mobile switch hit area stays reachable");
          const alignment = await label.evaluate((e) => {
            const toggle = e.getBoundingClientRect(), caption = e.parentElement.querySelector("label").getBoundingClientRect();
            return Math.abs(toggle.y + toggle.height / 2 - caption.y - caption.height / 2);
          });
          assert.ok(alignment <= 1, "Mobile captions stay alongside their switches");
          await label.tap(); await label.tap();
        } else { await label.click(); await label.click(); }
        assert.equal(await input.isChecked(), checked, "Pointer and keyboard activation agree");
      }
      await page.locator("#showAxes").focus();
      await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
      await page.screenshot({ path: resolve(output, `${theme}-switches-${width}.png`) });
      await page.evaluate(() => { setWorkspaceCollapsed(true, false); workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 }); await select();
  const original = await xInput(0).inputValue();
  await xInput(0).fill("");
  await page.locator("#drawingVertexSelect").selectOption("1");
  assert.equal(await page.evaluate(() => shouldWarnBeforeUnload()), true, "Hidden invalid edits still protect navigation");
  const before = await page.evaluate(() => ({ points: JSON.stringify(drawings[0].points), history: undoStack.length }));
  await page.locator("#drawingApply").click();
  assert.equal(await xInput(0).isVisible(), true, "Invalid hidden coordinate is revealed");
  assert.equal(await xInput(0).evaluate((e) => e === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => ({ points: JSON.stringify(drawings[0].points), history: undoStack.length })), before);
  await xInput(0).fill(original);
  await page.locator("#drawingStyle summary").click();
  await page.locator("#drawingWidth").fill("0");
  await page.locator("#drawingStyle summary").click();
  await page.locator("#drawingApply").click();
  assert.equal(await page.locator("#drawingStyle").getAttribute("open"), "", "Invalid hidden style field is revealed");
  await page.locator("#drawingWidth").fill("3");
  await page.locator("#drawingApply").click();
  assert.equal(await page.evaluate(() => drawings[0].style.width), 3);
  assert.equal(await page.evaluate(() => undoStack.length), Math.min(60, before.history + 1));
  assert.equal(await page.evaluate(() => undoStack.at(-1).label), "Edit Drawing");
  await page.locator("#undoBtn").click(); assert.equal(await page.evaluate(() => drawings[0].style.width), 2);
  await page.locator("#redoBtn").click(); assert.equal(await page.evaluate(() => drawings[0].style.width), 3);
  await page.evaluate(() => {
    window.originalInspectorViewport = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: 400, offsetTop: 0 } });
    mobileLayout.refresh();
  });
  await settle();
  for (const control of [xInput(0), page.locator("#drawingApply")]) {
    await control.scrollIntoViewIfNeeded();
    const bounds = await control.boundingBox(), dock = await page.locator("#mobileDock").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= dock.y + 1, "Coordinates and Apply stay scroll-reachable above a simulated keyboard");
  }
  await page.evaluate(() => { Object.defineProperty(window, "visualViewport", { configurable: true, value: window.originalInspectorViewport }); mobileLayout.refresh(); });
  await settle();
  await page.evaluate(() => { layers[0].locked = true; drawingTools.refresh(); });
  assert.equal(await xInput(0).isDisabled(), true);
  await page.locator("#drawingVertexSelect").selectOption("99");
  assert.equal(await xInput(99).isVisible(), true, "Locked geometry stays inspectable without editing");
  assert.equal(await xInput(99).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("Compact inspector and all 11 switch keyboard/pointer checks passed across three themes.");
} finally { await browser.close(); }
