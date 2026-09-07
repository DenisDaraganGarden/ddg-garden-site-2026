// Parity of the three plant levels in the running laboratory: the same plant,
// the same camera and light, level 0 / 1 / 2 forced through the lab's
// «Детализация» select, screenshots compared by the mean luminance, chroma and
// pixel count of the plant. Denis's rule: a far card may be neither lighter
// nor darker than the geometry it stands for. Needs the lab server
// (PLANT_LAB_URL, default 41215) and a Playwright Chromium; `--assert` turns the
// report into a check, `--out <dir>` keeps the screenshots.
import {chromium} from 'playwright';
import sharp from 'sharp';
import {mkdirSync} from 'node:fs';
const origin=process.env.PLANT_LAB_URL||'http://127.0.0.1:41215',argv=process.argv.slice(2);
const assertMode=argv.includes('--assert'),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null;
if(out)mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true,args:[process.env.PLANT_GPU_BACKEND==='swiftshader'?'--use-angle=swiftshader':'--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
const stats=()=>page.evaluate(()=>JSON.parse(document.querySelector('canvas').dataset.plantStats));
// Plant pixels: those that differ from the row's own background (the outer 8 %
// of columns) by more than 28/255 in ANY of the three levels - one mask for all
// three, so a level whose pixels sink into the background is measured as such
// instead of vanishing from the count. The view buttons (top 48 px) and the
// scale bar (bottom left) are masked. `crown` is the top 60 % of the plant's
// box, so the ground shadow does not count as plant; `n` is the level's own
// count of differing pixels (its silhouette).
async function analyse(pngs){
 const frames=await Promise.all(pngs.map(png=>sharp(png).raw().toBuffer({resolveWithObject:true})));
 const {width:w,height:h,channels:c}=frames[0].info,edge=Math.max(4,Math.floor(w*.08)),mask=new Uint8Array(w*h),own=frames.map(()=>new Uint8Array(w*h));
 let minY=h,maxY=0;
 for(let y=48;y<h-8;y++){
  const bg=frames.map(({data})=>{let r=0,g=0,b=0,k=0;for(let x=0;x<w;x++){if(x>=edge&&x<w-edge)continue;const i=(y*w+x)*c;r+=data[i];g+=data[i+1];b+=data[i+2];k++;}return [r/k,g/k,b/k];});
  for(let x=edge;x<w-edge;x++){
   if(x<130&&y>h-70)continue;
   frames.forEach(({data},f)=>{const i=(y*w+x)*c;if(Math.max(Math.abs(data[i]-bg[f][0]),Math.abs(data[i+1]-bg[f][1]),Math.abs(data[i+2]-bg[f][2]))>28){own[f][y*w+x]=1;mask[y*w+x]=1;}});
   if(mask[y*w+x]){if(y<minY)minY=y;if(y>maxY)maxY=y;}
  }
 }
 const crownEnd=minY+(maxY-minY)*.6;
 return frames.map(({data},f)=>{
  const sum={all:{n:0,lum:0,chroma:0},crown:{n:0,lum:0,chroma:0}};let ownCount=0;
  for(let y=48;y<h-8;y++)for(let x=edge;x<w-edge;x++){
   const p=y*w+x;if(!mask[p])continue;ownCount+=own[f][p];
   const i=p*c,r=data[i],g=data[i+1],b=data[i+2],lum=.2126*r+.7152*g+.0722*b,chroma=Math.max(r,g,b)-Math.min(r,g,b);
   for(const key of y<=crownEnd?['all','crown']:['all']){sum[key].n++;sum[key].lum+=lum;sum[key].chroma+=chroma;}
  }
  const finish=s=>({lum:s.n?s.lum/s.n:0,chroma:s.n?s.chroma/s.n:0});
  return {all:{...finish(sum.all),n:ownCount},crown:finish(sum.crown)};
 });
}
async function level(value){await page.selectOption('select[aria-label="Детализация"]',value);await wait(1300);}
async function view(name){
 if(name==='mid'){await page.getByRole('button',{name:'Общий',exact:true}).click();await wait(400);const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);for(let i=0;i<22;i++){await page.mouse.wheel(0,100);await wait(25);}await wait(700);}
 else{await page.getByRole('button',{name,exact:true}).click();await wait(900);}
}
const rows=[],failures=[];
// The snag is reported, not asserted: bleached bark over pale sand differs from
// its background by less than the mask threshold, so its counts mislead.
const PLANTS=[{collection:'tree',species:null,label:'tree',assert:true},{collection:'tree',species:'Сухостой',label:'snag',assert:false},{collection:'tree',species:'Алыча',label:'plum',assert:true},{collection:'oleaster',species:null,label:'shrub',assert:true}];
for(const plant of PLANTS){
 await page.goto(`${origin}/asset-lab.html?collection=${plant.collection}`);
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.plantStats,undefined,{timeout:60000});await wait(2000);
 if(plant.species){await page.getByRole('button',{name:plant.species,exact:true}).click();await wait(3500);}
 for(const v of ['Общий','mid','Вдали']){
  await level('auto');await view(v);
  const shots=[];
  for(const l of ['0','1','2']){
   await level(l);
   const png=await page.locator('canvas').screenshot();
   if(out)await sharp(png).toFile(`${out}/${plant.label}-${v==='Общий'?'near':v==='mid'?'mid':'far'}-lod${l}.png`);
   shots.push(png);
  }
  const measured=Object.fromEntries((await analyse(shots)).map((m,i)=>[String(i),m]));
  await level('auto');
  const after=await stats(),distance=after.scale?.metres;
  if(v==='Общий'&&after.parity)console.log(`${plant.label.padEnd(6)} parity ${JSON.stringify(after.parity)}`);
  const r=(a,b)=>b>0?a/b:0;
  const row={plant:plant.label,view:v,near:v==='Общий',far:v==='Вдали',l0:measured['0'],l1:measured['1'],l2:measured['2'],
   lum1:r(measured['1'].crown.lum,measured['0'].crown.lum),lum2:r(measured['2'].crown.lum,measured['0'].crown.lum),
   chroma2:r(measured['2'].crown.chroma,measured['0'].crown.chroma),cover2:r(measured['2'].all.n,measured['0'].all.n)};
  rows.push(row);
  const pct=x=>`${x>=1?'+':''}${((x-1)*100).toFixed(1)}%`;
  console.log(`${plant.label.padEnd(6)} ${v.padEnd(6)} ${String(distance??'?').padStart(4)}m lum L0/L1/L2 ${measured['0'].crown.lum.toFixed(1)}/${measured['1'].crown.lum.toFixed(1)}/${measured['2'].crown.lum.toFixed(1)}  L1 ${pct(row.lum1)}  L2 ${pct(row.lum2)}  chroma2 ${pct(row.chroma2)}  cover2 ${pct(row.cover2)}  px ${measured['0'].all.n}/${measured['1'].all.n}/${measured['2'].all.n}`);
  if(measured['0'].all.n<40||!plant.assert)continue; // nothing to compare against at this size, or a report-only plant
  // Luminance over the shared mask is what the eye compares; the silhouette
  // count is a threshold on a blend and stays a report (pale bark on pale sand
  // barely differs from its background).
  // Achieved parity (docs/tree-lab-plan.md): the dome crowns are the loosest at mid range.
  const lumLimit=row.far?.15:.13;
  if(Math.abs(row.lum2-1)>lumLimit)failures.push(`${plant.label} ${v}: card luminance ${pct(row.lum2)} vs geometry (limit ±${lumLimit*100}%)`);
  if(Math.abs(row.lum1-1)>.1)failures.push(`${plant.label} ${v}: mid level luminance ${pct(row.lum1)} (limit ±10%)`);
 }
}
await browser.close();
console.log(JSON.stringify({passed:failures.length===0,failures,errors:errors.slice(0,5)}));
if(assertMode&&(failures.length||errors.length))process.exit(1);
