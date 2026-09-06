import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRockGeometry } from './terrainRocks.js';
import { buildTerrainStrip, terrainLod } from './terrainGeometry.js';
import { createTerrainDefinition, coastCoordinates, shorePosition, coastPoint, COAST_STRIP_LENGTH } from './terrainModel.js';
import { createTerrainMaterial } from './terrainMaterial.js';
import { syncCoastUniforms } from './terrainShader.js';
import WaterSurfaceV2 from '../components/effects/water/WaterSurface';
import { CoastShells, CoastPebbles } from './CoastScatter.jsx';
import { TERRAIN_MAP_NAMES,createTerrainTextureArrays } from './terrainTextures.js';
import {terrainGeometryKey} from './settings.js';
import {updateEcologyUniforms} from '../plants/plantEcology.js';

const mapNames=TERRAIN_MAP_NAMES;
// The optics twin shares the strip's buffers, so it goes first: its dispose
// frees the shared attributes and its own index, the strip's then only its own.
function disposeStrip(geometry){geometry.userData.optics?.dispose();geometry.dispose();}
function TerrainStrip({ definition:p,s0,material,water,qualityProfile,settings,lighting,sky,runtime }) {
  const {camera}=useThree();
  const [lod,setLod]=useState(2); const timer=useRef(0),mesh=useRef(),transition=useRef({target:2,refining:false,morph:0});
  const geometryCache=useMemo(()=>({definition:p,s0,water,levels:new Map()}),[p,s0,water]);
  const geometry=useMemo(()=>{const {definition,s0,water,levels}=geometryCache;if(!levels.has(lod))levels.set(lod,buildTerrainStrip(definition,s0,lod,water));return levels.get(lod);},[geometryCache,lod]);
  // The reflection and refraction passes draw this strip through a twin that
  // shares every buffer and morph target but indexes every other row and
  // column: a quarter of the triangles for targets that cannot resolve more.
  const optics=useMemo(()=>{
    if(!geometry.userData.opticsIndex||geometry.userData.optics)return geometry.userData.optics??null;
    const twin=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(geometry.attributes))twin.setAttribute(name,attribute);
    twin.morphAttributes=geometry.morphAttributes;twin.setIndex(geometry.userData.opticsIndex);
    twin.boundingBox=geometry.boundingBox;twin.boundingSphere=geometry.boundingSphere;
    geometry.userData.optics=twin;return twin;
  },[geometry]);
  useEffect(()=>()=>{geometryCache.levels.forEach(g=>disposeStrip(g));geometryCache.levels.clear();},[geometryCache]);
  useLayoutEffect(()=>{
    // Reclaim the displayed geometry after StrictMode replays effect cleanup.
    geometryCache.levels.set(lod,geometry);
    if(!mesh.current)return;
    mesh.current.updateMorphTargets();
    transition.current.morph=transition.current.refining?1:0;mesh.current.userData.terrainMorph=transition.current.morph;
    if(mesh.current.morphTargetInfluences?.length)mesh.current.morphTargetInfluences[0]=transition.current.morph;
  },[geometry,geometryCache,lod]);
  useFrame((_,delta)=>{
    const state=transition.current;
    if(!water&&mesh.current?.morphTargetInfluences?.length){
      const goal=state.refining?0:state.target>lod?1:0;
      state.morph=state.morph+Math.sign(goal-state.morph)*Math.min(Math.abs(goal-state.morph),Math.min(delta,.05)/.65);
      mesh.current.morphTargetInfluences[0]=state.morph;mesh.current.userData.terrainMorph=state.morph;
      if(state.refining&&state.morph===0)state.refining=false;
      if(!state.refining&&state.target>lod&&state.morph===1){setLod(lod+1);return;}
    }
    timer.current+=delta;if(timer.current<.3)return;timer.current=0;
    const local=coastCoordinates(camera.position.x,camera.position.z,p);
    const ds=Math.max(s0-local.s,local.s-(s0+COAST_STRIP_LENGTH),0);
    const q=local.u-shorePosition(local.s,p);
    const crossDistance=Math.max((water?-32:-96)-q,q-(water?8:p.terrainLandWidth),0);
    const distance=Math.hypot(ds,crossDistance,Math.max(0,camera.position.y-p.terrainCliffHeight));
    // Retain nearby resolutions when crossing a threshold repeatedly. Release
    // unused fine buffers after leaving the area; a 4 km coast cannot keep all
    // visited high-detail strips resident on a phone.
    if(distance>360)for(const [level,cached]of geometryCache.levels){if(level<lod){disposeStrip(cached);geometryCache.levels.delete(level);}}
    const desired=terrainLod(distance,qualityProfile.isLowPower||qualityProfile.isMobileDevice);
    const threshold=desired<lod?(desired===0?70:250):(lod===0?100:300);
    if(desired!==lod&&(desired<lod?distance<threshold:distance>threshold)){
      state.target=desired;
      if(water)setLod(desired);
      else if(desired<lod&&!state.refining&&state.morph===0){state.refining=true;setLod(lod-1);}
    }else if(desired===lod)state.target=lod;
  });
  if(water)return <WaterSurfaceV2 geometryOverride={geometry} shoreMode runtime={runtime} settings={settings} lighting={lighting} sky={sky} qualityProfile={qualityProfile}/>;
  return <mesh ref={mesh} geometry={geometry} material={material} castShadow receiveShadow userData={{terrainLod:lod,ddgOpticsGeometry:optics}} />;
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
  const lowPower=qualityProfile.isLowPower||qualityProfile.isMobileDevice;
  const loaded=useLoader(THREE.TextureLoader,mapNames.map(name=>'/textures/azov/'+(lowPower?'mobile/':'')+name+'.webp'));
  const images=useMemo(()=>Object.fromEntries(mapNames.map((name,i)=>[name,loaded[i]])),[loaded]);
  const textures=useMemo(()=>createTerrainTextureArrays(images,lowPower,Math.min(lowPower?4:8,gl.capabilities.getMaxAnisotropy())),[images,lowPower,gl]);
  useEffect(()=>()=>textures.dispose(),[textures]);
  const materials=useMemo(()=>{const land=createTerrainMaterial(textures.maps,createTerrainDefinition()),rock=createTerrainMaterial(textures.maps,createTerrainDefinition(),true),debris=createTerrainMaterial(textures.maps,createTerrainDefinition(),true);debris.userData.coastUniforms.uRockLayer.value=3;return {land,rock,debris};},[textures]);
  const boulders=useMemo(()=>rocks.filter(r=>!r.debris),[rocks]),fragments=useMemo(()=>rocks.filter(r=>r.debris),[rocks]);
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
    const pondNormals=runtime?.normalTargetRef?.current?.texture??null,pondTexel=1/Math.max(1,runtime?.effectiveResolution??256);
    for(const m of Object.values(materials)){const u=m.userData.coastUniforms;syncCoastUniforms(u,definition);
      u.uPondNormalMap.value=pondNormals;u.uPondTexel.value.set(pondTexel,pondTexel);u.uPondExtent.value=settings.waterExtent;
      u.uCausticsParams.value.set(pondNormals?settings.causticsIntensity:0,settings.causticsScale,settings.causticsSharpness,settings.waterTurbidity);
      u.uCausticsLight.value.fromArray(lighting.key.direction);u.uCausticsKey.value=lighting.key.intensity;u.uTerrainTime.value=clock.elapsedTime;u.uTerrainScale.value=definition.terrainTextureScale;u.uTerrainParallax.value=lowPower?0:definition.terrainParallax;u.uTerrainGroundCover.value=definition.terrainGroundCover;updateEcologyUniforms(u,{dryness:settings.shrubsDryness??definition.terrainWeathering,fieldSeed:settings.shrubsFieldSeed,patchScale:settings.shrubsPatchScale,patchContrast:settings.shrubsPatchContrast});m.envMapIntensity=lighting.environment.reflection;}
    if(import.meta.env.DEV && Math.floor(clock.elapsedTime*2)%2===0){
      const lods=[0,0,0];let triangles=0,morphing=0;land.current?.traverse(o=>{if(o.userData.terrainLod!=null){lods[o.userData.terrainLod]++;if(o.userData.terrainMorph>0&&o.userData.terrainMorph<1)morphing++;triangles+=o.geometry.index.count/3;}});
      gl.domElement.dataset.ddgTerrain=JSON.stringify({axes:'N -Z · E +X · up +Y',length:definition.terrainLength,textureSize:textures.size,textureLayers:textures.layers,textureBytes:textures.bytes,geomorph:true,morphing,strips:strips.length,lods,triangles,waterline:0,depth:'logarithmic',physics:'analytic height / normal / surface / raycast'});
    }
  },-3);
  const meshKey=terrainGeometryKey(definition);
  const meshDefinition=useMemo(()=>createTerrainDefinition(JSON.parse(meshKey)),[meshKey]);
  const shared={definition:meshDefinition,settings,qualityProfile,lighting,sky,runtime};
  return <>
    <group ref={land} name="azov-terrain">{strips.map(s0=><TerrainStrip key={s0} {...shared} s0={s0} material={materials.land}/>)}<CoastRocks rocks={boulders} material={materials.rock}/><CoastRocks rocks={fragments} material={materials.debris}/><CoastShells definition={definition} qualityProfile={qualityProfile} lighting={lighting}/><CoastPebbles definition={definition} qualityProfile={qualityProfile} lighting={lighting}/></group>
    {settings.waterVisible ? <group name="coast-water">{strips.map(s0=><TerrainStrip key={s0} {...shared} s0={s0} water/>)}</group> : null}
  </>;
}
