import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {GRASS_SCENE_KINDS,GRASS_UNDERLAY,GRASS_SPECIES_DEFAULTS,grassAtlasSpec,makeGrassTuft} from './grassModel.js';
import {gatherGrass} from './grassMeadow.js';
import {usePlantAtlas} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

// One prototype tuft per kind, the meadow around the camera as instances.
function GrassKind({kind,placements,asset,settings,lowPower,envMapIntensity}){
 const atlas=usePlantAtlas(useMemo(()=>grassAtlasSpec(kind,lowPower),[kind,lowPower]));
 const model=useMemo(()=>makeGrassTuft(kind,{seed:settings.grassSeed,height:GRASS_SPECIES_DEFAULTS[kind].height*settings.grassHeight}),[kind,settings.grassSeed,settings.grassHeight]);
 // Cards close to the eye read as cards; the carpet stops where the tufts still stand.
 const carpet=kind===GRASS_UNDERLAY;
 const renderSettings=useMemo(()=>({...asset,renderDistance:Math.min(asset.renderDistance,carpet?(lowPower?28:45):lowPower?80:300),nearDistance:carpet?(lowPower?3:4):0}),[asset,lowPower,carpet]);
 return atlas&&placements.length?<group name={`coastal-grass-${kind}`}><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={placements} sceneTime lowPower={lowPower} statsKey={`grassStats_${kind}`} impostorFrame={carpet?(lowPower?128:256):lowPower?96:192} envMapIntensity={envMapIntensity}/></group>:null;
}
export default function CoastGrass({query,definition,settings,asset,qualityProfile,envMapIntensity=1}){
 const {camera}=useThree();
 const lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 const cache=useRef(new Map()),timer=useRef(1),lastPublish=useRef(0);
 const [placements,setPlacements]=useState(()=>Object.fromEntries(GRASS_SCENE_KINDS.map(kind=>[kind,[]])));
 const context=useMemo(()=>({definition,query,settings:{...settings,lowPower}}),[definition,query,settings,lowPower]);
 const radius=Math.min(settings.grassRenderDistance,lowPower?80:300);
 useEffect(()=>{cache.current=new Map();timer.current=1;},[context]);
 useFrame((_,delta)=>{
  timer.current+=delta;
  if(timer.current<.25)return;
  timer.current=0;
  const next=gatherGrass(cache.current,camera.position.x,camera.position.z,radius,context,lowPower?8:12,lowPower?28:45);
  if(!next)return;
  // Re-uploading five instance buffers per kind every tick of a fill is the
  // hitch; publish when the fill is complete, or every 700 ms meanwhile.
  const now=performance.now();
  if(next.pending&&now-lastPublish.current<700)return;
  lastPublish.current=now;setPlacements(next);
 });
 return <>{GRASS_SCENE_KINDS.map(kind=><GrassKind key={kind} kind={kind} placements={placements[kind]??[]} asset={asset} settings={settings} lowPower={lowPower} envMapIntensity={envMapIntensity}/>)}</>;
}
