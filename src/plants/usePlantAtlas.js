import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';

// The oleaster leaf: front and back halves of one map, split in the shader.
export const LEAF_ATLAS=Object.freeze({color:'/textures/plants/leaf-albedo.png',normal:'/textures/plants/leaf-normal.png'});
// A species atlas may add a surface map (R AO, G roughness, B translucency)
// and be single-sided: the same cutout seen from both faces.
export function usePlantAtlas(spec=LEAF_ATLAS){
 const {gl}=useThree();
 const urls=useMemo(()=>[spec.color,spec.normal].concat(spec.surface?[spec.surface]:[]),[spec.color,spec.normal,spec.surface]);
 const maps=useLoader(THREE.TextureLoader,urls);
 const [color,normal,surface]=maps;
 const [atlas,setAtlas]=useState(null),[revision,setRevision]=useState(0);
 useEffect(()=>{const restore=()=>setRevision(v=>v+1);gl.domElement.addEventListener('webglcontextrestored',restore);return()=>gl.domElement.removeEventListener('webglcontextrestored',restore);},[gl]);
 useLayoutEffect(()=>{
  color.colorSpace=THREE.SRGBColorSpace;normal.colorSpace=THREE.NoColorSpace;if(surface)surface.colorSpace=THREE.NoColorSpace;
  for(const map of [color,normal,surface]){if(!map)continue;map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());map.needsUpdate=true;}
  setAtlas({color:{texture:color},normal:{texture:normal},surface:surface?{texture:surface}:null,singleSided:Boolean(spec.singleSided),alphaTest:spec.alphaTest??.43,normalScale:spec.normalScale??.22});
  // useLoader caches these maps. They stay shared across collections/mounts;
  // shape-dependent render targets are disposed by PlantPopulation.
 },[gl,color,normal,surface,revision,spec.singleSided,spec.alphaTest,spec.normalScale]);
 return atlas;
}
