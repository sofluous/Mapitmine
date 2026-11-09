import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
    if (localStorage.getItem("map:A")) return;
    localStorage.setItem("map:A", JSON.stringify({ version: 3,
      pins: [{ uid: "p", label: "Pin", x: 0, z: 0, layerId: "default" }],
      layers: [{ id: "default", label: "Pins", visible: true, locked: false }], drawings: [],
    }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const warn = () => page.evaluate(() => {
    const before = JSON.stringify(localStorage);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    if (JSON.stringify(localStorage) !== before) throw new Error("Unload must not write storage");
    return event.defaultPrevented;
  });
  assert.equal(await warn(), false, "Clean local maps leave without a warning");
  await page.evaluate(() => { markDirty(); saveCurrentMap(); });
  assert.equal(await warn(), false, "Locally persisted changes need no file link");
  await page.evaluate(() => { currentFileHandle = {}; clearDirty(); });
  await page.evaluate(() => editPin(0));
  assert.equal(await warn(), false, "Unchanged existing pin fields are safe");
  await page.locator("#pinEditorLabel").fill("Changed");
  assert.equal(await warn(), true);
  await page.locator("#pinEditorLabel").fill("Pin");
  assert.equal(await warn(), false);
  await page.locator("#pinEditorX").fill("");
  assert.equal(await warn(), true);
  await page.locator("#pinEditorX").fill("0");
  await page.locator("#pinEditorY").focus();
  await page.keyboard.type("-");
  assert.equal(await page.locator("#pinEditorY").evaluate((field) => field.validity.badInput), true);
  assert.equal(await warn(), true, "Invalid optional number fields are not normalized away");
  await page.locator("#pinEditorCancelBtn").click();
  assert.equal(await warn(), false);
  await page.evaluate(() => { currentFileHandle = null; clearTimeout(_diskSaveTimer); });
  await page.evaluate(() => requestPinPlacement(700, 400, 10, 20));
  assert.equal(await warn(), true);
  await page.locator("#pinEditorSaveBtn").click();
  assert.equal(await warn(), false);

  await page.evaluate(() => drawingTools.start("path"));
  assert.equal(await warn(), false, "Armed drawing tool without points is safe");
  await page.mouse.click(700, 300);
  assert.equal(await warn(), true, "Even a single unfinished vertex is pending work");
  await page.locator("#drawingCancel").click();
  assert.equal(await warn(), false);
  await page.evaluate(() => drawingTools.start("line"));
  await page.mouse.click(700, 300);
  await page.mouse.click(800, 350);
  assert.equal(await warn(), false);
  await page.locator("#drawingName").fill("Applied line");
  assert.equal(await warn(), true);
  await page.locator("#drawingApply").click();
  assert.equal(await warn(), false);
  await page.evaluate(() => { pins[0].label = "Not persisted"; });
  assert.equal(await warn(), true);
  await page.evaluate(() => saveCurrentMap());
  assert.equal(await warn(), false);
  const stored = await page.evaluate(() => localStorage.getItem("map:A"));
  await page.evaluate(() => localStorage.removeItem("map:A"));
  assert.equal(await warn(), true);
  await page.evaluate((raw) => localStorage.setItem("map:A", raw), stored);
  assert.equal(await warn(), false);

  await page.evaluate(() => {
    currentFileHandle = { createWritable: async () => { throw new Error("Simulated file denial"); } };
    markDirty();
  });
  await page.evaluate(() => saveMapToDisk());
  assert.equal(await warn(), true, "Failed linked saves remain unsafe");
  await page.evaluate(() => {
    currentFileHandle = { createWritable: async () => ({
      write: () => new Promise((resolve) => { window.finishTestWrite = resolve; }), close: async () => {},
    }) };
  });
  const saving = page.evaluate(() => saveMapToDisk());
  await page.waitForFunction(() => typeof window.finishTestWrite === "function");
  await page.evaluate(() => {
    pins[0].label = "Newer edit";
    markDirty(); saveCurrentMap(); clearTimeout(_diskSaveTimer);
    window.finishTestWrite();
  });
  await saving;
  assert.equal(await warn(), true, "An older completed file write cannot clear newer dirty changes");
  await page.evaluate(async () => {
    currentFileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    await saveMapToDisk();
  });
  assert.equal(await warn(), false, "Latest completed linked write clears its own dirty state");
  await page.evaluate(() => { currentFileHandle = null; clearTimeout(_diskSaveTimer); });

  let dialogs = 0;
  let handled = Promise.resolve();
  page.on("dialog", (dialog) => {
    if (dialog.type() !== "beforeunload") errors.push(`Unexpected dialog: ${dialog.type()}`);
    dialogs++;
    handled = dialog.dismiss();
  });
  await page.evaluate(() => editPin(0));
  await page.locator("#pinEditorLabel").fill("Keep on reload");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 5000 }).catch((error) => {
    const cancelledByWarning = dialogs === 1 && error.name === "TimeoutError";
    if (!cancelledByWarning && !error.message.includes("ERR_ABORTED")) throw error;
  });
  await handled;
  assert.equal(dialogs, 1, "A real reload requests the browser warning after user interaction");
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Keep on reload");
  await page.locator("#pinEditorCancelBtn").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(dialogs, 1, "Discarded drafts permit a clean local reload without warning");
  await page.evaluate(() => editPin(0));
  await page.locator("#pinEditorLabel").click();
  await page.locator("#pinEditorLabel").fill("Keep on close");
  assert.equal(await warn(), true);
  const cdp = await page.context().newCDPSession(page);
  const closingDialog = page.waitForEvent("dialog", { timeout: 5000 }).then(() => true, () => false);
  await cdp.send("Page.close");
  assert.equal(await closingDialog, true, "Activated close requests a native warning");
  await handled;
  assert.equal(page.isClosed(), false, "Dismissing the close warning retains the page and draft");
  assert.equal(await page.locator("#pinEditorLabel").inputValue(), "Keep on close");
  assert.deepEqual(errors, []);
  console.log("Unload browser checks passed: draft/storage/link states, invalid fields, stale-write protection, actual reload/close dialogs and clean reload.");
} finally {
  await browser.close();
}
