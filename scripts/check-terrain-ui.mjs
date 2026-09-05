import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const safari=process.env.TERRAIN_BROWSER==='webkit';
const origin=process.env.COAST_URL||'http://127.0.0.1:41213',out=new URL('../output/playwright/coast-erosion'+(safari?'-webkit':'')+'/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await (safari?webkit:chromium).launch({headless:true,...(safari?{}:{args:process.env.PLANT_GPU_BACKEND==='metal'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})});
try{
 let page=await browser.newPage({viewport:{width:1280,height:960},deviceScaleFactor:1});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__home-scene/publish',route=>{errors.push('Unexpected publication from QA');return route.abort();});
 await page.goto(origin+'/scripts/check-terrain-gpu.html');await page.waitForFunction(()=>document.body.dataset.status);assert.equal(await page.locator('body').getAttribute('data-status'),'pass',await page.locator('body').innerText());const gpu=JSON.parse(await page.locator('body').innerText());
 // Fresh browser storage only. Authored desktop draft/published file stay intact.
 await page.evaluate(async()=>{
  const {getPublishedHomeSceneSettings,normalizeHomeSceneDraftSettings}=await import('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const source=getPublishedHomeSceneSettings();
  const look={colorSaturation:1,colorExposure:-.2,colorContrast:1,colorGamma:1,timeOfDay:14,sunBearing:270,sunNoonElevation:58,sunTint:'#fff5ea',sunIntensity:1.6,ambientIntensity:.4,ambientColor:'#c5d1dc',hemisphereIntensity:.85,hemisphereSkyColor:'#bfdbed',hemisphereGroundColor:'#82715b',hdrExposure:70,envTint:'#bdc9d6',fogDensity:.03,fogFar:1200,filmEnabled:false,simulationResolution:128,terrainParallax:.7,audio:{...source.audio,enabled:false}};
  source.sceneCameras=source.sceneCameras.map(camera=>({...camera,scene:{...camera.scene,...look}}));
  localStorage.setItem('ddg_home_scene_settings_v1',JSON.stringify(normalizeHomeSceneDraftSettings({...source,...look})));
 });
 await page.goto(origin+'/home/edit');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.plantStats,undefined,{timeout:60000});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 await page.getByRole('button',{name:'Ландшафт',exact:true}).click();await page.getByRole('button',{name:'Суша',exact:true}).click();
 const sample=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.ddgTerrain));
 const views=[],transitions=[];

 for(const [label,file]of [['Обвал','landslide'],['Спуск','descent'],['Покров','cover'],['Вдоль берега','coast'],['Обзор','overview']]){
  await page.getByRole('button',{name:label,exact:true}).click();for(let i=0;i<22;i++){await wait(80);transitions.push((await sample()).morphing);}
  await page.screenshot({path:new URL(file+'.png',out).pathname});
  views.push({label,shadow:await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.ddgTerrainShadow)),performance:await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.ddgRuntimeMetrics).performance),...await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.ddgTerrain))});
 }
 // Cover-only edits retain geometry and its collision/placement revision.
 await page.getByRole('button',{name:'Покров',exact:true}).click();await wait(1800);
 await page.getByRole('slider',{name:'Растительный покров грунта',exact:true}).press('Home');await wait(450);await page.screenshot({path:new URL('bare-ground.png',out).pathname});
 await page.getByRole('slider',{name:'Растительный покров грунта',exact:true}).press('End');
 await page.getByRole('button',{name:'Озеленение',exact:true}).click();await page.getByRole('button',{name:'Кустарники',exact:true}).click();
 for(const [key,file]of [['Home','fresh-ground'],['End','dry-ground']]){await page.getByRole('slider',{name:'Сухость',exact:true}).press(key);await wait(750);await page.screenshot({path:new URL(file+'.png',out).pathname});}
 const state=await page.context().storageState();await page.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,storageState:state});
 page=await mobile.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__home-scene/publish',route=>{errors.push('Unexpected publication from QA');return route.abort();});
 const mobileMaps=[];page.on('request',r=>{if(r.url().includes('/textures/azov/'))mobileMaps.push(r.url());});
 await page.goto(origin+'/home/edit');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ddgTerrain,undefined,{timeout:60000});
 await page.getByRole('button',{name:'Ландшафт',exact:true}).click();await page.getByRole('button',{name:'Суша',exact:true}).click();
 const devices=[];
 for(const [width,height]of [[390,844],[768,1024]]){
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'Обвал',exact:true}).click();await wait(2100);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  const terrain=await sample();assert.equal(terrain.textureSize,512);assert.ok(terrain.textureBytes<=24*1024*1024);assert.equal(terrain.lods[0],0);
  devices.push({width,height,overflow,...terrain});await page.screenshot({path:new URL(width===390?'phone.png':'tablet.png',out).pathname});
 }
 assert.ok(mobileMaps.length===18&&mobileMaps.every(url=>url.includes('/mobile/')),'Touch never fetches 1K terrain maps');
 assert.ok(transitions.some(value=>value>0),'Runtime actually traverses intermediate LOD surfaces');
 assert.deepEqual(errors,[]);const report={passed:true,gpu,views,devices,transitionSamples:transitions.filter(n=>n>0).length,mobileMaps:mobileMaps.length,errors};await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
