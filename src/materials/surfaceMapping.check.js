import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mappingForSelection, mappingFromTarget, mappingKey, modelSurfaceMappings, normalizeSurfaceMapping, patchTargetMappings, unfoldSurface } from './surfaceMapping.js';
import { boxUvGeometry, setLibraryTransform, splitFaces } from './modelMaterials.js';
import { normalizeMaterialSettings } from './settings.js';
import { paintTargets } from './selection.js';

const close = (a, b, message, tolerance = 0.00002) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);
const quad = (points) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([37, 8, -4, 81, 2, 31, 89, -7], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); return geometry;
};
const tread = (height, a, b) => quad([[0, height, a], [0, height, b], [4, height, b], [4, height, a]]);
const riser = (top, bottom, z, a = 0, b = 4) => quad([[a, top, z], [a, bottom, z], [b, bottom, z], [b, top, z]]);
const geometries = [tread(0.3, 0, 1), riser(0.3, 0.15, 1, 0, 2), riser(0.3, 0.15, 1, 2, 4), tread(0.15, 1, 1.4), riser(0.15, 0, 1.4), tread(0, 1.4, 2.5)];
const root = new THREE.Group(); root.userData.materialModel = 'stairs';
const material = new THREE.MeshStandardMaterial(); material.name = 'tile';
geometries.forEach((geometry) => { const mesh = new THREE.Mesh(geometry, material); mesh.rotation.y = 0.54321; mesh.scale.set(1.4, 1.1, 0.8); mesh.position.set(7, 3, -12); root.add(mesh); });
root.position.set(100, 40, -70); root.rotation.y = -1.3; root.updateMatrixWorld(true);
const target = { placedId: 'model', materialName: 'tile', meshKey: '0', asset: 'stairs', mesh: root.children[0], seed: 0, triangles: [0, 1], count: 2 };
const mapping = mappingFromTarget(target, root);
assert.ok(mapping, 'a boundary edge defines the reference');
const entries = root.children.map((mesh, i) => ({ mesh: String(i), geometry: mesh.geometry, matrix: root.matrixWorld.clone().invert().multiply(mesh.matrixWorld), triangles: [0, 1] }));
const result = unfoldSurface(entries, mapping);
assert.equal(result.islands, 1, 'T junctions exported as split risers join the continuous staircase');
assert.equal(result.seams, 0, 'a developable stair strip has no UV cuts');

// Every metric edge retains its length; each shared corner has exactly one UV,
// including tread/riser corners across separate mesh/material primitives.
const corners = new Map();
for (const entry of entries) for (const triangle of entry.triangles) {
    const uv = result.uv.get(entry.mesh).get(triangle), points = [0, 1, 2].map((k) => new THREE.Vector3()
        .fromBufferAttribute(entry.geometry.attributes.position, entry.geometry.index.getX(triangle * 3 + k)).applyMatrix4(entry.matrix));
    points.forEach((point, k) => {
        const key = point.toArray().map((n) => Math.round(n * 10000)).join(',');
        const value = new THREE.Vector2(uv[k * 2], uv[k * 2 + 1]);
        if (corners.has(key)) close(value.distanceTo(corners.get(key)), 0, 'UVs meet at shared vertices'); else corners.set(key, value);
        const next = (k + 1) % 3;
        close(value.distanceTo(new THREE.Vector2(uv[next * 2], uv[next * 2 + 1])), point.distanceTo(points[next]), 'nonuniform import transforms retain metres');
    });
}
for (const rotation of [4, 90, 137]) {
    const texture = new THREE.Texture();
    setLibraryTransform(texture, { projection: 'surface', tile: 2.4, tileY: 1.2, rotation, offsetU: 0.17, offsetV: -0.31 }, [1, 1], { rotation: 2 });
    const u = new THREE.Vector2(1, 0).applyMatrix3(texture.matrix), zero = new THREE.Vector2().applyMatrix3(texture.matrix);
    close(Math.hypot((u.x - zero.x) * 2.4, (u.y - zero.y) * 1.2), 1, 'rotation preserves physical scale on rectangular tiles');
}

