import React,{useMemo} from 'react';
import {makeCoastTree} from './treeModel.js';
import {TREE_KINDS,TREE_SPECIES} from './treeSpecies.js';
import {usePlantAtlas,LEAF_ATLAS,BARK_TILE,barkAtlasSpec} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

// The species a phone draws itself; the others stand in the oleaster's place
// there, so a phone bakes three atlases, not six.
const PHONE_KINDS=['oleaster','tamarisk','snag'];

// One population per species of the planting: its own model, leaf tint, bark
// tile and far card. The oleaster takes the editor's form; the other species
// their table form, with the editor's seed and the landscape's wind.
function TreeKind({kind,placements,settings,lowPower,envMapIntensity}){
 const species=TREE_SPECIES[kind];
 const atlas=usePlantAtlas(useMemo(()=>({...LEAF_ATLAS,bark:barkAtlasSpec(species.bark,lowPower)}),[species.bark,lowPower]));
 // The shape is the same on every device; only the middle-distance budget
 // differs: a phone keeps a quarter of the leaves there and no twigs.
 const shapeKey=JSON.stringify({...(kind==='oleaster'?{seed:settings.seed,height:settings.height,spread:settings.spread,lean:settings.lean,twist:settings.twist,density:settings.density,leafSize:settings.leafSize,deadwood:settings.deadwood}:{...species.form,seed:settings.seed+kind.length*7}),windBearing:settings.windBearing,midEvery:lowPower?4:2,midSkipsThin:lowPower,barkTile:BARK_TILE[species.bark],species:species.latin||species.ru});
 const model=useMemo(()=>makeCoastTree(JSON.parse(shapeKey)),[shapeKey]);
 const renderSettings=useMemo(()=>({...settings,leafTint:species.leafTint,barkColor:species.barkColor,barkBleach:species.barkBleach??0,blossom:0,renderDistance:Math.min(settings.renderDistance,lowPower?260:1200)}),[settings,species,lowPower]);
 // A trunk is not a twig. The shared wind field bends by height squared, so a
 // tree takes only a fraction of the exposure a shrub gets on the same spot.
 const placed=useMemo(()=>placements.map(p=>({...p,exposure:(p.exposure??1)*settings.flex})),[placements,settings.flex]);
 // A six-metre crown in a 256 px frame is two centimetres a pixel; leaves
 // thinner than that vanish from the far projection. Trees get a larger frame.
 return atlas&&placed.length?<group name={`coastal-trees-${kind}`}><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={placed} sceneTime lowPower={lowPower} statsKey={kind==='oleaster'?'treeStats':`treeStats_${kind}`} impostorFrame={lowPower?192:384} envMapIntensity={envMapIntensity}/></group>:null;
}
export default function CoastTrees({settings,plants,qualityProfile,envMapIntensity=1}){
 const lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 const byKind=useMemo(()=>{
  const out={};
  for(const p of plants){const kind=p.kind??'oleaster';(out[lowPower&&!PHONE_KINDS.includes(kind)?'oleaster':kind]??=[]).push(p);}
  return out;
 },[plants,lowPower]);
 return <>{TREE_KINDS.filter(kind=>byKind[kind]?.length).map(kind=><TreeKind key={kind} kind={kind} placements={byKind[kind]} settings={settings} lowPower={lowPower} envMapIntensity={envMapIntensity}/>)}</>;
}
