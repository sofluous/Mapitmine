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
    localStorage.clear();
    const document = {
      version: 3, layers: [{ id: "default", label: "Pins", visible: true, locked: false }], drawings: [],
      pins: [{ uid: "first", label: "First", x: 0, z: 0, layerId: "default" }, { uid: "second", label: "Second", x: 50, z: 0, layerId: "default" }],
    };
    localStorage.setItem("map:A", JSON.stringify(document));
    localStorage.setItem("map:B", JSON.stringify({ ...document, pins: [] }));
  });
  await page.goto(new URL("../index.html", import.meta.url).href, { waitUntil: "domcontentloaded" });
  const choice = (name) => page.locator(`[data-draft-choice="${name}"]`);
  const edit = () => page.locator("#pinEditorLabel");
  const snapshot = () => page.evaluate(() => ({
    map: currentMapName, raw: localStorage.getItem("map:A"),
    selection: workspaceState.get().selection, undo: undoStack.length, redo: redoStack.length,
    linked: !!currentFileHandle,
  }));
  await page.evaluate(() => editPin(0));
  await edit().fill("Pending first");
  await page.locator("#pinEditorX").fill("");
  const beforeKeep = await snapshot();
  let transition = page.evaluate(() => selectMapByName("B"));
  await choice("finish").waitFor();
  assert.equal(await choice("finish").isDisabled(), true);
  await choice("keep").click();
  assert.equal(await transition, false);
  assert.deepEqual(await snapshot(), beforeKeep, "Keep Editing cannot alter storage, selection, history or link");
  assert.equal(await edit().inputValue(), "Pending first");
  await page.evaluate(() => importMapFromFile({ name: "Invalid.json", text: async () => "not JSON" }));
  assert.deepEqual(await snapshot(), beforeKeep, "Invalid imports are rejected before asking to discard work");
  await page.locator("#pinEditorX").fill("0");
  transition = page.evaluate(() => selectMapByName("B"));
  await choice("finish").click();
  assert.equal(await transition, true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("map:A")).pins[0].label), "Pending first");
  await page.evaluate(() => selectMapByName("A"));

  await page.evaluate(() => editPin(0));
  await edit().fill("Retain source draft");
  await page.evaluate(() => setWorkspaceTab("pins"));
  await page.locator('.pin-card[data-index="1"] .pin-label').click();
  await choice("keep").click();
  assert.equal(await page.evaluate(() => currentEditIndex), 0);
  assert.equal(await edit().inputValue(), "Retain source draft");
  transition = page.evaluate(() => editPin(1));
  await choice("finish").click();
  await transition;
  assert.equal(await page.evaluate(() => pins[0].label), "Retain source draft", "Save applies to source pin, not navigation target");
  assert.equal(await page.evaluate(() => currentEditIndex), 1);
  await edit().fill("Discard second draft");
  await page.evaluate(() => { offsetX = 700; offsetY = 400; zoom = 4; draw(); });
  await page.mouse.click(700, 400);
  await choice("keep").click();
  assert.equal(await page.evaluate(() => currentEditIndex), 1);

  transition = page.evaluate(() => deletePin(0));
  await page.locator("#confirmDialogOk").click();
  await choice("keep").click();
  await transition;
  assert.equal(await page.evaluate(() => pins.length), 2, "Keeping the source draft cancels pin deletion");

  transition = page.evaluate(() => importMapFromFile({ name: "Copy.json", text: async () => JSON.stringify({ name: "Imported", pins: [] }) }));
  await choice("keep").click();
  await transition;
  assert.equal(await page.evaluate(() => localStorage.getItem("map:Imported")), null, "Cancelled import leaves no map behind");
  transition = page.evaluate(() => importMapFromFile({ name: "Copy.json", text: async () => JSON.stringify({ name: "Imported", pins: [] }) }));
  await choice("discard").click();
  await transition;
  assert.equal(await page.evaluate(() => currentMapName), "Imported");
  assert.equal(await page.locator("#pinEditorPanel").isVisible(), false);
  await page.evaluate(() => selectMapByName("A"));

  await page.evaluate(() => {
    resetHistoryState();
    pushHistoryState("Fixture change");
    pins[0].label = "Committed label";
    saveCurrentMap();
  });
  await page.evaluate(() => editPin(0));
  await edit().fill("Undo pending");
  const beforeUndo = await snapshot();
  transition = page.evaluate(() => undoPinsChange());
  await choice("keep").click();
  await transition;
  assert.deepEqual(await snapshot(), beforeUndo, "Cancelled Undo leaves stacks and document intact");
  transition = page.evaluate(() => undoPinsChange());
  await choice("discard").click();
  await transition;
  assert.equal(await page.evaluate(() => redoStack.length), 1);
  await page.evaluate(() => editPin(0));
  await edit().fill("Saved before redo");
  transition = page.evaluate(() => redoPinsChange());
  await choice("finish").click();
  await transition;
  assert.equal(await page.evaluate(() => pins[0].label), "Saved before redo");
  assert.equal(await page.evaluate(() => redoStack.length), 0, "Saving invalidates Redo before stack pop");

  await page.evaluate(async () => {
    await editPin(0);
    // Exercise the same live mutation and field sync as canvas pin dragging.
    pins[0].x = 25;
    syncPinEditorPositionInputs(25, pins[0].z);
  });
  transition = page.evaluate(() => undoPinsChange());
  await choice("finish").click();
  await transition;
  assert.equal(await page.evaluate(() => pins[0].x), 0, "Save then Undo restores the pre-drag coordinates");
  await page.evaluate(() => redoPinsChange());
  assert.equal(await page.evaluate(() => pins[0].x), 25);

  await page.evaluate(() => editPin(0));
  await edit().fill("Do not replace with linked file");
  await page.evaluate(() => {
    window.showOpenFilePicker = async () => [{
      getFile: async () => ({ name: "Linked.json", text: async () => JSON.stringify({ name: "Linked", pins: [] }) }),
    }];
  });
  const beforeLinked = await snapshot();
  transition = page.evaluate(() => openMapFromDisk());
  await choice("keep").click();
  await transition;
  assert.deepEqual(await snapshot(), beforeLinked);
  assert.equal(await page.evaluate(() => localStorage.getItem("map:Linked")), null);
  for (const action of ["rename", "duplicate", "create", "delete"]) {
    const beforeAction = await snapshot();
    transition = page.evaluate((action) => {
      if (action === "rename") return renameCurrentMap("Renamed");
      if (action === "duplicate") return duplicateMapByName("A");
      if (action === "create") return createNewMapFlow();
      return deleteMapByName("A");
    }, action);
    if (action === "create") {
      await page.locator("#textPromptInput").fill("New QA map");
      await page.locator("#textPromptOk").click();
    }
    if (action === "delete") await page.locator("#confirmDialogOk").click();
    await choice("keep").click();
    await transition;
    assert.deepEqual(await snapshot(), beforeAction, `Keeping edits cancels map ${action}`);
    assert.deepEqual(await page.evaluate(() => getStoredMapNames()), ["A", "B", "Imported"]);
  }
  await page.locator("#pinEditorCancelBtn").click();
  await page.evaluate(() => setWorkspaceTab("maps"));
  await page.locator('[data-canvas-tool="path"]').click();
  await page.mouse.click(700, 300);
  await page.mouse.click(800, 350);
  transition = page.evaluate(() => selectMapByName("B"));
  await choice("finish").click();
  await transition;
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("map:A")).drawings.length), 1);
  await page.evaluate(async () => {
    await selectMapByName("A");
    await selectWorkspaceObject({ kind: "drawing", id: drawings[0].id });
  });
  await page.locator("#drawingName").fill("Applied before leaving map");
  transition = page.evaluate(() => selectMapByName("B"));
  await choice("finish").click();
  await transition;
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("map:A")).drawings[0].name), "Applied before leaving map");
  assert.deepEqual(errors, []);
  console.log("Pending-change browser checks passed: cancelled map/import/link/history/pin transitions, invalid save, source identity, drawing commits, and Redo invalidation.");
} finally {
  await browser.close();
}
