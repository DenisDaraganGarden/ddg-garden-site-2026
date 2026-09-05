import React,{useMemo} from 'react';
import {makeCoastTree} from './treeModel.js';
import {usePlantAtlas} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

export default function CoastTrees({settings,plants,qualityProfile}){
 const atlas=usePlantAtlas(),lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 // The shape is the same on every device; only the middle-distance budget
 // differs: a phone keeps a quarter of the leaves there and no twigs.
 const shapeKey=JSON.stringify({seed:settings.seed,height:settings.height,spread:settings.spread,lean:settings.lean,twist:settings.twist,density:settings.density,leafSize:settings.leafSize,deadwood:settings.deadwood,windBearing:settings.windBearing,midEvery:lowPower?4:2,midSkipsThin:lowPower});
 const model=useMemo(()=>makeCoastTree(JSON.parse(shapeKey)),[shapeKey]);
 // A trunk is not a twig. The shared wind field bends by height squared, so a
 // tree takes only a fraction of the exposure a shrub gets on the same spot.
 const placements=useMemo(()=>plants.map(p=>({...p,exposure:(p.exposure??1)*settings.flex})),[plants,settings.flex]);
 const renderSettings=useMemo(()=>({...settings,renderDistance:Math.min(settings.renderDistance,lowPower?260:1200)}),[settings,lowPower]);
 // A six-metre crown in a 256 px frame is two centimetres a pixel; leaves
 // thinner than that vanish from the far projection. Trees get a larger frame.
 return atlas&&placements.length?<group name="coastal-oleaster-trees"><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={placements} sceneTime lowPower={lowPower} statsKey="treeStats" impostorFrame={lowPower?192:384}/></group>:null;
}
