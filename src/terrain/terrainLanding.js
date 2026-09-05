import * as THREE from 'three';
import { coastPoint } from './terrainModel.js';
export function createTerrainLandingSites(root,query) {
 if(!root||!query)return [];
 const sites=[];
 for(const [index,s] of [-16,0,19].entries()){
  const point=coastPoint(Math.min(query.definition.terrainBeachWidth*.55,12),s,query.definition);
  const surface=query.surfaceAt(point.x,point.z);
  if(surface.height<.22||surface.normal.y<.94)continue;
  const anchor=new THREE.Object3D();anchor.name='seagull-landing-anchor-beach-'+index;
  anchor.position.set(point.x,surface.height,point.z);
  anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(surface.normal.x,surface.normal.y,surface.normal.z));
  root.add(anchor);anchor.updateMatrixWorld(true);
  sites.push({id:'beach-'+index,surface:'shore',position:anchor.position.toArray(),quaternion:anchor.quaternion.clone(),object:anchor});
 }return sites;
}
