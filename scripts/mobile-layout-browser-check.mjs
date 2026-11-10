import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const output = fileURLToPath(new URL("../_docs/data/mobile-layout/", import.meta.url));
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("map:Mobile", JSON.stringify({ version: 3, layers: [{ id: "default", label: "Pins", visible: true, locked: false }],
      pins: [{ uid: "pin", x: 0, z: 0, label: "Pin", layerId: "default" }],
      drawings: [{ id: "route", type: "path", name: "Route", layerId: "default", points: [{ x: 0, z: 0 }, { x: 50, z: 50 }], style: { color: "#55bb99", width: 2 } }],
    }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const box = (id) => page.locator(`#${id}`).boundingBox();
  const check = async (height) => {
    await settle();
    const dock = await box("mobileDock"), rail = await box("appRail"), hud = await box("hud"), status = await box("mapStatusStrip");
    assert.ok(dock.y >= 0 && dock.y + dock.height <= height + 1);
    assert.ok(hud.y + hud.height <= status.y + 1 && status.y + status.height <= rail.y + 1);
    assert.ok(status.height <= 32, "Status remains one quiet row");
    assert.ok(rail.y + rail.height >= height - 2, "Navigation is anchored at the bottom");
    for (const button of await page.locator("#appRail button").all()) {
      const b = await button.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, "All navigation targets are at least 44px");
      assert.ok(b.x >= 0 && b.x + b.width <= (await page.viewportSize()).width);
    }
    const shellOpen = await page.locator("#workspaceShell").evaluate((element) => !element.classList.contains("is-collapsed"));
    if (shellOpen) {
      const panel = await box("workspacePanel");
      assert.ok(panel.y >= 0 && panel.y + panel.height <= dock.y + 1);
    } else if (await page.locator("#contextInspector").isVisible()) {
      const inspector = await box("contextInspector");
      assert.ok(inspector.y >= 0 && inspector.y + inspector.height <= dock.y + 1);
    }
    if (await page.locator("#minimapContainer").isVisible()) {
      const mini = await box("minimapContainer");
      assert.ok(mini.y + mini.height <= dock.y && mini.y < 60, "Minimap occupies the upper canvas");
      assert.ok(mini.y >= 20, "Minimap yields to the edge ruler");
    }
  };
  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((value) => MapItTheme.setTheme(value), theme);
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 420 }]) {
      await page.setViewportSize(viewport); await settle();
      await page.evaluate(() => { setWorkspaceCollapsed(true, false); workspaceState.select(null); });
      await check(viewport.height);
      await page.locator('[data-canvas-tool="path"]').click();
      await check(viewport.height);
      await page.locator("#drawingCancel").click();
      await page.evaluate(() => { workspaceState.select({ kind: "drawing", id: "route" }); drawingTools.refresh(); });
      await check(viewport.height);
      await page.screenshot({ path: resolve(output, `2026-11-10-${theme}-${viewport.width}x${viewport.height}.png`) });
      await page.evaluate(() => setWorkspaceTab("maps", { persist: false }));
      await check(viewport.height);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await settle();
  for (const tab of ["maps", "pins", "layers", "map-view", "settings"]) {
    await page.locator(`[data-workspace-tab="${tab}"]`).tap();
    assert.equal(await page.locator(`[data-workspace-tab="${tab}"]`).getAttribute("aria-pressed"), "true");
  }
  await page.evaluate(() => { setWorkspaceCollapsed(true, false); workspaceState.select(null); });
  await page.locator('[data-workspace-tab="settings"]').focus(); await page.keyboard.press("Enter");
  assert.equal(await page.locator("#workspacePanel").isVisible(), true, "Navigation also works from the keyboard");
  await page.evaluate(() => setWorkspaceCollapsed(true, false));
  for (const detail of ["minimal", "standard", "full"]) {
    await page.evaluate((value) => { document.getElementById("minimapDetail").value = value; syncMinimapOverlay(); }, detail);
    await settle();
    const outer = await box("minimapContainer"), inner = await box("minimapCanvas");
    assert.ok(inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height, "Square minimap canvas fits its compact widget");
    if (detail !== "minimal") {
      const readout = await box("minimapContainer .minimap-readout");
      assert.ok(readout.x >= inner.x + inner.width && readout.y >= outer.y && readout.y + readout.height <= outer.y + outer.height + 1, "Technical readout sits beside the map without escaping its bounds");
    }
  }
  const savedCamera = await page.evaluate(() => ({ offsetX, offsetY, zoom }));
  await page.evaluate(() => { offsetX = 1e12; offsetY = -1e12; draw(); });
  const readout = page.locator(".minimap-readout");
  await readout.focus();
  assert.equal(await page.evaluate(() => document.activeElement.className), "minimap-readout", "Long technical readouts remain keyboard reachable");
  assert.equal(await readout.evaluate((e) => getComputedStyle(e).overflowY), "auto", "Exceptional full-detail values can scroll instead of being cropped");
  await page.keyboard.press("End");
  await page.evaluate((saved) => { ({ offsetX, offsetY, zoom } = saved); draw(); }, savedCamera);
  await page.evaluate(() => {
    setWorkspaceCollapsed(true, false);
    const select = document.getElementById("minimapPosition"); select.value = "bottom-left"; syncMinimapOverlay();
  });
  assert.equal(await page.locator("#minimapPosition").inputValue(), "bottom-left");
  assert.equal(await page.locator("#minimapContainer").getAttribute("data-position"), "top-left");
  assert.equal(await page.evaluate(() => collectSettingsSnapshot().minimapPosition), "bottom-left", "Disk/export payload keeps the chosen position");
  await page.evaluate(() => requestPinPlacement(100, 200, 10, 20));
  await page.locator("#pinEditorLabel").fill("Keyboard viewport draft");
  await page.evaluate(() => {
    window.originalViewport = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: 400, offsetTop: 0 } });
    mobileLayout.refresh();
  });
  await settle();
  const dock = await box("mobileDock");
  assert.ok(dock.y >= 0 && dock.y + dock.height <= 401, "Dock follows an overlay keyboard's visual viewport");
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Keyboard viewport draft");
  await page.locator("#pinEditorSaveBtn").scrollIntoViewIfNeeded();
  const save = await box("pinEditorSaveBtn");
  assert.ok(save.y >= 0 && save.y + save.height <= dock.y + 1, "Editing actions remain scroll-reachable above the dock");
  await page.evaluate(() => closePinEditor());
  await page.evaluate(() => Object.defineProperty(window, "visualViewport", { configurable: true, value: window.originalViewport }));
  await page.setViewportSize({ width: 1440, height: 900 }); await settle();
  assert.equal(await page.locator("#mobileDock").isVisible(), false);
  assert.equal(await page.locator("#workspaceShell > #appRail").count(), 1);
  assert.equal(await page.locator("#minimapContainer").getAttribute("data-position"), "bottom-left");
  assert.ok((await box("hud")).y < 100, "Desktop keeps the top toolbar");
  assert.deepEqual(errors, []);
  console.log("Mobile layout browser checks passed: touch targets, dock/sheets/status, drawing modes, minimap preferences, keyboard-sized viewport and three-theme screenshots.");
} finally { await browser.close(); }
