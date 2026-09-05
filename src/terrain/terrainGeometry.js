import * as THREE from 'three';
import { coastPoint, coastHeight, sampleTerrainNormal, COAST_STRIP_LENGTH } from './terrainModel.js';
import { coastProfile } from './terrainLandforms.js';
const subdivisions = (a,b,n,out) => { for(let i=0;i<n;i++)out.push(a+(b-a)*i/n); };
function buildStrip(p,s0,lod=2,water=false) {
  const along=(water?[128,32,8]:[128,64,32])[lod],detail=[1,.5,.25][lod];
  const profile = s => {
    const qs=[];
    // Resolve the wave across the shore even in the far LOD. Terrain rows
    // follow the bluff's foot and crown instead of cutting across its bend.
    // Let the unified V2 coast surface fade out where coastMask itself begins.
    // Its offshore edge is therefore outside the visible surf band rather than
    // a material boundary at q=-32.
    if(water) {
      subdivisions(-96,-32,lod===0?48:24,qs);
      subdivisions(-32,8,lod===0?160:80,qs);
    }
    else {
      const f=coastProfile(s,p),start=f.foot,top=f.top;
      const wet=Math.min(1.4,start*.4),edge=p.terrainLandWidth-48;
      const plateau=Math.min(top+Math.max(8,f.bank*3),edge-1);
      const bands=[[-96,-32,8],[-32,-4,16],[-4,wet,20],[wet,start,12],
        [start,start+f.width*.5,12],[start+f.width*.5,start+f.width*.58,8],[start+f.width*.58,start+f.width*.76,8],
        [start+f.width*.76,top,16],[top,plateau,20],[plateau,edge,24],[edge,p.terrainLandWidth,16]];
      for(const [a,b,n] of bands)subdivisions(a,b,Math.max(2,Math.round(n*detail)),qs);
    }
    qs.push(water?8:p.terrainLandWidth);return qs;
  };
  const width=profile(s0).length,positions=[],normals=[],uvs=[],indices=[];
  const s1=Math.min(p.terrainLength*.5,s0+COAST_STRIP_LENGTH);
  for(let j=0;j<=along;j++) {
    const s=s0+(s1-s0)*j/along;
    for(const q of profile(s)){const {x,z}=coastPoint(q,s,p),y=water?0:coastHeight(q,s,p);const n=water?{x:0,y:1,z:0}:sampleTerrainNormal(x,z,p);
      positions.push(x,y,z);normals.push(n.x,n.y,n.z);uvs.push(x,z);}
  }
  for(let j=0;j<along;j++)for(let i=0;i<width-1;i++){const a=j*width+i,b=a+1,c=a+width;indices.push(a,c,b,b,c,c+1);}
  // Skirts hide only inter-LOD cracks; shared analytical normals stay continuous.
  if(!water) for(const row of [0,along]) {
    const start=positions.length/3;
    for(let i=0;i<width;i++) {const at=(row*width+i)*3;positions.push(positions[at],positions[at+1]-Math.max(2,p.terrainCliffHeight*.8),positions[at+2]);normals.push(normals[at],normals[at+1],normals[at+2]);uvs.push(uvs[(row*width+i)*2],uvs[(row*width+i)*2+1]);}
    for(let i=0;i<width-1;i++) {const a=row*width+i,b=start+i;if(row===0)indices.push(a,a+1,b,b,a+1,b+1);else indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  if(water){geometry.boundingBox.min.y=-.5;geometry.boundingBox.max.y=.5;geometry.boundingSphere.radius+=.5;}
  geometry.userData={lod,water,width,along,topVertices:(along+1)*width,topTriangles:along*(width-1)*2};return geometry;
}
export function terrainLod(distance,lowPower=false) { return distance<85?(lowPower?1:0):distance<280?1:2; }

// Nested profiles retain the foot, landslide bench and headwall at every LOD.
// Fine vertices collapse onto the parent's actual triangles, including X/Z:
// moving only height would leave a coastline snap as the curved rows change.
export function buildTerrainStrip(p,s0,lod=2,water=false){
 const geometry=buildStrip(p,s0,lod,water);
 if(water||lod===2)return geometry;
 const coarse=buildStrip(p,s0,lod+1,false),{width,along}=geometry.userData;
 const cw=coarse.userData.width,ca=coarse.userData.along;
 const positions=new Float32Array(geometry.attributes.position.array.length),normals=new Float32Array(positions.length);
 const sample=(row,col,source,target,at)=>{
  const x=col*(cw-1)/(width-1),z=row*ca/along,ix=Math.min(cw-2,Math.floor(x)),iz=Math.min(ca-1,Math.floor(z));
  const fx=x-ix,fz=z-iz,a=iz*cw+ix,b=a+1,c=a+cw,d=c+1;
  const ids=fx+fz<=1?[a,c,b]:[b,c,d],weights=fx+fz<=1?[1-fx-fz,fz,fx]:[1-fz,1-fx,fx+fz-1];
  for(let k=0;k<3;k++)target[at+k]=ids.reduce((sum,id,i)=>sum+source[id*3+k]*weights[i],0);
 };
 for(let row=0;row<=along;row++)for(let col=0;col<width;col++){
  const at=(row*width+col)*3;sample(row,col,coarse.attributes.position.array,positions,at);sample(row,col,coarse.attributes.normal.array,normals,at);
 }
 for(let edge=0;edge<2;edge++)for(let col=0;col<width;col++){
  const at=(geometry.userData.topVertices+edge*width+col)*3,from=(edge*along*width+col)*3;
  for(let k=0;k<3;k++){positions[at+k]=positions[from+k];normals[at+k]=normals[from+k];}
  positions[at+1]-=Math.max(2,p.terrainCliffHeight*.8);
 }
 geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(positions,3)];
 geometry.morphAttributes.normal=[new THREE.Float32BufferAttribute(normals,3)];
 geometry.computeBoundingBox();geometry.computeBoundingSphere();coarse.dispose();return geometry;
}
