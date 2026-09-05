import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin=process.env.COAST_URL||'http://127.0.0.1:41213',out=new URL('../output/playwright/coast-plants/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.env.PLANT_GPU_BACKEND==='metal'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 let page=await browser.newPage({viewport:{width:1280,height:960},deviceScaleFactor:1});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__home-scene/publish',route=>{errors.push('Unexpected publication from QA');return route.abort();});
 await page.goto(origin+'/scripts/check-coast-plant-settings.html');await page.waitForFunction(()=>document.body.dataset.status);assert.equal(await page.locator('body').getAttribute('data-status'),'pass');
 // Fresh browser storage only. Authored desktop draft/published file stay intact.
 await page.evaluate(async()=>{
  const {getPublishedHomeSceneSettings,normalizeHomeSceneDraftSettings}=await import('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const source=getPublishedHomeSceneSettings();
  const look={colorSaturation:1,colorExposure:-.2,colorContrast:1,colorGamma:1,timeOfDay:14,sunBearing:270,sunNoonElevation:58,sunTint:'#fff5ea',sunIntensity:1.6,ambientIntensity:.4,ambientColor:'#c5d1dc',hemisphereIntensity:.85,hemisphereSkyColor:'#bfdbed',hemisphereGroundColor:'#82715b',hdrExposure:70,envTint:'#bdc9d6',fogDensity:.03,fogFar:1200,filmEnabled:false,simulationResolution:128,terrainParallax:.7,audio:{...source.audio,enabled:false}};
  source.sceneCameras=source.sceneCameras.map(camera=>({...camera,scene:{...camera.scene,...look}}));
  localStorage.setItem('ddg_home_scene_settings_v1',JSON.stringify(normalizeHomeSceneDraftSettings({...source,...look})));
 });
 await page.goto(origin+'/home/edit');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.plantStats,undefined,{timeout:60000});
 await page.getByRole('button',{name:'Озеленение',exact:true}).click();await page.getByRole('button',{name:'Кустарники',exact:true}).click();await page.getByRole('button',{name:'Посадка',exact:true}).click();
 const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(900);
 const sample=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.plantStats));
 const planting=await sample();assert.ok(planting.plants>400);await page.screenshot({path:new URL('planting.png',out).pathname});
 await page.getByRole('button',{name:'Куст вблизи',exact:true}).click();await wait(850);const close=await sample();assert.ok(close.lods[0]>0,'close inspection uses curved leaves');await page.screenshot({path:new URL('close.png',out).pathname});
 // Live parameter edits must reach materials and keep the same seeded roots.
 const count=close.plants;await page.getByRole('slider',{name:'Сухость',exact:true}).press('End');await wait(450);assert.equal((await sample()).plants,count);await page.screenshot({path:new URL('dry.png',out).pathname});
 await page.getByRole('slider',{name:'Сухость',exact:true}).press('Home');await wait(450);await page.screenshot({path:new URL('fresh.png',out).pathname});
 const devices=[];
 const mobileState=await page.context().storageState();await page.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,storageState:mobileState});
 page=await mobile.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__home-scene/publish',route=>{errors.push('Unexpected publication from QA');return route.abort();});
 await page.goto(origin+'/home/edit');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.plantStats,undefined,{timeout:60000});
 await page.getByRole('button',{name:'Озеленение',exact:true}).click();await page.getByRole('button',{name:'Кустарники',exact:true}).click();
 for(const [width,height]of [[390,844],[768,1024]]){
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'Посадка',exact:true}).click();await wait(650);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);const device=await sample();assert.equal(device.lowPower,true);assert.deepEqual(device.atlas,[512,768]);devices.push({width,height,overflow,...device});await page.screenshot({path:new URL(width===390?'phone.png':'tablet.png',out).pathname});
 }
 assert.deepEqual(errors,[]);const report={passed:true,planting,close,devices,errors};await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
