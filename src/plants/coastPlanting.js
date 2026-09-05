import {coastPoint} from '../terrain/terrainModel.js';
import {coastWeather} from '../terrain/settings.js';
import {scatterPlants} from './plantHabitat.js';
import {normalizeShrubSettings,normalizeTreeSettings,shrubAssetSettings,treeAssetSettings} from './settings.js';

// A planting is a strip in coast coordinates: `length` along the shore around
// `along`, `width` across it, `inland` metres behind the bluff's slope.
function coastStrip(query,definition,{seed,count,length:requestedLength,width,along:requestedAlong,inland:requestedInland,spacing,asset,suitability},pathMask){
 const margin=Math.min(64,definition.terrainLength*.2),length=Math.min(requestedLength,definition.terrainLength-margin*2);
 const along=Math.max(-definition.terrainLength*.5+margin+length*.5,Math.min(definition.terrainLength*.5-margin-length*.5,requestedAlong));
 const inland=definition.terrainBeachWidth+definition.terrainCliffSlope+requestedInland+width*.5;
 return scatterPlants(query,{seed,count,extent:[width,length],spacing,dryness:asset.dryness,ecology:asset,pathMask,suitability,
  pointAt:(q,t)=>coastPoint(q+inland,t+along,definition)});
}
const wind=definition=>({speed:coastWeather(definition).wind,bearing:definition.terrainWindBearing});
export function createCoastPlanting(query,definition,input,pathMask=()=>0){
 const s=normalizeShrubSettings(input);
 if(!s.shrubsEnabled||!query)return [];
 return coastStrip(query,definition,{seed:s.shrubsSeed,count:s.shrubsCount,length:s.shrubsLength,width:s.shrubsWidth,along:s.shrubsAlong,inland:s.shrubsInland,
  spacing:Math.max(.7,s.shrubsSpread*.57),asset:shrubAssetSettings(s,wind(definition)),suitability:surface=>surface.vegetation?.shrubs??1},pathMask);
}
export function createCoastTreePlanting(query,definition,input,pathMask=()=>0){
 const t=normalizeTreeSettings(input);
 if(!t.treesEnabled||!query)return [];
 return coastStrip(query,definition,{seed:t.treesSeed+911,count:t.treesCount,length:t.treesLength,width:t.treesWidth,along:t.treesAlong,inland:t.treesInland,
  spacing:t.treesSpacing,asset:treeAssetSettings(input,wind(definition)),suitability:surface=>surface.vegetation?.trees??0},pathMask);
}
