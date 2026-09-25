import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addTraceLights } from './lights.js';
import { gardenLightUniforms } from '../lighting/gardenLightShader.js';
import { registerTraceSource, acquireTraceSource, isTraceLocked } from './bridge.js';
import { renderDimensions, uploadTextureArray } from './render.js';
import { physicalCopy } from './bake.js';
import { renderableMesh, posedPlantGeometry } from './snapshot.js';

const source = new THREE.Scene(), target = new THREE.Scene(), owned = [];
source.pathTraceLighting = { lighting: { key: { direction: [1, 2, 3], colorLinear: [1, .8, .5], sceneIntensity: 2 } } };
source.add(new THREE.DirectionalLight(), new THREE.DirectionalLight());
source.pathTraceGarden = { lights: [1, 2].map((id) => ({ x: id, y: 3, z: 4, axis: [0, -1, 0], peak: 120, color: [1, .5, .2], row: 0, radius: .02 })), profiles: new Float32Array(128).fill(.7) };
const old = gardenLightUniforms.uGardenLevel.value; gardenLightUniforms.uGardenLevel.value = .04;
assert.equal(addTraceLights(source, target, (r) => { owned.push(r); return r; }), 2);
assert.equal(target.children.filter((o) => o.isDirectionalLight).length, 1, 'CSM must not double the sun');
const fixtures = target.children.filter((o) => o.isSpotLight);
assert.equal(fixtures.length, 2); assert.equal(fixtures[0].intensity, 4.8);
assert.deepEqual(fixtures[0].target.position.toArray(), [1, 2, 4]);
assert.equal(fixtures[0].iesMap, fixtures[1].iesMap, 'same profile is shared');
assert.equal(fixtures[0].distance, 0, 'offline light has no raster distance cutoff');
gardenLightUniforms.uGardenLevel.value = old; owned.forEach((o) => o.dispose());

const texture = new THREE.Texture(); texture.matrixAutoUpdate = false; texture.matrix.makeRotation(.3);
const matrix = texture.matrix.clone();
assert.throws(() => uploadTextureArray({ setTextures() { texture.matrix.identity(); texture.matrixAutoUpdate = true; throw Error('upload failure'); } }, {}, [texture], 1, 1));
assert.ok(texture.matrix.equals(matrix)); assert.equal(texture.matrixAutoUpdate, false, 'failed upload restores authored UVs');
const material = new THREE.MeshStandardMaterial({ map: texture }); material.userData.cycle = material;
const copy = physicalCopy(material);
assert.equal(copy.map, texture); assert.deepEqual(copy.userData, {}); copy.dispose();
assert.deepEqual(renderDimensions(9 / 16, 2048), [1152, 2048]);
assert.deepEqual(renderDimensions(16 / 9, 2048), [2048, 1152]);

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material), parent = new THREE.Group(); parent.add(mesh);
assert.ok(renderableMesh(mesh)); parent.visible = false; assert.ok(!renderableMesh(mesh)); parent.visible = true; parent.name = 'painterly-sky'; assert.ok(!renderableMesh(mesh));
const geometry = new THREE.PlaneGeometry(1, 2), camera = new THREE.PerspectiveCamera(); camera.position.set(10, 2, 0); camera.updateMatrixWorld();
posedPlantGeometry(geometry, new THREE.Matrix4(), camera, { uniforms: { uGrow: { value: new THREE.Vector2(2, 3) } } });
geometry.computeBoundingBox(); assert.ok(geometry.boundingBox.max.x < .001); assert.ok(geometry.boundingBox.max.z > .99); assert.equal(geometry.boundingBox.max.y, 3);

let restored = 0; const controller = new AbortController(); const unregister = registerTraceSource(() => ({ setFrameloop() {}, invalidate() { restored++; } }));
const lock = acquireTraceSource(controller); assert.ok(isTraceLocked());
assert.throws(() => acquireTraceSource(new AbortController())); lock.release(); lock.release(); assert.equal(restored, 1); assert.ok(!isTraceLocked());
acquireTraceSource(controller); unregister(); assert.ok(controller.signal.aborted); lock.release();
console.log('pathTrace: single sun, fixtures/profile, UV restoration, cards, dimensions and renderer ownership passed');
