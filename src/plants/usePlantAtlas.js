import {useEffect,useLayoutEffect,useState} from 'react';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';

export function usePlantAtlas(){
 const {gl}=useThree();
 const [color,normal]=useLoader(THREE.TextureLoader,['/textures/plants/leaf-albedo.png','/textures/plants/leaf-normal.png']);
 const [atlas,setAtlas]=useState(null),[revision,setRevision]=useState(0);
 useEffect(()=>{const restore=()=>setRevision(v=>v+1);gl.domElement.addEventListener('webglcontextrestored',restore);return()=>gl.domElement.removeEventListener('webglcontextrestored',restore);},[gl]);
 useLayoutEffect(()=>{
  color.colorSpace=THREE.SRGBColorSpace;normal.colorSpace=THREE.NoColorSpace;
  for(const map of [color,normal]){map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());map.needsUpdate=true;}
  setAtlas({color:{texture:color},normal:{texture:normal}});
  // useLoader caches these maps. They stay shared across collections/mounts;
  // shape-dependent render targets are disposed by PlantPopulation.
 },[gl,color,normal,revision]);
 return atlas;
}
