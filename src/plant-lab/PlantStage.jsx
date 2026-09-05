import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {makeOleaster,makeBranchGeometry,makeLeafGeometry,selectPlantLod} from '../plants/oleasterModel.js';
import {makePlantMaterials,plantUniforms,updatePlantUniforms} from '../plants/plantMaterials.js';
import {bakePlantImpostor,makeImpostorMaterial} from '../plants/plantAtlases.js';
import {createPlantLabTerrain,plantGroundCover,scatterPlants} from '../plants/plantHabitat.js';

function GroundPlot({query,plants}){
 const geometry=useMemo(()=>{
  const g=new THREE.PlaneGeometry(10,10,64,64);g.rotateX(-Math.PI/2);
  const pos=g.attributes.position,colors=[];const sand=new THREE.Color('#c2b79a'),litter=new THREE.Color('#766b4c'),green=new THREE.Color('#9c9e74'),path=new THREE.Color('#d0c4a7');
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),cover=plantGroundCover(x,z,plants,query.pathMask);
   pos.setY(i,query.heightAt(x,z));const c=sand.clone().lerp(litter,cover.litter*.62).lerp(green,cover.vigor*.35).lerp(path,cover.path*.7);colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
 },[query,plants]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={.98}/></mesh>;
}
function Population({model,settings,atlas,placements,paused,onStats,lowPower}){
 const {gl,camera,size,invalidate}=useThree();
 const uniforms=useMemo(plantUniforms,[]),time=useRef(0),lastReport=useRef(-Infinity),lastLod=useRef(0);
 const groups=useMemo(()=>Array.from({length:3},()=>React.createRef()),[]),meshRefs=useMemo(()=>Array.from({length:5},()=>React.createRef()),[]);
 const [resources,setResources]=useState(null);
 const lastCamera=useRef({position:new THREE.Vector3(),height:0,fov:0});
 useLayoutEffect(()=>{lastReport.current=-Infinity;invalidate();},[invalidate,settings,lowPower,paused]);
 const transform=useMemo(()=>new THREE.Object3D(),[]);
 // Render targets must be created in an effect. A render-time memo can be
 // discarded by StrictMode/Suspense, leaving an empty or leaked GPU bake.
 useLayoutEffect(()=>{
  const meshes=[0,1].map(lod=>({bark:makeBranchGeometry(model,lod),leaf:makeLeafGeometry(model,lod)}));
  const materials=makePlantMaterials(atlas,uniforms);
  const impostor=bakePlantImpostor(gl,model,meshes[0],atlas);
  const farMaterial=makeImpostorMaterial(impostor);
  const farGeometry=new THREE.PlaneGeometry(impostor.width,impostor.height,1,4);
  farGeometry.translate(0,impostor.center.y,0);
  farGeometry.computeBoundingSphere();farGeometry.boundingSphere.radius+=.14*impostor.height**2+.08;
  for(const geometry of [...meshes.flatMap(m=>[m.bark,m.leaf]),farGeometry])geometry.setAttribute('plantExposure',new THREE.InstancedBufferAttribute(new Float32Array(64).fill(1),1));
  const next={meshes,materials,impostor,farMaterial,farGeometry,model};
  setResources(next);lastReport.current=-Infinity;
  return()=>{
   for(const m of meshes){m.bark.dispose();m.leaf.dispose();}
   materials.dispose();impostor.dispose();farMaterial.dispose();farGeometry.dispose();
  };
 },[gl,model,atlas,uniforms]);
 useLayoutEffect(()=>{
  placements.forEach((p,i)=>{
   transform.position.set(p.x,p.y-(p.rootDepth??0)*p.scale,p.z);transform.rotation.set(0,p.yaw,0);transform.scale.setScalar(p.scale);transform.updateMatrix();
   for(const ref of meshRefs){if(!ref.current)continue;ref.current.setMatrixAt(i,transform.matrix);ref.current.setColorAt(i,new THREE.Color(1,1,1));ref.current.geometry.attributes.plantExposure.setX(i,p.exposure??1);}
  });
  for(const ref of meshRefs){if(ref.current){ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();}}
  lastReport.current=-Infinity;invalidate();
 },[placements,transform,meshRefs,resources,invalidate]);
 useFrame((_,delta)=>{
  if(!resources||resources.model!==model)return;
  const {meshes,materials,farMaterial,farGeometry}=resources;
  if(!paused)time.current+=Math.min(Math.max(delta,0),.04);
  updatePlantUniforms(uniforms,settings,time.current);materials.leaves.roughness=settings.roughness;
  for(const m of [materials.bark,materials.leaves,farMaterial])m.wireframe=settings.wireframe;
  farMaterial.roughness=settings.roughness;farMaterial.userData.uniforms.uImpostorDryness.value=settings.dryness;
  farMaterial.userData.uniforms.uImpostorTime.value=time.current;
  farMaterial.userData.uniforms.uImpostorWind.value.copy(uniforms.uPlantWind.value);
  // One specimen uses true camera distance. Population partitions instances by
  // distance every quarter second, so distant plants never pay near geometry.
  const now=performance.now(),cameraChanged=lastCamera.current.position.distanceToSquared(camera.position)>1e-6||lastCamera.current.height!==size.height||lastCamera.current.fov!==camera.fov;
  if(!cameraChanged&&now-lastReport.current<250)return;
  lastReport.current=now;lastCamera.current.position.copy(camera.position);lastCamera.current.height=size.height;lastCamera.current.fov=camera.fov;
  const counts=[0,0,0],heights=model.height;
  for(const p of placements){
   const distance=camera.position.distanceTo(new THREE.Vector3(p.x,p.y+heights*p.scale*.5,p.z)),pixels=heights*p.scale*size.height/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(.1,distance));
   const level=settings.skeleton?0:settings.lod==='auto'?selectPlantLod(distance,pixels,p.lod??lastLod.current,lowPower,(camera.position.y-p.y-heights*p.scale*.5)/Math.max(.1,distance)):Number(settings.lod);
   p.lod=level;lastLod.current=level;
   const slot=counts[level]++;transform.position.set(p.x,p.y-(p.rootDepth??0)*p.scale,p.z);transform.rotation.set(0,p.yaw,0);transform.scale.setScalar(p.scale);transform.updateMatrix();
   const refs=level===2?[meshRefs[4]]:meshRefs.slice(level*2,level*2+2);
   for(const r of refs){if(r.current){r.current.setMatrixAt(slot,transform.matrix);r.current.geometry.attributes.plantExposure.setX(slot,p.exposure??1);r.current.setColorAt(slot,new THREE.Color().setRGB(1,1-p.dryness*.12,1-p.dryness*.26));}}
  }
  for(let i=0;i<3;i++){
   if(groups[i].current)groups[i].current.visible=counts[i]>0;
   const refs=i===2?[meshRefs[4]]:meshRefs.slice(i*2,i*2+2);
   for(const r of refs){if(r.current){r.current.count=counts[i];r.current.visible=!(settings.skeleton&&r===meshRefs[i*2+1]);r.current.instanceMatrix.needsUpdate=true;r.current.instanceColor.needsUpdate=true;r.current.geometry.attributes.plantExposure.needsUpdate=true;r.current.computeBoundingSphere();}}
  }
  const budgets=meshes.map(m=>(m.bark.index.count+m.leaf.index.count)/3).concat([farGeometry.index.count/3]);
  const focus=placements.reduce((best,p)=>!best||p.z-p.x>best.z-best.x?p:best,null);
  const focusPoint=new THREE.Vector3(focus?.x??0,(focus?.y??0)+heights*.5,focus?.z??0);
  const metresPerPixel=2*Math.tan(camera.fov*Math.PI/360)*camera.position.distanceTo(focusPoint)/size.height;
  const metres=[.01,.02,.05,.1,.2,.5,1,2,5,10,20,50].reduce((best,n)=>Math.abs(n/metresPerPixel-64)<Math.abs(best/metresPerPixel-64)?n:best,.01);
  const info={paused,frame:gl.info.render.frame,focus:focus?[focus.x,focus.y,focus.z]:[0,0,0],scale:{metres,pixels:metres/metresPerPixel},plants:placements.length,leaves:model.leaves.length,branches:model.branches.length,lods:counts,budgets,triangles:counts.reduce((sum,n,i)=>sum+n*budgets[i],0),calls:gl.info.render.calls,frameTriangles:gl.info.render.triangles,seconds:Number(time.current.toFixed(2))};
  gl.domElement.dataset.plantStats=JSON.stringify(info);onStats(info);
 });
 if(!resources||resources.model!==model)return null;
 const {meshes,materials,farMaterial,farGeometry}=resources;
 const count=Math.max(1,placements.length);
 return <>
  {[0,1].map(i=><group ref={groups[i]} key={i}>
   <instancedMesh ref={meshRefs[i*2]} args={[meshes[i].bark,materials.bark,count]} customDepthMaterial={materials.barkDepth} castShadow receiveShadow/>
   <instancedMesh ref={meshRefs[i*2+1]} args={[meshes[i].leaf,materials.leaves,count]} customDepthMaterial={materials.leafDepth} castShadow receiveShadow/>
  </group>)}
  <group ref={groups[2]}><instancedMesh ref={meshRefs[4]} args={[farGeometry,farMaterial,count]}/></group>
 </>;
}
export default function PlantStage({settings,mode,paused,onStats,lowPower}){
 const {gl}=useThree();
 const [color,normal]=useLoader(THREE.TextureLoader,['/textures/plants/leaf-albedo.png','/textures/plants/leaf-normal.png']);
 const [atlas,setAtlas]=useState(null),[contextVersion,setContextVersion]=useState(0);
 useEffect(()=>{const restore=()=>setContextVersion(v=>v+1);gl.domElement.addEventListener('webglcontextrestored',restore);return()=>gl.domElement.removeEventListener('webglcontextrestored',restore);},[gl]);
 useLayoutEffect(()=>{
  color.colorSpace=THREE.SRGBColorSpace;normal.colorSpace=THREE.NoColorSpace;
  for(const map of [color,normal]){map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());map.needsUpdate=true;}
  // Ship the reproducibly baked RGBA maps; the larger authoring image never
  // occupies mobile GPU memory. Only shape-dependent distant views bake here.
  setAtlas({color:{texture:color},normal:{texture:normal}});
  return()=>{color.dispose();normal.dispose();};
 },[gl,color,normal,contextVersion]);
 const shapeKey=JSON.stringify({seed:settings.seed,height:settings.height,spread:settings.spread,density:settings.density,leafSize:settings.leafSize});
 const [shape,setShape]=useState(()=>JSON.parse(shapeKey));
 useEffect(()=>{const timer=setTimeout(()=>setShape(JSON.parse(shapeKey)),120);return()=>clearTimeout(timer);},[shapeKey]);
 const model=useMemo(()=>makeOleaster(shape),[shape]);
 const query=useMemo(()=>createPlantLabTerrain(settings.slope,settings.dryness,settings.pathWidth),[settings.slope,settings.dryness,settings.pathWidth]);
 const placements=useMemo(()=>mode==='patch'?scatterPlants(query,{seed:settings.seed,count:settings.count,extent:9,spacing:1.05,dryness:settings.dryness,pathMask:query.pathMask}):[{x:0,y:0,z:0,scale:1,yaw:0,dryness:settings.dryness}], [mode,query,settings.seed,settings.count,settings.dryness]);
 return <>{mode==='patch'&&<GroundPlot query={query} plants={placements}/>}{atlas&&<Population model={model} atlas={atlas} settings={settings} placements={placements} paused={paused} onStats={onStats} lowPower={lowPower}/>}</>;
}
