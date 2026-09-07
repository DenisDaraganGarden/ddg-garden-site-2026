import * as THREE from 'three';
import { createCsmAdapter, getBaseMaterialHooks } from './csmAdapter.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
const initial = new THREE.MeshStandardMaterial();
const authoredCompile = () => {};
const authoredKey = () => 'authored-material';
initial.onBeforeCompile = authoredCompile;
initial.customProgramCacheKey = authoredKey;
scene.add(new THREE.Mesh(new THREE.BoxGeometry(), initial));

const adapter = createCsmAdapter({
  scene,
  camera,
  cascades: 2,
  maxFar: 160,
  nearDistance: 25,
  shadowMapSize: 1024,
  lightDirection: new THREE.Vector3(0, -1, 0),
  lightColor: new THREE.Color(1, 1, 1),
  lightIntensity: 1,
  shadowRadius: 2,
  shadowIntensity: 0.7,
  contactOffsetMeters: -0.006,
  legacyBias: -0.0036,
});

const baseHooks = getBaseMaterialHooks(initial);
if (baseHooks.onBeforeCompile !== authoredCompile || baseHooks.customProgramCacheKey !== authoredKey) {
  throw new Error('CSM did not expose the original material hooks.');
}

if (Math.abs(adapter.getSplitDistance() - 25) > 1e-6) {
  throw new Error(`Expected 25m CSM split, got ${adapter.getSplitDistance()}`);
}

const late = new THREE.MeshStandardMaterial();
scene.add(new THREE.Mesh(new THREE.BoxGeometry(), late));
adapter.update();
if (!late.customProgramCacheKey().includes('ddg-csm-2')) {
  throw new Error('Late material was not registered before its first render.');
}

adapter.configure({ shadowMapSize: 512 });
const [near, far] = adapter.getShadowHandles();
if (near.mapSize.x !== 512 || far.mapSize.x !== 512) {
  throw new Error('Current shadow map size did not reach CSM cascades.');
}
if (near.waterBias !== near.bias * 0.55 || far.waterBias !== far.bias * 0.55) {
  throw new Error('Water contact bias diverged from directional contact bias.');
}

late.dispose();
if (adapter.csm.shaders.has(late) || late.customProgramCacheKey().includes('ddg-csm-2')) {
  throw new Error('Disposed material remained in the CSM registry.');
}
adapter.dispose();
if (initial.onBeforeCompile !== authoredCompile || initial.customProgramCacheKey !== authoredKey) {
  throw new Error('Adapter disposal did not restore original material hooks.');
}

console.log('csmAdapter: split, map size, water contact, and material cleanup passed');
