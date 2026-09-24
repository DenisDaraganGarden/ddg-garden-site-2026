import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRONE_FACTORY, normalizeProneTuning, proneTuningModule } from './proneTuning.js';
import { createControls, createPose, proneControls, proneTuning, setProneTuning, solvePose } from './riderPose.js';
import { boardDimensions, deckHeight, halfWidth } from './boardShape.js';
import { SEGMENT } from './riderSkeleton.js';

// Denis's corrections to the lying pose, as the lab's manipulators make them
// and the dev server saves them: nonsense is turned away (no NaN, no flight
// across the scene, a zero direction is no direction), what is saved reads
// back as it was, and each one moves the part it names — the pelvis by its
// offset, a hand by its own, the chest up with the arch, an elbow the way it
// is told to point.

const norm = normalizeProneTuning({ pelvis: [0, 'x', 9], chest: 500, head: [NaN, -5], handL: [0.1], elbowL: [0, 0, 0], kneeR: [0, -2, 0] });
assert.deepEqual(norm.pelvis, [0, 0, 0.5], 'numbers only, and not beyond half a metre');
assert.equal(norm.chest, 60, 'the arch within 60°');
assert.deepEqual(norm.head, [0, -5]);
assert.deepEqual(norm.handL, [0, 0, 0], 'a malformed hand is no correction');
assert.equal(norm.elbowL, null, 'a zero direction is no direction');
assert.deepEqual(norm.kneeR, [0, -1, 0], 'a direction is made unit');
assert.deepEqual(normalizeProneTuning(), normalizeProneTuning(PRONE_FACTORY), 'nothing saved is the factory pose');

// What the dev server writes reads back as it was.
const saved = { ...PRONE_FACTORY, pelvis: [0.01, 0.05, -0.02], chest: 7.5, head: [4, -12], handR: [0.03, 0.02, 0.1], elbowL: [0.6, 0, -0.8] };
const file = path.join(mkdtempSync(path.join(tmpdir(), 'rider-pose-')), 'riderPoseTuning.js');
writeFileSync(file, proneTuningModule(saved));
const read = (await import(pathToFileURL(file).href)).default;
assert.deepEqual(read.prone, normalizeProneTuning(saved), 'saved and read back unchanged');

// Each correction moves its part.
const dims = boardDimensions({});
const board = { length: dims.length, deckY: (x, z) => deckHeight(dims, x, z), halfWidth: (z) => halfWidth(dims, z / dims.length + 0.5) };
const lying = (tuning) => {
  setProneTuning(tuning);
  const controls = proneControls(board, { strokeL: -1, strokeR: -1, arch: 0.6 }, createControls());
  return { controls, pose: solvePose(controls, createPose()) };
};
const before = lying(PRONE_FACTORY);
const after = lying(saved);
const moved = (key) => after.controls[key].map((v, i) => v - before.controls[key][i]);
assert.deepEqual(moved('pelvis').map((v) => +v.toFixed(6)), [0.01, 0.05, -0.02], 'the pelvis by its offset');
assert.deepEqual(moved('handR').map((v) => +v.toFixed(6)), [0.03, 0.02, 0.1], 'the right hand by its own');
assert.deepEqual(moved('handL'), [0, 0, 0], 'and the left one not at all');
const chestRise = after.pose.position[SEGMENT.chest][1] - before.pose.position[SEGMENT.chest][1] - 0.05;
assert.ok(chestRise > 0.01, `the arch lifts the chest (${chestRise.toFixed(3)} m over the pelvis's own rise)`);
assert.deepEqual(after.controls.elbowPoleL.map((v) => +v.toFixed(6)), [0.6, 0, -0.8], 'the left elbow points where it was told');
// Paddling, the stroke's own elbow, not the resting one.
setProneTuning(saved);
const stroking = proneControls(board, { strokeL: 0.3, strokeR: -1 }, createControls());
assert.notDeepEqual(stroking.elbowPoleL.map((v) => +v.toFixed(3)), [0.6, 0, -0.8], 'a stroke keeps its elbow');
setProneTuning(PRONE_FACTORY);
assert.deepEqual(proneTuning(), normalizeProneTuning(PRONE_FACTORY));

console.log('proneTuning: nonsense turned away, saved reads back unchanged, the pelvis, a hand, the arch and an elbow each move as told, a stroke keeps its own elbow');
