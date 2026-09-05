import * as THREE from 'three';
export const TERRAIN_MATERIAL_LAYERS=['sand','shells','sandstone','loam','ground-fresh','ground-dry'];
export const TERRAIN_MAP_NAMES=TERRAIN_MATERIAL_LAYERS.flatMap(name=>['color','normal','surface'].map(channel=>name+'-'+channel));

// WebGL2 arrays use three samplers for six complete PBR materials. Individual
// layers have independent repeat/mips: no atlas gutters or tile-edge bleeding.
export function createTerrainTextureArrays(images,lowPower=false,anisotropy=4){
 const size=lowPower?512:1024,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),maps={};
 for(const channel of ['color','normal','surface']){
  const data=new Uint8Array(size*size*4*TERRAIN_MATERIAL_LAYERS.length);
  TERRAIN_MATERIAL_LAYERS.forEach((layer,index)=>{
   ctx.setTransform(1,0,0,-1,0,size);ctx.clearRect(0,0,size,size);
   ctx.drawImage(images[layer+'-'+channel].image,0,0,size,size);
   data.set(ctx.getImageData(0,0,size,size).data,index*size*size*4);
  });
  const map=new THREE.DataArrayTexture(data,size,size,TERRAIN_MATERIAL_LAYERS.length);
  map.name='azov-'+channel+'-layers';map.colorSpace=channel==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  map.generateMipmaps=true;map.anisotropy=anisotropy;map.needsUpdate=true;maps[channel]=map;
 }
 return {maps,size,layers:TERRAIN_MATERIAL_LAYERS.length,bytes:Math.round(size*size*4*TERRAIN_MATERIAL_LAYERS.length*3*4/3),dispose(){Object.values(maps).forEach(map=>map.dispose());}};
}
