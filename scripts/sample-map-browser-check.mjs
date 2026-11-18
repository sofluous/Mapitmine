import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "_docs/data/sample-map"); await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname.replace(/^\/published\//, "/");
    const target = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) throw new Error("Outside application root");
    const content = await readFile(target);
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(target)] || "application/octet-stream");
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const warn = page => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; });
try {
  for (const url of [pathToFileURL(resolve(root, "index.html")).href, `${base}/published/index.html`]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url().startsWith("file:") || route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const sampleName = await page.evaluate(() => MapitMineSampleMap.name);
    assert.equal(await page.evaluate(() => currentMapName), sampleName);
    assert.equal(await page.locator("#noMapOverlay").isVisible(), false);
    assert.equal(await page.evaluate(() => pins.length), 16);
    assert.equal(await page.evaluate(() => layers.length), 6);
    assert.equal(await page.evaluate(() => drawings.length), 3);
    assert.ok(await page.evaluate(() => zoom >= 0.25 && zoom <= 1));
    assert.equal(await page.evaluate(() => undoStack.length), 0, "Initial framing creates no history");
    assert.equal(await warn(page), false, "Pristine sample leaves without unload warnings");
    const raw = await page.evaluate(() => localStorage.getItem(mapKey(currentMapName)));
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => localStorage.getItem(mapKey(currentMapName))), raw, "Reload never resets the sample");
    assert.equal(await warn(page), false);
    await page.evaluate(() => editPin(0));
    await page.locator("#pinEditorLabel").fill("My sample edit");
    assert.equal(await warn(page), true, "Real unsaved work retains warnings");
    await page.evaluate(() => setWorkspaceTab("maps"));
    await page.locator("#createSampleMapBtn").click();
    await page.locator('[data-draft-choice="keep"]').click();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("map:")).length), 1);
    await page.locator("#pinEditorSaveBtn").click();
    assert.equal(await warn(page), false, "Saved edits do not warn");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => pins[0].label), "My sample edit", "Sample edits survive reload");
    await page.evaluate(() => setWorkspaceTab("maps"));
    await page.locator("#createSampleMapBtn").click();
    assert.notEqual(await page.evaluate(() => currentMapName), sampleName);
    assert.equal(await page.evaluate(() => pins[0].label), "Village Green");
    assert.equal(await page.evaluate(name => JSON.parse(localStorage.getItem(mapKey(name))).pins[0].label, sampleName), "My sample edit");
    assert.equal(await warn(page), false);
    for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(value => { MapItTheme.setTheme(value); setWorkspaceCollapsed(true, false); frameSampleMap(); draw(); }, theme);
      assert.equal(await page.evaluate(() => pins.filter(isPinVisible).every(pin => {
        const x = offsetX + pin.x * zoom, y = offsetY + pin.z * zoom;
        return x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
      })), true, "Sample markers fit the presentation viewport");
      assert.equal(await page.evaluate(() => workspaceState.get().selection), null);
      assert.equal(await page.evaluate(() => undoStack.length), 0);
      await page.screenshot({ path: resolve(output, `${url.startsWith("file:") ? "file" : "http"}-${theme}-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("map:Owner map", JSON.stringify({ version: 3, pins: [], layers: [], drawings: [] })));
  await page.goto(pathToFileURL(resolve(root, "index.html")).href);
  assert.equal(await page.evaluate(() => currentMapName), "Owner map");
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("map:")).length), 1);
  assert.equal(await warn(page), false);
  await context.close();
  console.log("Sample map browser checks passed: file and published subpath, offline assets, fresh start/reload, preserved libraries/edits, guarded fresh copies and real unload warnings.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
