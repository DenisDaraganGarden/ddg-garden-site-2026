import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const bindings = read('./waterSceneBindings.js');
const captures = read('./WaterReflections.jsx');

// A render target is overwritten in place. Capture matrices must therefore be
// the exact live objects published by WaterReflections, rather than values
// copied during an earlier useFrame callback. Otherwise camera motion exposes
// one frame of new pixels projected with an old matrix.
for (const [uniform, source] of [
  ['uReflectionMatrix', 'matrix'],
  ['uRefractionMatrix', 'refractionMatrix'],
  ['uRefractionViewMatrix', 'refractionViewMatrix'],
  ['uRefractionCameraRange', 'refractionCameraRange'],
]) {
  assert.ok(bindings.includes(`uniforms.${uniform}.value = data.${source};`), `${uniform} keeps the live capture object`);
  assert.ok(!bindings.includes(`uniforms.${uniform}.value.copy(data.${source})`), `${uniform} is not copied before the capture pass`);
}
assert.ok(captures.includes('matrix: new THREE.Matrix4()'), 'reflection capture owns a stable matrix object');
assert.ok(captures.includes('refractionMatrix: new THREE.Matrix4()'), 'refraction capture owns a stable projection-view object');
assert.ok(captures.includes('refractionViewMatrix: new THREE.Matrix4()'), 'refraction capture owns a stable view object');
assert.ok(captures.includes('refractionCameraRange: new THREE.Vector2(camera.near, camera.far)'), 'refraction capture owns a stable range object');

console.log('water scene bindings: live capture matrix contract preserved');
