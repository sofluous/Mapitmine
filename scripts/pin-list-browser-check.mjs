import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/pin-list/", import.meta.url)); await mkdir(output, { recursive: true });
try {
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) for (const width of [320, 390, 901, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 900 });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("map:List QA", JSON.stringify({ version: 3,
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
      drawings: [{ id: "route", name: "Route", type: "path", layerId: "default", points: [{ x: 1000, z: 1000 }, { x: 1100, z: 1100 }], style: { color: "#55bb99", width: 2 } }],
      pins: [{ uid: "farm", label: "Apple Farm", id: "farm", x: -12, z: 34, layerId: "default" },
        { uid: "village", label: "A Very Long Village Name For Readability", id: "village", x: 123456789, z: -987654321, description: "A longer description stays on its own row.", layerId: "default" },
        { uid: "custom", label: "Camp", x: 20, z: -10, layerId: "default" }],
    })));
    await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
    await page.evaluate((value) => { MapItTheme.setTheme(value); setWorkspaceTab("pins"); }, theme);
    const search = page.locator("#pinSearchInput"), clear = page.locator("#pinSearchClearBtn"), filter = page.locator("#pinFilterBtn");
    const rows = page.locator("#pinList .pin-card"), summary = page.locator("#pinResultSummary");
    const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(mapKey(currentMapName)), history: undoStack.length, pins: JSON.stringify(pins) }));
    const before = await snapshot();
    assert.equal(await rows.count(), 3);
    for (const row of await rows.all()) {
      const title = await row.locator('.pin-label').boundingBox();
      assert.ok(title.width >= 40, 'Every row retains identifying title space');
      assert.equal(await row.locator('.pin-tag').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Tags remain readable');
      const coords = await row.locator('.pin-coords').boundingBox();
      const line = await row.locator('.pin-line-secondary').boundingBox();
      assert.ok(Math.abs(coords.x + coords.width - line.x - line.width) <= 1, 'Coordinates stay anchored right');
    }
    assert.deepEqual(await rows.nth(1).locator('.pin-coord-value').allTextContents(), ['123456789', '-', '-987654321']);
    const longTitle = await rows.nth(1).locator('.pin-label').boundingBox();
    const longCoords = await rows.nth(1).locator('.pin-coords').boundingBox();
    assert.ok(longCoords.y >= longTitle.y + longTitle.height, 'Extreme values use an explicit continuation line');
    assert.equal(await summary.textContent(), "3/3");
    assert.equal(await page.locator("#pinFilterSummary").textContent(), "0");
    assert.equal(await page.locator(".pin-toolbar-row").count(), 1, "Toolbar uses one row without duplicate chips");
    await rows.nth(0).click();
    assert.equal(await page.evaluate(() => workspaceState.get().selection.id), "farm");
    const a = await rows.nth(0).boundingBox(), b = await rows.nth(1).boundingBox();
    assert.ok(Math.abs(a.y + a.height - b.y) <= 1, "Pin rows meet without a gap");
    const wrap = await page.locator(".pin-search-wrap").boundingBox(), icon = await page.locator(".pin-search-wrap > .io").boundingBox();
    assert.ok(icon.x >= wrap.x && icon.x + icon.width <= wrap.x + wrap.width && icon.y >= wrap.y && icon.y + icon.height <= wrap.y + wrap.height);
    const initialInput = await search.boundingBox();
    await search.fill("Apple");
    assert.equal(await rows.count(), 1); assert.equal(await summary.textContent(), "1/3");
    assert.equal(await search.evaluate((element) => getComputedStyle(element).borderTopWidth), "0px");
    assert.equal(await search.evaluate((element) => getComputedStyle(element).boxShadow), "none");
    assert.equal(await page.locator(".pin-search-wrap").evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
    assert.equal((await search.boundingBox()).width, initialInput.width, "Clear-button reveal cannot resize input");
    assert.ok((await clear.boundingBox()).width >= 44);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => workspaceState.get().selection.id), "farm", "Clearing search cannot deselect a pin");
    assert.equal(await search.inputValue(), ""); assert.equal(await rows.count(), 3);
    assert.equal(await search.evaluate((element) => document.activeElement === element), true);
    await filter.focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#pinFilterPopover").isVisible(), true);
    const farm = page.locator('#pinTypeChecklist input[data-pin-filter-type="farm"]');
    await farm.uncheck();
    assert.equal(await page.locator("#pinFilterSummary").textContent(), "1");
    assert.equal(await summary.textContent(), "2/3");
    assert.equal(await farm.evaluate((element) => document.activeElement === element), true, "Filter refresh preserves checkbox focus");
    await page.keyboard.press("Space");
    assert.equal(await farm.isChecked(), true); assert.equal(await summary.textContent(), "3/3");
    if (width === 390) {
      const ids = await page.locator("#pinTypeChecklist input").evaluateAll((inputs) => inputs.map((input) => input.dataset.pinFilterType));
      for (const id of ids) await page.locator(`#pinTypeChecklist input[data-pin-filter-type="${id}"]`).uncheck();
      assert.equal(await summary.textContent(), "0/3", "Excluding every type has a clear empty state");
      assert.equal(await page.locator("#pinFilterSummary").textContent(), String(ids.length));
      await page.locator("#pinFilterResetBtn").click();
      assert.equal(await page.locator("#pinFilterSummary").textContent(), "0");
      assert.equal(await rows.count(), 3);
    }
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#pinFilterPopover").isVisible(), false);
    assert.equal(await filter.evaluate((element) => document.activeElement === element), true);
    if (width === 390) {
      await page.evaluate(() => { workspaceState.select({ kind: "drawing", id: "route" }); setWorkspaceTab("pins"); });
      await filter.focus(); await page.keyboard.press("Enter");
      await page.locator("#pinFilterResetBtn").focus(); await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => workspaceState.get().selection.id), "route", "Filter Escape does not clear a drawing selection");
    }
    await search.fill("not-a-real-pin");
    assert.equal(await page.locator(".pin-empty-title").textContent(), "No matching pins");
    await page.locator("#clearPinSearchOnlyBtn").click();
    assert.equal(await rows.count(), 3);
    await search.fill(" "); assert.equal(await clear.isVisible(), true); await clear.click();
    await page.screenshot({ path: resolve(output, `${theme}-${width}.png`) });
    assert.deepEqual(await snapshot(), before, "Search/filter navigation cannot write pin/map/history state");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Pin list browser checks passed: integrated search/focus, contiguous rows, compact counts, keyboard filters and empty-state reset across themes/widths.");
} finally { await browser.close(); }
