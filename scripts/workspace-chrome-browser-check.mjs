import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chooseObjectKind, choosePinView } from './browser-controls.mjs';

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error('Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
const output = fileURLToPath(new URL('../_docs/data/workspace-chrome/', import.meta.url));
await mkdir(output, { recursive: true });
const railGeometry = [];
try {
  for (const [width,height] of [[320,900],[390,900],[844,390],[390,560],[901,900],[1440,900]]) {
    const page = await browser.newPage({ viewport: {width,height}, hasTouch: width <= 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('../index.html', import.meta.url).href);
    const tab = page.locator('[data-workspace-tab="objects"]');
    const tree = page.locator('#layerList');
    const snapshot = () => page.evaluate(() => ({ data: JSON.stringify({pins,drawings,layers}), raw: localStorage.getItem(mapKey(currentMapName)), undo: undoStack.length, redo: redoStack.length }));
    const before = await snapshot();
    for (const theme of ['paper-mint','steel-night','amber-terminal']) {
      await page.evaluate(value => { MapItTheme.setTheme(value); setWorkspaceTab('objects'); },theme);
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#railCollapseBtn').count(),0);
      for (const id of ['layersPanelSection','mapViewPanelSection','settings']) {
        assert.equal(await page.locator(`#${id} > .workspace-section-head, #${id} .workspace-tab-header`).count(),0);
        assert.ok(await page.locator(`#${id}`).getAttribute('aria-label'));
      }
      if (width <= 900) await tab.tap(); else await tab.click();
      await page.waitForTimeout(250);
      assert.equal(await tab.getAttribute('aria-pressed'),'false');
      assert.equal(await tab.getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('[data-workspace-tab].is-active').count(),0);
      if (width <= 900) {
        const treatment = await tab.evaluate(el => { const s=getComputedStyle(el);return {background:s.backgroundColor,shadow:s.boxShadow,mode:document.documentElement.dataset.layerUtilityInput,hover:el.matches(":hover"),focus:el.matches(":focus-visible")}; });
        assert.ok(/(?:0\)|transparent)$/.test(treatment.background), `Touch hover must not mimic selection: ${JSON.stringify(treatment)}`);
        assert.equal(treatment.shadow,'none');
      }
      await tab.focus(); await page.keyboard.press('Space');
      assert.equal(await tab.getAttribute('aria-expanded'),'true');
      assert.equal(await tab.evaluate(el => el === document.activeElement),true);
      await page.keyboard.press('Enter');
      assert.equal(await tab.getAttribute('aria-expanded'),'false');
      await page.keyboard.press('Enter');
      assert.equal(await tab.getAttribute('aria-expanded'),'true');
      const geometry = await page.locator('#appRail').evaluate(rail => {
        const r=rail.getBoundingClientRect(); return [...rail.querySelectorAll('.rail-tab-btn')].map(el=>{
          const b=el.getBoundingClientRect(),i=el.firstElementChild.getBoundingClientRect();
          return {width:b.width,height:b.height,railDelta:b.x+b.width/2-r.x-r.width/2,iconDelta:i.x+i.width/2-b.x-b.width/2};
        });
      });
      for (const item of geometry) {
        assert.ok(item.width >= 44 && item.height >= 44);
        assert.ok(Math.abs(item.iconDelta) <= 1);
        if(width>900)assert.ok(Math.abs(item.railDelta) <= 1, `Rail centering: ${JSON.stringify(item)}`);
      }
      if(width>900)railGeometry.push({width,theme,geometry});
      const row = tree.locator('.object-layer').first();
      await row.focus(); await page.keyboard.press('ArrowRight');
      if(width>900) {
        assert.equal(await row.locator('.mobile-layer-disclosure').isVisible(),false);
        assert.equal(await row.locator('.desktop-layer-disclosure').isVisible(),true);
        await row.locator('.layer-name').click();
        assert.equal(await row.getAttribute('aria-expanded'),'false');
        await row.focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await row.getAttribute('aria-expanded'),'true');
      }
      await chooseObjectKind(page,'pin');
      await page.locator('#objectSearch').fill('Village');
      await choosePinView(page,'summary');
      const state = await page.evaluate(() => ({selection: workspaceState.get().selection, search:objectSearch.value, kind:objectFilter.value}));
      await page.evaluate(() => {window.chromeTree=document.getElementById('layerList');});
      await choosePinView(page,'detailed'); await choosePinView(page,'summary');
      assert.equal(await page.evaluate(() => chromeTree === document.getElementById('layerList')),true);
      assert.deepEqual(await page.evaluate(() => ({selection:workspaceState.get().selection,search:objectSearch.value,kind:objectFilter.value})),state);
      if(width <= 900) {
        assert.equal(await page.locator('.object-filter-tabs').isVisible(),false);
        assert.ok((await page.locator('#objectSearch').boundingBox()).width >= 40, 'Mobile search retains readable text space');
        const controls = await page.locator('.pin-toolbar-row').evaluate(el => {
          const r=el.getBoundingClientRect();return [...el.children].filter(c=>getComputedStyle(c).display!=='none').map(c=>{
            const b=c.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,ownerRight:r.right};
          });
        });
        for(let i=0;i<controls.length;i++) {
          assert.ok(controls[i].right <= controls[i].ownerRight+1,'Search controls fit the panel');
          if(i)assert.ok(controls[i-1].right <= controls[i].left+1,'Search controls never overlap');
          assert.ok(Math.abs((controls[i].top+controls[i].bottom-controls[0].top-controls[0].bottom)/2)<=2,'Search controls share one aligned row');
        }
      }
      await page.locator('#objectSearch').fill(''); await chooseObjectKind(page,'all');
      // Every last item can scroll entirely clear of the floating action.
      const last=tree.locator('.object-entry').last();
      await last.scrollIntoViewIfNeeded();
      await page.evaluate(() => { const tree=document.getElementById('layerList');tree.scrollTop=tree.scrollHeight; const body=tree.closest('.workspace-section-body');body.scrollTop=body.scrollHeight; });
      const content=await last.boundingBox(),fab=await page.locator('#createLayerBtn').boundingBox();
      assert.ok(fab.width>=44 && fab.height>=44);
      assert.ok(content.y+content.height <= fab.y+1 || content.x+content.width <= fab.x || content.x>=fab.x+fab.width, 'Last row clears floating New layer');
      assert.deepEqual(await snapshot(),before,'Chrome interactions do not change maps or history');
      if([320,1440].includes(width)) await page.screenshot({path:resolve(output,`${theme}-${width}.png`)});
      await page.evaluate(() => {const tree=document.getElementById('layerList');tree.scrollTop=0; tree.closest('.workspace-section-body').scrollTop=0;});
      console.log(`Workspace chrome passed: ${theme} ${width}x${height}`);
    }
    // Responsive restoration keeps the single filter/view state.
    await chooseObjectKind(page,'drawing'); await choosePinView(page,'summary');
    await page.setViewportSize({width:width<=900?1440:390,height:900});
    assert.equal(await page.locator('#objectFilter').inputValue(),'drawing');
    assert.equal(await tree.getAttribute('data-view'),'summary');
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  for(const width of [901,1440]) {
    const entries=railGeometry.filter(item=>item.width===width);
    assert.deepEqual(entries[0].geometry,entries[1].geometry,'Rail geometry stays stable across themes');
    assert.deepEqual(entries[1].geometry,entries[2].geometry,'High-style theme preserves navigation geometry');
  }
} finally {await browser.close();}
