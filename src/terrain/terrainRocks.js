import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { coastPoint,coastHeight,sampleTerrainHeight } from './terrainModel.js';
import { coastProfile } from './terrainLandforms.js';
export function makeRockGeometry() {
  const points=[];
  // Bevelled, fractured slabs: broad bedding faces instead of rounded pebbles.
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
    for(const [x,y,z] of [[.5,.36,.33],[.35,.45,.36],[.34,.36,.5]])
      points.push(new THREE.Vector3(sx*x*(1+.12*sy*sz),sy*y*(1+.13*sx),sz*z*(1+.08*sy)));
  }
  const geometry=new ConvexGeometry(points);geometry.computeBoundingBox();return geometry;
}
export function buildCoastRocks(p) {
  let seed=p.terrainSeed;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const rocks=[];const count=Math.floor(p.terrainLength*.2*p.terrainRocks);
  for(let i=0;i<count;i++){
    const s=(random()-.5)*(p.terrainLength-80);const nearWater=random()<.3;
    const profile=coastProfile(s,p);
    const q=nearWater?-1+random()*4:profile.foot-.5-random()*(2.5+profile.slide*4);
    const point=coastPoint(q,s,p),size=.18+Math.pow(random(),3)*3.2;
    rocks.push({x:point.x,y:coastHeight(q,s,p)+size*.24,z:point.z,s,q,scale:[size*(1+random()),size*(.4+random()*.35),size*(.75+random())],rotation:[(random()-.5)*.5,random()*Math.PI*2,(random()-.5)*.3]});
  }
  // Small angular fragments collect below failures and drainage mouths.
  // A bounded instanced batch shares the same rock collision adapter.
  for(let i=0;i<Math.floor(p.terrainLength*2*p.terrainRocks);i++){
    const s=(random()-.5)*(p.terrainLength-80),f=coastProfile(s,p);
    if(random()>Math.min(.85,f.slide*.9+f.ravine*.55))continue;
    const q=f.foot-3.5+random()*(4+f.width*.26),point=coastPoint(q,s,p),size=.07+Math.pow(random(),2)*.66;
    rocks.push({x:point.x,y:coastHeight(q,s,p),z:point.z,s,q,debris:true,scale:[size*(1+random()*.6),size*(.55+random()*.5),size*(.7+random()*.5)],rotation:[(random()-.5)*1.1,random()*Math.PI*2,(random()-.5)*.7]});
  }
  const geometry=makeRockGeometry(),vertices=geometry.attributes.position,transform=new THREE.Matrix4(),rotation=new THREE.Quaternion(),point=new THREE.Vector3();
  for(const rock of rocks){
    rotation.setFromEuler(new THREE.Euler(...rock.rotation));
    transform.compose(new THREE.Vector3(),rotation,new THREE.Vector3(...rock.scale));
    let support=-Infinity,lowest=Infinity;
    for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(transform);lowest=Math.min(lowest,point.y);support=Math.max(support,sampleTerrainHeight(rock.x+point.x,rock.z+point.z,p)-point.y);}
    // A slab touching the uphill bluff must embed into it, not be lifted by
    // that single high corner until its whole downhill face floats in air.
    const centreSeat=sampleTerrainHeight(rock.x,rock.z,p)-lowest+.06*rock.scale[1];
    rock.y=Math.min(support,centreSeat)-.14*rock.scale[1];
  }
  geometry.dispose();return rocks;
}

// A spatial hash of upward-facing triangle support planes gives creatures the
// actual instanced rock surface without testing every rock or depending on LOD.
export function attachRockCollisions(query,rocks) {
 const geometry=makeRockGeometry(),positions=geometry.attributes.position;
 const cells=new Map(),size=12,transform=new THREE.Matrix4(),rotation=new THREE.Quaternion();
 const key=(x,z)=>Math.floor(x/size)+','+Math.floor(z/size);
 for(const rock of rocks){
  rotation.setFromEuler(new THREE.Euler(...rock.rotation));transform.compose(new THREE.Vector3(rock.x,rock.y,rock.z),rotation,new THREE.Vector3(...rock.scale));
  const points=[];for(let i=0;i<positions.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform));
  const bounds=new THREE.Box3().setFromPoints(points),triangles=[];
  for(let i=0;i<points.length;i+=3){const a=points[i],b=points[i+1],c=points[i+2],n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(n.y>.01)triangles.push({a,b,c,n});}
  const collider={bounds,triangles};
  for(let x=Math.floor(bounds.min.x/size);x<=Math.floor(bounds.max.x/size);x++)for(let z=Math.floor(bounds.min.z/size);z<=Math.floor(bounds.max.z/size);z++){const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(collider);}
 }
 geometry.dispose();
 const groundHeight=query.heightAt,groundNormal=query.normalAt,groundSurface=query.surfaceAt;
 const hitAt=(x,z)=>{
  let hit=null;
  for(const collider of cells.get(key(x,z))??[]){if(x<collider.bounds.min.x||x>collider.bounds.max.x||z<collider.bounds.min.z||z>collider.bounds.max.z)continue;
   for(const {a,b,c,n}of collider.triangles){
    const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(det)<1e-8)continue;
    const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det,w=1-u-v;
    if(u<-.00001||v<-.00001||w<-.00001)continue;
    const height=u*a.y+v*b.y+w*c.y;if(!hit||height>hit.height)hit={height,normal:n};
   }
  }return hit;
 };
 query.heightAt=(x,z)=>Math.max(groundHeight(x,z),hitAt(x,z)?.height??-Infinity);
 query.normalAt=(x,z)=>{const hit=hitAt(x,z);return hit&&hit.height>groundHeight(x,z)?hit.normal:groundNormal(x,z);};
 query.surfaceAt=(x,z,time)=>{const surface=groundSurface(x,z,time),hit=hitAt(x,z);if(!hit||hit.height<=surface.height)return surface;return {...surface,height:hit.height,normal:hit.normal,slope:Math.acos(Math.max(0,Math.min(1,hit.normal.y))),material:'sandstone',habitat:'rock',vegetation:{grass:0,shrubs:0,trees:0}};};
 query.rockCount=rocks.length;return query;
}
