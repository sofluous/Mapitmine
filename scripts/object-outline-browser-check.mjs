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
  const output = fileURLToPath(new URL("../_docs/data/", import.meta.url));
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("map:Outline QA", JSON.stringify({
      version: 3,
      layers: [
        { id: "default", label: "Base", visible: true, locked: false },
        { id: "locked", label: "Locked", visible: false, locked: true },
        { id: "empty", label: "Empty", visible: true, locked: false },
      ],
      pins: [
        { uid: "alpha", label: "Alpha", x: 0, z: 0, layerId: "default" },
        { uid: "beta", label: "Beta", x: 20, z: 0, layerId: "default" },
        { uid: "locked-pin", label: "Locked pin", x: 30, z: 0, layerId: "locked" },
      ],
      drawings: [{ id: "path", name: "Path", type: "path", layerId: "default", points: [{ x: 0, z: 5 }, { x: 20, z: 5 }], style: { color: "#55bb99", width: 2 } }],
    }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => setWorkspaceTab("layers"));
  const row = (id) => page.locator(`#layerList [role="treeitem"][data-object-id="${id}"]`);
  const focusId = () => page.evaluate(() => document.activeElement.dataset.objectId);
  const selected = () => page.evaluate(() => workspaceState.get().selection);
  const choice = (name) => page.locator(`[data-draft-choice="${name}"]`);
  const camera = await page.evaluate(() => ({ x: offsetX, y: offsetY, zoom }));
  assert.equal(await page.locator('#layerList [role="treeitem"][tabindex="0"]').count(), 1);
  await row("default").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusId(), "alpha");
  await page.keyboard.press("ArrowDown");
  assert.equal(await focusId(), "beta");
  assert.equal(await selected(), null, "Arrows move focus without selecting or recentering");
  assert.deepEqual(await page.evaluate(() => ({ x: offsetX, y: offsetY, zoom })), camera);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await focusId(), "default");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await row("default").getAttribute("aria-expanded"), "false");
  assert.equal(await row("alpha").isVisible(), false);
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusId(), "default", "Expansion preserves the layer's focus through rerender");
  await page.keyboard.press("End");
  assert.equal(await focusId(), "empty");
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusId(), "empty", "Empty expanded layers have no child target");
  await page.keyboard.press("Home");
  assert.equal(await focusId(), "default");
  await page.keyboard.press("a");
  assert.equal(await focusId(), "alpha");
  await page.keyboard.press("Home");
  await page.keyboard.press("p");
  assert.equal(await focusId(), "path");
  assert.equal(await page.evaluate(() => workspaceState.get().tool), "select", "Tree typeahead must not trigger the P canvas shortcut");
  await row("default").dispatchEvent("keydown", { key: "p", isComposing: true });
  assert.equal(await focusId(), "path", "Composition does not navigate the tree");
  await row("path").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => workspaceState.get().selection?.id === "path");
  await page.keyboard.press("ArrowUp");
  assert.equal(await focusId(), "beta");
  assert.equal((await selected()).id, "path");
  await page.locator("#drawingName").fill("Unapplied outline edit");
  await row("beta").focus();
  await page.keyboard.press("Enter");
  await choice("keep").click();
  assert.equal((await selected()).id, "path");
  assert.equal(await page.locator("#drawingName").inputValue(), "Unapplied outline edit");
  await row("default").locator('[data-outline-action="visibility"]').focus();
  await page.keyboard.press("Escape");
  await choice("keep").click();
  assert.equal((await selected()).id, "path", "Escape from layer utilities still guards pending properties");
  await row("beta").focus();
  await page.keyboard.press("F2");
  await choice("discard").click();
  await page.waitForFunction(() => currentEditIndex === 1);
  assert.equal(await page.locator("#pinEditorLabel").evaluate((element) => element === document.activeElement), true);
  await page.locator("#pinEditorCancelBtn").click();
  await row("path").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => workspaceState.get().selection?.id === "path");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => workspaceState.get().selection === null);
  assert.equal(await focusId(), "path");
  await row("locked-pin").focus();
  await page.keyboard.press("F2");
  await page.waitForFunction(() => workspaceState.get().selection?.id === "locked-pin");
  assert.equal(await page.locator("#pinEditorPanel").isVisible(), false, "Locked/hidden objects remain inspectable, not editable");
  await row("default").focus();
  await page.keyboard.press("F2");
  await page.locator("#textPromptInput").fill("Renamed base");
  await page.locator("#textPromptOk").click();
  await page.waitForFunction(() => layers[0].label === "Renamed base");
  assert.equal(await focusId(), "default");
  const visibility = row("default").locator('[data-outline-action="visibility"]');
  await visibility.focus();
  await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.outlineAction), "visibility", "Utility focus survives layer rerenders");
  await page.keyboard.press("Space");
  await page.locator("#objectSearch").fill("Beta");
  assert.equal(await page.locator("#objectSearch").evaluate((element) => element === document.activeElement), true);
  await row("default").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusId(), "beta", "Navigation skips filtered objects");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await row("beta").isVisible(), false, "Filtered branches can still collapse");
  await page.locator("#objectSearch").fill("");
  assert.equal(await row("alpha").isVisible(), true, "Filtering preserves normal expansion preferences");
  await row("alpha").focus();
  await page.evaluate(() => { pins = pins.filter((pin) => pin.uid !== "alpha"); renderLayers(); });
  assert.equal(await focusId(), "default", "Removed focused children fall back to their parent");

  for (const theme of ["paper-mint", "steel-night", "amber-terminal"]) {
    await page.evaluate((theme) => MapItTheme.setTheme(theme), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { setWorkspaceTab("layers"); workspaceState.select({ kind: "drawing", id: "path" }); });
      await page.evaluate(() => document.getElementById("toastStack").replaceChildren());
      await row("beta").focus();
      await page.screenshot({ path: resolve(output, `2026-10-29-outline-${theme}-${width}.png`) });
    }
  }
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => workspaceState.get().selection?.id === "beta");
  assert.equal(await page.locator("#inspectorClose").evaluate((element) => element === document.activeElement), true, "Mobile activation hands focus to the inspector");
  assert.equal(await page.locator("#workspacePanel").isVisible(), false);
  await page.locator('[data-workspace-tab="layers"]').click();
  assert.equal(await page.locator("#layerList").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log("Outline browser checks passed: tree semantics, independent focus, navigation, editing guards, filtering, focus restoration, locked objects, mobile handoff and three-theme screenshots.");
} finally {
  await browser.close();
}
