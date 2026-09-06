import {OLEASTER_DEFAULTS} from './oleasterModel.js';
import {TREE_DEFAULTS} from './treeModel.js';
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
// The grove stands on the plateau behind the shrubs. Colour, gusts and leaf
// motion are the landscape's, set once under the shrubs; here only the tree.
export const DEFAULT_TREE_SETTINGS=Object.freeze({
 treesEnabled:true,treesCount:14,treesSeed:7,treesLength:220,treesWidth:36,treesAlong:40,treesInland:14,treesSpacing:7,
 treesHeight:6,treesSpread:5.5,treesLean:.55,treesTwist:.4,treesDensity:.8,treesLeafSize:1.8,treesDeadwood:.3,
 treesFlex:.15,treesRenderDistance:600,
});
export const TREE_RANGES={
 treesCount:[0,256,1],treesSeed:[1,200,1],treesLength:[12,1024,4],treesWidth:[6,160,1],treesAlong:[-1200,1200,2],treesInland:[-10,160,.5],treesSpacing:[3,20,.5],
 treesHeight:[2.5,12,.1],treesSpread:[1.5,12,.1],treesLean:[0,1,.01],treesTwist:[0,1,.01],treesDensity:[.1,1,.01],treesLeafSize:[.8,2.4,.05],treesDeadwood:[0,1,.01],
 treesFlex:[0,1,.01],treesRenderDistance:[60,1200,10],
};
// The meadow: four kinds by share, one density, height and flexibility; its
// colour rides the landscape's ecology with an offset from the shrubs' dryness.
export const DEFAULT_GRASS_SETTINGS=Object.freeze({
 grassEnabled:true,grassSeed:23,grassDensity:1,grassStipa:1,grassFestuca:1,grassLeymus:1,grassPhragmites:1,
 grassHeight:1,grassFlex:2.2,grassDryness:0,grassRenderDistance:150,
 grassFieldCoverage:.85,grassFieldContrast:.6,grassFieldWaves:.6,grassFieldSheen:.35,grassFieldScale:9,grassFieldBlend:60,grassFieldHeight:.5,grassFieldFresh:'#ffffff',grassFieldDry:'#ffffff',
});
export const GRASS_RANGES={
 grassSeed:[1,200,1],grassDensity:[0,2,.05],grassStipa:[0,1,.05],grassFestuca:[0,1,.05],grassLeymus:[0,1,.05],grassPhragmites:[0,1,.05],
 grassHeight:[.5,1.6,.05],grassFlex:[.3,4,.1],grassDryness:[-.5,.5,.05],grassRenderDistance:[40,300,5],
 grassFieldCoverage:[0,1,.05],grassFieldContrast:[0,1,.05],grassFieldWaves:[0,1,.05],grassFieldSheen:[0,1,.05],grassFieldScale:[3,30,.5],grassFieldBlend:[20,300,5],grassFieldHeight:[0,1,.05],grassFieldFresh:null,grassFieldDry:null,
};
function normalizeRanged(defaults,ranges,source={}){
 const out={};
 for(const [key,fallback]of Object.entries(defaults)){
  if(typeof fallback==='boolean'){out[key]=typeof source[key]==='boolean'?source[key]:fallback;continue;}
  if(typeof fallback==='string'){out[key]=/^#[0-9a-f]{6}$/i.test(source[key]??'')?source[key]:fallback;continue;}
  const value=Number(source[key]),[min,max,step]=ranges[key];
  out[key]=source[key]!=null&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
  if(step>=1)out[key]=Math.round(out[key]);
 }
 return out;
}
export const normalizeShrubSettings=source=>normalizeRanged(DEFAULT_SHRUB_SETTINGS,SHRUB_RANGES,source);
export const normalizeTreeSettings=source=>normalizeRanged(DEFAULT_TREE_SETTINGS,TREE_RANGES,source);
export const normalizeGrassSettings=source=>normalizeRanged(DEFAULT_GRASS_SETTINGS,GRASS_RANGES,source);
// The landscape's ecology and wind response, shared by every form of the species.
function landscapeAssetSettings(source){
 const s=normalizeShrubSettings(source);
 return {dryness:s.shrubsDryness,patchScale:s.shrubsPatchScale,patchContrast:s.shrubsPatchContrast,crownVariation:s.shrubsCrownVariation,crownScale:s.shrubsCrownScale,fieldSeed:s.shrubsFieldSeed,
  gustStrength:s.shrubsGusts,lodging:s.shrubsLodging,flutter:s.shrubsFlutter,translucency:s.shrubsTranslucency,roughness:s.shrubsRoughness};
}
export function shrubAssetSettings(source,wind){
 const s=normalizeShrubSettings(source);
 return {...OLEASTER_DEFAULTS,...ECOLOGY_DEFAULTS,...landscapeAssetSettings(source),seed:s.shrubsSeed,height:s.shrubsHeight,spread:s.shrubsSpread,density:s.shrubsDensity,
 wind:Math.min(26,Math.max(0,wind.speed)),windBearing:wind.bearing,lod:'auto',renderDistance:s.shrubsRenderDistance};
}
export function treeAssetSettings(source,wind){
 const t=normalizeTreeSettings(source);
 return {...OLEASTER_DEFAULTS,...ECOLOGY_DEFAULTS,...TREE_DEFAULTS,...landscapeAssetSettings(source),seed:t.treesSeed,height:t.treesHeight,spread:t.treesSpread,lean:t.treesLean,twist:t.treesTwist,
 density:t.treesDensity,leafSize:t.treesLeafSize,deadwood:t.treesDeadwood,flex:t.treesFlex,
 wind:Math.min(26,Math.max(0,wind.speed)),windBearing:wind.bearing,lod:'auto',renderDistance:t.treesRenderDistance};
}
export function grassAssetSettings(source,wind){
 const g=normalizeGrassSettings(source),landscape=landscapeAssetSettings(source);
 return {...OLEASTER_DEFAULTS,...ECOLOGY_DEFAULTS,...landscape,dryness:Math.max(0,Math.min(1,landscape.dryness+g.grassDryness)),translucency:.9,roughness:.8,
 wind:Math.min(26,Math.max(0,wind.speed)),windBearing:wind.bearing,lod:'auto',renderDistance:g.grassRenderDistance,wireframe:false,skeleton:false};
}
