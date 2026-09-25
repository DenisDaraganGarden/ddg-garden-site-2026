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

// Wide views and a low sun used to place visible receivers beyond a fixed
// 240m light-camera far plane, although they were inside the 160m view range.
// Exercise real shadow matrices, including the shader's cascade fade interval.
const projected = new THREE.Vector3();
for (const view of [
  { fov: 70, aspect: 1088 / 834, position: [-41, 12, -8], target: [-14, 0, 4], sun: [-.8847, -.4578, .08794] },
  { fov: 105, aspect: 2, position: [30, 8, 40], target: [0, 0, 0], sun: [.8, -.1, -.3] },
  { fov: 45, aspect: .6, position: [-20, 16, 30], target: [0, 0, 0], sun: [-.2, -.9, .3] },
  { fov: 12, aspect: 1.4, position: [0, 300, 0], target: [0, 0, .001], sun: [.2, -.6, -.4], distance: 325, split: 255 },
]) {
  camera.fov = view.fov; camera.aspect = view.aspect;
  camera.position.fromArray(view.position); camera.lookAt(...view.target);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  adapter.configure({ maxFar: view.distance ?? 160, nearDistance: view.split ?? 25,
    lightDirection: new THREE.Vector3(...view.sun).normalize() });
  adapter.update();
  const csm = adapter.csm, distance = Math.min(camera.far, csm.maxFar);
  csm.lights.forEach((light, index) => {
    light.updateMatrixWorld(); light.target.updateMatrixWorld(); light.shadow.updateMatrices(light);
    const vertices = csm.frustums[index].vertices;
    for (let corner = 0; corner < 4; corner += 1) {
      const a = vertices.near[corner], b = vertices.far[corner];
      const fadeStart = .125 * (csm.breaks[index - 1] ?? 0) ** 2 * distance;
      const fadeEnd = .125 * csm.breaks[index] ** 2 * distance;
      for (const t of [-fadeStart / (a.z - b.z), 0, 1, 1 + fadeEnd / (a.z - b.z)]) {
        projected.lerpVectors(a, b, t).applyMatrix4(camera.matrixWorld).project(light.shadow.camera);
        if (projected.z < -1 - 1e-6 || projected.z > 1 + 1e-6) {
          throw new Error(`Visible cascade receiver clipped in depth: ${projected.z}`);
        }
      }
    }
    const fitted = light.shadow.camera;
    if (Math.abs(light.shadow.bias * (fitted.far - fitted.near) + .006) > 1e-9) {
      throw new Error('Fitted depth changed the physical contact offset.');
    }
    if (light.shadow.mapSize.x !== 512 || csm.shadowMapSize !== 512) {
      throw new Error('Depth fitting changed the map allocation or stale texel snapping size.');
    }
  });
}

late.dispose();
if (adapter.csm.shaders.has(late) || late.customProgramCacheKey().includes('ddg-csm-2')) {
  throw new Error('Disposed material remained in the CSM registry.');
}
adapter.dispose();
if (initial.onBeforeCompile !== authoredCompile || initial.customProgramCacheKey !== authoredKey) {
  throw new Error('Adapter disposal did not restore original material hooks.');
}

console.log('csmAdapter: split, fitted depth/fade, low sun/wide/portrait/plan cameras, contact and cleanup passed');
