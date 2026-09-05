import { randomSequence } from './oleasterModel.js';
const clamp = x => Math.max(0,Math.min(1,x));
// Adapter contract matches the terrain query in the coast branch; no terrain mesh dependency.
export function scatterPlants(query,{seed=23,count=32,extent=10,spacing=1.15,dryness=.2,pathMask=()=>0}={}) {
  const random=randomSequence(seed),plants=[];
  for(let attempt=0;attempt<count*80&&plants.length<count;attempt++){
    const x=(random()-.5)*extent,z=(random()-.5)*extent,s=query.surfaceAt(x,z,0);
    const suitability=clamp(s.vegetation?.shrubs??1)*(1-clamp(s.wetness??0))*clamp((s.normal.y-.78)/.18)*(1-clamp(pathMask(x,z)));
    if(s.height<0||random()>suitability||plants.some(p=>Math.hypot(p.x-x,p.z-z)<spacing))continue;
    plants.push({x,y:s.height,z,rootDepth:.03,scale:.65+random()*.55,yaw:random()*Math.PI*2,seed:seed+plants.length*17,dryness:clamp(dryness*.7+(s.vegetation?.dryness??dryness)*.3),exposure:s.wind?.exposure??1});
  }
  return plants;
}
export function plantGroundCover(x,z,plants,pathMask=()=>0) {
  let litter=0,vigor=0;
  for(const p of plants){const weight=Math.exp(-((x-p.x)**2+(z-p.z)**2)/(p.scale*p.scale*.5));litter=Math.max(litter,weight*(.3+.7*p.dryness));vigor=Math.max(vigor,weight*(1-p.dryness));}
  const path=clamp(pathMask(x,z));return {litter:litter*(1-path),vigor:vigor*(1-path),path};
}
export function createPlantLabTerrain(slope=0,dryness=.2,pathWidth=.7) {
  const heightAt=(x,z)=>.12+slope*(x+5)+.16*(Math.sin(x*.65+z*.28)+1);
  return {heightAt,pathMask:(x,z)=>pathWidth<=0?0:1-clamp((Math.abs(z-Math.sin(x*.45)*.7)-pathWidth*.5)/.3),surfaceAt(x,z){
    const dx=slope+.104*Math.cos(x*.65+z*.28),dz=.0448*Math.cos(x*.65+z*.28),length=Math.hypot(dx,1,dz),moisture=clamp(.4-z*.07);
    return {height:heightAt(x,z),normal:{x:-dx/length,y:1/length,z:-dz/length},wetness:0,vegetation:{shrubs:.7+.3*moisture,dryness:clamp(dryness+.18-moisture*.4)},wind:{exposure:.8+clamp(x/5)*.2}};
  }};
}
