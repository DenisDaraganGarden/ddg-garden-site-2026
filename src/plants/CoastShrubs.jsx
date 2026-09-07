import React,{useMemo} from 'react';
import {makeOleaster} from './oleasterModel.js';
import {usePlantAtlas,LEAF_ATLAS,BARK_TILE,barkAtlasSpec} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

export default function CoastShrubs({settings,plants,qualityProfile,envMapIntensity=1}){
 const lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 const atlas=usePlantAtlas(useMemo(()=>({...LEAF_ATLAS,bark:barkAtlasSpec('oleaster',lowPower)}),[lowPower]));
 const shapeKey=JSON.stringify({seed:settings.seed,height:settings.height,spread:settings.spread,density:settings.density,leafSize:settings.leafSize,barkTile:BARK_TILE.oleaster});
 const model=useMemo(()=>makeOleaster(JSON.parse(shapeKey)),[shapeKey]);
 const renderSettings=useMemo(()=>({...settings,renderDistance:Math.min(settings.renderDistance,lowPower?110:300)}),[settings,lowPower]);
 return atlas&&plants.length?<group name="coastal-oleaster"><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={plants} sceneTime lowPower={lowPower} envMapIntensity={envMapIntensity}/></group>:null;
}
