// Run: node src/components/effects/water/boatDynamics.check.js

import assert from 'node:assert/strict';
import {
  applyBoatDynamicsImpulse,
  createBoatDynamicsState,
  resetBoatDynamicsState,
  resolveBoatImpact,
  resolveBoatWakeStrength,
  stepBoatDynamics,
} from './boatDynamics.js';
import { resolveBoatCockpitSeal } from './boatCockpitSeal.js';
import { enqueueWaterImpulse, takeNextWaterImpulse } from './waterImpulseQueue.js';

const limits = {
  heave: [-0.5, 0.5],
  pitch: [-0.24, 0.24],
  roll: [-0.28, 0.28],
};

const simulate = (frameDelta) => {
  const state = createBoatDynamicsState();
  resetBoatDynamicsState(state, { heave: 0, pitch: 0, roll: 0 });
  applyBoatDynamicsImpulse(state, resolveBoatImpact({
    boatX: 0,
    boatZ: 0,
    pointX: -0.2,
    pointZ: 0.1,
    strength: 0.9,
    radius: 1.4,
  }));
  for (let time = 0; time < 5; time += frameDelta) {
    stepBoatDynamics(state, { heave: 0, pitch: 0, roll: 0 }, frameDelta, limits);
  }
  return state;
};

const at30 = simulate(1 / 30);
const at120 = simulate(1 / 120);
assert.ok(Math.abs(at30.heave - at120.heave) < 0.002, 'heave must be frame-rate stable');
assert.ok(Math.abs(at30.pitch - at120.pitch) < 0.002, 'pitch must be frame-rate stable');
assert.ok(Math.abs(at30.roll - at120.roll) < 0.002, 'roll must be frame-rate stable');
assert.ok(Math.abs(at30.heave) < 0.002, 'heave must settle after an impact');
assert.ok(Math.abs(at30.pitch) < 0.004, 'pitch must settle after an impact');
assert.ok(Math.abs(at30.roll) < 0.004, 'roll must settle after an impact');

const energetic = createBoatDynamicsState();
resetBoatDynamicsState(energetic, { heave: 0, pitch: 0, roll: 0 });
applyBoatDynamicsImpulse(energetic, { heaveVelocity: 0.1, rollVelocity: 0.2, energy: 0.8 });
assert.ok(resolveBoatWakeStrength(energetic) > 0.035, 'an external rock must emit a wake');

const queue = [];
assert.equal(enqueueWaterImpulse(queue, { source: 'boat-wake', strength: 0.05, priority: -1 }), true);
assert.equal(enqueueWaterImpulse(queue, { source: 'boat-wake', strength: 0.08, priority: -1 }), true);
assert.equal(queue.length, 1, 'boat wakes must coalesce');
assert.equal(queue[0].strength, 0.08, 'coalescing must preserve the stronger wake');
for (let index = 0; index < 7; index += 1) {
  enqueueWaterImpulse(queue, { source: `ambient-${index}`, strength: 0.1, priority: 0 });
}
assert.equal(queue.length, 8);
assert.equal(enqueueWaterImpulse(queue, { source: 'gull-impact', strength: 0.9, priority: 10 }), true);
assert.equal(queue.some((event) => event.source === 'gull-impact'), true, 'gull impact must displace a wake');
assert.equal(takeNextWaterImpulse(queue).event.source, 'gull-impact', 'gull impact must run before a wake');

const cursorQueue = [{ source: 'boat-wake', strength: 0.05, priority: -1 }];
const cursorEvent = { source: 'cursor', strength: 0.3, priority: 5 };
const cursorSelection = takeNextWaterImpulse(cursorQueue, cursorEvent);
assert.equal(cursorSelection.event, cursorEvent, 'cursor must run before a visual wake');
assert.equal(cursorSelection.usedDirect, true);
assert.equal(cursorQueue.length, 1, 'a deferred wake must remain queued');

const seal = resolveBoatCockpitSeal({
  center: { x: 1.05, y: 0.35, z: -0.99 },
  size: { x: 1.59, y: 0.83, z: 4.37 },
});
assert.ok(seal.width < 1.59 * 0.5, 'cockpit seal must stay inside the hull width');
assert.ok(seal.length < 4.37 * 0.5, 'cockpit seal must stay inside the hull length');
assert.ok(seal.localY > 0.2 && seal.localY < 0.3, 'seal must sit near the authored waterline');

console.log('boatDynamics: all checks passed');
