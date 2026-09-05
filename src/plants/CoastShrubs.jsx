import React,{useMemo} from 'react';
import {makeOleaster} from './oleasterModel.js';
import {usePlantAtlas} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

export default function CoastShrubs({settings,plants,qualityProfile}){
 const atlas=usePlantAtlas(),lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 const shapeKey=JSON.stringify({seed:settings.seed,height:settings.height,spread:settings.spread,density:settings.density,leafSize:settings.leafSize});
 const model=useMemo(()=>makeOleaster(JSON.parse(shapeKey)),[shapeKey]);
 const renderSettings=useMemo(()=>({...settings,renderDistance:Math.min(settings.renderDistance,lowPower?110:300)}),[settings,lowPower]);
 return atlas&&plants.length?<group name="coastal-oleaster"><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={plants} sceneTime lowPower={lowPower}/></group>:null;
}