const targets = root.children.map((mesh, i) => ({ ...target, mesh, meshKey: String(i) }));
const anchored = mappingForSelection(target, root, targets, 'face');
const anchoredPaint = paintTargets({}, targets, 'face', { material: 'ceramic', tile: 2.4, projection: 'surface', mapping: anchored });
const beforeRepaint = modelSurfaceMappings(root, anchoredPaint.model).get(mappingKey(anchored));
const detached = paintTargets(anchoredPaint, [target, targets[3]], 'face', { material: 'ceramic', tile: 2.4, projection: 'box' });
const afterRepaint = modelSurfaceMappings(root, detached.model).get(mappingKey(anchored));
for (const key of ['1', '2', '4', '5']) assert.deepEqual(afterRepaint.uv.get(key), beforeRepaint.uv.get(key), 'changing only some faces never shifts untouched neighbours');
assert.deepEqual(normalizeSurfaceMapping(anchored).surfaces, anchored.surfaces);
let all = paintTargets({}, targets, 'face', { material: 'ceramic', tile: 2.4, tileY: 1.2, normal: 1, roughness: 0.6 });
all = patchTargetMappings(all, targets, 'face', () => ({ projection: 'surface', mapping, rotation: 0 }));
const saved = normalizeMaterialSettings(JSON.parse(JSON.stringify({ modelMaterials: all }))).modelMaterials;
assert.equal(saved.model.tile.faces[0].projection, 'surface', 'mapping survives project normalization');
assert.deepEqual(saved.model.tile.faces[0].mapping.seed, mapping.seed);
const charts = modelSurfaceMappings(root, saved.model), chart = [...charts.values()][0];
assert.equal(chart.islands, 1);
assert.equal(chart.seams, 0);
assert.equal(modelSurfaceMappings(root, saved.model), charts, 'reuse topology when only render state changes');
const rotated = patchTargetMappings(saved, targets, 'face', () => ({ rotation: 90, offsetU: 1 }));
assert.equal(modelSurfaceMappings(root, rotated.model), charts, 'rotation/offsets do not rebuild the unfold');
const rules = saved.model.tile.faces;
const projected = splitFaces(geometries[0], entries[0].matrix, rules, [], '0', 'stairs', charts);
assert.equal(projected.attributes.uv1.count, 6);
assert.deepEqual(projected.userData.sourceTriangles, [0, 1], 'source triangle IDs survive material grouping');
const expected = chart.uv.get('0').get(0);
expected.forEach((value, i) => close(projected.attributes.uv1.array[i], value, 'face projection uses the shared chart'));
const base = boxUvGeometry(geometries[0], entries[0].matrix, [1, 1], 'surface', { uv: chart.uv.get('0'), mapping });
expected.forEach((value, i) => close(base.attributes.uv.array[i], value, 'whole-material projection uses the same chart'));
assert.equal(geometries[0].attributes.uv.getX(0), 37, 'the source GLB and shared instances remain untouched');
assert.equal(projected.index, null);

const second = { ...mapping, origin: [20, 2, 4] };
const separate = paintTargets(saved, [targets[1]], 'face', { ...rules[0], mapping: second });
assert.equal(separate.model.tile.faces.length, 2, 'different nested reference frames must never coalesce');
const mismatched = modelSurfaceMappings(root, { tile: { ...rules[0], mapping: { ...mapping, seed: { ...mapping.seed, asset: 'other-version' } } } });
assert.equal([...mismatched.values()][0].uv.size, 0, 'a frame cannot address a replacement model by accident');
const invalid = normalizeSurfaceMapping({ ...mapping, u: mapping.normal });
assert.equal(invalid, null, 'reject a collapsed basis');
assert.equal(normalizeSurfaceMapping({ ...mapping, origin: [0, Infinity, 2] }), null);

const otherMaterial = new THREE.MeshStandardMaterial(); otherMaterial.name = 'metal';
root.children[1].material = otherMaterial;
const mixedTargets = [target, { ...targets[1], materialName: 'metal' }];
const mixed = { model: { tile: { material: 'ceramic', tile: 2.4 }, metal: { material: 'steel', tile: 1 } } };
const changed = patchTargetMappings(mixed, mixedTargets, 'face', () => ({ projection: 'surface', mapping, rotation: 90 }));
assert.equal(changed.model.tile.faces[0].material, 'ceramic');
assert.equal(changed.model.metal.faces[0].material, 'steel', 'alignment preserves different materials');
assert.equal(modelSurfaceMappings(root, changed.model).get(mappingKey(mapping)).islands, 1, 'chart joins across different source materials');

const disconnected = unfoldSurface([entries[0], { ...entries[5], matrix: new THREE.Matrix4().makeTranslation(100, 0, 0) }], mapping);
assert.equal(disconnected.islands, 2, 'a gap stays separate');
const box = new THREE.BoxGeometry(2, 2, 2);
const closed = unfoldSurface([{ mesh: '0', geometry: box, matrix: new THREE.Matrix4(), triangles: Array.from({ length: 12 }, (_, i) => i) }], mapping);
assert.ok(closed.seams > 0, 'closed corners report unavoidable cuts instead of silently promising seamless wrapping');
const denseBox = new THREE.BoxGeometry(2, 2, 2, 4, 4, 4);
const dense = unfoldSurface([{ mesh: '0', geometry: denseBox, matrix: new THREE.Matrix4(), triangles: Array.from({ length: denseBox.index.count / 3 }, (_, i) => i) }], mapping);
const flatCorners = new Map();
for (const [t, coordinates] of dense.uv.get('0')) for (let k = 0; k < 3; k += 1) {
    const index = denseBox.index.getX(t * 3 + k), p = new THREE.Vector3().fromBufferAttribute(denseBox.attributes.position, index), n = new THREE.Vector3().fromBufferAttribute(denseBox.attributes.normal, index);
    const key = `${n.toArray()}:${p.toArray()}`, value = new THREE.Vector2(coordinates[k * 2], coordinates[k * 2 + 1]);
    if (flatCorners.has(key)) close(value.distanceTo(flatCorners.get(key)), 0, 'unavoidable cuts stay out of densely triangulated planar faces'); else flatCorners.set(key, value);
}
console.log('surface mapping: metric unfold, rotated staircase, split edges, material boundaries, projection, persistence, cache, isolation, closed cuts');
