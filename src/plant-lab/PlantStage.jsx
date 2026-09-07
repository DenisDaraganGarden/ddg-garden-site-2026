import React,{useEffect,useMemo,useRef,useState} from 'react';
import {buildHomeSceneLighting} from '../components/effects/homeSceneLighting';
import {getPublishedHomeSceneSettings} from '../features/home-scene/hooks/useHomeSceneSettings';
import {usePlantAtlas} from '../plants/usePlantAtlas.js';
import * as THREE from 'three';
import PlantPopulation from '../plants/PlantPopulation.jsx';
import {createPlantLabTerrain,plantGroundCover,scatterPlants} from '../plants/plantHabitat.js';
import {randomSequence} from '../plants/oleasterModel.js';
import {ecologyPatch} from '../plants/plantEcology.js';
import {GRASS_SPECIES_DEFAULTS,grassAtlasSpec,makeGrassTuft} from '../plants/grassModel.js';

// Plants take the landscape's environment at the published intensity, as on the site.
const SCENE_ENV=buildHomeSceneLighting(getPublishedHomeSceneSettings()).environment.reflection;
function GroundPlot({query,plants,extent}){
 const geometry=useMemo(()=>{
  const g=new THREE.PlaneGeometry(extent,extent,96,96);g.rotateX(-Math.PI/2);
  const pos=g.attributes.position,colors=[];const sand=new THREE.Color('#c2b79a'),litter=new THREE.Color('#766b4c'),green=new THREE.Color('#9c9e74'),path=new THREE.Color('#d0c4a7');
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),cover=plantGroundCover(x,z,plants,query.pathMask);
   pos.setY(i,query.heightAt(x,z));const c=sand.clone().lerp(litter,cover.litter*.62).lerp(green,cover.vigor*.35).lerp(path,cover.path*.7);colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
 },[query,plants,extent]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={.98}/></mesh>;
}
function SingleStage({species,settings,mode,paused,onStats,lowPower}){
 const atlas=usePlantAtlas(species.atlas);
 const shapeKey=JSON.stringify(Object.fromEntries(species.shape.map(key=>[key,settings[key]])));
 const [shape,setShape]=useState(()=>JSON.parse(shapeKey));
 useEffect(()=>{const timer=setTimeout(()=>setShape(JSON.parse(shapeKey)),120);return()=>clearTimeout(timer);},[shapeKey]);
 const model=useMemo(()=>species.makeModel(shape),[species,shape]);
 const query=useMemo(()=>createPlantLabTerrain(settings.slope,.5,settings.pathWidth,settings.extent,settings.moisture),[settings.slope,settings.pathWidth,settings.extent,settings.moisture]);
 const placementKey=JSON.stringify(Object.fromEntries(['seed','count','extent','dryness','patchScale','patchContrast','crownScale','crownVariation','fieldSeed'].map(key=>[key,settings[key]])));
 const planting=useMemo(()=>JSON.parse(placementKey),[placementKey]);
 // A trunk is not a twig: the species says how much of the wind it takes.
 const placements=useMemo(()=>(mode==='patch'?scatterPlants(query,{seed:planting.seed,count:planting.count,extent:planting.extent-1,spacing:species.planting.spacing,dryness:planting.dryness,pathMask:query.pathMask,ecology:planting,suitability:species.planting.suitability}):[{x:0,y:0,z:0,scale:1,yaw:0,dryness:planting.dryness,exposure:1}]).map(p=>({...p,exposure:(p.exposure??1)*settings.flex})), [mode,query,planting,species,settings.flex]);
 const impostorFrame=species.impostorFrame?(lowPower?species.impostorFrame.lowPower:species.impostorFrame.desktop):undefined;
 return <>{mode==='patch'&&<GroundPlot query={query} plants={placements} extent={settings.extent}/>}{atlas&&<PlantPopulation model={model} atlas={atlas} settings={settings} placements={placements} paused={paused} onStats={onStats} lowPower={lowPower} impostorFrame={impostorFrame} envMapIntensity={SCENE_ENV}/>}</>;
}
// One kind of the mix: its own atlas, prototype and population.
function KindPopulation({kind,seed,heightScale,settings,placements,paused,lowPower,onStats,impostorFrame}){
 const atlas=usePlantAtlas(useMemo(()=>grassAtlasSpec(kind,lowPower),[kind,lowPower]));
 const model=useMemo(()=>makeGrassTuft(kind,{seed,height:GRASS_SPECIES_DEFAULTS[kind].height*heightScale}),[kind,seed,heightScale]);
 const kindSettings=useMemo(()=>kind==='carpet'?{...settings,nearDistance:3}:settings,[kind,settings]);
 return atlas&&placements.length?<PlantPopulation model={model} atlas={atlas} settings={kindSettings} placements={placements} paused={paused} onStats={onStats} lowPower={lowPower} statsKey={`plantStats_${kind}`} impostorFrame={impostorFrame} envMapIntensity={SCENE_ENV}/>:null;
}
// Several kinds as one meadow: one scatter, each tuft handed to a kind by the
// shares and a cluster field, so species stand in patches, not in salt-and-pepper.
function MixedStage({species,settings,mode,paused,onStats,lowPower}){
 const kinds=species.kinds;
 const query=useMemo(()=>createPlantLabTerrain(settings.slope,.5,settings.pathWidth,settings.extent,settings.moisture),[settings.slope,settings.pathWidth,settings.extent,settings.moisture]);
 const placementKey=JSON.stringify(Object.fromEntries(['seed','count','extent','dryness','patchScale','patchContrast','crownScale','crownVariation','fieldSeed',...kinds].map(key=>[key,settings[key]])));
 const planting=useMemo(()=>JSON.parse(placementKey),[placementKey]);
 const byKind=useMemo(()=>{
  const out=Object.fromEntries(kinds.map(k=>[k,[]]));
  if(mode!=='patch'){kinds.forEach((k,i)=>{out[k].push({x:(i-(kinds.length-1)/2)*.9,y:0,z:0,scale:1,yaw:0,exposure:settings.flex});});return out;}
  const all=scatterPlants(query,{seed:planting.seed,count:planting.count,extent:planting.extent-1,spacing:species.planting.spacing,dryness:planting.dryness,pathMask:query.pathMask,ecology:planting,suitability:species.planting.suitability});
  const rand=randomSequence(planting.seed*13+7);
  for(const p of all){
   const weights=kinds.map((k,i)=>(planting[k]??1)*(k==='carpet'?1:.35+.65*ecologyPatch(p.x,p.z,6,planting.seed+i*11)));
   const total=weights.reduce((a,b)=>a+b,0);if(total<=0)continue;
   let r=rand()*total,pick=0;for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){pick=i;break;}}
   out[kinds[pick]].push({...p,exposure:(p.exposure??1)*settings.flex});
  }
  return out;
 },[mode,query,planting,species,kinds,settings.flex]);
 const all=useMemo(()=>kinds.flatMap(k=>byKind[k]),[byKind,kinds]);
 const statsRef=useRef({});
 const report=useMemo(()=>Object.fromEntries(kinds.map(k=>[k,info=>{
  statsRef.current[k]=info;const list=Object.values(statsRef.current);
  const sum=key=>list.reduce((n,s)=>n+(s[key]??0),0);
  onStats?.({...info,plants:sum('plants'),culled:sum('culled'),triangles:sum('triangles'),leaves:sum('leaves'),branches:sum('branches'),lods:[0,1,2].map(i=>list.reduce((n,s)=>n+(s.lods?.[i]??0),0)),budgets:info.budgets});
 }])),[kinds,onStats]);
 const impostorFrame=species.impostorFrame?(lowPower?species.impostorFrame.lowPower:species.impostorFrame.desktop):undefined;
 return <>{mode==='patch'&&<GroundPlot query={query} plants={all} extent={settings.extent}/>}{kinds.map(k=><KindPopulation key={k} kind={k} seed={settings.seed} heightScale={settings.height} settings={settings} placements={byKind[k]} paused={paused} lowPower={lowPower} onStats={report[k]} impostorFrame={k==='carpet'?256:impostorFrame}/>)}</>;
}
export default function PlantStage(props){return props.species.kinds?<MixedStage {...props}/>:<SingleStage {...props}/>;}
