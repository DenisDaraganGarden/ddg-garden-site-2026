import assert from 'node:assert/strict';
import { createFramePacer, normalizeFrameRateLimit } from './framePacing.js';

assert.equal(normalizeFrameRateLimit(undefined), 0, 'missing legacy setting stays unlimited');
assert.equal(normalizeFrameRateLimit(30), 30);
assert.equal(normalizeFrameRateLimit(75), 0, 'unsupported limits cannot create arbitrary cadence');

function simulate(limit, ticks) {
  let callback = null;
  let nextId = 0;
  const frames = [];
  const pacer = createFramePacer({
    limit,
    requestFrame(next) { callback = next; nextId += 1; return nextId; },
    cancelFrame() { callback = null; },
    onFrame(frame) { frames.push(frame); },
  });
  pacer.start();
  for (const now of ticks) callback?.(now);
  return { pacer, frames, callback: () => callback };
}

for (const refreshHz of [59.94, 60, 120]) {
  for (const limit of [30, 40, 60, 120]) {
    const durationSeconds = 10;
    const interval = 1000 / refreshHz;
    const ticks = Array.from({ length: Math.ceil(durationSeconds * refreshHz) + 1 }, (_, index) => index * interval);
    const { frames } = simulate(limit, ticks);
    assert.equal(frames[0].deltaSeconds, 0, `${refreshHz}/${limit}: first frame does not advance`);
    const active = frames.slice(1);
    const expected = Math.min(refreshHz, limit) * durationSeconds;
    assert.ok(Math.abs(active.length - expected) <= 1.5, `${refreshHz}/${limit}: average cap stays truthful`);
    const elapsed = active.reduce((total, frame) => total + frame.deltaSeconds, 0);
    assert.ok(elapsed > durationSeconds - .1 && elapsed <= durationSeconds + interval / 1000, `${refreshHz}/${limit}: steady animation follows active wall time`);
  }
}

const hitchBeforeNextDeadline = simulate(60, [0, 16.667, 33.334, 1600, 1616]);
assert.equal(hitchBeforeNextDeadline.frames.length, 4, 'a hitch produces one draw, then waits for the next deadline');
const hitchAtNextDeadline = simulate(60, [0, 16.667, 33.334, 1600, 1616, 1634]);
assert.equal(hitchAtNextDeadline.frames.length, 5, 'a later RAF produces one normal frame, never a catch-up burst');

const hidden = simulate(30, [0, 40]);
const beforeStop = hidden.frames.length;
hidden.pacer.stop();
hidden.callback()?.(10000);
assert.equal(hidden.frames.length, beforeStop, 'hidden canvas has no RAF work');
hidden.pacer.start();
hidden.callback()?.(10040);
assert.equal(hidden.frames.at(-1).deltaSeconds, 0, 'resume discards hidden wall time');

console.log('framePacing: caps, no catch-up, and hidden resume are stable');
