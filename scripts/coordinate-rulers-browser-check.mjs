import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/rulers/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("map:Rulers")) localStorage.setItem("map:Rulers", JSON.stringify({ version: 3,
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
      pins: [{ uid: "pin", x: 0, z: 0, label: "Origin", layerId: "default" }], drawings: [],
    }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(mapKey(currentMapName)), history: undoStack.length, zoom, offsetX, offsetY }));
  const labels = () => page.locator(".ruler-x .ruler-tick").allTextContents();
  assert.equal(await page.locator("#showRulers").isChecked(), true);
  await settle();
  assert.ok((await labels()).length > 0, "Rulers are visible by default");
  await page.evaluate(() => { offsetX = 650; offsetY = 440; zoom = 1; draw(); });
  await settle();
  const original = await snapshot();
  const oldLabels = await labels();
  await page.evaluate(() => { offsetX += 100; offsetY += 50; draw(); });
  await settle();
  assert.notDeepEqual(await labels(), oldLabels, "Pan updates coordinate values");
  const scaleLabels = await labels();
  await page.evaluate(() => { zoom = 5; draw(); }); await settle();
  assert.notDeepEqual(await labels(), scaleLabels, "Zoom updates intervals");
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 901, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport); await settle();
      for (const open of [false, true]) {
        await page.evaluate((value) => { setWorkspaceCollapsed(!value, false); offsetX = 200; offsetY = 200; zoom = 1; draw(); }, open);
        await settle();
        const rulerData = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll(".coordinate-ruler"));
          return elements.filter((element) => !element.hidden).map((element) => {
            const box = element.getBoundingClientRect();
            return { axis: element.classList.contains("ruler-x") ? "X" : "Z", box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom },
              ticks: Array.from(element.querySelectorAll(".ruler-tick"), (tick) => {
                const rect = tick.getBoundingClientRect();
                return { value: Number(tick.dataset.value), position: Number(tick.dataset.position), x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
              }) };
          });
        });
        assert.ok(rulerData.length > 0, `At least one ruler has space: ${viewport.width}/${open}`);
        for (const ruler of rulerData) {
          assert.ok(ruler.box.x >= 0 && ruler.box.y >= 0 && ruler.box.right <= viewport.width + 1 && ruler.box.bottom <= viewport.height + 1);
          for (let i = 0; i < ruler.ticks.length; i++) {
            const tick = ruler.ticks[i];
            assert.ok(tick.x >= ruler.box.x - 1 && tick.y >= ruler.box.y - 1 && tick.right <= ruler.box.right + 1 && tick.bottom <= ruler.box.bottom + 1, "Ruler labels fit their band");
            assert.ok(Math.abs(tick.position - (200 + tick.value)) < 0.001, "Displayed coordinates use the actual camera transform");
            if (i) assert.ok(ruler.axis === "X" ? tick.x > ruler.ticks[i - 1].right : tick.y > ruler.ticks[i - 1].bottom, "Labels do not overlap");
          }
        }
        const collisions = await page.evaluate(() => {
          const obstacles = ["workspaceShell", "contextInspector", "mobileDock", "hud", "mapStatusStrip", "minimapContainer"].map((id) => document.getElementById(id)).filter((element) => {
            const style = getComputedStyle(element); return !element.hidden && style.display !== "none" && style.visibility !== "hidden";
          }).map((element) => element.getBoundingClientRect());
          return Array.from(document.querySelectorAll(".coordinate-ruler:not([hidden]) .ruler-tick")).filter((tick) => {
            const box = tick.getBoundingClientRect();
            return obstacles.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
          }).length;
        });
        assert.equal(collisions, 0, "No ruler label overlaps a visible workspace/HUD widget");
        if (!open) {
          assert.ok(await page.evaluate(() => !!(document.getElementById("historyTools").compareDocumentPosition(document.getElementById("workspaceTools")) & Node.DOCUMENT_POSITION_FOLLOWING)), "History precedes action tools in DOM/keyboard order");
          assert.equal(await page.locator("#mapStatusStrip").evaluate((e) => e.parentElement.id), viewport.width <= 900 ? "mobileDock" : "hud", "Telemetry shares existing chrome");
          const widths = () => page.locator(".status-chip").evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().width));
          const beforeWidths = await widths();
          await page.evaluate(() => { lastCursor = { x: -123456789, z: 987654321 }; updateStatusStrip(); });
          assert.deepEqual(await widths(), beforeWidths, "Changing coordinate digit counts cannot resize telemetry slots");
          assert.equal(await page.locator("#minimapContainer").evaluate((e) => e.classList.contains("app-panel")), false, "Minimap has no decorative panel frame");
          assert.equal(await page.locator("#mapScaleChip").count(), 0, "Distance scale is removed");
          const xBand = await page.locator(".ruler-x").boundingBox();
          assert.ok(xBand.height <= 18 && xBand.y <= 3, "Compact ruler stays at the top edge, independent of minimap");
          if (viewport.width <= 900) {
            const zBand = await page.locator(".ruler-z").boundingBox();
            if (zBand) assert.ok(zBand.x <= 3, "Mobile vertical ruler hugs the edge");
          }
          const major = page.locator(".ruler-x .ruler-mark.is-major").first();
          assert.ok(await page.locator(".ruler-x .ruler-mark:not(.is-major)").count() > await page.locator(".ruler-x .ruler-mark.is-major").count());
          const mark = await major.boundingBox();
          const png = (await page.screenshot()).toString("base64");
          const pixels = await page.evaluate(async ({ png, mark }) => {
            const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
            const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
            const x = Math.round(mark.x), y = Math.floor(mark.y + mark.height - 2);
            return [Array.from(ctx.getImageData(x, y, 1, 1).data), Array.from(ctx.getImageData(x + 2, y, 1, 1).data)];
          }, { png, mark });
          assert.notDeepEqual(pixels[0], pixels[1], `Major tick paints distinct pixels: ${theme}/${viewport.width} ${JSON.stringify({mark, style:await major.evaluate((e)=>({bg:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e).opacity}))})}`);
        }
        if (!open) await page.screenshot({ path: resolve(output, `2026-11-10-${theme}-${viewport.width}x${viewport.height}.png`) });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await settle();
  await page.evaluate(() => {
    offsetX = 650; offsetY = 440; zoom = 1; setWorkspaceCollapsed(true, false);
    document.getElementById("showGrid").checked = false; document.getElementById("showAxes").checked = false; draw();
  }); await settle();
  assert.ok((await labels()).length > 0, "Rulers are independent of grid and axis visibility");
  assert.deepEqual(await snapshot(), original, "Ruler rendering never changes map content, history or the camera");
  await page.evaluate(() => workspaceState.select({ kind: "pin", id: "pin" })); await settle();
  const rulerEdge = await page.locator(".ruler-x").boundingBox();
  const inspectorEdge = await page.locator("#contextInspector").boundingBox();
  assert.ok(rulerEdge.x + rulerEdge.width <= inspectorEdge.x, "Desktop rulers reserve the inspector edge");
  await page.setViewportSize({ width: 390, height: 844 }); await settle();
  await page.evaluate(() => {
    window.savedRulerViewport = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: 400, offsetTop: 20 } });
    mobileLayout.refresh(); coordinateRulers.refresh();
  }); await settle();
  for (const ruler of await page.locator(".coordinate-ruler:not([hidden])").all()) {
    const bounds = await ruler.boundingBox();
    assert.ok(bounds.y >= 20 && bounds.y + bounds.height <= 420, "Rulers stay in the visual viewport above keyboard and sheets");
  }
  await page.evaluate(() => Object.defineProperty(window, "visualViewport", { configurable: true, value: window.savedRulerViewport }));
  await page.setViewportSize({ width: 1440, height: 900 }); await settle();
  await page.evaluate(() => { workspaceState.select(null); draw(); });
  await page.evaluate(() => { offsetX = 1e12; offsetY = -1e12; draw(); }); await settle();
  const largeLabels = await labels();
  assert.ok(largeLabels.length > 0 && new Set(largeLabels).size === largeLabels.length, "Large coordinate labels stay readable and distinct");
  await page.evaluate(() => { offsetX = 250.5; offsetY = 250.5; zoom = 1000; draw(); }); await settle();
  assert.ok((await labels()).some((label) => label.includes(".")), "Fractional ruler labels render without losing precision");
  await page.locator('[data-workspace-tab="map-view"]').click();
  await page.locator('label[aria-label="Show coordinate rulers"]').click(); await settle();
  assert.equal(await page.locator("#showRulers").isChecked(), false);
  assert.equal(await page.locator("#coordinateRulers").isVisible(), false);
  assert.equal(await page.evaluate(() => collectSettingsSnapshot().showRulers), false);
  await page.reload({ waitUntil: "domcontentloaded" }); await settle();
  assert.equal(await page.locator("#showRulers").isChecked(), false, "Explicit visibility persists across reload");
  if (!await page.locator('label[aria-label="Show coordinate rulers"]').isVisible()) await page.locator('[data-workspace-tab="map-view"]').click();
  await page.locator("#showRulers").focus();
  assert.equal(await page.evaluate(() => document.activeElement.id), "showRulers", "Native ruler switch receives keyboard focus");
  await page.keyboard.press("Space"); await settle();
  assert.equal(await page.locator("#showRulers").isChecked(), true, "Visibility toggle works from the keyboard");
  assert.equal(await page.locator("#coordinateRulers").isVisible(), true);
  assert.equal(await page.locator("#coordinateRulers").evaluate((element) => getComputedStyle(element).pointerEvents), "none");
  assert.deepEqual(errors, []);
  console.log("Ruler browser checks passed: default visibility, pan/zoom, bounds, three themes, responsive panels, independent grid toggle, persistence and unchanged map/history.");
} finally { await browser.close(); }
