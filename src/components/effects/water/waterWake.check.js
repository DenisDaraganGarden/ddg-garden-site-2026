import assert from 'node:assert/strict';
import {
  WAKE_FOAM, WAKE_LIFE, WAKE_RINGS, ageWake, clearWake, createWaterWake, takeWakeFoam, wakeFoam, wakeReach, wakeRing, writeWakeRings,
} from './waterWake.js';

// The wake record between what moves on the water and the shaders that draw
// it: rings live their life and go, the circle handed to the shader holds
// every live ring's waves, a full buffer drops the oldest ring and the weakest
// foam, and foam is read once.

const vec4 = () => ({ x: 0, y: 0, z: 0, w: 0, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } });
const rings = Array.from({ length: WAKE_RINGS }, vec4), bounds = vec4();
const segments = Array.from({ length: WAKE_FOAM }, vec4), shapes = Array.from({ length: WAKE_FOAM }, vec4);

{
  const wake = createWaterWake();
  assert.equal(writeWakeRings(wake, rings, bounds), 0, 'an empty wake has no rings');
  assert.equal(bounds.w, 0, 'and the shader skips it');

  wakeRing(wake, 10, -4, 1);
  ageWake(wake, 1);
  wakeRing(wake, 14, -4, 0.5);
  assert.equal(writeWakeRings(wake, rings, bounds), 2);
  // Every point a live ring's waves reach is inside the circle.
  for (const [x, z, age] of [[10, -4, 1], [14, -4, 0]]) {
    const reach = wakeReach(age);
    for (let a = 0; a < 16; a += 1) {
      const px = x + reach * Math.cos(a), pz = z + reach * Math.sin(a);
      assert.ok(Math.hypot(px - bounds.x, pz - bounds.y) <= bounds.z + 1e-9, `ring at ${x} reaches inside the bounds`);
    }
  }

  ageWake(wake, WAKE_LIFE);
  assert.equal(writeWakeRings(wake, rings, bounds), 0, 'rings are gone after their life');
  assert.ok(rings.every((ring) => ring.w === 0), 'and their slots read empty');
}

{
  const wake = createWaterWake();
  for (let i = 0; i <= WAKE_RINGS; i += 1) wakeRing(wake, i, 0, 1);
  writeWakeRings(wake, rings, bounds);
  const xs = rings.map((ring) => ring.x).sort((a, b) => a - b);
  assert.deepEqual([xs[0], xs.at(-1)], [1, WAKE_RINGS], 'a full buffer drops the oldest ring');
  wakeRing(wake, 0, 0, 0);
  wakeRing(wake, NaN, 0, 1);
  writeWakeRings(wake, rings, bounds);
  assert.deepEqual(rings.map((ring) => ring.x).sort((a, b) => a - b), xs, 'no ring from nothing or from NaN');
  clearWake(wake);
  assert.equal(writeWakeRings(wake, rings, bounds), 0, 'cleared');
}

{
  const wake = createWaterWake();
  for (let i = 0; i < WAKE_FOAM; i += 1) wakeFoam(wake, i, 0, i + 1, 0, 0.3, 0.2 + 0.1 * i);
  wakeFoam(wake, 9, 9, 9, 9, 0.8, 0.9);
  wakeFoam(wake, 7, 7, 7, 7, 0.8, 0.05);
  assert.equal(takeWakeFoam(wake, segments, shapes), WAKE_FOAM);
  const strengths = shapes.map((shape) => shape.y).sort((a, b) => a - b);
  assert.deepEqual(strengths.map((s) => s.toFixed(1)), ['0.3', '0.4', '0.5', '0.9'], 'a full queue lets the weakest foam go, and not for a weaker one');
  assert.equal(takeWakeFoam(wake, segments, shapes), 0, 'foam is read once');
  assert.ok(shapes.every((shape) => shape.y === 0), 'and then reads empty');
}

console.log('waterWake: rings age out, the bounds hold every live ring, full buffers drop the oldest ring and the weakest foam, foam is read once');
