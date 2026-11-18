import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROMIUM_EXECUTABLE) throw new Error('Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
const output=fileURLToPath(new URL('../_docs/data/vector-editing/',import.meta.url));
await mkdir(output,{recursive:true});
try {
  for(const width of [390,1440]) for(const theme of ['paper-mint','steel-night','amber-terminal']) {
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('map:Vector QA',JSON.stringify({version:3,layers:[{id:'default',label:'Base',visible:true,locked:false}],pins:[],drawings:[{id:'route',name:'Route',type:'path',layerId:'default',points:[{x:140,z:300},{x:340,z:300}],style:{color:'#55bb99',width:2}}]})));
    await page.goto(new URL('../index.html',import.meta.url).href);
    await page.evaluate(value=>{MapItTheme.setTheme(value);setWorkspaceTab('objects');},theme);
    await page.locator('#pinRowView').selectOption('summary');
    assert.equal(await page.locator('#pinRowView').getAttribute('aria-pressed'),null);
    assert.equal(await page.locator('#layerList').getAttribute('data-view'),'summary');
    await page.locator('#pinRowView').selectOption('detailed');
    assert.equal(await page.locator('#pinRowView').getAttribute('aria-pressed'),null);
    await page.evaluate(()=>{setWorkspaceCollapsed(true,false);offsetX=0;offsetY=0;zoom=1;draw();});
    const camera=await page.evaluate(()=>[offsetX,offsetY,zoom]);
    const count=await page.evaluate(()=>undoStack.length);
    if(width===390){await page.touchscreen.tap(240,300);await page.waitForTimeout(80);await page.touchscreen.tap(240,300);}
    else await page.locator('#mapCanvas').dblclick({position:{x:240,y:300}});
    await page.waitForFunction(()=>workspaceState.get().tool==='vertices');
    assert.equal(await page.locator('#contextInspector').isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>[offsetX,offsetY,zoom]),camera,'Entering vertices never recenters');
    assert.equal(await page.evaluate(()=>undoStack.length),count,'Entering edit mode is not a document edit');
    assert.equal(await page.locator('#drawingApply,#drawingRevert').count(),0);
    if(width===390){
      const session=await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:300,id:1}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y:320,id:1}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await session.detach();
    }else{await page.mouse.move(140,300);await page.mouse.down();await page.mouse.move(160,320,{steps:4});await page.mouse.up();}
    await page.waitForFunction(()=>drawings[0].points[0].x===160);
    assert.deepEqual(await page.evaluate(()=>drawings[0].points[0]),{x:160,z:320});
    assert.equal(await page.evaluate(()=>undoStack.length),count+1,'One completed drag is one history step');
    await page.locator('#undoBtn').click();assert.equal(await page.evaluate(()=>drawings[0].points[0].x),140);
    await page.locator('#redoBtn').click();assert.equal(await page.evaluate(()=>drawings[0].points[0].x),160);
    await page.locator('#drawingName').fill('River route');await page.locator('#drawingName').press('Enter');
    assert.equal(await page.evaluate(()=>drawings[0].name),'River route');
    assert.equal(await page.evaluate(()=>undoStack.length),count+2,'Field completion creates one undoable transaction');
    assert.equal(await page.evaluate(()=>drawingTools.hasPendingEdits()),false);
    await page.locator('#undoBtn').click();assert.equal(await page.evaluate(()=>drawings[0].name),'Route');
    await page.locator('#redoBtn').click();assert.equal(await page.evaluate(()=>drawings[0].name),'River route');
    await page.locator('#drawingName').fill('');await page.locator('#drawingName').press('Enter');
    assert.equal(await page.evaluate(()=>drawings[0].name),'River route');
    assert.equal(await page.evaluate(()=>undoStack.length),count+2,'Invalid fields cannot write history');
    await page.locator('#drawingName').press('Escape');assert.equal(await page.locator('#drawingName').inputValue(),'River route');
    await page.locator('#drawingName').fill('Trail');await page.locator('#drawingName').press('Tab');
    assert.equal(await page.evaluate(()=>drawings[0].name),'Trail','Blur/change commits without Apply');
    await page.locator('#drawingName').fill('unfinished');await page.locator('#drawingName').press('Escape');
    assert.equal(await page.locator('#drawingName').inputValue(),'Trail');
    await page.locator('#drawingName').blur();
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>workspaceState.get().tool),'select');
    assert.equal(await page.evaluate(()=>workspaceState.get().selection?.id),'route','Escape exits vertex mode before deselecting');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>workspaceState.get().selection),null);
    await page.evaluate(()=>{setWorkspaceCollapsed(true,false);workspaceState.select({kind:'drawing',id:'route'});});
    if(width===390){await page.touchscreen.tap(250,310);await page.waitForTimeout(80);await page.touchscreen.tap(250,310);}
    else await page.locator('#mapCanvas').dblclick({position:{x:250,y:310}});
    await page.waitForFunction(()=>workspaceState.get().tool==='vertices');
    const vertexCount=await page.evaluate(()=>undoStack.length);
    await page.locator('#drawingVertexInsert').click();
    assert.equal(await page.evaluate(()=>drawings[0].points.length),3);
    await page.keyboard.press('Delete');
    assert.equal(await page.evaluate(()=>drawings[0].points.length),2,'Delete removes the active vertex');
    assert.equal(await page.evaluate(()=>undoStack.length),vertexCount+2,'Insert and Delete are separate undoable edits');
    await page.keyboard.press('Delete');
    assert.equal(await page.evaluate(()=>undoStack.length),vertexCount+2,'Minimum geometry cannot be deleted');
    await page.evaluate(() => document.getElementById('toastStack').replaceChildren());
    await page.screenshot({path:resolve(output,`${theme}-${width}.png`)});
    assert.deepEqual(errors,[]);
    await page.close();console.log(`Vector editing passed: ${theme}/${width}`);
  }
}finally{await browser.close();}
