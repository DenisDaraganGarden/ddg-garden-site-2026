import {OLEASTER_DEFAULTS} from './oleasterModel.js';
import {ECOLOGY_DEFAULTS} from './plantEcology.js';

export const DEFAULT_SHRUB_SETTINGS=Object.freeze({
 shrubsEnabled:true,shrubsCount:512,shrubsSeed:23,shrubsLength:120,shrubsWidth:24,shrubsAlong:0,shrubsInland:-5,
 shrubsHeight:1.35,shrubsSpread:1.75,shrubsDensity:.8,shrubsDryness:.42,
 shrubsPatchScale:7,shrubsPatchContrast:.8,shrubsCrownVariation:.48,shrubsCrownScale:.8,shrubsFieldSeed:23,
 shrubsGusts:.7,shrubsLodging:.35,shrubsFlutter:.55,shrubsTranslucency:.65,shrubsRoughness:.73,shrubsRenderDistance:180,
});
export const SHRUB_RANGES={
 shrubsCount:[0,2048,1],shrubsSeed:[1,200,1],shrubsLength:[12,1024,4],shrubsWidth:[4,120,1],shrubsAlong:[-1200,1200,2],shrubsInland:[-20,100,.5],
 shrubsHeight:[.45,2.4,.05],shrubsSpread:[.6,2.5,.05],shrubsDensity:[.1,1,.01],shrubsDryness:[0,1,.01],
 shrubsPatchScale:[1,30,.5],shrubsPatchContrast:[0,1,.01],shrubsCrownVariation:[0,1,.01],shrubsCrownScale:[.2,2,.1],shrubsFieldSeed:[1,200,1],
 shrubsGusts:[0,1,.01],shrubsLodging:[0,1,.01],shrubsFlutter:[0,1,.01],shrubsTranslucency:[0,1.4,.05],shrubsRoughness:[.35,1,.01],shrubsRenderDistance:[40,300,5],
};
export function normalizeShrubSettings(source={}){
 const out={};
 for(const [key,fallback]of Object.entries(DEFAULT_SHRUB_SETTINGS)){
  if(typeof fallback==='boolean'){out[key]=typeof source[key]==='boolean'?source[key]:fallback;continue;}
  const value=Number(source[key]),[min,max,step]=SHRUB_RANGES[key];
  out[key]=source[key]!=null&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
  if(step>=1)out[key]=Math.round(out[key]);
 }
 return out;
}
export function shrubAssetSettings(source,wind){
 const s=normalizeShrubSettings(source);
 return {...OLEASTER_DEFAULTS,...ECOLOGY_DEFAULTS,seed:s.shrubsSeed,height:s.shrubsHeight,spread:s.shrubsSpread,density:s.shrubsDensity,
 dryness:s.shrubsDryness,patchScale:s.shrubsPatchScale,patchContrast:s.shrubsPatchContrast,crownVariation:s.shrubsCrownVariation,crownScale:s.shrubsCrownScale,fieldSeed:s.shrubsFieldSeed,
 gustStrength:s.shrubsGusts,lodging:s.shrubsLodging,flutter:s.shrubsFlutter,translucency:s.shrubsTranslucency,roughness:s.shrubsRoughness,
 wind:Math.min(26,Math.max(0,wind.speed)),windBearing:wind.bearing,lod:'auto',renderDistance:s.shrubsRenderDistance};
}
