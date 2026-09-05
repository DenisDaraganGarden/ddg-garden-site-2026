import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const origin=process.env.PLANT_LAB_URL||'http://127.0.0.1:7313';
const browser=await chromium.launch({headless:true,args:process.env.PLANT_GPU_BACKEND==='metal'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.goto(`${origin}/scripts/check-plant-gpu.html`);await page.waitForFunction(()=>window.plantGpuResult,undefined,{timeout:90000});
 const result=await page.evaluate(()=>window.plantGpuResult);
 if(!result.passed||errors.length)throw Error(JSON.stringify({error:result.error,errors}));
 const textures=new URL('../public/textures/plants/',import.meta.url),models=new URL('../assets-source/models/oleaster/',import.meta.url),qa=new URL('../output/playwright/oleaster/',import.meta.url);
 for(const path of [textures,models,qa])await fs.mkdir(path,{recursive:true});
 for(const [name,data]of Object.entries(result.files))await fs.writeFile(new URL(name,name.endsWith('.glb')?models:textures),Buffer.from(data,'base64'));
 for(let i=0;i<result.previews.length;i++)await fs.writeFile(new URL(`gpu-preview-${i}.png`,qa),Buffer.from(result.previews[i].data.split(',')[1],'base64'));
 await fs.writeFile(new URL('manifest.json',models),JSON.stringify(result.manifest,null,2)+'\n');
 const report={...result,files:Object.keys(result.files),previews:result.previews.map(p=>p.name)};
 await fs.writeFile(new URL('gpu-report.json',qa),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:Object.keys(result.checks).length,alphaCoverage:result.alphaCoverage,dprHashes:result.dprHashes,wind:result.wind,variants:result.manifest.variants}));
}finally{await browser.close();}
