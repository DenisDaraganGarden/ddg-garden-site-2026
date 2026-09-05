import * as THREE from 'three';

// One camera-local directional map, with the original hero framing retained
// near the pond. World light bearing/radiance never changes with the camera.
export function fitTerrainShadow(position,direction,lightDirection,query,heroRadius,mapSize){
 const weight=query?THREE.MathUtils.smoothstep(Math.hypot(position.x,position.z),18,34):0;
 const centre=new THREE.Vector3();
 if(weight>0){
  const hit=query.raycast(position,direction,130);
  if(hit)centre.copy(hit.point);
  else {centre.copy(position).addScaledVector(direction,24);centre.y=Math.max(0,query.heightAt(centre.x,centre.z));}
 }
 const radius=THREE.MathUtils.lerp(heroRadius,THREE.MathUtils.clamp(12+centre.distanceTo(position)*.45,18,64),weight);
 centre.multiplyScalar(weight);
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),lightDirection);
 if(right.lengthSq()<1e-6)right.set(1,0,0);else right.normalize();
 const up=new THREE.Vector3().crossVectors(lightDirection,right).normalize(),texel=radius*2/mapSize;
 for(const axis of [right,up])centre.addScaledVector(axis,Math.round(centre.dot(axis)/texel)*texel-centre.dot(axis));
 const standoff=THREE.MathUtils.lerp(heroRadius+6,radius*2+(query?.definition.terrainCliffHeight??0)+20,weight);
 return {centre,radius,standoff,near:THREE.MathUtils.lerp(Math.max(.5,standoff-heroRadius-1),Math.max(.5,standoff-radius*2-10),weight),far:THREE.MathUtils.lerp(standoff+heroRadius+1,standoff+radius*2+10,weight),texel,weight};
}
