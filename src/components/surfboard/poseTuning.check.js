import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { POSE_FACTORY, STROKE_KEYS, SWIM_KEYS, normalizePoseTuning, poseTuningModule, strokeOffset } from './poseTuning.js';
import { createControls, createPose, poseTuning, proneControls, setPoseTuning, solvePose, swimControls } from './riderPose.js';
import { boardDimensions, deckHeight, halfWidth } from './boardShape.js';
import { SEGMENT } from './riderSkeleton.js';

// Denis's corrections to the rider's poses — lying, the paddle stroke, the
// crawl — as the lab's manipulators make them and the dev server saves them:
// nonsense is turned away (no NaN, no flight across the scene, a zero
// direction is no direction), what is saved reads back as it was, and each
// one moves the part it names: the pelvis by its offset, a resting hand by
// its own, the chest up with the arch, an elbow the way it is told; a stroke
// moved at one of its four moments is moved there exactly and nowhere else
// by more.

const norm = normalizePoseTuning({ prone: { pelvis: [0, 'x', 9], chest: 500, head: [NaN, -5], handL: [0.1], elbowL: [0, 0, 0], kneeR: [0, -2, 0] }, paddle: { strokeL: [[0.1, 0, 0]] } });
assert.deepEqual(norm.prone.pelvis, [0, 0, 0.5], 'numbers only, and not beyond half a metre');
assert.equal(norm.prone.chest, 60, 'the arch within 60°');
assert.deepEqual(norm.prone.head, [0, -5]);
assert.deepEqual(norm.prone.handL, [0, 0, 0], 'a malformed hand is no correction');
assert.equal(norm.prone.elbowL, null, 'a zero direction is no direction');
assert.deepEqual(norm.prone.kneeR, [0, -1, 0], 'a direction is made unit');
assert.deepEqual(norm.paddle.strokeL, [[0.1, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], 'a stroke has its four moments');
assert.deepEqual(normalizePoseTuning(), normalizePoseTuning(POSE_FACTORY), 'nothing saved is the factory pose');
assert.deepEqual(normalizePoseTuning({ prone: POSE_FACTORY.prone }).swim, normalizePoseTuning(POSE_FACTORY).swim, 'a file from before the stroke and the crawl reads as theirs untouched');

// The stroke's correction: each moment's own at its phase, straight between.
const keys = [[0.1, 0, 0], [0, 0.2, 0], [0, 0, 0], [0, 0, -0.1]];
const at = (phase, moments = STROKE_KEYS) => strokeOffset(keys, moments, phase, [0, 0, 0]).map((v) => +v.toFixed(6));
STROKE_KEYS.forEach((phase, i) => assert.deepEqual(at(phase), keys[i], `the moment at ${phase} is its own`));
assert.deepEqual(at((STROKE_KEYS[0] + STROKE_KEYS[1]) / 2), [0.05, 0.1, 0], 'half way, half each');
assert.deepEqual(at((STROKE_KEYS[3] + 1) / 2), [0.05, 0, -0.05], 'round the end of the stroke to its start');
assert.deepEqual(at(1.2), at(0.2), 'a stroke comes round');

// What the dev server writes reads back as it was.
const saved = normalizePoseTuning({
  prone: { pelvis: [0.01, 0.05, -0.02], chest: 7.5, head: [4, -12], handR: [0.03, 0.02, 0.1], elbowL: [0.6, 0, -0.8] },
  paddle: { strokeR: [[0, 0, 0.1], [0, -0.05, 0], [0, 0, 0], [0, 0.03, 0]], elbowR: [-1, 0, 0] },
  swim: { chest: -5, strokeL: keys, footL: [0, 0.1, 0], kneeR: [0, -1, 0] },
});
const file = path.join(mkdtempSync(path.join(tmpdir(), 'rider-pose-')), 'riderPoseTuning.js');
writeFileSync(file, poseTuningModule(saved));
const read = (await import(pathToFileURL(file).href)).default;
assert.deepEqual(normalizePoseTuning(read), saved, 'saved and read back unchanged');

// Each correction moves its part.
const dims = boardDimensions({});
const board = { length: dims.length, deckY: (x, z) => deckHeight(dims, x, z), halfWidth: (z) => halfWidth(dims, z / dims.length + 0.5) };
const lying = (tuning, p = { strokeL: -1, strokeR: -1, arch: 0.6 }) => {
  setPoseTuning(tuning);
  const controls = proneControls(board, p, createControls());
  return { controls, pose: solvePose(controls, createPose()) };
};
const diff = (a, b, key) => a.controls[key].map((v, i) => +(v - b.controls[key][i]).toFixed(6));
const before = lying(POSE_FACTORY), after = lying(saved);
assert.deepEqual(diff(after, before, 'pelvis'), [0.01, 0.05, -0.02], 'the pelvis by its offset');
assert.deepEqual(diff(after, before, 'handR'), [0.03, 0.02, 0.1], 'the right hand by its own');
assert.deepEqual(diff(after, before, 'handL'), [0, 0, 0], 'and the left one not at all');
const chestRise = after.pose.position[SEGMENT.chest][1] - before.pose.position[SEGMENT.chest][1] - 0.05;
assert.ok(chestRise > 0.01, `the arch lifts the chest (${chestRise.toFixed(3)} m over the pelvis's own rise)`);
assert.deepEqual(after.controls.elbowPoleL.map((v) => +v.toFixed(6)), [0.6, 0, -0.8], 'the left elbow points where it was told');
// Paddling: the stroke moved at its moment, its own elbow; the resting one's not.
const stroke = (tuning, phase) => lying(tuning, { strokeL: phase, strokeR: phase, arch: 0.6 });
assert.deepEqual(diff(stroke(saved, STROKE_KEYS[1]), stroke(POSE_FACTORY, STROKE_KEYS[1]), 'handR'), [0, -0.05, 0], 'the right stroke deeper at its deepest');
assert.deepEqual(stroke(saved, 0.3).controls.elbowPoleR.map((v) => +v.toFixed(6)), [-1, 0, 0], 'the stroke\'s own elbow');
assert.notDeepEqual(stroke(saved, 0.3).controls.elbowPoleL.map((v) => +v.toFixed(3)), [0.6, 0, -0.8], 'not the resting one');
// Swimming: the crawl's own.
const swimming = (tuning, phase) => { setPoseTuning(tuning); return { controls: swimControls({ strokeL: phase, strokeR: phase, kick: 0, lift: 1 }, createControls()) }; };
assert.deepEqual(diff(swimming(saved, SWIM_KEYS[0]), swimming(POSE_FACTORY, SWIM_KEYS[0]), 'handL'), [0.1, 0, 0], 'the crawl moved at its entry');
assert.deepEqual(diff(swimming(saved, 0), swimming(POSE_FACTORY, 0), 'soleL'), [0, 0.1, 0], 'the kick\'s foot');
setPoseTuning(POSE_FACTORY);
assert.deepEqual(poseTuning(), normalizePoseTuning(POSE_FACTORY));

console.log('poseTuning: nonsense turned away, an old file reads, saved reads back unchanged; lying, the pelvis, a hand, the arch and an elbow move as told; a stroke moved at its moment and with its own elbow; the crawl and the kick too');
