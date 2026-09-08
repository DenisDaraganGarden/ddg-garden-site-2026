import { createSpitDefinition, sampleSpit, spitHeight, spitJoin } from './terrainSpit.js';
import { normalizeTerrainSettings, coastWeather } from './settings.js';
import { coastProfile, coastPathMask } from './terrainLandforms.js';
export const COAST_OFFSHORE = 96;
export const COAST_STRIP_LENGTH = 64;
export const WORLD_AXES = Object.freeze({ up: '+Y', north: '-Z', east: '+X', south: '+Z', west: '-X', waterline: 0, units: 'metres' });
export const clamp01 = n => Math.max(0,Math.min(1,n));
export const smooth = (a,b,n) => { const t=clamp01((n-a)/(b-a)); return t*t*(3-2*t); };
const mix=(a,b,t)=>a+(b-a)*t;
export function createTerrainDefinition(settings={}) {
  const p=normalizeTerrainSettings(settings), bearing=p.terrainBearing*Math.PI/180;
  const spit=createSpitDefinition(p,shorePosition);
  return {...p, spit, coastOffshore:Math.max(p.terrainShelfExtent,p.terrainSpitEnabled?spit.offshore:96), waterDepth: Math.max(.1,settings.waterDepthMeters??settings.waterDepth??1.25), landX:Math.sin(bearing),landZ:-Math.cos(bearing),alongX:Math.cos(bearing),alongZ:Math.sin(bearing)};
}
export function coastCoordinates(x,z,p) {
  return {u:x*p.landX+z*p.landZ,s:x*p.alongX+z*p.alongZ};
}
export function shorePosition(s,p) {
  const cape = Math.exp(-Math.pow((s-p.terrainCapePosition)/p.terrainCapeWidth,2));
  const originCape = Math.exp(-Math.pow(p.terrainCapePosition/p.terrainCapeWidth,2));
  return p.terrainOffset + p.terrainCurve*(Math.sin(s*.008)+(Math.cos(s*.019)-1)*.24) - p.terrainCapeDepth*(cape-originCape);
}
export function coastPoint(q,s,p) {
  const u=shorePosition(s,p)+q;
  return {x:u*p.landX+s*p.alongX,z:u*p.landZ+s*p.alongZ};
}
export function terrainCoverage(q,s,p) {
  if(!p.terrainEnabled)return 0;
  const ends=1-smooth(p.terrainLength*.5-64,p.terrainLength*.5,Math.abs(s));
  return smooth(-p.coastOffshore,-p.coastOffshore+24,q)*(1-smooth(p.terrainLandWidth-48,p.terrainLandWidth,q))*ends;
}
// The CPU twin of coastShelfDrop in terrainShader.js: the shelf keeps
// deepening past the knee of the near-shore curve. Keep the two identical.
export function coastShelfDrop(q,s,p) {
  const ends=1-smooth(p.terrainLength*.5-64,p.terrainLength*.5,Math.abs(s));
  return -(p.terrainShelfSlope??0)*.01*Math.max(Math.min(-q,p.coastOffshore)-24,0)*ends*(p.terrainEnabled?1:0);
}
export function coastHeight(q,s,p) {
  const seed=p.terrainSeed*.137;
  // The knee of the near-shore curve, as a 1:N run at the water's edge; and on
  // it, bars and shoals stretched along the shore. GLSL twin in terrainShader.js
  // coastHeight - keep the two identical, the water reads both.
  const knee=Math.max(p.terrainShoreKnee??12,1);
  const ramp=-p.waterDepth*(1-Math.exp(Math.min(q,0)/knee));
  const shelf=ramp+(p.terrainBars??0)*.55*(coastPatch(s,q*2.2,46,seed+7)-.5)*smooth(-90,-50,q)*(1-smooth(-14,-4,q))*smooth(.05,.7,-ramp);
  if(q<=0)return spitHeight(mix(-p.waterDepth,shelf,terrainCoverage(q,s,p))+coastShelfDrop(q,s,p),sampleSpit(q+shorePosition(s,p),s,p),terrainCoverage(q,s,p),p,q);
  const f=coastProfile(s,p),t=smooth(f.foot,f.top,q);
  const bench=.4*smooth(f.foot,f.foot+f.width*.58,q)+.6*smooth(f.foot+f.width*.76,f.top,q);
  const scarp=.18*smooth(f.foot,f.foot+f.width*.6,q)+.82*smooth(f.foot+f.width*.5,f.top,q);
  const cliff=mix(mix(scarp,bench,f.slide),t,f.descent);
  const recovery=smooth(f.top,f.top+Math.max(6,f.bank*3),q);
  const slump=(f.slide*.16+f.ravine*.58)*(1-recovery);
  const beach=Math.min(q,f.beach)*.035;
  // A scarp, displaced bench and deposited toe share one continuous field: the
  // toe is a cone at the foot of a slide, spilling onto the beach (GLSL twin in coastHeight).
  const toe=((q-f.foot)/Math.max(f.width,1)-.12)/.26;
  const talus=f.slide*f.bank*.2*p.terrainTalus*Math.exp(-toe*toe)*(1-f.descent)*smooth(1,4,q);
  const flow=Math.sin(s*.72+Math.sin(s*.131+seed)+q*.075);
  const rill=Math.exp(-Math.pow(flow/.24,2));
  const erosion=-rill*Math.min(.42,f.bank*.07)*p.terrainErosion*Math.sin(t*Math.PI)*(1-f.descent*.8);
  const dryNoise=(Math.sin(q*.71+s*.19+seed)*.025+Math.sin(s*.41-q*.27)*.04)*p.terrainRelief*smooth(1,6,q);
  const upland=(Math.sin(s*.081+q*.067+seed)*.18+Math.sin(s*.027-q*.103)*.12)*p.terrainRelief*smooth(f.top,f.top+8,q);
  const height=shelf+beach+cliff*f.bank*(1-slump)+talus+erosion+dryNoise+upland;
  return spitHeight(mix(-p.waterDepth,height,terrainCoverage(q,s,p)),sampleSpit(q+shorePosition(s,p),s,p),terrainCoverage(q,s,p),p,q);
}
// The old flat bed discards itself inside the coast band, where the terrain's
// shelf is the bed. When the whole pond square lies in that band the plane
// would draw nothing at all, so the scene need not mount it.
export function coastBandCoversPond(p,extent) {
  if(!p.terrainEnabled)return false;
  const half=extent*.5;
  for(const x of [-half,0,half])for(const z of [-half,0,half]){
    const {u,s}=coastCoordinates(x,z,p),q=u-shorePosition(s,p);
    if(!(Math.abs(s)<p.terrainLength*.5&&q>-p.coastOffshore&&q<p.terrainLandWidth))return false;
  }
  return true;
}
export function coastPondWeight(q,s,p) {
  const coverage=terrainCoverage(q,s,p);
  return smooth(.4,.8,-coastHeight(q,s,p))*coverage+(1-coverage);
}
export function sampleTerrainHeight(x,z,p) {
  const {u,s}=coastCoordinates(x,z,p);
  return coastHeight(u-shorePosition(s,p),s,p);
}
export function sampleTerrainNormal(x,z,p) {
  const e=.06;
  const dx=(sampleTerrainHeight(x+e,z,p)-sampleTerrainHeight(x-e,z,p))/(2*e);
  const dz=(sampleTerrainHeight(x,z+e,p)-sampleTerrainHeight(x,z-e,p))/(2*e);
  const inv=1/Math.hypot(dx,1,dz);return {x:-dx*inv,y:inv,z:-dz*inv};
}
export function coastSurfCoordinates(q,s,p) {
  const spit=sampleSpit(q+shorePosition(s,p),s,p);
  if(!spit)return {q,s,spit:null};
  const join=spitJoin(q,spit,p),along=mix(s,spit.along+p.terrainSpitPosition,join.blend);
  return {q:join.edge,s:mix(spit.edge>q?spit.along+p.terrainSpitPosition:s,along,join.weight),spit:spit.edge>q||join.weight>.01?spit:null};
}
// The CPU twin of coastWave in terrainShader.js: keep the two identical.
// The envelope of the run-up (GLSL coastWaveGain): how high the water can climb here.
export function sampleCoastWaveGain(q,s,time,p) {
  const coverage=terrainCoverage(q,s,p);
  ({q,s}=coastSurfCoordinates(q,s,p));
  const weather=coastWeather(p);
  const amp=.78+.22*Math.sin(s*.071+time*.23)+.18*Math.sin(s*.029-time*.017+2.4)+(.12*Math.sin(s*.31+time*.4)+.08*Math.sin(s*.53-time*.27))*smooth(-8,0,q);
  const shoal=1+.55*smooth(-14,-4,q);
  return weather.height*amp*shoal*(1-smooth(0,4.5,q))*smooth(-32,-22,q)*coverage;
}
export function sampleCoastWave(q,s,time,p) {
  const gain=sampleCoastWaveGain(q,s,time,p);
  ({q,s}=coastSurfCoordinates(q,s,p));
  const weather=coastWeather(p);
  const jitter=Math.sin(s*.041+time*.03)*.55+Math.sin(s*.017-time*.021+1.7)*.35+Math.sin(s*.093+time*.05+.6)*.2;
  const phase=q*1.15-time*Math.PI*2/weather.period+s*.015+jitter*1.3;
  const skew=smooth(-18,-4,q),w=Math.sin(phase)+.3*skew*Math.sin(2*phase-1.25);
  return w*gain;
}
// Wet sand follows the envelope, not the wave of this second (GLSL coastWetnessAtHeight).
export function sampleCoastWetness(q,s,time,p) {
  const level=Math.max(Math.max(.04,p.terrainWetBand*.035),sampleCoastWaveGain(q,s,time,p));
  return (1-smooth(level,level+.1,coastHeight(q,s,p)))*terrainCoverage(q,s,p);
}
// The CPU twin of coastPatch / coastBedCover in terrainShader.js: weed, silt
// and mussel cover of the bed, 0..1, at depth metres of water over it. Keep
// the two identical; the shader only adds ragged edges on top of this field.
const coastPatch=(x,y,scale,seed)=>{const a=x/Math.max(scale,1),b=y/Math.max(scale,1),phase=seed*.713;const warp=Math.sin(a*1.7-b*1.3+phase)*.7;return .5+.25*Math.sin(a*2.1+b*.9+warp+phase)+.17*Math.sin(b*2.7-a*.6+phase*1.7)+.08*Math.sin(a*4.3+b*3.2-phase*.8);};
export function sampleSeabedCover(q,s,depth,p) {
  const f=depth/Math.max(p.waterDepth,.1),seed=p.terrainSeed*.37,scale=Math.max(p.terrainBedScale??42,4),px=s,py=q*2.2;
  const meadow=coastPatch(px,py,scale,seed+3),calm=coastPatch(px+190,py+70,scale*1.9,seed+11),bank=coastPatch(px+41,py*.6,scale*.45,seed+27);
  const wash=smooth(.25,.6,depth),mask=terrainCoverage(q,s,p);
  return {weed:clamp01((p.terrainWeed??0)*wash*smooth(.12,.45,f)*(1-smooth(.9,1.3,f))*smooth(.5,.75,meadow))*mask,
    silt:clamp01((p.terrainSilt??0)*smooth(.45,1,f)*smooth(.45,.7,calm))*mask,
    mussels:clamp01((p.terrainMussels??0)*wash*smooth(.3,.8,f)*smooth(.62,.8,bank))*mask};
}
// The CPU twin of coastSoil in terrainShader.js: the ground at the foot of the
// bluff. talus: the tongue of loose loam run out of the bluff onto the beach,
// lobed along the shore. seep: ground moisture where the bluff drains - its
// foot, the toes of slides, the mouths of ravines across the beach. Keep the
// two identical; the material only adds the tiers of the face on top.
export function sampleCoastSoil(q,s,p) {
  const f=coastProfile(s,p),seed=p.terrainSeed*.37,amount=p.terrainTalus;
  const reach=(1.2+f.bank*(.3+f.slide*.7))*(.4+amount);
  const lobes=coastPatch(s,(q-f.foot)*1.4,3.5+f.slide*5,seed+53);
  const run=reach*mix(.25,1.35,lobes),d=f.foot-q;
  const talus=(1-smooth(run*.4,run,d))*(1-smooth(f.foot+f.width*.3,f.foot+f.width*.5,q))*Math.min(1,amount*1.6)*(.7+.3*f.slide);
  const patch=mix(.5,1,coastPatch(s+77,q*2,5,seed+41));
  const foot=smooth(f.foot-1.5-reach*.3,f.foot-.2,q)*(1-smooth(f.foot+.5+f.width*.15,f.foot+1.5+f.width*.3,q))*(.3+.7*Math.max(f.slide,f.ravine));
  const mouth=f.ravine*.6*smooth(-2,0,q)*(1-smooth(f.beach*.8,f.beach*1.2,q));
  const mask=terrainCoverage(q,s,p);
  return {talus:clamp01(talus)*mask,seep:clamp01(Math.max(foot,mouth)*patch)*mask};
}
export function sampleTerrainSurface(x,z,p,time=0) {
  const {u,s}=coastCoordinates(x,z,p),q=u-shorePosition(s,p),height=coastHeight(q,s,p),normal=sampleTerrainNormal(x,z,p);
  const wetness=sampleCoastWetness(q,s,time,p);
  const surf=coastSurfCoordinates(q,s,p);
  const shellBand=(1-smooth(3,Math.max(6,p.terrainBeachWidth*.75),surf.q))*smooth(-.4,1,surf.q)*p.terrainShells;
  const slope=Math.acos(clamp01(normal.y));
  const windAngle=p.terrainWindBearing*Math.PI/180;
  const exposure=clamp01(.45+height/Math.max(1,p.terrainCliffHeight)*.55);
  const gust=.85+.1*Math.sin(time*.73+x*.018-z*.013)+.05*Math.sin(time*1.91+s*.037);
  const path=coastPathMask(q,s,p),stable=1-smooth(.12,.65,path);
  const habitat=height>0.25 && slope<.55 ? (q>p.terrainBeachWidth+p.terrainCliffSlope?'plateau':'beach') : height<0?'submerged':'swash';
  const seabed=height<0?sampleSeabedCover(q,s,-height,p):{weed:0,silt:0,mussels:0};
  const soil=sampleCoastSoil(q,s,p);
  return {height,normal,slope,wetness,path,landform:surf.spit?'spit':'mainland',shoreDistance:surf.q,shells:shellBand,seabed,talus:soil.talus,seep:soil.seep,material:normal.y<.88?'sandstone':shellBand>.3?'shell-sand':'sand',friction:mix(.85,.48,wetness),habitat,
    vegetation:{grass:habitat==='plateau'?exposure*stable:0,shrubs:height>.28&&wetness<.15&&q>p.terrainBeachWidth*.85 ? smooth(.67,.94,normal.y)*(1-exposure*.45)*(.3+.7*p.terrainSoil)*stable:0,trees:habitat==='plateau'&&q>p.terrainBeachWidth+15?.5*stable:0,dryness:p.terrainWeathering*(1-soil.seep*.5),soil:p.terrainSoil},
    wind:{x:Math.sin(windAngle)*coastWeather(p).wind*exposure*gust,z:-Math.cos(windAngle)*coastWeather(p).wind*exposure*gust,exposure,gust}};
}
export function createTerrainQuery(p) {
  return { definition:p, heightAt:(x,z)=>sampleTerrainHeight(x,z,p), normalAt:(x,z)=>sampleTerrainNormal(x,z,p), surfaceAt:(x,z,time)=>sampleTerrainSurface(x,z,p,time),
    // Height-field ray query is independent of display LOD. No vertical overhangs.
    raycast(origin,direction,maxDistance=5000) {
      if(![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z,maxDistance].every(Number.isFinite)||maxDistance<=0)return null;
      const magnitude=Math.hypot(direction.x,direction.y,direction.z);if(magnitude<1e-9)return null;
      direction={x:direction.x/magnitude,y:direction.y/magnitude,z:direction.z/magnitude};
      const step=Math.min(1,maxDistance/128); let prev=origin.y-this.heightAt(origin.x,origin.z);
      if(prev<=0)return {point:{...origin},distance:0,normal:this.normalAt(origin.x,origin.z)};
      for(let t=step;t<=maxDistance;t+=step) {
        const x=origin.x+direction.x*t,z=origin.z+direction.z*t,y=origin.y+direction.y*t;
        const gap=y-this.heightAt(x,z);
        if(gap<=0&&prev>0) {
          let a=t-step,b=t;for(let i=0;i<15;i++){const m=(a+b)*.5;const h=this.heightAt(origin.x+direction.x*m,origin.z+direction.z*m);if(origin.y+direction.y*m>h)a=m;else b=m;}
          const distance=(a+b)*.5;const point={x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance};return{point,distance,normal:this.normalAt(point.x,point.z)};
        } prev=gap;
      } return null;
    },
  };
}
