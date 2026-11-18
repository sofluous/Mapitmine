import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error('Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.');
const { chromium }=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
const output=fileURLToPath(new URL('../_docs/data/minimap-bounds/',import.meta.url));
await mkdir(output,{recursive:true});
try {
  for(const width of [320,390,1440]) for(const theme of ['paper-mint','steel-night','amber-terminal']) {
    const page=await browser.newPage({viewport:{width,height:width===390?560:900},hasTouch:width<900});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(new URL('../index.html',import.meta.url).href);
    await page.evaluate(theme=>{MapItTheme.setTheme(theme);setWorkspaceCollapsed(true,false);},theme);
    await page.evaluate(()=>document.fonts.ready);
    const snapshot=()=>page.evaluate(()=>({raw:localStorage.getItem(mapKey(currentMapName)),data:JSON.stringify({pins,drawings,layers}),undo:undoStack.length,redo:redoStack.length}));
    const before=await snapshot();
    for(const size of ['sm','md','lg']) for(const position of ['top-left','top-right','bottom-left','bottom-right']) for(const detail of ['standard','full']) {
      await page.evaluate(({size,position,detail})=>{
        document.getElementById('minimapSizePreset').value=size;
        document.getElementById('minimapPosition').value=position;
        document.getElementById('minimapDetail').value=detail;
        syncMinimapOverlay();
        for(const [id,value] of Object.entries({minX:-1000,maxX:1000,minZ:-1000,maxZ:1000}))document.getElementById(id).value=value;
        offsetX=innerWidth/2+123456789;offsetY=innerHeight/2-987654321;zoom=1;draw();
      },{size,position,detail});
      const readout=page.locator('.minimap-readout');
      const ordinary=await readout.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(ordinary.scroll<=ordinary.width+1,`${theme}/${width}/${size}: integer endpoints fit without horizontal crowding`);
      assert.ok(await readout.locator('.label-value:visible').evaluateAll(values=>values.every(el=>{
        const range=document.createRange();range.selectNodeContents(el);
        const text=range.getBoundingClientRect(),owner=el.closest('.minimap-readout').getBoundingClientRect();
        return text.left>=owner.left+1&&text.right<=owner.right-1;
      })),'Ordinary endpoint glyphs stay clear of the viewport and inset focus ring');
      const box=await page.locator('#minimapContainer').boundingBox();
      const mini=await page.locator('#minimapCanvas').boundingBox();
      const read=await readout.boundingBox();
      assert.ok(read.x>=box.x-1&&read.x+read.width<=box.x+box.width+1&&read.y>=box.y-1&&read.y+read.height<=box.y+box.height+1);
      assert.ok(position.endsWith('right')?read.x+read.width<=mini.x:read.x>=mini.x+mini.width,'Readout stays inward of corner-anchored canvas');
      if(size==='md'&&position==='top-right'&&detail==='standard') {
        await readout.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});
        await page.screenshot({path:resolve(output,`${theme}-${width}-standard.png`)});
      }
      await page.evaluate(()=>{for(const [id,value] of Object.entries({minX:-1234567890123456,maxX:-1234567000000000,minZ:987654321012345,maxZ:987654400000000}))document.getElementById(id).value=value;draw();});
      assert.equal(await page.locator('#cropMinX').textContent(),'-1234567890123456');
      assert.equal(await page.locator('#cropMaxZ').textContent(),'987654400000000');
      const geometry=await readout.locator('.minimap-axis:visible').evaluateAll(axes=>axes.map(axis=>{
        const [min,max]=axis.querySelectorAll('.label-value');const a=min.getBoundingClientRect(),b=max.getBoundingClientRect();
        return {label:axis.getAttribute('aria-label'),height:a.height,line:parseFloat(getComputedStyle(min).lineHeight),ordered:b.y>=a.bottom,nowrap:getComputedStyle(min).whiteSpace};
      }));
      for(const values of geometry){assert.ok(values.label.includes('minimum to maximum'));assert.equal(values.nowrap,'nowrap');assert.ok(values.ordered);assert.ok(Math.abs(values.height-values.line)<=1,'An exact endpoint never wraps into ambiguous fragments');}
      if(detail==='full'&&position==='top-right'&&size==='sm') {
        await readout.focus();await readout.evaluate(el=>el.scrollLeft=0);
        const overflow=await readout.evaluate(el=>el.scrollWidth>el.clientWidth);
        await page.keyboard.press('ArrowRight');await page.waitForTimeout(120);
        if(overflow)assert.ok(await readout.evaluate(el=>el.scrollLeft>0),'Keyboard exposes the rest of an exceptional unbroken endpoint');
        if(overflow&&width===320&&theme==='paper-mint') {
          await readout.evaluate(el=>el.scrollLeft=0);
          const beforeCamera=await page.evaluate(()=>[offsetX,offsetY,zoom]);
          const session=await page.context().newCDPSession(page);
          const x=read.x+read.width-5,y=read.y+20;
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          for(let step=1;step<=5;step++) {
            await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-step*6,y,id:1}]});
            await page.waitForTimeout(16);
          }
          await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForTimeout(100);await session.detach();
          assert.ok(await readout.evaluate(el=>el.scrollLeft>0),'Touch can inspect long bounds without panning the canvas');
          assert.deepEqual(await page.evaluate(()=>[offsetX,offsetY,zoom]),beforeCamera);
        }
      }
      if(size==='md'&&position==='top-right'&&detail==='full') {
        await readout.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});
        await page.screenshot({path:resolve(output,`${theme}-${width}.png`)});
      }
    }
    assert.deepEqual(await snapshot(),before,'Presentation and camera updates do not write map/history');
    assert.deepEqual(errors,[]);await page.close();console.log(`Minimap bounds passed: ${theme}/${width}, all sizes/corners/details`);
  }
}finally{await browser.close();}
