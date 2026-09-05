import * as THREE from 'three';
// Sparse root deposits, packed as litter/vigor. Generated from the same plant
// placements and ecology; a single filtered lookup for the terrain material.
export function createPlantCover(plants,resolution=256){
 const bounds=new THREE.Vector4(0,0,1,1);
 if(plants.length){
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  for(const p of plants){x0=Math.min(x0,p.x-3);z0=Math.min(z0,p.z-3);x1=Math.max(x1,p.x+3);z1=Math.max(z1,p.z+3);}
  bounds.set(x0,z0,x1-x0,z1-z0);
 }
 const data=new Uint8Array(resolution*resolution*4);
 for(const p of plants){
  const radius=p.scale*2.5;
  const x0=Math.max(0,Math.floor((p.x-radius-bounds.x)/bounds.z*resolution)),x1=Math.min(resolution-1,Math.ceil((p.x+radius-bounds.x)/bounds.z*resolution));
  const z0=Math.max(0,Math.floor((p.z-radius-bounds.y)/bounds.w*resolution)),z1=Math.min(resolution-1,Math.ceil((p.z+radius-bounds.y)/bounds.w*resolution));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const wx=bounds.x+(x+.5)/resolution*bounds.z,wz=bounds.y+(z+.5)/resolution*bounds.w;
   const weight=Math.exp(-((wx-p.x)**2+(wz-p.z)**2)/(p.scale*p.scale*.75)),index=(z*resolution+x)*4;
   data[index]=Math.max(data[index],Math.round(255*weight*(.3+.7*p.dryness)));
   data[index+1]=Math.max(data[index+1],Math.round(255*weight*(1-p.dryness)));data[index+3]=255;
  }
 }
 const texture=new THREE.DataTexture(data,resolution,resolution,THREE.RGBAFormat);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return {texture,bounds,dispose(){texture.dispose();}};
}
