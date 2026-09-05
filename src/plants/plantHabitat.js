import { randomSequence } from './oleasterModel.js';
import {ecologyPatch,plantDrynessAt} from './plantEcology.js';
const clamp = x => Math.max(0,Math.min(1,x));
// Adapter contract matches the terrain query in the coast branch; no terrain mesh dependency.
export function scatterPlants(query,{seed=23,count=32,extent=10,spacing=1.15,dryness=.2,pathMask=()=>0,pointAt=(x,z)=>({x,z}),ecology={}}={}) {
  const random=randomSequence(seed),plants=[],grid=new Map(),cell=Math.max(.1,spacing);
  const [width,depth]=Array.isArray(extent)?extent:[extent,extent];
  const key=(x,z)=>`${x},${z}`;
  for(let attempt=0;attempt<count*100&&plants.length<count;attempt++){
    const {x,z}=pointAt((random()-.5)*width,(random()-.5)*depth),s=query.surfaceAt(x,z,0);
    const colonies=.35+.65*ecologyPatch(x,z,Math.max(3,Math.min(width,depth)*.16),seed+89);
    const suitability=clamp(s.vegetation?.shrubs??1)*(1-clamp(s.wetness??0))*clamp((s.normal.y-.64)/.28)*(1-clamp(pathMask(x,z)))*colonies;
    if(s.height<0||random()>suitability)continue;
    const gx=Math.floor(x/cell),gz=Math.floor(z/cell);let crowded=false;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const p of grid.get(key(gx+i,gz+j))??[])if(Math.hypot(p.x-x,p.z-z)<spacing)crowded=true;
    if(crowded)continue;
    const habitat=s.vegetation?.dryness??.5;
    const p={x,y:s.height,z,rootDepth:.065,scale:.65+random()*.55,yaw:random()*Math.PI*2,seed:seed+plants.length*17,habitat,dryness:plantDrynessAt(x,s.height,z,{dryness,...ecology},habitat),exposure:s.wind?.exposure??1};
    plants.push(p);const bucket=grid.get(key(gx,gz))??[];bucket.push(p);grid.set(key(gx,gz),bucket);
  }
  return plants;
}
export function plantGroundCover(x,z,plants,pathMask=()=>0) {
  let litter=0,vigor=0;
  for(const p of plants){const weight=Math.exp(-((x-p.x)**2+(z-p.z)**2)/(p.scale*p.scale*.5));litter=Math.max(litter,weight*(.3+.7*p.dryness));vigor=Math.max(vigor,weight*(1-p.dryness));}
  const path=clamp(pathMask(x,z));return {litter:litter*(1-path),vigor:vigor*(1-path),path};
}
export function createPlantLabTerrain(slope=0,dryness=.2,pathWidth=.7,extent=10) {
  const heightAt=(x,z)=>.12+slope*(x+extent*.5)+.16*(Math.sin(x*.65+z*.28)+1);
  return {heightAt,pathMask:(x,z)=>pathWidth<=0?0:1-clamp((Math.abs(z-Math.sin(x*.45)*.7)-pathWidth*.5)/.3),surfaceAt(x,z){
    const dx=slope+.104*Math.cos(x*.65+z*.28),dz=.0448*Math.cos(x*.65+z*.28),length=Math.hypot(dx,1,dz),moisture=clamp(.4-z*.07);
    return {height:heightAt(x,z),normal:{x:-dx/length,y:1/length,z:-dz/length},wetness:0,vegetation:{shrubs:.7+.3*moisture,dryness:clamp(dryness+.18-moisture*.4)},wind:{exposure:.8+clamp(x/(extent*.5))*.2}};
  }};
}
