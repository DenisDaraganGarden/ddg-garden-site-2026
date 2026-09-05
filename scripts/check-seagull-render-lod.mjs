import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  measureSeagullRenderSize,
  resolveSeagullRenderLods,
  SEAGULL_RENDER_LOD,
} from '../src/features/home-scene/creatures/seagullRenderLod.js';

function describeCamera(camera) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return {
    position: camera.position,
    forward,
    fovDegrees: camera.fov,
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  };
}

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 10000);
camera.position.set(0, 2, 0);
camera.lookAt(0, 2, -1);
camera.updateMatrixWorld(true);
const options = { camera: describeCamera(camera), viewport: { width: 1600, height: 900 } };

const near = { index: 0, position: new THREE.Vector3(0, 2, -22), modelScale: 1, route: 'flock' };
const far = { index: 1, position: new THREE.Vector3(0, 8, -180), modelScale: 1, route: 'high', phase: 0 };
const perched = { index: 2, position: new THREE.Vector3(0, 0.5, -180), modelScale: 1, landingState: 'perched' };
const removed = { index: 3, position: new THREE.Vector3(0, 3, -180), modelScale: 1, shotState: 'removed' };

const nearMeasure = measureSeagullRenderSize(near, options);
const farMeasure = measureSeagullRenderSize(far, options);
assert.ok(nearMeasure.pixels > SEAGULL_RENDER_LOD.spriteExitPixels, 'close gull stays a full rig');
assert.ok(farMeasure.pixels < SEAGULL_RENDER_LOD.spriteEnterPixels, 'distant gull reaches sprite budget');

const first = resolveSeagullRenderLods([near, far, perched, removed], options);
assert.equal(first.modes.get(0), 'full');
assert.equal(first.modes.get(1), 'sprite');
assert.equal(first.modes.get(2), 'full', 'perched feet always retain the rig');
assert.equal(first.modes.has(3), false, 'removed gull has no render mode');

// A bird near the switch threshold keeps its previous representation until it
// crosses the larger exit size, eliminating camera-distance flicker.
const retained = { ...far, position: new THREE.Vector3(0, 3.5, -75) };
const retainedMeasure = measureSeagullRenderSize(retained, options);
assert.ok(retainedMeasure.pixels > SEAGULL_RENDER_LOD.spriteEnterPixels);
assert.ok(retainedMeasure.pixels < SEAGULL_RENDER_LOD.spriteExitPixels + SEAGULL_RENDER_LOD.retainedBiasPixels);
const hysteresis = resolveSeagullRenderLods([retained], {
  ...options,
  previousModes: new Map([[1, 'sprite']]),
});
assert.equal(hysteresis.modes.get(1), 'sprite', 'sprite LOD uses a retained hysteresis band');

console.log(JSON.stringify({
  nearPixels: Number(nearMeasure.pixels.toFixed(2)),
  farPixels: Number(farMeasure.pixels.toFixed(2)),
  retainedPixels: Number(retainedMeasure.pixels.toFixed(2)),
  modes: Object.fromEntries(first.modes),
}));
