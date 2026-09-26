import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addTraceLights } from './lights.js';
import { gardenLightUniforms } from '../lighting/gardenLightShader.js';
import { registerTraceSource, acquireTraceSource, isTraceLocked } from './bridge.js';
import { renderDimensions, uploadTextureArray } from './render.js';
import { physicalCopy } from './bake.js';
import { renderableMesh, posedPlantGeometry, snapshotScene } from './snapshot.js';

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
const plain = new THREE.Scene(); plain.add(new THREE.Mesh(new THREE.PlaneGeometry().toNonIndexed(), new THREE.MeshStandardMaterial()));
const shot = await snapshotScene({ scene: plain, camera: new THREE.PerspectiveCamera(), gl: null });
assert.equal(shot.stats.triangles, 2, 'a non-indexed single-material mesh is counted, not dereferenced'); shot.dispose();
console.log('pathTrace: single sun, fixtures/profile, UV restoration, cards, non-indexed meshes, dimensions and renderer ownership passed');

// One imported mesh can use several surface materials; each trace mesh must
// keep exactly the triangles assigned to that surface, including draw ranges.
const { splitDrawGroups, normalizeVertexColors } = await import('./snapshot.js');
const plane = new THREE.PlaneGeometry(), red = new THREE.MeshStandardMaterial({ color: 'red' }), blue = new THREE.MeshStandardMaterial({ color: 'blue' });
plane.clearGroups(); plane.addGroup(0, 3, 0); plane.addGroup(3, 3, 1);
const pieces = splitDrawGroups(plane, [red, blue]);
assert.equal(pieces.length, 2); assert.equal(pieces[0].material, red); assert.equal(pieces[1].material, blue);
assert.deepEqual(pieces.map((p) => p.geometry.index.count), [3, 3]);
plane.setDrawRange(3, 3); const clipped = splitDrawGroups(plane, [red, blue]);
assert.equal(clipped.length, 1); assert.equal(clipped[0].material, blue);
plane.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(.7), 3)); normalizeVertexColors(plane);
assert.equal(plane.attributes.color.itemSize, 4); assert.equal(plane.attributes.color.getW(3), 1);
const mirrored = new THREE.PlaneGeometry();
posedPlantGeometry(mirrored, new THREE.Matrix4(), camera, { uniforms: { uGrow: { value: new THREE.Vector2(1, 1) } } }, -1);
const points = [0, 1, 2].map((i) => new THREE.Vector3().fromBufferAttribute(mirrored.attributes.position, mirrored.index.getX(i)));
const face = new THREE.Vector3().crossVectors(points[1].sub(points[0]), points[2].sub(points[0]));
assert.ok(face.dot(new THREE.Vector3().fromBufferAttribute(mirrored.attributes.normal, 0)) > 0, 'mirrored cards keep normals facing their front side');
[...pieces, ...clipped].forEach((p) => p.geometry.dispose()); plane.dispose(); mirrored.dispose(); red.dispose(); blue.dispose();
console.log('pathTrace: multiple surfaces, draw range, RGBA vertex colors and mirrored leaf normals passed');
