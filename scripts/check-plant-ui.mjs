import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const origin=process.env.PLANT_LAB_URL||'http://127.0.0.1:7313',output=new URL('../output/playwright/oleaster/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.env.PLANT_GPU_BACKEND==='metal'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={passed:false,checks:[],devices:[]};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${origin}/asset-lab.html?collection=oleaster`);
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.plantStats,undefined,{timeout:30000});
 const sample=()=>page.evaluate(()=>JSON.parse(document.querySelector('canvas').dataset.plantStats));
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 await page.getByRole('button',{name:'Ⅱ Пауза',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.plantStats).paused);await wait(400);
 const paused=await sample();await wait(700);const still=await sample();assert.equal(still.seconds,paused.seconds);assert.equal(still.frame,paused.frame);report.checks.push('pause stops both active time and render frames');
 await page.screenshot({path:new URL('phone.png',output).pathname});
 const layout=()=>page.evaluate(()=>({width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
 const phone=await layout();assert.equal(phone.width,390);assert.equal(phone.overflow,false);report.devices.push(phone);
 assert.equal((await sample()).lods[1],1,'touch profile starts with leaf cards');
 await page.setViewportSize({width:768,height:1024});await wait(300);await page.screenshot({path:new URL('tablet.png',output).pathname});const tablet=await layout();assert.equal(tablet.overflow,false);report.devices.push(tablet);
 await page.getByRole('button',{name:'▶ Продолжить',exact:true}).click();await wait(450);
 // Synthetic Visibility API integration test. It verifies the application's
 // listener/frameloop contract, not the native visibility policy of the host app.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 await wait(350);const hidden=await sample();await wait(700);const frozen=await sample();assert.equal(frozen.seconds,hidden.seconds);assert.equal(frozen.frame,hidden.frame);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await wait(550);const resumed=await sample();assert.ok(resumed.seconds>frozen.seconds&&resumed.seconds-frozen.seconds<1.2);report.checks.push('synthetic visibility stops GPU frames and resumes without a time jump');
 await page.getByRole('button',{name:'Посадка',exact:true}).click();await page.getByRole('tab',{name:'Грунт',exact:true}).click();await page.getByRole('slider',{name:'Размер участка',exact:true}).press('End');await page.getByRole('slider',{name:'Количество кустов',exact:true}).press('End');await page.getByRole('slider',{name:'Уклон',exact:true}).press('End');await wait(500);
 await page.getByRole('button',{name:'Ⅱ Пауза',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.plantStats).paused);await wait(400);await page.screenshot({path:new URL('slope-max.png',output).pathname});report.population=await sample();assert.ok(report.population.plants>=450&&report.population.plants<=512);report.checks.push('maximum planting stays within the population budget');
 await page.getByRole('button',{name:'Ветвление',exact:true}).click();await wait(300);await page.screenshot({path:new URL('root-contact.png',output).pathname});assert.ok((await sample()).lods[0]>=1,'paused camera close-up updates the LOD immediately');
 await page.getByRole('button',{name:'Сброс',exact:true}).click();await page.getByRole('button',{name:'EN',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Narrow-leaf oleaster'}).count(),1);report.checks.push('English control set is available');
 assert.deepEqual(errors,[]);report.checks.push('no browser or shader errors');report.passed=true;
 await fs.writeFile(new URL('ui-report.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
