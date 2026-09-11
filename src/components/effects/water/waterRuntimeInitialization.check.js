import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initializeWaterRuntimeTargets } from './waterRuntimeInitialization.js';

const target = (name) => ({ name, texture: { name } });
const pass = (name) => ({ scene: name, camera: {}, material: { uniforms: { uState: {}, uNormalMap: {} } } });
const state = { read: target('read'), write: target('write'), normal: target('normal'), probe: target('probe'), normalPass: pass('normal'), probePass: pass('probe') };
const originalTarget = target('caller');
const originalColor = new THREE.Color(0.2, 0.3, 0.4);
let active = originalTarget, color = originalColor.clone(), alpha = 0.4;
const calls = [];
const gl = {
  getRenderTarget: () => active,
  getClearColor: (out) => out.copy(color),
  getClearAlpha: () => alpha,
  setRenderTarget: (value) => { active = value; },
  setClearColor: (value, opacity) => { color.set(value); alpha = opacity; },
  clear: () => { calls.push(`clear:${active.name}`); },
  render: (scene) => { calls.push(`render:${scene}:${active.name}`); },
};

initializeWaterRuntimeTargets(gl, state);
assert.deepEqual(calls, ['clear:read', 'clear:write', 'render:normal:normal', 'render:probe:probe']);
assert.equal(state.normalPass.material.uniforms.uState.value, state.read.texture);
assert.equal(state.probePass.material.uniforms.uState.value, state.read.texture);
assert.equal(state.probePass.material.uniforms.uNormalMap.value, state.normal.texture);
assert.equal(active, originalTarget);
assert.ok(color.equals(originalColor));
assert.equal(alpha, 0.4);

// A compilation/context failure must not strand the caller in the water FBO.
gl.render = () => { throw new Error('test render failure'); };
assert.throws(() => initializeWaterRuntimeTargets(gl, state), /test render failure/);
assert.equal(active, originalTarget);
assert.ok(color.equals(originalColor));
assert.equal(alpha, 0.4);
console.log('waterRuntimeInitialization: flat derived maps before the first tick; renderer state restored');
