import * as THREE from 'three';
// Sparse root deposits, packed as litter/vigor, and in blue the moist halo of
// shade around shrubs, trees and boulders where the sand greens. Generated from
// the same plant placements and ecology; a single filtered lookup for the
// terrain material. halos: extra shade sources {x,z,radius} - the boulders.
export function createPlantCover(plants,resolution=256,halos=[]){
 const bounds=new THREE.Vector4(0,0,1,1);
 if(plants.length){
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  for(const p of plants){x0=Math.min(x0,p.x-6);z0=Math.min(z0,p.z-6);x1=Math.max(x1,p.x+6);z1=Math.max(z1,p.z+6);}
  bounds.set(x0,z0,x1-x0,z1-z0);
 }
 const data=new Uint8Array(resolution*resolution*4);
 // Sources outside the bounds paint nothing: the texel range clamps to the edge.
 const paint=(px,pz,radius,write)=>{
  const x0=Math.max(0,Math.floor((px-radius-bounds.x)/bounds.z*resolution)),x1=Math.min(resolution-1,Math.ceil((px+radius-bounds.x)/bounds.z*resolution));
  const z0=Math.max(0,Math.floor((pz-radius-bounds.y)/bounds.w*resolution)),z1=Math.min(resolution-1,Math.ceil((pz+radius-bounds.y)/bounds.w*resolution));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const wx=bounds.x+(x+.5)/resolution*bounds.z,wz=bounds.y+(z+.5)/resolution*bounds.w;
   write((z*resolution+x)*4,(wx-px)**2+(wz-pz)**2);
  }
 };
 for(const p of plants)paint(p.x,p.z,p.scale*2.5,(index,d2)=>{
  const weight=Math.exp(-d2/(p.scale*p.scale*.75));
  data[index]=Math.max(data[index],Math.round(255*weight*(.3+.7*p.dryness)));
  data[index+1]=Math.max(data[index+1],Math.round(255*weight*(1-p.dryness)));data[index+3]=255;
 });
 const shade=[...plants.map(p=>({x:p.x,z:p.z,radius:1.5+p.scale*2,strength:1-p.dryness*.5})),...halos];
 for(const h of shade)paint(h.x,h.z,h.radius,(index,d2)=>{
  const weight=Math.exp(-d2/(h.radius*h.radius*.35))*(h.strength??1);
  data[index+2]=Math.max(data[index+2],Math.round(255*weight));data[index+3]=255;
 });
 const texture=new THREE.DataTexture(data,resolution,resolution,THREE.RGBAFormat);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return {texture,bounds,dispose(){texture.dispose();}};
}
