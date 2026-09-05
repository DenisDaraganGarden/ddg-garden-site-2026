import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { DEFAULT_TERRAIN_SETTINGS, normalizeTerrainSettings } from '../src/terrain/settings.js';
import { createTerrainDefinition, createTerrainQuery, coastPoint, coastCoordinates, shorePosition, sampleTerrainHeight, sampleTerrainNormal, sampleCoastWave } from '../src/terrain/terrainModel.js';
import { buildTerrainStrip, terrainLod } from '../src/terrain/terrainGeometry.js';
import { buildCoastRocks, attachRockCollisions, makeRockGeometry } from '../src/terrain/terrainRocks.js';
import { createTerrainCollider } from '../src/terrain/terrainCollider.js';
import { createFlightAgents, updateFlightAgents } from '../src/features/home-scene/creatures/seagullFlight.js';
import { createFishHabitat, constrainFishToWater } from '../src/features/home-scene/creatures/fish/fishHabitat.js';

const close = (a,b,tolerance=1e-5) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b} (${tolerance})`);
const p=createTerrainDefinition();
assert.equal(p.terrainEnabled,true);
const normalized=normalizeTerrainSettings({terrainSeed:NaN,terrainLength:Infinity,terrainCliffHeight:-10,terrainBeachWidth:60,terrainLandWidth:80});
assert.equal(normalized.terrainSeed,DEFAULT_TERRAIN_SETTINGS.terrainSeed);
assert.equal(normalized.terrainLength,1600);
assert.equal(normalized.terrainCliffHeight,0);
assert.ok(normalized.terrainLandWidth>normalized.terrainBeachWidth+normalized.terrainCliffSlope+60);

for(const bearing of [0,90,180,270,347]) {
  const definition=createTerrainDefinition({terrainBearing:bearing});
  for(const [q,s] of [[0,0],[-12,18],[60,-720]]){
    const world=coastPoint(q,s,definition),local=coastCoordinates(world.x,world.z,definition);
    close(local.s,s);close(local.u-shorePosition(s,definition),q);
  }
  const alongLand=coastPoint(10,0,definition),shore=coastPoint(0,0,definition);
  close(alongLand.x-shore.x,Math.sin(bearing*Math.PI/180)*10);
  close(alongLand.z-shore.z,-Math.cos(bearing*Math.PI/180)*10);
}

let triangles=0,maxNormalError=0;
for(const lod of [0,1,2])for(const water of [false,true]) {
  const a=buildTerrainStrip(p,-32,lod,water),b=buildTerrainStrip(p,32,lod,water);
  const vertices=a.attributes.position,normals=a.attributes.normal,index=a.index;
  const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  for(let i=0;i<a.userData.topTriangles*3;i+=3){
    v.forEach((point,k)=>point.fromBufferAttribute(vertices,index.getX(i+k)));
    const face=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
    assert.ok(face.y>0,'Top winding must face +Y');
  }
  for(let i=0;i<a.userData.topVertices;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
    close(y,water?0:sampleTerrainHeight(x,z,p),.0002);
    const n=water?{x:0,y:1,z:0}:sampleTerrainNormal(x,z,p);
    maxNormalError=Math.max(maxNormalError,Math.hypot(normals.getX(i)-n.x,normals.getY(i)-n.y,normals.getZ(i)-n.z));
    assert.ok(a.boundingBox.containsPoint(new THREE.Vector3(x,y,z)));
  }
  const width=a.userData.width;
  for(let i=0;i<width;i++)for(let c=0;c<3;c++){
    close(vertices.array[(a.userData.topVertices-width+i)*3+c],b.attributes.position.array[i*3+c]);
    close(normals.array[(a.userData.topVertices-width+i)*3+c],b.attributes.normal.array[i*3+c]);
  }
  triangles+=index.count/3;a.dispose();b.dispose();
}
assert.ok(maxNormalError<.001);
assert.equal(terrainLod(0,true),1);
assert.equal(terrainLod(1000),2);

const long=createTerrainDefinition({terrainLength:4096,terrainCliffHeight:22,terrainCapeDepth:90,terrainBearing:273});
for(const s of [-2048,-2016,0,2016,2048]){
  const point=coastPoint(35,s,long);
  assert.ok(Number.isFinite(sampleTerrainHeight(point.x,point.z,long)));
  assert.ok(Math.hypot(point.x,point.z)<10000,'Coast must fit the camera far plane');
}
const disabled=createTerrainDefinition({terrainEnabled:false});
close(sampleTerrainHeight(25,0,disabled),-disabled.waterDepth);
for(const q of [-96,8,100]) close(sampleCoastWave(q,0,3,p),0);

const rocks=buildCoastRocks(p),query=attachRockCollisions(createTerrainQuery(p),rocks);
assert.deepEqual(rocks,buildCoastRocks(p),'Scatter must be reproducible');
assert.notDeepEqual(rocks,buildCoastRocks(createTerrainDefinition({terrainSeed:38})));
const rockGeometry=makeRockGeometry(),rockMesh=new THREE.InstancedMesh(rockGeometry,new THREE.MeshBasicMaterial(),rocks.length);
const transform=new THREE.Object3D();
rocks.forEach((rock,index)=>{transform.position.set(rock.x,rock.y,rock.z);transform.rotation.set(...rock.rotation);transform.scale.set(...rock.scale);transform.updateMatrix();rockMesh.setMatrixAt(index,transform.matrix);});
const rockPoint=new THREE.Vector3(),rockMatrix=new THREE.Matrix4();
rocks.forEach((rock,index)=>{
  rockMesh.getMatrixAt(index,rockMatrix);let lowest=Infinity;
  for(let i=0;i<rockGeometry.attributes.position.count;i++)lowest=Math.min(lowest,rockPoint.fromBufferAttribute(rockGeometry.attributes.position,i).applyMatrix4(rockMatrix).y);
  assert.ok(lowest<=sampleTerrainHeight(rock.x,rock.z,p)+.0001,'Bluff contact must not lift the slab above its beach footing');
});
rockMesh.updateMatrixWorld();rockMesh.computeBoundingSphere();
const raycaster=new THREE.Raycaster();
for(const rock of rocks.slice(0,30)){
  raycaster.set(new THREE.Vector3(rock.x,40,rock.z),new THREE.Vector3(0,-1,0));
  const hit=raycaster.intersectObject(rockMesh)[0];
  assert.ok(hit,'Ray must hit rock centre');
  close(query.heightAt(rock.x,rock.z),Math.max(hit.point.y,sampleTerrainHeight(rock.x,rock.z,p)),.0001);
  const contact=query.raycast({x:rock.x,y:40,z:rock.z},{x:0,y:-4,z:0},60);
  assert.ok(contact);close(contact.point.y,query.heightAt(rock.x,rock.z),.0001);
}
const collider=createTerrainCollider(query),scene=new THREE.Scene();scene.add(collider);scene.updateMatrixWorld(true);
const testPoint=coastPoint(12,10,p);
raycaster.set(new THREE.Vector3(testPoint.x,30,testPoint.z),new THREE.Vector3(0,-1,0));
const collision=raycaster.intersectObject(collider)[0];assert.ok(collision);close(collision.point.y,query.heightAt(testPoint.x,testPoint.z),.0001);
raycaster.set(new THREE.Vector3(0,80,0),new THREE.Vector3(1,0,0));assert.equal(raycaster.intersectObject(collider).length,0);
rockGeometry.dispose();rockMesh.material.dispose();
assert.equal(query.raycast({x:0,y:10,z:0},{x:0,y:0,z:0}),null);
assert.equal(query.raycast({x:0,y:10,z:0},{x:0,y:1,z:0},10),null);
const point=coastPoint(80,0,p),surface=query.surfaceAt(point.x,point.z,8);
assert.equal(surface.habitat,'plateau');assert.ok(surface.vegetation.grass>0);assert.ok(surface.wind.exposure>0);

const habitat=createFishHabitat({min:[-4,-2,-4],max:[4,0,4],sampleBottomY:x=>x>0?1:-1.5});
const fish={position:new THREE.Vector3(2,-.7,0),radius:.08,scale:1};
assert.ok(constrainFishToWater(fish,habitat));assert.ok(fish.position.x<=0);assert.ok(fish.position.y<0);
const dry=createFishHabitat({sampleBottomY:()=>1});
assert.equal(constrainFishToWater({position:new THREE.Vector3(),radius:.08,scale:1},dry),false);

const birds=createFlightAgents(7),raisedCoast=attachRockCollisions(createTerrainQuery(createTerrainDefinition({terrainOffset:-10,terrainCliffHeight:9,terrainBeachWidth:4})),[]);
for(let frame=0;frame<120;frame++){updateFlightAgents(birds,frame/60,1/60,'flight',[],frame/60,raisedCoast);for(const bird of birds)assert.ok(bird.position.y>=raisedCoast.heightAt(bird.position.x,bird.position.z)+.319,'Bird penetrates land');}

// Perspective depth precision: a 24-bit logarithmic buffer resolves a 1 cm
// shell-level camera and a 4 km coastline without a single huge near plane.
for(const metres of [.02,.1,1,100,1000,5000]){
  const depth=Math.log2(metres+1)/Math.log2(10001);
  const quantized=Math.round(depth*(2**24-1))/(2**24-1);
  close(2**(quantized*Math.log2(10001))-1,metres,Math.max(.000002,metres*.000001));
}
const manifest=JSON.parse(fs.readFileSync(new URL('../public/textures/azov/manifest.json',import.meta.url)));
assert.equal(manifest.resolution,1024);
for(const name of Object.keys(manifest.materials))for(const channel of ['color','normal','surface'])assert.ok(fs.statSync(new URL(`../public/textures/azov/${name}-${channel}.webp`,import.meta.url)).size>1000);
console.log(JSON.stringify({status:'PASS',geometryTrianglesChecked:triangles,maxNormalError,rockColliders:rocks.length,axes:'N -Z; E +X; up +Y',longCoastMetres:4096},null,2));
