import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyModelFaces, hasSelectedFaces, normalizeRemovedFaces, removeSelectedFaces, restoreModelFaces, selectFaces } from './faceEdits.js';
import { faceSelection, materialMeshKey, sourceGeometry, sourceTriangle, triangleCount, triangleMaterial } from '../materials/selection.js';
import { splitFaces } from '../materials/modelMaterials.js';
import { normalizeSketchupModels } from './settings.js';
import { heightfieldAt, solidHeightfield } from './solidSurface.js';

const root = new THREE.Group(); root.userData.materialModel = 'house-v1';
const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material); root.add(a, b); b.position.x = 5;
const pick = (mesh, index, clicks = 1) => ({ mesh: mesh.uuid, ...faceSelection(mesh, index, clicks) });
let selection = selectFaces(null, pick(a, 0));
selection = selectFaces(selection, pick(a, 4), true);
selection = selectFaces(selection, pick(b, 0), true);
assert.deepEqual(selection.items.map((item) => item.triangles), [[0, 1, 4, 5], [0, 1]], 'Shift spans materials and mesh instances');
selection = selectFaces(selection, pick(a, 0), true);
assert.deepEqual(selection.items[0].triangles, [4, 5], 'Shift removes one polygon from a larger set');
selection = selectFaces(selection, pick(b, 0), true);
let rows = removeSelectedFaces([], root, 'house-v1', selection);
rows = normalizeSketchupModels({ placed: { removedFaces: JSON.parse(JSON.stringify(rows)) } }).placed.removedFaces;
assert.deepEqual(rows, [{ asset: 'house-v1', mesh: '0', triangles: [4, 5] }], 'save and reopen preserve instance and source triangle addresses');

let disposed = 0; geometry.addEventListener('dispose', () => { disposed += 1; });
applyModelFaces(root, rows);
assert.equal(triangleCount(a.geometry), 10);
assert.equal(b.geometry, geometry, 'the duplicate keeps the cached GLTF geometry');
assert.equal(sourceGeometry(a), geometry);
assert.equal(sourceTriangle(a, 4), 6, 'ray hits retain original triangle numbering after deletion');
assert.equal(faceSelection(a, 0, 3).triangles.length, 10, 'triple click excludes deleted faces');
assert.equal(triangleMaterial(a.geometry, 4), 3, 'material groups survive holes in the triangle list');
root.updateMatrixWorld(true);
const ray = new THREE.Raycaster(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
assert.equal(ray.intersectObject(a)[0].point.y, -1, 'ray passes through the deleted top and hits the bottom');
assert.equal(heightfieldAt(solidHeightfield(a), 0, 0), -1, 'collision follows the surviving bottom, not the deleted top');
restoreModelFaces(root);
assert.equal(a.geometry, geometry, 'undo restores the original shared geometry');
assert.equal(ray.intersectObject(a)[0].point.y, 1);
assert.equal(disposed, 0, 'owned derivatives dispose without disposing the source');

// Painting reorders triangles; deletion remains the last stage and never
// changes which polygon a stored material target addresses.
const painted = splitFaces(geometry, new THREE.Matrix4(), [{ faces: ['up', 'down', 'side'], targets: [{ mesh: '0', triangles: [0, 1] }] }], [], '0', 'house-v1');
a.userData.faceSplit = { geometry, material }; a.geometry = painted; a.material = [material, material];
applyModelFaces(root, [{ asset: 'house-v1', mesh: '0', triangles: [0, 1] }]);
assert.equal(triangleCount(a.geometry), 10);
assert.ok(!a.geometry.userData.sourceTriangles.includes(0));
assert.deepEqual(faceSelection(a, 0).triangles, [2, 3]);
restoreModelFaces(root);
assert.equal(a.geometry, painted);
painted.dispose(); a.geometry = geometry; a.material = material; delete a.userData.faceSplit;
applyModelFaces(root, [{ asset: 'house-v2', mesh: '0', triangles: [0, 1] }]);
assert.equal(a.geometry, geometry, 'a replacement asset cannot inherit stale triangle deletions');

selection = selectFaces(null, pick(a, 0, 3));
selection = selectFaces(selection, pick(a, 0), true);
assert.equal(selection.items[0].triangles.length, 10);
selection = selectFaces(null, pick(a, 0));
selection = selectFaces(selection, pick(a, 0), true);
assert.equal(hasSelectedFaces(selection), false, 'empty Shift selection stays empty, never becomes the component');
applyModelFaces(root, [{ asset: 'house-v1', mesh: materialMeshKey(a, root), triangles: [...Array(12).keys()] }]);
assert.equal(triangleCount(a.geometry), 0);
assert.equal(ray.intersectObject(a).length, 0, 'deleting all faces leaves no clickable remnant');
restoreModelFaces(root);
assert.equal(disposed, 0);
assert.deepEqual(normalizeRemovedFaces([{ asset: '../x', mesh: '0', triangles: [0] }, { asset: 'house-v1', mesh: '0', triangles: [-1, NaN, 1.2, 2, 2] }]), [{ asset: 'house-v1', mesh: '0', triangles: [2] }]);
console.log('face edits: multi-selection, persistence, instances, painted groups, raycast, collision, undo and asset replacement — ok');
