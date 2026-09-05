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
  return {...p, waterDepth: Math.max(.1,settings.waterDepthMeters??settings.waterDepth??1.25), landX:Math.sin(bearing),landZ:-Math.cos(bearing),alongX:Math.cos(bearing),alongZ:Math.sin(bearing)};
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
  return smooth(-96,-72,q)*(1-smooth(p.terrainLandWidth-48,p.terrainLandWidth,q))*ends;
}
export function coastHeight(q,s,p) {
  const seed=p.terrainSeed*.137;
  const shelf=-p.waterDepth*(1-Math.exp(Math.min(q,0)/12));
  if(q<=0)return mix(-p.waterDepth,shelf,terrainCoverage(q,s,p));
  const f=coastProfile(s,p),t=smooth(f.foot,f.top,q);
  const bench=.4*smooth(f.foot,f.foot+f.width*.58,q)+.6*smooth(f.foot+f.width*.76,f.top,q);
  const scarp=.18*smooth(f.foot,f.foot+f.width*.6,q)+.82*smooth(f.foot+f.width*.5,f.top,q);
  const cliff=mix(mix(scarp,bench,f.slide),t,f.descent);
  const recovery=smooth(f.top,f.top+Math.max(6,f.bank*3),q);
  const slump=(f.slide*.16+f.ravine*.58)*(1-recovery);
  const beach=Math.min(q,f.beach)*.035;
  // A scarp, displaced bench and deposited toe share one continuous field.
  const talus=f.slide*f.bank*.1*Math.sin(t*Math.PI)*(1-f.descent);
  const flow=Math.sin(s*.72+Math.sin(s*.131+seed)+q*.075);
  const rill=Math.exp(-Math.pow(flow/.24,2));
  const erosion=-rill*Math.min(.42,f.bank*.07)*p.terrainErosion*Math.sin(t*Math.PI)*(1-f.descent*.8);
  const dryNoise=(Math.sin(q*.71+s*.19+seed)*.025+Math.sin(s*.41-q*.27)*.04)*p.terrainRelief*smooth(1,6,q);
  const upland=(Math.sin(s*.081+q*.067+seed)*.18+Math.sin(s*.027-q*.103)*.12)*p.terrainRelief*smooth(f.top,f.top+8,q);
  const height=shelf+beach+cliff*f.bank*(1-slump)+talus+erosion+dryNoise+upland;
  return mix(-p.waterDepth,height,terrainCoverage(q,s,p));
}
// The old flat bed discards itself inside the coast band, where the terrain's
// shelf is the bed. When the whole pond square lies in that band the plane
// would draw nothing at all, so the scene need not mount it.
export function coastBandCoversPond(p,extent) {
  if(!p.terrainEnabled)return false;
  const half=extent*.5;
  for(const x of [-half,0,half])for(const z of [-half,0,half]){
    const {u,s}=coastCoordinates(x,z,p),q=u-shorePosition(s,p);
    if(!(Math.abs(s)<p.terrainLength*.5&&q>-96&&q<p.terrainLandWidth))return false;
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
export function sampleCoastWave(q,s,time,p) {
  const weather=coastWeather(p),phase=q*1.15-time*Math.PI*2/weather.period+s*.015;
  return Math.sin(phase)*weather.height*(1-smooth(0,4,q))*(.76+.24*Math.sin(s*.071+time*.23))*smooth(-32,-22,q)*terrainCoverage(q,s,p);
}
export function sampleCoastWetness(q,s,time,p) {
  const recent=Math.max(sampleCoastWave(q,s,time,p),sampleCoastWave(q,s,time-.7,p)*.85,sampleCoastWave(q,s,time-1.4,p)*.65);
  const margin=Math.max(.04,p.terrainWetBand*.035);
  return (1-smooth(Math.max(margin,recent),Math.max(margin,recent)+.055,coastHeight(q,s,p)))*terrainCoverage(q,s,p);
}
export function sampleTerrainSurface(x,z,p,time=0) {
  const {u,s}=coastCoordinates(x,z,p),q=u-shorePosition(s,p),height=coastHeight(q,s,p),normal=sampleTerrainNormal(x,z,p);
  const wetness=sampleCoastWetness(q,s,time,p);
  const shellBand=(1-smooth(3,Math.max(6,p.terrainBeachWidth*.75),q))*smooth(-.4,1,q)*p.terrainShells;
  const slope=Math.acos(clamp01(normal.y));
  const windAngle=p.terrainWindBearing*Math.PI/180;
  const exposure=clamp01(.45+height/Math.max(1,p.terrainCliffHeight)*.55);
  const gust=.85+.1*Math.sin(time*.73+x*.018-z*.013)+.05*Math.sin(time*1.91+s*.037);
  const path=coastPathMask(q,s,p),stable=1-smooth(.12,.65,path);
  const habitat=height>0.25 && slope<.55 ? (q>p.terrainBeachWidth+p.terrainCliffSlope?'plateau':'beach') : height<0?'submerged':'swash';
  return {height,normal,slope,wetness,path,shells:shellBand,material:normal.y<.88?'sandstone':shellBand>.3?'shell-sand':'sand',friction:mix(.85,.48,wetness),habitat,
    vegetation:{grass:habitat==='plateau'?exposure*stable:0,shrubs:height>.28&&wetness<.15&&q>p.terrainBeachWidth*.85 ? smooth(.67,.94,normal.y)*(1-exposure*.45)*(.3+.7*p.terrainSoil)*stable:0,trees:habitat==='plateau'&&q>p.terrainBeachWidth+15?.5*stable:0,dryness:p.terrainWeathering,soil:p.terrainSoil},
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
