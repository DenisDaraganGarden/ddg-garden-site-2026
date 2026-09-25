// Run: node src/materials/faces.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { faceClass, splitFaces } from './modelMaterials.js';
import { normalizeFaceRule, normalizeMaterialOverride } from './settings.js';

// Правила по граням: крышка ящика — «пол» на своей высоте, бока и дно — одно
// правило; забор мимо; раскладка по граням в uv1, в метрах.
const box = new THREE.BoxGeometry(2, 1, 2).translate(0, 0.5, 0);
const rules = [
    normalizeFaceRule({ faces: 'up', y: [1.1, 0.9], material: 'svetlyy', tile: 2.4 }),
    normalizeFaceRule({ faces: ['side', 'down'], material: 'grafit', tile: 2.4, skip: ['ЗАБОР'] }),
];
assert.deepEqual(rules[0].y, [0.9, 1.1], 'a height window is sorted');
const split = splitFaces(box, new THREE.Matrix4(), rules);
const sizes = Object.fromEntries(split.groups.map((group) => [group.materialIndex, group.count / 3]));
assert.deepEqual(sizes, { 1: 2, 2: 10 }, `the top to the floor rule, the rest to the other (${JSON.stringify(sizes)})`);
assert.equal(split.attributes.uv1.count, split.attributes.position.count, 'every vertex has a face-straight uv');
const top = split.attributes.uv1.array.slice(0, 12);
assert.ok(top.every((value) => Math.abs(Math.abs(value) - 1) < 1e-6), `the top lies in metres: ${[...top]}`);
assert.ok(split.attributes.uv, 'the model’s own uv stays for its own material');

assert.equal(faceClass(rules, new THREE.Vector3(0, 1, 0), 3), 0, 'a floor out of the height window is left alone');
assert.equal(splitFaces(box, new THREE.Matrix4(), [rules[1]], ['ЗАБОР#1']), null, 'a skipped part is not split');
assert.equal(normalizeFaceRule({ faces: 'roof', material: 'x' }), null, 'no such side');
assert.equal(normalizeFaceRule({ faces: 'up' }), null, 'a rule needs a library material');
const override = normalizeMaterialOverride({ faces: [{ faces: 'down', material: 'grafit', tile: 2.4 }] });
assert.ok(override && override.faces.length === 1 && !('material' in override), 'an entry can be rules only');

console.log('materials faces: floors, walls and ceilings of one SketchUp material apart, a height window, a skipped part, uv1 in metres');
