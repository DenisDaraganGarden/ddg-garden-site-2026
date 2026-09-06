import React,{useEffect,useMemo,useState} from 'react';
import {usePlantAtlas} from '../plants/usePlantAtlas.js';
import * as THREE from 'three';
import PlantPopulation from '../plants/PlantPopulation.jsx';
import {createPlantLabTerrain,plantGroundCover,scatterPlants} from '../plants/plantHabitat.js';

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
export default function PlantStage({species,settings,mode,paused,onStats,lowPower}){
 const atlas=usePlantAtlas(species.atlas);
 const shapeKey=JSON.stringify(Object.fromEntries(species.shape.map(key=>[key,settings[key]])));
 const [shape,setShape]=useState(()=>JSON.parse(shapeKey));
 useEffect(()=>{const timer=setTimeout(()=>setShape(JSON.parse(shapeKey)),120);return()=>clearTimeout(timer);},[shapeKey]);
 const model=useMemo(()=>species.makeModel(shape),[species,shape]);
 const query=useMemo(()=>createPlantLabTerrain(settings.slope,.5,settings.pathWidth,settings.extent),[settings.slope,settings.pathWidth,settings.extent]);
 const placementKey=JSON.stringify(Object.fromEntries(['seed','count','extent','dryness','patchScale','patchContrast','crownScale','crownVariation','fieldSeed'].map(key=>[key,settings[key]])));
 const planting=useMemo(()=>JSON.parse(placementKey),[placementKey]);
 // A trunk is not a twig: the species says how much of the wind it takes.
 const placements=useMemo(()=>(mode==='patch'?scatterPlants(query,{seed:planting.seed,count:planting.count,extent:planting.extent-1,spacing:species.planting.spacing,dryness:planting.dryness,pathMask:query.pathMask,ecology:planting,suitability:species.planting.suitability}):[{x:0,y:0,z:0,scale:1,yaw:0,dryness:planting.dryness,exposure:1}]).map(p=>({...p,exposure:(p.exposure??1)*settings.flex})), [mode,query,planting,species,settings.flex]);
 const impostorFrame=species.impostorFrame?(lowPower?species.impostorFrame.lowPower:species.impostorFrame.desktop):undefined;
 return <>{mode==='patch'&&<GroundPlot query={query} plants={placements} extent={settings.extent}/>}{atlas&&<PlantPopulation model={model} atlas={atlas} settings={settings} placements={placements} paused={paused} onStats={onStats} lowPower={lowPower} impostorFrame={impostorFrame}/>}</>;
}
