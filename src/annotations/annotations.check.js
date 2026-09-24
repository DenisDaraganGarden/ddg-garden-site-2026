// Run: node src/annotations/annotations.check.js
import assert from 'node:assert/strict';
import { formatLevel, markLevels, normalizeAnnotationSettings, stackLabels } from './settings.js';

// Число — как на чертеже: знак, запятая, знаков после — сколько требует шаг.
assert.equal(formatLevel(1.2504), '+1,250');
assert.equal(formatLevel(-0.45), '−0,450');
assert.equal(formatLevel(0.0002), '±0,000', 'less than half a step is zero');
assert.equal(formatLevel(1.2549, { step: 0.01 }), '+1,25');
assert.equal(formatLevel(1.25, { units: 'cm', step: 0.01 }), '+125');
assert.equal(formatLevel(1.25, { units: 'mm', step: 0.001 }), '+1250');
assert.equal(formatLevel(1.254, { units: 'cm', step: 0.005 }), '+125,5');
assert.equal(formatLevel(1.25, { ru: false }), '+1.250');

// Ноль один: без него нулём становится первая, лишние снимаются.
const three = normalizeAnnotationSettings({ annotationMarks: [{ id: 'a', x: 0, y: 1, z: 0 }, { id: 'b', x: 1, y: 2.5, z: 0, zero: true }, { id: 'c', x: 2, y: 0.5, z: 0, zero: true }] }).annotationMarks;
assert.deepEqual(three.map((mark) => Boolean(mark.zero)), [false, true, false]);
assert.equal(normalizeAnnotationSettings({ annotationMarks: [{ id: 'a', x: 0, y: 1, z: 0 }] }).annotationMarks[0].zero, true);
assert.deepEqual([...markLevels(three).values()], [-1.5, 0, -2]);
assert.equal(normalizeAnnotationSettings({ annotationMarks: [{ x: 'no' }] }).annotationMarks.length, 0);
assert.equal(normalizeAnnotationSettings({ annotationStep: 0.02 }).annotationStep, 0.001, 'only the listed rounding steps');
assert.equal(normalizeAnnotationSettings({ annotationMarks: [{ id: 'p', x: 0, y: 0, z: 0, ground: true }] }).annotationMarks[0].ground, true, 'a mark on the plane remembers it');

// Полки: две отметки рядом на экране — дальняя поднимается выше, одинокая — внизу.
const shelves = stackLabels([
    { id: 'near', x: 100, y: 200, width: 80, height: 30, depth: 5 },
    { id: 'far', x: 120, y: 205, width: 80, height: 30, depth: 9 },
    { id: 'alone', x: 400, y: 200, width: 80, height: 30, depth: 7 },
], 26);
assert.equal(shelves.get('near'), 0);
assert.ok(shelves.get('far') >= 1, 'the farther of two overlapping labels goes up a shelf');
assert.equal(shelves.get('alone'), 0);

console.log('annotations: level format, one zero, shelves for crowded labels');
