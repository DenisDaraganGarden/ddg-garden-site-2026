// Run: node src/components/effects/contactAO.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { captureContactAoDepth, decodeContactAoViewDistance, isContactAoOccluder, reconstructContactAoViewPosition } from './contactAO.js';
import { createContactAoDepthMaterials } from './contactAoDepth.js';

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

const depthMaterials = createContactAoDepthMaterials();
const pbr = new THREE.MeshStandardMaterial();
pbr.userData.runtime = { material: pbr };
pbr.onBeforeCompile = (shader) => { shader.vertexShader += '\n// authored vertex deformation'; };
const fast = depthMaterials.get(pbr);
assert.notEqual(fast, pbr);
assert.equal(fast.userData.runtime, pbr.userData.runtime, 'capture must not serialise live material handles');
const shader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
fast.onBeforeCompile(shader, {});
assert.ok(shader.vertexShader.includes('authored vertex deformation'), 'depth capture must retain authored vertex deformation');
assert.ok(shader.fragmentShader.includes('logdepthbuf_fragment'), 'lean depth must use the renderer depth encoding');
assert.equal(depthMaterials.get(pbr), fast, 'capture must reuse compiled depth materials');
assert.equal(depthMaterials.get(cutoutMaterial), cutoutMaterial, 'alpha cutouts keep their exact original program');
const cutoutPbr = new THREE.MeshStandardMaterial({ alphaTest: .4 });
assert.equal(depthMaterials.get(cutoutPbr), cutoutPbr);

const custom = new THREE.MeshStandardMaterial();
custom.onBeforeCompile = (s) => { s.fragmentShader = 'void main() { if (true) discard; }'; };
const customShader = { vertexShader: '', fragmentShader: '' };
depthMaterials.get(custom).onBeforeCompile(customShader, {});
assert.ok(customShader.fragmentShader.includes('discard'), 'custom geometry cuts must not become solid AO');

opaque.material = pbr;
gl.shadowMap.needsUpdate = true;
gl.render = () => {
  assert.equal(opaque.material, fast);
  assert.equal(gl.shadowMap.needsUpdate, false, 'an explicit pending shadow update must wait for the beauty pass');
  throw new Error('fast capture failure');
};
assert.throws(() => captureContactAoDepth({ gl, scene, camera: new THREE.Camera(), target: depthTarget, depthMaterials }), /fast capture failure/);
assert.equal(opaque.material, pbr, 'failure must restore the original mesh material');
assert.equal(gl.shadowMap.needsUpdate, true);
assert.equal(state.target, originalTarget);
let released = false;
fast.addEventListener('dispose', () => { released = true; });
pbr.dispose();
assert.equal(released, true, 'source disposal must release its AO shader');
depthMaterials.dispose();
assert.equal(depthMaterials.size, 0, 'capture teardown must drop retained materials');
custom.dispose(); cutoutPbr.dispose();
console.log('contactAO: lean depth, deformation, cutout, failure and disposal checks passed');
