// Run: node src/components/effects/contactAO.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { captureContactAoDepth, decodeContactAoViewDistance, isContactAoOccluder, reconstructContactAoViewPosition } from './contactAO.js';

assert.equal(decodeContactAoViewDistance(0, 0.1, 1000, true), 0, 'log depth origin must decode to zero distance');
assert.ok(Math.abs(decodeContactAoViewDistance(1, 0.1, 1000, true) - 1000) < 1e-8, 'log depth far endpoint must agree with the shader equation');
assert.ok(Math.abs(decodeContactAoViewDistance(0, 0.1, 1000, false) - 0.1) < 1e-8, 'perspective depth near endpoint must decode to camera near');
assert.equal(decodeContactAoViewDistance(1.01, 0.1, 1000, true), null, 'invalid sampled depth must not become an AO radius');
assert.equal(decodeContactAoViewDistance(0.5, 0, 1000, true), null, 'invalid camera range must be rejected');

const reconstructionCamera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
reconstructionCamera.updateProjectionMatrix();
const offAxis = reconstructContactAoViewPosition({
  uv: new THREE.Vector2(0.82, 0.67), depth: 0.5, near: 0.1, far: 1000,
  logarithmic: true, projectionInverse: reconstructionCamera.projectionMatrixInverse,
});
assert.ok(Math.abs(offAxis.z + (Math.sqrt(1001) - 1)) < 1e-6, 'off-axis reconstruction must preserve decoded -viewZ instead of turning it into ray distance');
assert.equal(isContactAoOccluder(-2, -2), false, 'a flat plane cannot occlude itself');
assert.equal(isContactAoOccluder(-1, -2), true, 'geometry in front of a hemisphere probe must occlude');
assert.equal(isContactAoOccluder(-3, -2), false, 'geometry behind a hemisphere probe must not occlude');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#123456');
const opaqueMaterial = new THREE.MeshBasicMaterial();
opaqueMaterial.onBeforeCompile = () => {};
const cutoutMaterial = new THREE.MeshBasicMaterial({ alphaTest: 0.4 });
const waterMaterial = new THREE.MeshBasicMaterial();
const transparentMaterial = new THREE.MeshBasicMaterial({ transparent: true });
const opaque = new THREE.Mesh(new THREE.PlaneGeometry(), opaqueMaterial);
const cutout = new THREE.Mesh(new THREE.PlaneGeometry(), cutoutMaterial);
const water = new THREE.Mesh(new THREE.PlaneGeometry(), waterMaterial);
water.name = 'water-surface';
const transparent = new THREE.Mesh(new THREE.PlaneGeometry(), transparentMaterial);
scene.add(opaque, cutout, water, transparent);

const originalTarget = { id: 'previous' };
const depthTarget = { id: 'ao' };
const state = { target: originalTarget, clearCalls: 0, renderCalls: 0 };
const gl = {
  shadowMap: { autoUpdate: true },
  getRenderTarget: () => state.target,
  setRenderTarget: (target) => { state.target = target; },
  clear: () => { state.clearCalls += 1; },
  render: () => {
    state.renderCalls += 1;
    assert.equal(opaqueMaterial.colorWrite, false, 'opaque original material must write only depth');
    assert.equal(cutoutMaterial.colorWrite, false, 'cutout must retain its original shader while colour writes are disabled');
    assert.equal(cutout.visible, true, 'alpha-test cutout must participate in the opaque depth capture');
    assert.equal(water.visible, false, 'water must not seed a false AO receiver');
    assert.equal(transparent.visible, false, 'blended material must not seed opaque AO depth');
    throw new Error('synthetic renderer failure');
  },
};

assert.throws(() => captureContactAoDepth({ gl, scene, camera: new THREE.Camera(), target: depthTarget }), /synthetic renderer failure/);
assert.equal(state.target, originalTarget, 'failure must restore the prior render target');
assert.equal(scene.background.getHexString(), '123456', 'failure must restore scene background');
assert.equal(gl.shadowMap.autoUpdate, true, 'failure must restore shadow update policy');
assert.equal(opaqueMaterial.colorWrite, true, 'failure must restore opaque material state');
assert.equal(cutoutMaterial.colorWrite, true, 'failure must restore cutout material state');
assert.equal(water.visible, true, 'failure must restore water visibility');
assert.equal(transparent.visible, true, 'failure must restore transparent visibility');
assert.equal(state.clearCalls, 1, 'capture must clear only its own target');
assert.equal(state.renderCalls, 1, 'capture must not retry a failed scene render');

console.log('contactAO: all checks passed');
