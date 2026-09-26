import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizePlantingBed } from '../planting/settings.js';
import { fillBed, insideBed } from '../planting/fillBed.js';
import { normalizeCover, coverSeason } from './settings.js';
import { triangleSurface, describeCoverSurface, resolveCoverSurface, receiverSurface, terrainCoverSurface } from './surface.js';
import { buildCover } from './model.js';

assert.equal(normalizeCover(null).density, 1);
assert.equal(normalizeCover({ density: Infinity }).density, 1);
assert.ok(normalizeCover({ leaf: 1, thyme: 1 }).leaf === .5);
const input = { id: 'cover-test', kind: 'cover', points: [[0, 0], [2, 0], [2, 2], [0, 2]], holes: [[[.7, .7], [1.3, .7], [1.3, 1.3], [.7, 1.3]]], cover: { leaf: .65, thyme: .25 }, coverSurface: { root: 'placed-visual-test', path: [0], face: 0 }, seed: 9 };
const bed = normalizePlantingBed(input);
assert.deepEqual(normalizePlantingBed(JSON.parse(JSON.stringify(bed))), bed);
assert.deepEqual(fillBed(bed, new Map()), []);
assert.deepEqual(normalizePlantingBed({ ...input, coverSurface: { root: 'terrain' } }).coverSurface, { root: 'terrain' });
const slope = triangleSurface(new Float32Array([0, 0, 0, 2, 1, 0, 2, 1, 2, 0, 0, 0, 2, 1, 2, 0, 0, 2]));
assert.ok(Math.abs(slope.sample(1.1, .4).height - .55) < 1e-6);
assert.ok(Math.abs(slope.sample(1.1, .4).normal[0] + .5 / Math.hypot(1, .5)) < 1e-6);
assert.equal(slope.sample(3, 3), null);
for (const habitat of ['rock', 'submerged', 'swash']) assert.equal(terrainCoverSurface({ surfaceAt: () => ({ habitat }) }).sample(0, 0), null);
assert.equal(terrainCoverSurface({ surfaceAt: () => ({ habitat: 'plateau', path: .8 }) }).sample(0, 0), null);
assert.deepEqual(terrainCoverSurface({ surfaceAt: () => ({ habitat: 'plateau', height: 2, normal: { x: 0, y: 1, z: 0 } }) }).sample(0, 0), { height: 2, normal: [0, 1, 0] });
const root = new THREE.Group(); root.name = 'placed-visual-test'; root.userData.placedId = 'test';
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); root.add(mesh); root.updateMatrixWorld();
assert.deepEqual(describeCoverSurface(mesh, 0), bed.coverSurface);
assert.equal(resolveCoverSurface(root, bed.coverSurface), mesh);
mesh.visible = false; assert.equal(resolveCoverSurface(root, bed.coverSurface), null); mesh.visible = true;
assert.equal(receiverSurface(mesh, 9000), null);
mesh.geometry.dispose(); mesh.material.dispose();

const one = buildCover(bed, slope, { budget: 700 }), two = buildCover(bed, slope, { budget: 700 });
one.update(6); two.update(1);
assert.ok(one.stats.instances <= 700);
assert.ok(one.stats.batches < 18);
assert.ok(one.stats.triangles > 0);
const a = one.group.children.filter((o) => o.isInstancedMesh), b = two.group.children.filter((o) => o.isInstancedMesh);
assert.equal(a.length, b.length);
const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
for (let j = 0; j < a.length; j++) {
    assert.equal(a[j].geometry, b[j].geometry, 'beds share geometry');
    assert.deepEqual(a[j].instanceMatrix.array, b[j].instanceMatrix.array, 'season does not reshuffle roots');
    for (let i = 0; i < a[j].instanceMatrix.count; i++) {
        a[j].getMatrixAt(i, matrix); matrix.decompose(p, q, scale);
        // Normal offsets move stems slightly along X on a slope; never above paving.
        assert.ok(insideBed(bed, p.x, p.z) || Math.min(Math.abs(p.x), Math.abs(p.x - 2)) < .02);
        assert.ok(p.y >= p.x * .5 - .001 && p.y < p.x * .5 + .22);
    }
}
assert.equal(coverSeason(1, normalizeCover()).bloom, 0);
assert.equal(coverSeason(6, normalizeCover({ climate: 'mild' })).winter, 0);
assert.ok(coverSeason(6, normalizeCover()).bloom > .5);
assert.ok(coverSeason(8, normalizeCover({ moisture: 0 })).drought > coverSeason(8, normalizeCover({ moisture: 1 })).drought);
let disposed = 0; a[0].geometry.addEventListener('dispose', () => disposed++);
one.dispose(); assert.equal(disposed, 0, 'other bed still owns shared assets');
two.dispose(); assert.equal(disposed, 1, 'last owner releases shared geometry');
two.dispose(); assert.equal(disposed, 1, 'cleanup is idempotent');
console.log('groundcover: persistence, exact slope/normal, holes, bounded instances, stable season and shared-resource disposal hold');
