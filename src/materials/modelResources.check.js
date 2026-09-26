// Run: node src/materials/modelResources.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedTextureCache } from './sharedTextureCache.js';
import { applyModelMaterials, disposeModelMaterials, loadLibraryMaps } from './modelMaterials.js';
import { makeFaceCamera } from '../placed/sketchupModel.js';

const texture = () => new THREE.DataTexture(new Uint8Array(16), 2, 2);
let loads = 0, freed = 0;
const acquire = createSharedTextureCache(async () => {
    loads += 1;
    const result = texture();
    result.addEventListener('dispose', () => { freed += 1; });
    return result;
});
const [a, b] = await Promise.all([acquire('tile'), acquire('tile')]);
assert.equal(loads, 1, 'concurrent users share a load');
assert.notEqual(a, b, 'each material owns a texture view');
assert.equal(a.source, b.source, 'views share GPU source');
a.repeat.set(2, 3);
assert.deepEqual(b.repeat.toArray(), [1, 1], 'UV edits stay local');
a.dispose(); a.dispose();
assert.equal(freed, 0, 'double disposal cannot evict another user');
b.dispose();
assert.equal(freed, 1, 'the final user releases the decoded source');
(await acquire('tile')).dispose();
assert.equal(loads, 2, 'unused sources are not an unbounded cache');

const originalLoad = THREE.TextureLoader.prototype.load;
const deferred = [];
THREE.TextureLoader.prototype.load = (url, done, _progress, fail) => {
    const value = texture();
    queueMicrotask(() => {
        if (url.includes('missing') && url.endsWith('ao.webp')) fail(new Error('missing map'));
        else if (url.includes('deferred')) deferred.push(() => done(value));
        else done(value);
    });
    return value;
};
try {
    const root = new THREE.Group(), sourceGeometry = new THREE.BoxGeometry(2, 2, 2);
    const sourceMap = texture(), material = new THREE.MeshStandardMaterial({ map: sourceMap });
    material.name = 'stone';
    const mesh = new THREE.Mesh(sourceGeometry, material);
    root.add(mesh);
    const prepared = { root, materials: [material] };
    let sourceDisposals = 0;
    sourceMap.addEventListener('dispose', () => { sourceDisposals += 1; });
    sourceGeometry.addEventListener('dispose', () => { sourceDisposals += 1; });
    const override = { material: 'tile', tile: 1, projection: 'box', normal: 1, roughness: .8,
        faces: [{ faces: ['up'], material: 'tile', tile: 2, normal: 1, roughness: .8 }] };
    const job = applyModelMaterials(prepared, { stone: override }, { root });
    await job.ready;
    const baseMap = material.map, ruled = material.userData.faceRules.materials[0];
    assert.equal(baseMap.source, ruled.map.source, 'base and face rule share pixels despite distinct UV/channel');
    assert.notEqual(baseMap.repeat.x, ruled.map.repeat.x);
    let disposed = 0;
    for (const resource of [mesh.geometry, mesh.userData.faceSplit.geometry, material.map, material.heightMap, ruled.map, ruled.heightMap, ruled]) {
        resource.addEventListener('dispose', () => { disposed += 1; });
    }
    job.cancel();
    disposeModelMaterials(prepared);
    assert.equal(disposed, 7, 'split, projection, base/rule maps and rule material are released');
    assert.equal(mesh.geometry, sourceGeometry);
    assert.equal(mesh.material, material);
    assert.equal(material.map, sourceMap);
    assert.equal(sourceDisposals, 0, 'shared GLTF inputs stay intact');
    disposeModelMaterials(prepared);
    assert.equal(disposed, 7, 'teardown is idempotent');

    // StrictMode effect replay uses the same prepared instance again.
    const replay = applyModelMaterials(prepared, { stone: override }, { root });
    await replay.ready;
    assert.notEqual(material.map, sourceMap);
    replay.cancel(); disposeModelMaterials(prepared);

    const late = applyModelMaterials(prepared, { stone: { ...override, material: 'deferred', faces: [] } }, { root });
    await new Promise((resolve) => setTimeout(resolve, 0));
    late.cancel(); disposeModelMaterials(prepared);
    deferred.splice(0).forEach((complete) => complete());
    await late.ready;
    assert.equal(material.map, sourceMap, 'late load cannot resurrect an unmounted model');
    await assert.rejects(loadLibraryMaps('missing'), /missing map/);

    // Moving a slider while the first texture load is pending must not leave
    // the SketchUp map in place forever under a claimed library override.
    const pending = applyModelMaterials(prepared, { stone: { ...override, material: 'deferred-slider', faces: [] } }, { root });
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.cancel();
    const changed = applyModelMaterials(prepared, { stone: { ...override, material: 'deferred-slider', normal: 0.4, faces: [] } }, { root });
    await new Promise((resolve) => setTimeout(resolve, 0));
    deferred.splice(0).forEach((complete) => complete());
    await Promise.all([pending.ready, changed.ready]);
    assert.notEqual(material.map, sourceMap, 'slider change during loading still installs library maps');
    assert.equal(material.normalScale.x, 0.4, 'latest slider value wins');
    changed.cancel(); disposeModelMaterials(prepared);

    const cards = new THREE.Group(), cardSource = new THREE.PlaneGeometry(1, 2);
    cards.userData.faceCamera = true;
    const card = new THREE.Mesh(cardSource, new THREE.MeshStandardMaterial());
    cards.add(card);
    const controller = makeFaceCamera(cards);
    assert.equal(makeFaceCamera(cards), controller, 'repeated preparation retains resource ownership');
    assert.notEqual(card.geometry, cardSource);
    assert.equal(cardSource.attributes.aWindCard, undefined, 'wind never mutates cached geometry');
    let windDisposals = 0;
    card.geometry.addEventListener('dispose', () => { windDisposals += 1; });
    card.material.addEventListener('dispose', () => { windDisposals += 1; });
    controller.dispose();
    assert.equal(windDisposals, 2);
} finally {
    THREE.TextureLoader.prototype.load = originalLoad;
}
console.log('model resources: shared Sources, independent UVs, teardown, effect replay, late/failed loads and wind ownership');
