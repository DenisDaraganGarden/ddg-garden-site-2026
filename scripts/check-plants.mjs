import assert from 'node:assert/strict';
import {plantDrynessAt,ecologyPatch} from '../src/plants/plantEcology.js';
import {createPlantCover} from '../src/plants/plantCover.js';
import * as THREE from 'three';
import {makeOleaster,makeBranchGeometry,makeLeafGeometry,selectPlantLod} from '../src/plants/oleasterModel.js';
import {scatterPlants,createPlantLabTerrain,plantGroundCover} from '../src/plants/plantHabitat.js';

let geometryCount=0,attachmentCount=0;
for(const options of [{},{seed:1,height:.45,spread:2.5},{seed:200,height:2.4,spread:.6,leafSize:1.6}]){
 const model=makeOleaster(options),again=makeOleaster(options);
 assert.deepEqual(model.leaves.map(l=>l.pivot.toArray()),again.leaves.map(l=>l.pivot.toArray()),'same seed must regenerate exactly');
 for(const b of model.branches){
  if(b.parent>=0){assert.ok(b.curve.v0.distanceTo(model.branches[b.parent].curve.getPoint(b.parentT))<1e-9);attachmentCount++;}
 }
 for(const l of model.leaves){assert.ok(l.pivot.distanceTo(model.branches[l.parent].curve.getPoint(l.t))<1e-9);assert.ok(l.normal.y>0,'leaf front must face the upper hemisphere');attachmentCount++;}
 const budgets=[];
 for(let lod=0;lod<2;lod++){
  const bark=makeBranchGeometry(model,lod),leaf=makeLeafGeometry(model,lod);budgets.push((bark.index.count+leaf.index.count)/3);
  for(const g of [bark,leaf]){
   geometryCount++;for(const attr of Object.values(g.attributes))assert.ok(attr.array.every(Number.isFinite));
   const n=g.attributes.normal;for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
   const pos=g.attributes.position;for(let i=0;i<pos.count;i++)assert.ok(g.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(pos,i)),'wind bounds contain every vertex');
  }
  // First tube cross-section: visible surface normals point away from its centre.
  const root=model.branches[0].curve.v0;
  for(let i=0;i<(lod?4:7);i++){
   const radial=new THREE.Vector3().fromBufferAttribute(bark.attributes.position,i).sub(root);
   assert.ok(radial.dot(new THREE.Vector3().fromBufferAttribute(bark.attributes.normal,i))>0,'outward branch winding');
  }
  const stride=lod===0?15:4;
  for(let i=0;i<model.leaves.length;i++){
   const base=i*stride,l=model.leaves[i],p=leaf.attributes.leafPivot;
   assert.ok(new THREE.Vector3().fromBufferAttribute(p,base).distanceTo(l.pivot)<2e-7,'leaf geometry retains its petiole pivot');
   const left=new THREE.Vector3().fromBufferAttribute(leaf.attributes.position,base),right=new THREE.Vector3().fromBufferAttribute(leaf.attributes.position,base+(lod?1:2));
   assert.ok(left.add(right).multiplyScalar(.5).distanceTo(l.pivot)<2e-7,'leaf base midpoint remains on the branch in every LOD');
  }
  bark.dispose();leaf.dispose();
 }
 assert.ok(budgets[1]<budgets[0]*.24,'mid LOD saves at least 76 percent of triangles');
}
assert.equal(selectPlantLod(1,700,1,true),0,'mobile close-ups retain curved leaves');
assert.equal(selectPlantLod(6,200,0,true),1);
assert.equal(selectPlantLod(50,60,1),2);
assert.equal(selectPlantLod(50,60,2,true,.7),2,'aerial views use the upper canopy projection');
assert.equal(selectPlantLod(50,60,2,true,-.7),1,'underside views retain 3D foliage');
assert.equal(selectPlantLod(45,90,2),2,'far hysteresis');
assert.equal(selectPlantLod(30,110,2),1,'return from far');
const query=createPlantLabTerrain(.12,.3,1),options={seed:7,count:64,pathMask:query.pathMask},plants=scatterPlants(query,options);
assert.deepEqual(plants,scatterPlants(query,options));assert.ok(plants.length>20);
for(const p of plants){assert.equal(p.y,query.heightAt(p.x,p.z));assert.ok(query.pathMask(p.x,p.z)<1);assert.ok(p.exposure>0);}
for(let i=0;i<plants.length;i++)for(let j=i+1;j<plants.length;j++)assert.ok(Math.hypot(plants[i].x-plants[j].x,plants[i].z-plants[j].z)>=1.15);
assert.equal(scatterPlants({...query,surfaceAt:()=>({height:1,normal:{y:.2}})}).length,0,'steep cliffs exclude shrubs');
assert.equal(scatterPlants({...query,surfaceAt:()=>({height:1,normal:{y:1},wetness:1})}).length,0,'water excludes shrubs');
assert.equal(scatterPlants({...query,surfaceAt:()=>({height:-1,normal:{y:1}})}).length,0,'submerged terrain excludes shrubs');
assert.equal(createPlantLabTerrain(0,0,0).pathMask(0,0),0,'zero path width disables the path');
const dry=plantGroundCover(0,0,[{x:0,z:0,scale:1,dryness:1}]),green=plantGroundCover(0,0,[{x:0,z:0,scale:1,dryness:0}]);
assert.ok(dry.litter>green.litter&&green.vigor>dry.vigor,'ground cover follows plant health');
console.log(JSON.stringify({passed:true,geometries:geometryCount,attachments:attachmentCount,habitatPlants:plants.length}));

let neighbourDelta=0,distantDelta=0;
for(let i=0;i<120;i++){
 const x=i*.73,z=Math.sin(i*.6)*20;
 for(const dryness of [0,1])assert.equal(plantDrynessAt(x,1,z,{dryness},.7),dryness,'dryness endpoints remain literal');
 const value=ecologyPatch(x,z,7,23);neighbourDelta+=Math.abs(value-ecologyPatch(x+.12,z+.12,7,23));distantDelta+=Math.abs(value-ecologyPatch(x+9,z+9,7,23));
}
assert.ok(neighbourDelta<distantDelta*.06,'nearby foliage belongs to correlated colonies');
const large=scatterPlants(createPlantLabTerrain(.12,.4,.7,64),{count:512,extent:63});assert.equal(large.length,512);
const changed=scatterPlants(createPlantLabTerrain(.12,.4,.7,64),{count:512,extent:63,ecology:{dryness:.8,patchContrast:1}});
assert.deepEqual(large.map(p=>[p.x,p.y,p.z,p.yaw,p.scale]),changed.map(p=>[p.x,p.y,p.z,p.yaw,p.scale]),'colour edits preserve root identities');
const cover=createPlantCover(large);assert.ok(cover.texture.image.data.some(v=>v>0));cover.dispose();
console.log(JSON.stringify({largePopulation:large.length,neighbourCorrelation:neighbourDelta/distantDelta}));
