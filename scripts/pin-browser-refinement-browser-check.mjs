import { chooseObjectKind, choosePinView } from "./browser-controls.mjs";
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run directly with the same environment as the other optional browser suites.
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) {
  throw new Error('Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.');
}
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const failures = [];
const output = new URL('../_docs/data/pin-refinement/', import.meta.url);
await mkdir(output, { recursive: true });
const check = (condition, message) => assert.ok(condition, message);
try {
  for (const theme of ['paper-mint', 'steel-night', 'amber-terminal']) for (const width of [320, 390, 901, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 900 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => {
        if (localStorage.getItem('map:Refinement QA')) return;
        localStorage.setItem('map:Refinement QA', JSON.stringify({ version: 3,
          layers: [{ id: 'default', label: 'Base', visible: true, locked: false },
            { id: 'reference', label: 'Reference', visible: false, locked: true }],
          pins: [
            { uid: 'camp', label: 'Camp', id: 'farm', x: 12, z: 34, timestamp: 1790000000000, description: 'Notes remain stored in Summary.', layerId: 'default' },
            { uid: 'long', label: 'A Very Long Settlement Name For Readability', id: 'village', x: 123456789, z: -987654321, timestamp: 1790000000000, layerId: 'default' },
            { uid: 'hidden', label: 'Reference pin', x: 4, z: 8, layerId: 'reference' }],
          drawings: [{ id: 'route', name: 'Route', type: 'path', layerId: 'default', points: [{ x: 0, z: 0 }, { x: 30, z: 30 }], style: { color: '#55bb99', width: 2 } }],
        }));
      });
      await page.goto(new URL('../index.html', import.meta.url).href, { waitUntil: 'domcontentloaded' });
      await page.evaluate(value => { MapItTheme.setTheme(value); setWorkspaceTab('objects', { openPanel: true }); }, theme);
      const tree = page.locator('#layerList'), view = page.locator('#pinRowView');
      const row = id => tree.locator(`[data-object-kind="pin"][data-object-id="${id}"]`);
      const summary = page.locator('#pinResultSummary');
      const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(mapKey(currentMapName)), data: JSON.stringify({ pins, drawings, layers }), undo: JSON.stringify(undoStack), redo: JSON.stringify(redoStack) }));
      const before = await snapshot();
      await page.evaluate(() => {
        window.refinementMapWrites = [];
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith('map:')) refinementMapWrites.push(key);
          return original.call(this, key, value);
        };
      });
      check(/Pins/.test(await page.locator('[data-workspace-tab="objects"]').getAttribute('aria-label')), 'Unified rail is named Pins');
      assert.equal(await page.locator('[data-workspace-panel="objects"]').getAttribute('aria-label'), 'Pins');
      check(/pins/i.test(await tree.getAttribute('aria-label')), 'Tree has a map pins accessible name');
      assert.equal(await view.evaluate(el => el.tagName), 'SELECT');
      assert.equal(await view.getAttribute('aria-label'), 'Row density');
      assert.equal(await view.getAttribute('aria-pressed'), null);
      assert.equal(await tree.getAttribute('data-view'), 'detailed');
      assert.equal(await page.locator('#objectSearch').getAttribute('placeholder'), 'Search');
      assert.equal(await page.locator('#objectSearch').getAttribute('aria-label'), 'Search pins and shapes');
      for (const [kind, count, noun] of [['all', '4/4', 'objects'], ['pin', '3/3', 'pins'], ['drawing', '1/1', 'shapes']]) {
        await chooseObjectKind(page, kind);
        assert.equal(await summary.textContent(), count);
        const [matched, total] = count.split('/');
        const label = await summary.getAttribute('aria-label');
        check(label.startsWith(`${matched} of ${total} `), 'Accessible counts agree with visible counts');
        check(new RegExp(kind === 'drawing' ? 'shapes|drawings' : noun, 'i').test(label), `Truthful ${noun} count name`);
      }
      await page.evaluate(() => setWorkspaceTab('pins'));
      assert.equal(await page.locator('#objectFilter').inputValue(), 'pin', 'Legacy Pins route retains pin restriction');
      const detailed = await row('camp').boundingBox();
      await page.screenshot({ path: resolve(fileURLToPath(output), `${theme}-${width}-detailed.png`) });
      const icon = await row('camp').locator('.pin-icon').boundingBox();
      const title = await row('camp').locator('.pin-label').boundingBox();
      check(Math.abs(icon.y + icon.height / 2 - title.y - title.height / 2) <= 4, 'Icon aligns with main title rather than between date and title');
      await row('camp').click();
      await page.locator('#objectSearch').fill('Camp');
      await page.evaluate(() => {
        window.refinementTree = document.getElementById('layerList');
        window.refinementRow = document.querySelector('[data-object-kind="pin"][data-object-id="camp"]');
      });
      await view.focus();
      await choosePinView(page, 'summary');
      assert.equal(await tree.getAttribute('data-view'), 'summary');
      await page.screenshot({ path: resolve(fileURLToPath(output), `${theme}-${width}-summary.png`) });
      check(await view.evaluate(el => document.activeElement === el), 'View action retains focus');
      check(await page.evaluate(() => refinementTree === document.getElementById('layerList') && refinementRow === document.querySelector('[data-object-kind="pin"][data-object-id="camp"]')), 'Mode switch preserves tree and row identity');
      assert.equal(await page.locator('#objectSearch').inputValue(), 'Camp');
      assert.equal(await page.locator('#objectFilter').inputValue(), 'pin');
      assert.equal(await page.evaluate(() => workspaceState.get().selection.id), 'camp');
      assert.equal(await summary.textContent(), '1/3');
      check((await row('camp').boundingBox()).height < detailed.height, 'Summary reduces item height');
      for (const selector of ['.pin-card-date', '.pin-description']) assert.equal(await row('camp').locator(selector).isVisible(), false, 'Summary hides date and notes');
      if (width < 900) {
        const more = await row('camp').locator('.btn-more').boundingBox();
        check(more.width >= 44 && more.height >= 44, 'Summary touch More retains 44px target');
      }
      const terminal = await row('camp').locator('.btn-more').boundingBox();
      const main = await row('camp').locator('.pin-line-secondary').boundingBox();
      check(main.x + main.width <= terminal.x + 1, 'Summary reserves terminal action width');
      await row('camp').hover();
      const hovered = await row('camp').locator('.pin-line-secondary').boundingBox();
      assert.deepEqual(hovered, main, 'Hover cannot resize Summary content');
      await page.locator('#objectSearch').fill('');
      assert.deepEqual(await row('long').locator('.pin-coord-value').allTextContents(), ['123456789', '-', '-987654321']);
      const coords = await row('long').locator('.pin-coords').boundingBox();
      const valueFit = await row('long').locator('.pin-coord-value').evaluateAll(values => values.every(el => {
        const r = el.getBoundingClientRect(), owner = el.closest('.pin-coords').getBoundingClientRect();
        return r.left >= owner.left - 1 && r.right <= owner.right + 1 && el.scrollWidth <= el.clientWidth + 1;
      }));
      check(valueFit, 'Every complete coordinate value fits visibly inside its group');
      const line = await row('long').locator('.pin-line-secondary').boundingBox();
      check(Math.abs(coords.x + coords.width - line.x - line.width) <= 1, 'Long exact coordinates remain right anchored');
      const geometry = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        return { search: rect('.pin-search-wrap'), filter: rect('#pinFilterBtn'), summary: rect('#pinResultSummary') };
      });
      check(geometry.search.right <= geometry.filter.left + 1 && geometry.filter.right <= geometry.summary.left + 1, 'Search, actual filter and count do not overlap');
      // Compare collapse state without relying on the implementation storage format.
      const parent = tree.locator('[data-object-kind="layer"][data-object-id="reference"]');
      await parent.focus(); await page.keyboard.press('ArrowLeft');
      const collapsed = await parent.getAttribute('aria-expanded');
      assert.equal(collapsed, 'false');
      await choosePinView(page, 'detailed'); await choosePinView(page, 'summary');
      assert.equal(await parent.getAttribute('aria-expanded'), collapsed);
      assert.deepEqual(await snapshot(), before, 'Density/filter/selection/collapse are presentation only');
      assert.deepEqual(await page.evaluate(() => refinementMapWrites), [], 'Presentation changes never call map storage writes');
      assert.equal(await page.evaluate(() => localStorage.getItem('mapitmine.pinRowView')), 'summary');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate(() => setWorkspaceTab('objects', { openPanel: true }));
      assert.equal(await view.inputValue(), 'summary', 'Preference survives reload');
      assert.equal(await tree.getAttribute('data-view'), 'summary');
      const scrollOwners = await page.evaluate(() => {
        const selectors = ['#layerList', '[data-workspace-panel="objects"] .workspace-section-body'];
        return selectors.map(selector => {
          const el = document.querySelector(selector), owner = el.parentElement;
          const r = el.getBoundingClientRect(), outer = owner.getBoundingClientRect(), style = getComputedStyle(owner);
          return { selector, rightGap: outer.right - parseFloat(style.borderRightWidth) - r.right,
            overflow: getComputedStyle(el).overflowY };
        });
      });
      for (const metrics of scrollOwners) {
        check(Math.abs(metrics.rightGap) <= 1, `${metrics.selector}: scroll viewport is flush with owning right edge (${metrics.rightGap}px)`);
      }
      await row('camp').focus();
      const focus = await row('camp').evaluate(el => {
        const r = el.getBoundingClientRect(), owner = document.getElementById('layerList').getBoundingClientRect();
        const style = getComputedStyle(el);
        return { left: r.left - owner.left, right: owner.right - r.right,
          outline: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) };
      });
      check(focus.left >= -1 && focus.right >= -1, 'Focused content remains inside scroll viewport');
      // Keyboard focus uses the same inset row treatment in both modes.
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      const utilitiesBefore = await snapshot();
      const baseLock = tree.locator('[data-object-id="default"] > .layer-row [data-utility-kind="lock"]');
      const hidden = tree.locator('[data-object-id="reference"] > .layer-row [data-utility-kind="visibility"]');
      assert.equal(await hidden.getAttribute('aria-pressed'), 'true', 'Hidden, not visible, is the pressed state');
      await hidden.hover();
      check(await hidden.locator('.layer-utility-preview').isVisible(), 'Hidden utility previews Show on direct hover');
      check(!(await hidden.locator('.layer-utility-state').isVisible()), 'Preview replaces the persistent glyph');
      await page.mouse.move(width - 10, 100);
      await page.locator('#objectSearch').focus();
      assert.equal(await baseLock.evaluate(el => getComputedStyle(el).opacity), '0', 'Mouse default utilities are quiet away from their row');
      for (const pointerType of ['touch', 'pen', 'mouse']) {
        await page.evaluate(type => document.dispatchEvent(new PointerEvent(type === 'mouse' ? 'pointermove' : 'pointerover', { pointerType: type, bubbles: true })), pointerType);
        const metrics = await baseLock.evaluate(el => ({ opacity: getComputedStyle(el).opacity, width: el.getBoundingClientRect().width }));
        assert.equal(metrics.opacity, pointerType === 'mouse' ? '0' : '1', 'Actual input mode overrides hardware fallback');
        if (pointerType !== 'mouse') check(metrics.width >= 44, 'Touch and pen expose full-size utilities');
      }
      assert.deepEqual(await snapshot(), utilitiesBefore, 'Utility preview and input changes never mutate the document or history');
      for (const [tab, selector] of [['maps', '#mapGallery'], ['map-view', '#mapViewPanelSection > .workspace-section-body'], ['settings', '#settings > .workspace-section-body']]) {
        await page.evaluate(value => setWorkspaceTab(value, { openPanel: true }), tab);
        const metrics = await page.locator(selector).evaluate(el => {
          const r = el.getBoundingClientRect(), owner = el.parentElement, outer = owner.getBoundingClientRect();
          return { gap: outer.right - parseFloat(getComputedStyle(owner).borderRightWidth) - r.right,
            overflow: el.scrollWidth - el.clientWidth };
        });
        check(Math.abs(metrics.gap) <= 1, `${tab} scroll viewport reaches its owning edge`);
        check(metrics.overflow <= 1, `${tab} content does not overflow horizontally`);
      }
      // Use actual pointer input: setting the dragging class alone cannot test gesture ownership.
      await page.evaluate(() => setWorkspaceCollapsed(true, false));
      const canvas = await page.locator('#mapCanvas').boundingBox();
      const start = { x: Math.min(width - 35, canvas.x + canvas.width * 0.75), y: 450 };
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x - 25, start.y + 25, { steps: 4 });
      await page.waitForFunction(() => document.body.classList.contains('is-map-dragging'));
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#hud').evaluate(el => getComputedStyle(el).opacity), '1', 'Toolbar remains fully opaque during actual pan');
      assert.equal(await page.locator('#hud').evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Toolbar cannot steal pan input');
      await page.mouse.up();
      await page.waitForFunction(() => !document.body.classList.contains('is-map-dragging'));
      assert.deepEqual(errors, []);
      console.log(`Pin refinement passed: ${theme} ${width}px`);
    } catch (error) {
      failures.push(`${theme} ${width}px: ${error.stack}`);
    } finally { await context.close(); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
} finally { await browser.close(); }
