import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrainDefinition,createTerrainQuery,coastPoint,sampleTerrainHeight,sampleTerrainSurface} from '../src/terrain/terrainModel.js';
import {coastProfile,coastPathMask} from '../src/terrain/terrainLandforms.js';
import {fitTerrainShadow} from '../src/terrain/terrainShadow.js';
import {buildTerrainStrip} from '../src/terrain/terrainGeometry.js';

const p=createTerrainDefinition(),disabled=createTerrainDefinition({terrainLandslides:0,terrainErosion:0,terrainPaths:0});
const peaks={slide:0,ravine:0,descent:0};let cuts=0,paths=0,maxContinuity=0;
for(let s=-700;s<700;s+=.5){
 const f=coastProfile(s,p);for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],f[key]);
 const off=coastProfile(s,disabled);assert.equal(off.slide+off.ravine+off.descent,0);
 const q=(f.foot+f.top)/2,point=coastPoint(q,s,p);
 if(Math.abs(sampleTerrainHeight(point.x,point.z,p)-sampleTerrainHeight(point.x,point.z,disabled))>.5)cuts++;
 for(const q of [8,25,40,60])if(coastPathMask(q,s,p)>.7){
  const point=coastPoint(q,s,p),surface=sampleTerrainSurface(point.x,point.z,p);
  assert.equal(surface.vegetation.shrubs,0,'Path centre excludes shrubs');paths++;
 }
}
assert.ok(peaks.slide>.7&&peaks.ravine>.4&&peaks.descent>.99&&cuts>250&&paths>0,JSON.stringify({peaks,cuts,paths}));
for(let cell=-30;cell<=30;cell++)for(const q of [0,12,20,28,48]){
 const a=coastPoint(q,cell*p.terrainFeatureScale-1e-6,p),b=coastPoint(q,cell*p.terrainFeatureScale+1e-6,p);
 maxContinuity=Math.max(maxContinuity,Math.abs(sampleTerrainHeight(a.x,a.z,p)-sampleTerrainHeight(b.x,b.z,p)));
}
assert.ok(maxContinuity<.0001,'No landform cell seams');

const errors=[],habitatErrors=[];let morphError=0,triangles=0;
const ray=new THREE.Raycaster(),material=new THREE.MeshBasicMaterial(),v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
for(const start of [-96,-32,32,96]){
 const g=buildTerrainStrip(p,start,0),pos=g.attributes.position,idx=g.index;
 triangles+=idx.count/3;
 for(let i=0;i<g.userData.topTriangles*3;i+=3){
  v.forEach((point,k)=>point.fromBufferAttribute(pos,idx.getX(i+k)));
  const centre=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);
  const error=Math.abs(centre.y-sampleTerrainHeight(centre.x,centre.z,p));errors.push(error);
  if(i%27===0&&sampleTerrainSurface(centre.x,centre.z,p).vegetation.shrubs>.2)habitatErrors.push(error);
 }
 g.dispose();
 for(const lod of [0,1]){
  const fine=buildTerrainStrip(p,start,lod),coarse=buildTerrainStrip(p,start,lod+1),mesh=new THREE.Mesh(coarse,material);
  mesh.updateMatrixWorld();const target=fine.morphAttributes.position[0];
  // Actual triangle interiors must lie on the parent, not just its vertices.
  for(let t=0;t<150;t++){
   const at=((t*7919)%fine.userData.topTriangles)*3;
   v.forEach((point,k)=>point.fromBufferAttribute(target,fine.index.getX(at+k)));
   const centre=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);
   ray.set(new THREE.Vector3(centre.x,50,centre.z),new THREE.Vector3(0,-1,0));
   const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
   morphError=Math.max(morphError,Math.abs(hit.point.y-centre.y));
   for(const blend of [.25,.5,.75]){
    v.forEach((point,k)=>point.fromBufferAttribute(fine.attributes.position,fine.index.getX(at+k)).lerp(new THREE.Vector3().fromBufferAttribute(target,fine.index.getX(at+k)),blend));
    assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).y>0,'Morph never flips a terrain triangle');
   }
  }
  fine.dispose();coarse.dispose();
 }
}
errors.sort((a,b)=>a-b);habitatErrors.sort((a,b)=>a-b);
const p99=errors[Math.floor(errors.length*.99)],rootP99=habitatErrors[Math.floor(habitatErrors.length*.99)];
assert.ok(morphError<.0001,'LOD switch has the same surface');
assert.ok(p99<.06&&errors.at(-1)<.19,'Near terrain remains close to the physical query');
assert.ok(rootP99<.06,'Plant roots retain the inset contact budget');
const lightDirection=new THREE.Vector3(-.6,.7,.3).normalize(),query=createTerrainQuery(p);
const hero=fitTerrainShadow(new THREE.Vector3(0,3,10),new THREE.Vector3(0,-.2,-1).normalize(),lightDirection,query,6,1024);
assert.equal(hero.weight,0);assert.equal(hero.radius,6);assert.equal(hero.near,5);assert.equal(hero.far,19);assert.equal(hero.centre.length(),0);
const target=coastPoint(24,100,p),eye=coastPoint(8,88,p);eye.y=4;target.y=4;
const cameraPosition=new THREE.Vector3(eye.x,eye.y,eye.z),view=new THREE.Vector3(target.x,target.y,target.z).sub(cameraPosition).normalize();
const fit=fitTerrainShadow(cameraPosition,view,lightDirection,query,6,512),hit=query.raycast(cameraPosition,view,130);
assert.equal(fit.weight,1);assert.ok(fit.radius>=18&&fit.radius<=64);assert.ok(hit&&fit.centre.distanceTo(new THREE.Vector3().copy(hit.point))<fit.texel*1.5,'Shadow map follows the visible land');
assert.ok(fit.far>fit.standoff&&fit.near<fit.standoff);
material.dispose();
console.log(JSON.stringify({passed:true,peaks,visibleDeformations:cuts,pathSamples:paths,maxCellSeamMetres:maxContinuity,morphErrorMetres:morphError,nearP99Metres:p99,nearWorstMetres:errors.at(-1),plantContactP99Metres:rootP99,triangles},null,2));
