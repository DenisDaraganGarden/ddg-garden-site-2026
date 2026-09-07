import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';

// The oleaster leaf: front and back halves of one map, split in the shader.
export const LEAF_ATLAS=Object.freeze({color:'/textures/plants/leaf-albedo.png',normal:'/textures/plants/leaf-normal.png'});
// Bark tiles from Denis's maps (scripts/plants/build-bark-textures.mjs):
// albedo, normal and a surface map (R ambient occlusion, G roughness,
// B height); `tile` is the metres of bark one repeat covers.
export const BARK_TILE=Object.freeze({oleaster:.45,tamarisk:.4,plum:.3,elm:.5});
export const barkAtlasSpec=(kind,lowPower=false)=>{const base=`/textures/plants/bark/${lowPower?'mobile/':''}${kind}`;return {kind,color:`${base}-albedo.webp`,normal:`${base}-normal.webp`,surface:`${base}-surface.webp`,tile:BARK_TILE[kind]};};
// A species atlas may add a surface map (R AO, G roughness, B translucency)
// and be single-sided: the same cutout seen from both faces. `bark` adds the
// bark tile of the species.
export function usePlantAtlas(spec=LEAF_ATLAS){
 const {gl}=useThree();
 const bark=spec.bark??null;
 const urls=useMemo(()=>[spec.color,spec.normal].concat(spec.surface?[spec.surface]:[]).concat(bark?[bark.color,bark.normal,bark.surface]:[]),[spec.color,spec.normal,spec.surface,bark]);
 const maps=useLoader(THREE.TextureLoader,urls);
 const color=maps[0],normal=maps[1],surface=spec.surface?maps[2]:null,barkStart=spec.surface?3:2;
 const barkColor=bark?maps[barkStart]:null,barkNormal=bark?maps[barkStart+1]:null,barkSurface=bark?maps[barkStart+2]:null;
 const [atlas,setAtlas]=useState(null),[revision,setRevision]=useState(0);
 useEffect(()=>{const restore=()=>setRevision(v=>v+1);gl.domElement.addEventListener('webglcontextrestored',restore);return()=>gl.domElement.removeEventListener('webglcontextrestored',restore);},[gl]);
 useLayoutEffect(()=>{
  color.colorSpace=THREE.SRGBColorSpace;normal.colorSpace=THREE.NoColorSpace;if(surface)surface.colorSpace=THREE.NoColorSpace;
  for(const map of [color,normal,surface]){if(!map)continue;map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());map.needsUpdate=true;}
  if(barkColor){
   barkColor.colorSpace=THREE.SRGBColorSpace;barkNormal.colorSpace=THREE.NoColorSpace;barkSurface.colorSpace=THREE.NoColorSpace;
   for(const map of [barkColor,barkNormal,barkSurface]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());map.needsUpdate=true;}
  }
  setAtlas({color:{texture:color},normal:{texture:normal},surface:surface?{texture:surface}:null,singleSided:Boolean(spec.singleSided),alphaTest:spec.alphaTest??.43,normalScale:spec.normalScale??.22,
   bark:barkColor?{kind:bark.kind,color:{texture:barkColor},normal:{texture:barkNormal},surface:{texture:barkSurface},tile:bark.tile}:null});
  // useLoader caches these maps. They stay shared across collections/mounts;
  // shape-dependent render targets are disposed by PlantPopulation.
 },[gl,color,normal,surface,barkColor,barkNormal,barkSurface,bark,revision,spec.singleSided,spec.alphaTest,spec.normalScale]);
 return atlas;
}
