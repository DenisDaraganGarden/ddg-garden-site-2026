import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRockGeometry } from './terrainRocks.js';
import { buildTerrainStrip, terrainLod } from './terrainGeometry.js';
import { createTerrainDefinition, coastCoordinates, shorePosition, coastPoint, COAST_STRIP_LENGTH } from './terrainModel.js';
import { createTerrainMaterial } from './terrainMaterial.js';
import { syncCoastUniforms } from './terrainShader.js';
import WaterSurfaceV2 from '../components/effects/water/WaterSurface';
import CoastShells from './CoastShells.jsx';

const mapNames=['sand','shells','sandstone'].flatMap(name=>['color','normal','surface'].map(channel=>name+'-'+channel));
function TerrainStrip({ definition:p,s0,material,water,qualityProfile,settings,lighting,sky,runtime }) {
  const {camera}=useThree();
  const [lod,setLod]=useState(2); const timer=useRef(0);
  const geometry=useMemo(()=>buildTerrainStrip(p,s0,lod,water),[p,s0,lod,water]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame((_,delta)=>{
    timer.current+=delta;if(timer.current<.3)return;timer.current=0;
    const local=coastCoordinates(camera.position.x,camera.position.z,p);
    const ds=Math.max(s0-local.s,local.s-(s0+COAST_STRIP_LENGTH),0);
    const q=local.u-shorePosition(local.s,p);
    const crossDistance=Math.max((water?-32:-96)-q,q-(water?8:p.terrainLandWidth),0);
    const distance=Math.hypot(ds,crossDistance,Math.max(0,camera.position.y-p.terrainCliffHeight));
    const desired=terrainLod(distance,qualityProfile.isLowPower);
    const threshold=desired<lod?(desired===0?70:250):(lod===0?100:300);
    if(desired!==lod && (desired<lod?distance<threshold:distance>threshold))setLod(desired);
  });
  if(water)return <WaterSurfaceV2 geometryOverride={geometry} shoreMode runtime={runtime} settings={settings} lighting={lighting} sky={sky} qualityProfile={qualityProfile}/>;
  return <mesh geometry={geometry} material={material} castShadow receiveShadow userData={{terrainLod:lod}} />;
}
function CoastRocks({rocks,material}) {
  const ref=useRef();const geometry=useMemo(makeRockGeometry,[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useLayoutEffect(()=>{if(!ref.current)return;const transform=new THREE.Object3D();rocks.forEach((rock,i)=>{transform.position.set(rock.x,rock.y,rock.z);transform.rotation.set(...rock.rotation);transform.scale.set(...rock.scale);transform.updateMatrix();ref.current.setMatrixAt(i,transform.matrix);});ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[rocks]);
  return <instancedMesh ref={ref} name="coast-rocks" args={[geometry,material,Math.max(1,rocks.length)]} count={rocks.length} castShadow receiveShadow/>;
}
export default function AzovTerrain({ definition, settings, qualityProfile, lighting, sky, runtime, rocks, onTerrainReady, audioRuntime, plantCover }) {
  const {gl}=useThree();const land=useRef();
  const shoreEmitter=useRef(settings.audio?.emitters?.shore);shoreEmitter.current=settings.audio?.emitters?.shore;
  useEffect(()=>()=>{const emitter=shoreEmitter.current;if(emitter)audioRuntime?.updateEmitter?.('shore',emitter.x,emitter.y,emitter.z);},[audioRuntime]);
  const loaded=useLoader(THREE.TextureLoader,mapNames.map(name=>'/textures/azov/'+name+'.webp'));
  const textures=useMemo(()=>Object.fromEntries(mapNames.map((name,i)=>[name,loaded[i]])),[loaded]);
  useLayoutEffect(()=>{for(const [name,texture]of Object.entries(textures)){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=name.endsWith('-color')?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=Math.min(qualityProfile.isLowPower?4:8,gl.capabilities.getMaxAnisotropy());texture.needsUpdate=true;}},[textures,gl,qualityProfile.isLowPower]);
  const materials=useMemo(()=>({land:createTerrainMaterial(textures,createTerrainDefinition()),rock:createTerrainMaterial(textures,createTerrainDefinition(),true)}),[textures]);
  useEffect(()=>()=>Object.values(materials).forEach(m=>m.dispose()),[materials]);
  useLayoutEffect(()=>{const u=materials.land.userData.coastUniforms;u.uPlantCover.value=plantCover?.texture??null;u.uPlantCoverBounds.value.copy(plantCover?.bounds??new THREE.Vector4(0,0,1,1));u.uPlantCoverEnabled.value=plantCover?1:0;},[materials,plantCover]);
  const strips=useMemo(()=>{const out=[];for(let s=-definition.terrainLength*.5;s<definition.terrainLength*.5;s+=COAST_STRIP_LENGTH)out.push(s);return out;},[definition.terrainLength]);
  useLayoutEffect(()=>{
    onTerrainReady?.({surface:'terrain',root:land.current,revision:definition});
    return ()=>onTerrainReady?.({surface:'terrain',root:null});
  },[definition,onTerrainReady]);
  useFrame(({clock,camera})=>{
    if(audioRuntime?.isActive?.()){
      const local=coastCoordinates(camera.position.x,camera.position.z,definition);
      const s=Math.max(-definition.terrainLength/2+60,Math.min(definition.terrainLength/2-60,local.s));
      const source=coastPoint(0,s,definition);audioRuntime.updateEmitter('shore',source.x,.15,source.z);
    }
    for(const m of Object.values(materials)){const u=m.userData.coastUniforms;syncCoastUniforms(u,definition);u.uTerrainTime.value=clock.elapsedTime;u.uTerrainScale.value=definition.terrainTextureScale;u.uTerrainParallax.value=qualityProfile.isLowPower?0:definition.terrainParallax;m.envMapIntensity=lighting.environment.reflection;}
    if(import.meta.env.DEV && Math.floor(clock.elapsedTime*2)%2===0){
      const lods=[0,0,0];let triangles=0;land.current?.traverse(o=>{if(o.userData.terrainLod!=null){lods[o.userData.terrainLod]++;triangles+=o.geometry.index.count/3;}});
      gl.domElement.dataset.ddgTerrain=JSON.stringify({axes:'N -Z · E +X · up +Y',length:definition.terrainLength,strips:strips.length,lods,triangles,waterline:0,depth:'logarithmic',physics:'analytic height / normal / surface / raycast'});
    }
  },-3);
  const meshKey=JSON.stringify(Object.fromEntries(['terrainSeed','terrainBearing','terrainOffset','terrainLength','terrainLandWidth','terrainBeachWidth','terrainCliffHeight','terrainCliffSlope','terrainCurve','terrainCapeDepth','terrainCapePosition','terrainCapeWidth','terrainRelief','terrainErosion'].map(key=>[key,definition[key]]).concat([['waterDepthMeters',definition.waterDepth]])));
  const meshDefinition=useMemo(()=>createTerrainDefinition(JSON.parse(meshKey)),[meshKey]);
  const shared={definition:meshDefinition,settings,qualityProfile,lighting,sky,runtime};
  return <>
    <group ref={land} name="azov-terrain">{strips.map(s0=><TerrainStrip key={s0} {...shared} s0={s0} material={materials.land}/>)}<CoastRocks rocks={rocks} material={materials.rock}/><CoastShells definition={definition} qualityProfile={qualityProfile} lighting={lighting}/></group>
    {settings.waterVisible && settings.debugView==='beauty' ? <group name="coast-water">{strips.map(s0=><TerrainStrip key={s0} {...shared} s0={s0} water/>)}</group> : null}
  </>;
}
