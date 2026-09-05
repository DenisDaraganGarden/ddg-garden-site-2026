import {coastPoint} from '../terrain/terrainModel.js';
import {coastWeather} from '../terrain/settings.js';
import {scatterPlants} from './plantHabitat.js';
import {normalizeShrubSettings,shrubAssetSettings} from './settings.js';

export function createCoastPlanting(query,definition,input,pathMask=()=>0){
 const s=normalizeShrubSettings(input),asset=shrubAssetSettings(s,{speed:coastWeather(definition).wind,bearing:definition.terrainWindBearing});
 if(!s.shrubsEnabled||!query)return [];
 const margin=Math.min(64,definition.terrainLength*.2),length=Math.min(s.shrubsLength,definition.terrainLength-margin*2),along=Math.max(-definition.terrainLength*.5+margin+length*.5,Math.min(definition.terrainLength*.5-margin-length*.5,s.shrubsAlong));
 const inland=definition.terrainBeachWidth+definition.terrainCliffSlope+s.shrubsInland+s.shrubsWidth*.5;
 return scatterPlants(query,{seed:s.shrubsSeed,count:s.shrubsCount,extent:[s.shrubsWidth,length],spacing:Math.max(.7,s.shrubsSpread*.57),dryness:asset.dryness,ecology:asset,pathMask,
  pointAt:(q,t)=>coastPoint(q+inland,t+along,definition)});
}
