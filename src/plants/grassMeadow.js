import {coastCoordinates,shorePosition,sampleCoastWaveGain,smooth,clamp01} from '../terrain/terrainModel.js';
import {coastProfile} from '../terrain/terrainLandforms.js';
import {coastWeather} from '../terrain/settings.js';
import {ecologyPatch} from './plantEcology.js';
import {GRASS_KINDS} from './grassModel.js';

// The meadow is planted cell by cell around the camera: every 8 m cell is
// seeded by its own coordinates, so a tuft stands where it stood however the
// camera came, and only the cells within reach are ever evaluated. Each kind
// has its niche on the coast profile (docs/grass-lab-plan.md §2).
export const GRASS_CELL=8;
// Tufts per square metre where the niche is perfect, before the sliders.
const BASE_DENSITY={stipa:.55,festuca:.9,leymus:.12,phragmites:.35};
const SHARE_KEY={stipa:'grassStipa',festuca:'grassFestuca',leymus:'grassLeymus',phragmites:'grassPhragmites'};

// Which kinds can live at this cross-shore distance at all: a cheap gate
// before the surface is sampled for every candidate.
function kindsAt(q,f,p){
 const out=[];
 if(q>f.top+1)out.push('stipa');
 if(q>f.foot-1)out.push('festuca');
 if(q>p.terrainBeachWidth*.35&&q<f.top+3)out.push('leymus');
 if(q>-7&&q<f.foot+6)out.push('phragmites');
 return out;
}
function suitability(kind,s,q,sc,p,f){
 if(s.path>.3||s.normal.y<.7)return 0;
 switch(kind){
  case 'stipa':return s.habitat==='plateau'&&s.normal.y>.96?(.5+.5*(s.wind?.exposure??.5))*smooth(f.top+1,f.top+8,q):0;
  case 'festuca':return s.height>.25&&s.normal.y>.9?(.4+.6*(p.terrainSoil??.5))*(s.habitat==='plateau'?1:.7)*smooth(f.foot-1,f.foot+2,q):0;
  case 'leymus':{
   if(s.wetness>.1||s.height<.1)return 0;
   const sand=smooth(p.terrainBeachWidth*.45,p.terrainBeachWidth*.7,q)*(1-smooth(f.foot+1,f.foot+4,q));
   const scree=f.slide*smooth(f.foot-1,f.foot+1,q)*(1-smooth(f.top-1,f.top+2,q));
   return Math.max(sand,scree*.7);
  }
  case 'phragmites':{
   // Reed stands where the wave does not reach: the calm edge, seepage at the
   // bluff foot, the mouths of ravines.
   if(s.height>.35||s.height<-.8)return 0;
   const calm=1-smooth(.25,.6,sampleCoastWaveGain(q,sc,0,p)/Math.max(.02,coastWeather(p).height));
   const edge=smooth(-6,-3,q)*(1-smooth(.8,1.6,q))*calm;
   const seep=f.slide*smooth(f.foot-2,f.foot,q)*(1-smooth(f.foot+3,f.foot+5,q))*.8;
   const mouth=f.ravine*smooth(-2,0,q)*(1-smooth(f.beach*.8,f.beach*1.2,q))*.7;
   return Math.max(edge,seep,mouth);
  }
  default:return 0;
 }
}
export function grassCell(cx,cz,{definition:p,query,settings}){
 let seed=(Math.imul(cx,73856093)^Math.imul(cz,19349663)^Math.imul(settings.grassSeed,2654435761))>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const out=Object.fromEntries(GRASS_KINDS.map(kind=>[kind,[]]));
 const centreX=(cx+.5)*GRASS_CELL,centreZ=(cz+.5)*GRASS_CELL,{u,s:sc}=coastCoordinates(centreX,centreZ,p);
 const f=coastProfile(sc,p),kinds=kindsAt(u-shorePosition(sc,p),f,p);
 for(const kind of kinds){
  const share=settings[SHARE_KEY[kind]];
  const expected=BASE_DENSITY[kind]*share*settings.grassDensity*GRASS_CELL*GRASS_CELL;
  if(expected<=0)continue;
  const candidates=Math.ceil(expected*1.6);
  for(let i=0;i<candidates;i++){
   const x=cx*GRASS_CELL+random()*GRASS_CELL,z=cz*GRASS_CELL+random()*GRASS_CELL;
   const chance=random(),yaw=random()*Math.PI*2,micro=.9+.2*random();
   const local=coastCoordinates(x,z,p),q=local.u-shorePosition(local.s,p);
   const surface=query.surfaceAt(x,z,0);
   const colonies=.3+.7*ecologyPatch(x,z,32,settings.grassSeed+kind.length*7);
   if(chance>suitability(kind,surface,q,local.s,p,f)*colonies/1.6)continue;
   // Height: the meadow field, the site and a little per tuft (plan §6).
   const scale=(.82+.36*ecologyPatch(x,z,45,settings.grassSeed+3))*micro*(kind==='phragmites'?1+.25*clamp01(surface.wetness):1)*(1-.5*clamp01(surface.path));
   out[kind].push({x,y:surface.height,z,rootDepth:.02,scale,yaw,habitat:surface.vegetation?.dryness??.5,exposure:(surface.wind?.exposure??1)*settings.grassFlex});
  }
 }
 return out;
}
// Fills the cells within `radius` of the camera, at most `budget` new ones per
// call, and returns the placements of every filled cell in reach - or null
// when nothing changed. The cache keeps cells for the way back.
export function gatherGrass(cache,cameraX,cameraZ,radius,context,budget=24){
 const cx=Math.floor(cameraX/GRASS_CELL),cz=Math.floor(cameraZ/GRASS_CELL),span=Math.ceil(radius/GRASS_CELL);
 let made=0,pending=false;
 for(let dz=-span;dz<=span&&!pending;dz++)for(let dx=-span;dx<=span;dx++){
  if(dx*dx+dz*dz>span*span)continue;
  const key=`${cx+dx}:${cz+dz}`;
  if(cache.has(key))continue;
  if(made>=budget){pending=true;break;}
  cache.set(key,grassCell(cx+dx,cz+dz,context));made++;
 }
 if(cache.size>4000)for(const key of cache.keys()){const [x,z]=key.split(':').map(Number);if((x-cx)**2+(z-cz)**2>span*span*4)cache.delete(key);if(cache.size<=3000)break;}
 const centre=`${cx}:${cz}`;
 if(made===0&&cache.centre===centre)return null;
 cache.centre=pending?null:centre;
 const out=Object.fromEntries(GRASS_KINDS.map(kind=>[kind,[]]));
 for(let dz=-span;dz<=span;dz++)for(let dx=-span;dx<=span;dx++){
  if(dx*dx+dz*dz>span*span)continue;
  const cell=cache.get(`${cx+dx}:${cz+dz}`);if(!cell)continue;
  for(const kind of GRASS_KINDS)if(cell[kind].length)out[kind].push(...cell[kind]);
 }
 return out;
}
