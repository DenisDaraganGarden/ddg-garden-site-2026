import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {GRASS_KINDS,GRASS_SPECIES_DEFAULTS,grassAtlasSpec,makeGrassTuft} from './grassModel.js';
import {gatherGrass} from './grassMeadow.js';
import {usePlantAtlas} from './usePlantAtlas.js';
import PlantPopulation from './PlantPopulation.jsx';

// One prototype tuft per kind, the meadow around the camera as instances.
function GrassKind({kind,placements,asset,settings,lowPower}){
 const atlas=usePlantAtlas(useMemo(()=>grassAtlasSpec(kind,lowPower),[kind,lowPower]));
 const model=useMemo(()=>makeGrassTuft(kind,{seed:settings.grassSeed,height:GRASS_SPECIES_DEFAULTS[kind].height*settings.grassHeight}),[kind,settings.grassSeed,settings.grassHeight]);
 const renderSettings=useMemo(()=>({...asset,renderDistance:Math.min(asset.renderDistance,lowPower?90:300)}),[asset,lowPower]);
 return atlas&&placements.length?<group name={`coastal-grass-${kind}`}><PlantPopulation model={model} atlas={atlas} settings={renderSettings} placements={placements} sceneTime lowPower={lowPower} statsKey={`grassStats_${kind}`} impostorFrame={lowPower?64:128}/></group>:null;
}
export default function CoastGrass({query,definition,settings,asset,qualityProfile}){
 const {camera}=useThree();
 const lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
 const cache=useRef(new Map()),timer=useRef(1);
 const [placements,setPlacements]=useState(()=>Object.fromEntries(GRASS_KINDS.map(kind=>[kind,[]])));
 const context=useMemo(()=>({definition,query,settings}),[definition,query,settings]);
 const radius=Math.min(settings.grassRenderDistance,lowPower?90:300);
 useEffect(()=>{cache.current=new Map();timer.current=1;},[context]);
 useFrame((_,delta)=>{
  timer.current+=delta;
  if(timer.current<.25)return;
  timer.current=0;
  const next=gatherGrass(cache.current,camera.position.x,camera.position.z,radius,context);
  if(next)setPlacements(next);
 });
 return <>{GRASS_KINDS.map(kind=><GrassKind key={kind} kind={kind} placements={placements[kind]} asset={asset} settings={settings} lowPower={lowPower}/>)}</>;
}
