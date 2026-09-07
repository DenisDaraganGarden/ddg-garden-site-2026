import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {makeBranchGeometry,makeLeafGeometry,selectPlantLod} from './oleasterModel.js';
import {makePlantMaterials,plantUniforms,updatePlantUniforms} from './plantMaterials.js';
import {bakePlantImpostor,makeImpostorMaterial} from './plantAtlases.js';
const WHITE=new THREE.Color(1,1,1);

export default function PlantPopulation({model,settings,atlas,placements,paused=false,onStats,lowPower=false,sceneTime=false,statsKey='plantStats',impostorFrame}){
 const {gl,camera,size,invalidate}=useThree();
 const capacity=Math.max(1,2**Math.ceil(Math.log2(Math.max(1,placements.length))));
 const uniforms=useMemo(plantUniforms,[]),time=useRef(0),lastReport=useRef(-Infinity),lastLod=useRef(0);
 const groups=useMemo(()=>Array.from({length:3},()=>React.createRef()),[]),meshRefs=useMemo(()=>Array.from({length:5},()=>React.createRef()),[]);
 const [resources,setResources]=useState(null);
 const lastCamera=useRef({position:new THREE.Vector3(),height:0,fov:0});
 useLayoutEffect(()=>{lastReport.current=-Infinity;invalidate();},[invalidate,settings,lowPower,paused]);
 const transform=useMemo(()=>new THREE.Object3D(),[]),leafTint=useMemo(()=>new THREE.Color(),[]),blossomTint=useMemo(()=>new THREE.Color(),[]);
 // Render targets must be created in an effect. A render-time memo can be
 // discarded by StrictMode/Suspense, leaving an empty or leaked GPU bake.
 useLayoutEffect(()=>{
  // A species may build its own geometry (grass); the oleaster builders are the default.
  const meshes=[0,1].map(lod=>model.geometry?model.geometry(lod):{bark:makeBranchGeometry(model,lod),leaf:makeLeafGeometry(model,lod)});
  const materials=makePlantMaterials(atlas,uniforms);
  const impostor=bakePlantImpostor(gl,model,meshes[0],atlas,impostorFrame??(lowPower?128:256));
  const farMaterial=makeImpostorMaterial(impostor,uniforms);
  const farGeometry=new THREE.PlaneGeometry(impostor.width,impostor.height,1,4);
  farGeometry.translate(...impostor.center.toArray());
  farGeometry.computeBoundingSphere();farGeometry.boundingSphere.radius+=.75*impostor.height**2+.08;

  const next={meshes,materials,impostor,farMaterial,farGeometry,model};
  setResources(next);lastReport.current=-Infinity;
  return()=>{
   for(const m of meshes){m.bark.dispose();m.leaf.dispose();}
   materials.dispose();impostor.dispose();farMaterial.dispose();farGeometry.dispose();
  };
 },[gl,model,atlas,uniforms,lowPower,impostorFrame]);
 useLayoutEffect(()=>{
  if(!resources)return;
  for(const geometry of [...resources.meshes.flatMap(m=>[m.bark,m.leaf]),resources.farGeometry]){
   geometry.setAttribute('plantExposure',new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1),1));
   geometry.setAttribute('plantHabitat',new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(.5),1));
  }
 },[resources,capacity]);
 // New placements only ask for a frame: the partition below places every
 // instance on it, so uploading them here as well was the same work twice -
 // and the hitch when a meadow of thousands regrew around a moving camera.
 useLayoutEffect(()=>{
  for(const ref of meshRefs)if(ref.current)ref.current.count=0;
  lastReport.current=-Infinity;invalidate();
 },[placements,meshRefs,resources,invalidate]);
 useFrame(({clock},delta)=>{
  if(!resources||resources.model!==model)return;
  const {meshes,materials,farMaterial,farGeometry}=resources;
  if(!paused)time.current=sceneTime?clock.elapsedTime:time.current+Math.min(Math.max(delta,0),.04);
  updatePlantUniforms(uniforms,settings,time.current);materials.leaves.roughness=settings.roughness;
  // The artist's tone for the whole species: near ribbons and far cards alike.
  const tone=settings.tone??1,tint=leafTint.set(settings.leafTint??'#ffffff');
  // A species tints the shared leaf atlas and colours the bark (treeSpecies.js);
  // blossom is the same tint pulled toward the flower colour. The far cards
  // read the same two colours through their leaf/bark mask.
  if(settings.blossom>0)tint.lerp(blossomTint.set(settings.blossomColor??'#f7f0e8'),Math.min(1,settings.blossom));
  materials.leaves.color.copy(tint).multiplyScalar(tone);farMaterial.color.setScalar(tone);
  const bark=materials.bark.color.set(settings.barkColor??model.barkColor??'#685b44'),far=farMaterial.userData.uniforms;
  // The near bark carries a procedural grain that averages .86 of its colour (plantMaterials.js); the
  // card bakes bark white, so it gets the same mean. The audit measured the old x1.5 as far trunks
  // 1.7x brighter than near ones (docs/tree-lab-plan.md, аудит 7 сентября).
  far.uPlantLeafTint.value.copy(tint);far.uPlantBarkColor.value.copy(bark).multiplyScalar(.86);
  for(const m of [materials.bark,materials.leaves,farMaterial])m.wireframe=settings.wireframe;
  farMaterial.roughness=settings.roughness;
  // One specimen uses true camera distance. Population partitions instances by
  // distance - at most every quarter second, and only when the camera moved or
  // the placements or settings changed: a still viewport pays nothing here.
  const now=performance.now(),dirty=lastReport.current===-Infinity,cameraChanged=lastCamera.current.position.distanceToSquared(camera.position)>1e-6||lastCamera.current.height!==size.height||lastCamera.current.fov!==camera.fov;
  if(!dirty&&(!cameraChanged||now-lastReport.current<250))return;
  lastReport.current=now;lastCamera.current.position.copy(camera.position);lastCamera.current.height=size.height;lastCamera.current.fov=camera.fov;
  const counts=[0,0,0],heights=model.height;let culled=0;
  // A static far population (the grass carpet) is uploaded once per placements
  // change and never partitioned; its reach is bounded by whoever planted it.
  if(model.staticFar){
   if(dirty){
    const far=meshRefs[4].current;
    if(far){
     placements.forEach((p,i)=>{transform.position.set(p.x,p.y-(p.rootDepth??0)*p.scale,p.z);transform.rotation.set(0,p.yaw,0);transform.scale.setScalar(p.scale);transform.updateMatrix();far.setMatrixAt(i,transform.matrix);far.setColorAt(i,WHITE);far.geometry.attributes.plantExposure.setX(i,p.exposure??1);far.geometry.attributes.plantHabitat.setX(i,p.habitat??.5);});
     far.count=placements.length;far.instanceMatrix.needsUpdate=true;if(far.instanceColor)far.instanceColor.needsUpdate=true;far.geometry.attributes.plantExposure.needsUpdate=true;far.geometry.attributes.plantHabitat.needsUpdate=true;far.computeBoundingSphere();
    }
    for(let i=0;i<2;i++)if(groups[i].current)groups[i].current.visible=false;
    if(groups[2].current)groups[2].current.visible=placements.length>0;
   }
   counts[2]=placements.length;
  } else for(const p of placements){
   const cy=p.y+heights*p.scale*.5,dx=camera.position.x-p.x,dy=camera.position.y-cy,dz=camera.position.z-p.z;
   const distance=Math.sqrt(dx*dx+dy*dy+dz*dz),pixels=heights*p.scale*size.height/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(.1,distance));
   if(settings.lod==='auto'&&(distance>(settings.renderDistance??(lowPower?100:180))||distance<(settings.nearDistance??0))){culled++;continue;}
   const level=settings.skeleton?0:settings.lod==='auto'?(model.selectLod??selectPlantLod)(distance,pixels,p.lod??lastLod.current,lowPower,(camera.position.y-p.y-heights*p.scale*.5)/Math.max(.1,distance)):Number(settings.lod);
   p.lod=level;lastLod.current=level;
   const slot=counts[level]++;transform.position.set(p.x,p.y-(p.rootDepth??0)*p.scale,p.z);transform.rotation.set(0,p.yaw,0);transform.scale.setScalar(p.scale);transform.updateMatrix();
   const refs=level===2?[meshRefs[4]]:meshRefs.slice(level*2,level*2+2);
   for(const r of refs){if(r.current){r.current.setMatrixAt(slot,transform.matrix);r.current.geometry.attributes.plantExposure.setX(slot,p.exposure??1);r.current.geometry.attributes.plantHabitat.setX(slot,p.habitat??.5);r.current.setColorAt(slot,WHITE);}}
  }
  if(!model.staticFar)for(let i=0;i<3;i++){
   if(groups[i].current)groups[i].current.visible=counts[i]>0;
   const refs=i===2?[meshRefs[4]]:meshRefs.slice(i*2,i*2+2);
   for(const r of refs){if(r.current){r.current.count=counts[i];r.current.visible=!(settings.skeleton&&r===meshRefs[i*2+1]);r.current.instanceMatrix.needsUpdate=true;if(r.current.instanceColor)r.current.instanceColor.needsUpdate=true;r.current.geometry.attributes.plantExposure.needsUpdate=true;r.current.geometry.attributes.plantHabitat.needsUpdate=true;r.current.computeBoundingSphere();}}
  }
  const budgets=meshes.map(m=>(m.bark.index.count+m.leaf.index.count)/3).concat([farGeometry.index.count/3]);
  const focus=placements.reduce((best,p)=>!best||p.z-p.x>best.z-best.x?p:best,null);
  const focusPoint=new THREE.Vector3(focus?.x??0,(focus?.y??0)+heights*.5,focus?.z??0);
  const metresPerPixel=2*Math.tan(camera.fov*Math.PI/360)*camera.position.distanceTo(focusPoint)/size.height;
  const metres=[.01,.02,.05,.1,.2,.5,1,2,5,10,20,50].reduce((best,n)=>Math.abs(n/metresPerPixel-64)<Math.abs(best/metresPerPixel-64)?n:best,.01);
  const info={paused,lowPower,atlas:[resources.impostor.color.width,resources.impostor.color.height],frame:gl.info.render.frame,focus:focus?[focus.x,focus.y,focus.z]:[0,0,0],scale:{metres,pixels:metres/metresPerPixel},plants:placements.length,culled,leaves:model.leaves.length,branches:model.branches.length,lods:counts,budgets,triangles:counts.reduce((sum,n,i)=>sum+n*budgets[i],0),calls:gl.info.render.calls,frameTriangles:gl.info.render.triangles,seconds:Number(time.current.toFixed(2))};
  gl.domElement.dataset[statsKey]=JSON.stringify(info);onStats?.(info);
 });
 if(!resources||resources.model!==model)return null;
 const {meshes,materials,farMaterial,farGeometry}=resources;
 const count=capacity;
 return <>
  {[0,1].map(i=><group ref={groups[i]} key={i}>
   <instancedMesh ref={meshRefs[i*2]} args={[meshes[i].bark,materials.bark,count]} customDepthMaterial={materials.barkDepth} castShadow receiveShadow/>
   <instancedMesh ref={meshRefs[i*2+1]} args={[meshes[i].leaf,materials.leaves,count]} customDepthMaterial={materials.leafDepth} castShadow receiveShadow/>
  </group>)}
  <group ref={groups[2]}><instancedMesh ref={meshRefs[4]} args={[farGeometry,farMaterial,count]} customDepthMaterial={farMaterial.userData.depth} castShadow={model.farCastsShadow!==false} receiveShadow/></group>
 </>;
}
