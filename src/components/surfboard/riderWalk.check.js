import assert from 'node:assert/strict';
import { RUN_SPEED, WALK_SPEED, createWalker, resetWalker, stepWalker, walkControls } from './riderWalk.js';
import { createControls, createPose, solvePose } from './riderPose.js';
import { REST, SEGMENT, SEGMENT_CENTRE } from './riderSkeleton.js';
import { qRotate } from './ragdoll.js';

// Walking and running on his own feet: he gets up to a walk and a run; each
// foot stands still while it carries him (no sliding, ever) and the feet take
// turns; walking both feet stand at once for a moment, running both are off
// the ground at once; every step lands on the ground, a slope's too, and the
// legs reach it; he turns on the spot by stepping round; stopped, he settles
// with a foot at each side and stands still.

const DT = 1 / 60;
const flat = () => 0;
function walk({ seconds, forward = 0, turn = 0, run = 0, ground = flat, walker = null, each = null }) {
  const w = walker ?? resetWalker(createWalker(), { ground });
  // The feet standing at the start are not steps.
  const stance = { L: w.feet.L.swing ? null : [...w.feet.L.at], R: w.feet.R.swing ? null : [...w.feet.R.at] };
  let slid = 0, both = 0, none = 0, steps = 0;
  for (let t = 0; t < seconds; t += DT) {
    stepWalker(w, { dt: DT, forward, turn, run, ground });
    for (const side of ['L', 'R']) {
      const f = w.feet[side];
      if (f.swing) { stance[side] = null; continue; }
      if (!stance[side]) { stance[side] = [...f.at]; steps += 1; continue; }
      slid = Math.max(slid, Math.hypot(f.at[0] - stance[side][0], f.at[1] - stance[side][1], f.at[2] - stance[side][2]));
    }
    if (!w.feet.L.swing && !w.feet.R.swing) both += 1;
    if (w.feet.L.swing && w.feet.R.swing) none += 1;
    each?.(w);
  }
  return { w, slid, both, none, steps };
}

// Walking.
{
  const { w, slid, both, none, steps } = walk({ seconds: 6, forward: 1 });
  assert.ok(Math.abs(w.speed - WALK_SPEED) < 0.01, `up to a walk (${w.speed.toFixed(2)} m/s)`);
  assert.ok(slid < 1e-9, `a standing foot never slides (${slid})`);
  assert.ok(both > 20 && none === 0, `walking both feet stand at once for a moment, never both off (${both} frames both down, ${none} both up)`);
  const cadence = steps / 6;
  assert.ok(cadence > 1.5 && cadence < 2.2, `about two steps a second (${cadence.toFixed(2)})`);
  assert.ok(w.pelvisY > 0.9 && w.pelvisY < 0.99, `the pelvis at walking height (${w.pelvisY.toFixed(3)})`);
}
// Running.
{
  let longest = 0, last = null;
  const { w, slid, none } = walk({
    seconds: 6, forward: 1, run: 1,
    each: (walker) => {
      const f = walker.feet.L;
      if (!f.swing && last && last.swing) longest = Math.max(longest, Math.hypot(f.at[0] - last.from[0], f.at[2] - last.from[2]));
      last = { swing: f.swing, from: [...f.from] };
    },
  });
  assert.ok(Math.abs(w.speed - RUN_SPEED) < 0.01 && w.run > 0.99, `up to a run (${w.speed.toFixed(2)} m/s)`);
  assert.ok(slid < 1e-9, 'running, a standing foot never slides either');
  assert.ok(none > 20, `running both feet are off the ground at once (${none} frames)`);
  assert.ok(longest > 2.0 && longest < 2.8, `a running stride of two steps is long (${longest.toFixed(2)} m)`);
}
// Up a slope: every step lands on it, and the legs reach every foot: the
// ankle the IK reaches is the one the sole asks for.
{
  const slope = (x, z) => 0.12 * z;
  let worstLanding = 0, worstReach = 0;
  const controls = createControls(), pose = createPose();
  const t = [0, 0, 0];
  walk({
    seconds: 5, forward: 1, ground: slope,
    each: (w) => {
      for (const side of ['L', 'R']) {
        const f = w.feet[side];
        if (!f.swing) worstLanding = Math.max(worstLanding, Math.abs(f.at[1] - slope(f.at[0], f.at[2])));
      }
      solvePose(walkControls(w, controls), pose);
      for (const side of ['L', 'R']) {
        const i = SEGMENT[`foot${side}`], c = SEGMENT_CENTRE[`foot${side}`], a = REST[`ankle${side}`];
        qRotate(pose.rotation[i], [a[0] - c[0], a[1] - c[1], a[2] - c[2]], t);
        const reached = [pose.position[i][0] + t[0], pose.position[i][1] + t[1], pose.position[i][2] + t[2]];
        qRotate(controls[`footQ${side}`], [0, 0.08, 0], t);
        const sole = controls[`sole${side}`];
        worstReach = Math.max(worstReach, Math.hypot(reached[0] - sole[0] - t[0], reached[1] - sole[1] - t[1], reached[2] - sole[2] - t[2]));
      }
    },
  });
  assert.ok(worstLanding < 1e-9, `a standing foot is on the slope (${worstLanding})`);
  assert.ok(worstReach < 0.005, `the legs reach every foot (${(worstReach * 1000).toFixed(1)} mm short at most)`);
}
// Turning on the spot: he steps round.
{
  const { w, steps } = walk({ seconds: 2, turn: 1 });
  assert.ok(Math.abs(w.yaw) > 3, `he turns (${w.yaw.toFixed(2)} rad)`);
  assert.ok(steps >= 3, `stepping round (${steps} steps)`);
  assert.ok(Math.hypot(w.x, w.z) < 1e-9, 'on the spot');
}
// Stopping: he settles with a foot at each side and stands still.
{
  const { w } = walk({ seconds: 3, forward: 1 });
  walk({ seconds: 2.5, walker: w });
  assert.ok(w.idle, 'standing still');
  const spread = Math.hypot(w.feet.L.at[0] - w.feet.R.at[0], w.feet.L.at[2] - w.feet.R.at[2]);
  assert.ok(Math.abs(spread - 0.2) < 0.03, `a foot at each side (${spread.toFixed(3)} m apart)`);
  const phase = w.phase;
  walk({ seconds: 1, walker: w });
  assert.equal(w.phase, phase, 'and the stride waits');
}

console.log(`riderWalk: walking ${WALK_SPEED} m/s about two steps a second with a moment on both feet, running ${RUN_SPEED} m/s with both feet off, no standing foot ever slides, steps land on a slope and the legs reach them, he turns on the spot by stepping and settles standing when stopped`);
