// Run: node src/components/effects/sky/painterly/lightning.check.js
import assert from 'node:assert/strict';
import {
  SOUND_SPEED, STRIKES_PER_MINUTE, advanceLightning, buildBolt, createLightningState, takeThunder,
} from './lightning.js';

const target = () => ({ x: 3000, z: -4000, top: 1800, bottom: 0 });
const listener = { x: 0, z: 0 };

// --- no lightning, no strikes, flash stays at zero ---------------------------
{
  const state = createLightningState(3);
  for (let i = 0; i < 6000; i += 1) advanceLightning(state, 1 / 60, { lightning: 0, pickTarget: target, listener });
  assert.equal(state.strikes, 0, 'lightning 0 must never strike');
  assert.equal(state.flash, 0);
  assert.equal(takeThunder(state).length, 0);
}

// --- forced strike: flash peaks near 1 and decays to nothing -----------------
{
  const state = createLightningState(5);
  state.force = true;
  advanceLightning(state, 1 / 60, { lightning: 0, pickTarget: target, listener });
  assert.equal(state.strikes, 1, 'force must strike even at lightning 0');
  assert.ok(state.bolt > 0.5, 'the channel is visible on the first frame');
  let peak = 0;
  for (let i = 0; i < 120; i += 1) {
    advanceLightning(state, 1 / 60, { lightning: 0, pickTarget: target, listener });
    peak = Math.max(peak, state.flash);
  }
  assert.ok(peak > 0.7 && peak <= 1, `flash must peak near 1, got ${peak}`);
  assert.ok(state.flash < 0.01, `flash must have decayed after 2 s, got ${state.flash}`);
  assert.equal(state.strike, null, 'a finished strike is released');
  assert.equal(state.bolt, 0);
  const thunder = takeThunder(state);
  const distance = Math.hypot(3000, 4000);
  assert.equal(thunder.length, 0, `thunder from ${distance} m is not due after 2 s`);
  for (let i = 0; i < 60 * 15; i += 1) advanceLightning(state, 1 / 60, { lightning: 0, pickTarget: target, listener });
  const due = takeThunder(state);
  assert.equal(due.length, 1, 'thunder arrives once');
  assert.ok(Math.abs(due[0].at - distance / SOUND_SPEED) < 1 / 30, 'thunder delay is distance over the speed of sound');
  assert.ok(due[0].gain > 0 && due[0].gain <= 1);
  assert.equal(takeThunder(state).length, 0, 'thunder is consumed');
}

// --- the strike rate follows the slider: Poisson mean around the contract -----
{
  const rate = (lightning) => {
    const state = createLightningState(11);
    const minutes = 40;
    for (let i = 0; i < minutes * 60 * 30; i += 1) advanceLightning(state, 1 / 30, { lightning, pickTarget: target, listener });
    return state.strikes / minutes;
  };
  const full = rate(1);
  const half = rate(0.5);
  assert.ok(Math.abs(full - STRIKES_PER_MINUTE) < STRIKES_PER_MINUTE * 0.25, `about ${STRIKES_PER_MINUTE}/min at 1, got ${full}`);
  assert.ok(Math.abs(half - STRIKES_PER_MINUTE / 2) < STRIKES_PER_MINUTE * 0.2, `about half at 0.5, got ${half}`);
}

// --- re-strikes are bounded and the envelope never exceeds 1 -----------------
{
  const state = createLightningState(2);
  let maxStrokes = 0;
  let maxFlash = 0;
  for (let i = 0; i < 60 * 600; i += 1) {
    advanceLightning(state, 1 / 60, { lightning: 1, pickTarget: target, listener });
    maxStrokes = Math.max(maxStrokes, state.strokes.length);
    maxFlash = Math.max(maxFlash, state.flash);
  }
  assert.ok(maxStrokes <= 4, `at most four live strokes, got ${maxStrokes}`);
  assert.ok(maxFlash <= 1 + 1e-9, 'flash never exceeds 1');
}

// --- the bolt geometry is finite, starts at the top and reaches the bottom ----
{
  const bolt = buildBolt({ x: 100, z: -200, top: 1500, bottom: 0, seed: 9, branches: 4 });
  const positions = bolt.main;
  assert.ok(positions.length % 6 === 0 && positions.length >= 128 * 6, 'segment pairs, at least the main channel');
  for (const value of [...positions, ...bolt.branches]) assert.ok(Number.isFinite(value));
  assert.equal(positions[1], 1500, 'the channel starts at the cloud');
  let lowest = Infinity;
  for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]);
  assert.ok(lowest <= 0 + 1e-6, 'the main channel reaches the ground');
  assert.ok(bolt.branches.length >= 4 * 16 * 6, 'four branches with their forks');
  const same = buildBolt({ x: 100, z: -200, top: 1500, bottom: 0, seed: 9, branches: 4 });
  assert.deepEqual(Array.from(same.main), Array.from(positions), 'a seed reproduces its channel');
}

console.log('lightning: all checks passed');
