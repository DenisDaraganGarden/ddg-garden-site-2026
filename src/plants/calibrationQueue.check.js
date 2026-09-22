import assert from 'node:assert/strict';
import { createCalibrationQueue } from './calibrationQueue.js';
let time = 0;
const seen = [], completed = [];
const queue = createCalibrationQueue({ now: () => time, budgetMs: 3, maxSteps: 2 });
function* work(name, cost, count = 2) {
  try { for (let i = 0; i < count; i++) { seen.push(name); time += cost; yield; } return name; }
  finally { seen.push(`${name}:closed`); }
}
const detachA = queue.attach('a'); queue.attach('b');
assert.equal(queue.isDriver('a'), true); detachA(); assert.equal(queue.isDriver('b'), true);
queue.enqueue(work('heavy', 7), value => completed.push(value));
const cancel = queue.enqueue(work('cheap', 1), value => completed.push(value));
queue.advance(); assert.deepEqual(seen, ['heavy']); // one expensive read cannot admit more work
queue.advance(); assert.deepEqual(seen.slice(1), ['cheap', 'heavy']); // fair rotation, at most two steps
cancel(); assert.equal(seen.at(-1), 'cheap:closed');
while (queue.stats.pending) queue.advance();
assert.deepEqual(completed, ['heavy']); assert.equal(queue.stats.completed, 1);
assert.equal(queue.stats.maxStepsPerFrame, 2); assert.equal(queue.advance(), false);
// A yielded promise (a fenced readback) parks the job until it settles and
// resumes it with the value; the queue keeps rotating the others meanwhile.
let finishRead; const got = [];
queue.enqueue((function* () { got.push(yield new Promise((r) => { finishRead = r; })); yield; return 'fenced'; })(), value => completed.push(value));
queue.enqueue(work('other', 1, 1), value => completed.push(value));
queue.advance(); queue.advance(); assert.deepEqual(got, []); assert.equal(queue.stats.pending, 1); assert.equal(completed.at(-1), 'other');
finishRead(42); await new Promise((r) => setTimeout(r, 0));
queue.advance(); assert.deepEqual(got, [42]); queue.advance(); assert.deepEqual(completed.slice(1), ['other', 'fenced']);
console.log('calibrationQueue: shared budget, fairness, owner handover, cancellation and fenced steps passed');
