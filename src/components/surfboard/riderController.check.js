import assert from 'node:assert/strict';
import { boardDimensions, buildBoardHull, deckHeight, halfWidth } from './boardShape.js';
import { createBoardBody, createBoardState, stepBoard } from './boardPhysics.js';
import { boardFollows, createRider, resetRider, stepRider } from './riderController.js';
import { bodyPoint, jointGap } from './ragdoll.js';
import { SEGMENT } from './riderSkeleton.js';

// The rider on his board, as the scene runs him: the board steps, then he does,
// and what he says goes into the board's next step. Each case is something
// Denis will see: lying still, paddling, getting up on a wave and riding it
// with his feet planted, being knocked off by whitewater, falling when the
// board turns over, floating, the leash, swimming and climbing back on.

const dims = boardDimensions({});
const hull = buildBoardHull(dims);
const ridden = createBoardBody(hull, { boardMass: 3.2, riderMass: 75 });
const empty = createBoardBody(hull, { boardMass: 3.2, riderMass: 0 });
const board = { length: dims.length, deckY: (x, z) => deckHeight(dims, x, z), halfWidth: (z) => halfWidth(dims, z / dims.length + 0.5) };
const calm = (x, z, t, out) => { out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = -Infinity; return out; };
const intentOf = () => ({ lean: 0, trim: 0, crouch: 0, grab: 0, lookBack: 0, strokeLeft: 0, strokeRight: 0, popUp: 0 });

function session({ x = 0, y = -0.07, yaw = 0, speed = 0, leash = true } = {}) {
  const state = createBoardState({ x, y, z: 0, yaw });
  state.v[0] = speed * Math.sin(yaw); state.v[2] = speed * Math.cos(yaw);
  const rider = createRider(board, { leash });
  const intent = intentOf();
  const view = () => ({ p: state.p, q: state.q, v: state.v, w: state.w, speed: Math.hypot(state.v[0], state.v[2]), wipeout: state.wipeout });
  resetRider(rider, view());
  let t = 0;
  const step = (boardWater, riderWater = boardWater) => {
    t += 1 / 60;
    const on = rider.out.onBoard;
    stepBoard(state, on ? ridden : empty, on ? rider.out.input : null, boardWater, t, 1 / 60, { substep: 1 / 120, external: rider.out.leash });
    stepRider(rider, { dt: 1 / 60, board: view(), intent, water: (px, pz, out) => riderWater(px, pz, t, out), ground: null });
  };
  const run = (seconds, water, riderWater, each) => { for (let k = 0; k < Math.round(seconds * 60); k += 1) { each?.(t); step(water, riderWater); } };
  const finite = () => rider.world.bodies.every((b) => Number.isFinite(b.x[0] + b.x[1] + b.x[2] + b.q[0] + b.q[3]));
  return { state, rider, intent, run, finite, time: () => t };
}
const up = (q) => 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
// How far a sole is off the deck under it (m), in the board's frame.
const soleGap = (s, foot) => {
  const body = s.rider.world.bodies[SEGMENT[foot]];
  const p = bodyPoint(body, [0, -body.half[1], 0], [0, 0, 0]);
  const d = [p[0] - s.state.p[0], p[1] - s.state.p[1], p[2] - s.state.p[2]];
  const q = s.state.q;
  // world → board: rotate by the inverse of q
  const x = d[0], y = d[1], z = d[2], qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  const lx = x + qw * tx + qy * tz - qz * ty, ly = y + qw * ty + qz * tx - qx * tz, lz = z + qw * tz + qx * ty - qy * tx;
  return ly - board.deckY(lx, lz);
};

// 1. Lying on calm water he is still, whole and on his board.
{
  const s = session();
  s.run(3, calm);
  assert.ok(s.finite(), 'lying still is finite');
  assert.equal(s.rider.state, 'prone');
  assert.ok(jointGap(s.rider.world) < 5e-3, `his joints hold (${(jointGap(s.rider.world) * 1000).toFixed(1)} mm)`);
  const chest = s.rider.out.chest;
  assert.ok(Math.abs(chest[1] - (s.state.p[1] + 0.3)) < 0.2 && Math.abs(chest[0] - s.state.p[0]) < 0.1, `his chest is on the board (${chest.map((v) => v.toFixed(2))})`);
}

// 2. Paddling: forward held, the arms stroke in turn and the board gets going.
let paddled;
{
  const s = session();
  s.intent.trim = 1;
  let strokes = 0, last = -1;
  s.run(6, calm, calm, () => { if (s.rider.strokeL >= 0 && last < 0) strokes += 1; last = s.rider.strokeL; });
  paddled = Math.hypot(s.state.v[0], s.state.v[2]);
  assert.ok(paddled > 1.1, `he paddles the board up to speed (${paddled.toFixed(2)} m/s)`);
  assert.ok(strokes >= 4, `with the left arm stroking in turn (${strokes} strokes in 6 s)`);
  assert.ok(jointGap(s.rider.world) < 6e-3, 'paddling does not pull him apart');
}

// 3. A wave: lying on its front face going with it, he pops up and rides it
// for three seconds with his feet planted and the board under him.
const g = 9.81, depth = 2, H = 1.2, lambda = 4, c = Math.sqrt(g * (depth + H));
const wave = (x, z, t, out) => {
  const xi = (x - c * t) / lambda;
  const sech = 1 / Math.cosh(xi);
  const eta = H * sech * sech;
  const etaX = -2 * eta * Math.tanh(xi) / lambda;
  const u = c * eta / (depth + eta);
  out.height = eta; out.vx = u; out.vy = (u - c) * etaX; out.vz = 0; out.whitewater = 0; out.ground = -depth;
  return out;
};
let rode;
{
  const front = lambda * Math.acosh(1 / Math.sqrt(0.6));
  const s = session({ x: front, y: H * 0.6 - 0.1, yaw: Math.PI / 2, speed: 4 });
  s.intent.trim = 1;
  let worstSole = 0, stoodAt = null, fellAt = null, worstOff = 0;
  s.run(4, wave, wave, (t) => {
    if (t > 0.25 && s.rider.state === 'prone' && s.intent.popUp === 0) s.intent.popUp = 1;
    if (s.rider.state === 'stand' && stoodAt === null) stoodAt = t;
    if (s.rider.state === 'fallen' && fellAt === null) fellAt = t;
    if (s.rider.state === 'stand') worstSole = Math.max(worstSole, Math.abs(soleGap(s, 'footL')), Math.abs(soleGap(s, 'footR')));
    if (s.rider.state === 'stand') worstOff = Math.max(worstOff, s.rider.out.chestOff);
  });
  rode = { stoodAt, fellAt, travelled: s.state.p[0] - front, worstSole, sink: s.rider.sink, worstOff };
  assert.ok(stoodAt !== null && stoodAt < 1.2, `he gets up on the wave (${stoodAt?.toFixed(2)} s)`);
  assert.equal(fellAt, null, 'and rides it without falling');
  assert.equal(s.rider.state, 'stand');
  assert.ok(worstSole < 0.02, `his feet never leave the deck (${(worstSole * 1000).toFixed(1)} mm)`);
  assert.ok(worstOff < 0.14, `riding, his chest stays near its pose (${worstOff.toFixed(3)} m off)`);
  assert.ok(rode.travelled > 0.7 * c * 4, `the wave carries them (${rode.travelled.toFixed(1)} m)`);
  assert.ok(up(s.state.q) > 0.7, 'the board stays under him');
}

// 4. Whitewater: standing on a running board, a wall of foam at chest height
// shoves his upper body off his hips — and he goes.
let knocked;
{
  const s = session({ speed: 5 });
  s.rider.state = 'prone';
  s.intent.popUp = 1;
  s.run(1.2, calm);
  assert.equal(s.rider.state, 'stand', 'up on a running board');
  const foam = (x, z, t, out) => { out.height = 1.6; out.vx = 8; out.vy = 0; out.vz = 9; out.whitewater = 1; out.ground = -Infinity; return out; };
  let fell = null;
  s.run(1.5, calm, foam, (t) => { if (s.rider.state === 'fallen' && fell === null) fell = t; });
  knocked = fell;
  assert.ok(fell !== null, 'a wall of foam knocks him off');
}

// 5. The board turned over under him: he falls, floats up, swims to the rail
// and climbs back on.
let recovered, floated;
{
  const s = session();
  s.run(1, calm);
  s.state.q[0] = 0; s.state.q[1] = 0; s.state.q[2] = Math.sin(0.85); s.state.q[3] = Math.cos(0.85);
  let fell = null, backAt = null, highestChest = -Infinity;
  const seen = new Set();
  s.run(9, calm, calm, (t) => {
    if (s.rider.state === 'fallen' && fell === null) fell = t;
    if (fell !== null && backAt === null) seen.add(s.rider.state);
    if (fell !== null && (s.rider.state === 'fallen' || s.rider.state === 'swim')) highestChest = Math.max(highestChest, s.rider.out.chest[1]);
    if (fell !== null && backAt === null && s.rider.state === 'prone') backAt = t - fell;
    if (s.rider.out.events.flipBoard) { s.state.q[0] = 0; s.state.q[2] = 0; s.state.q[1] = 0; s.state.q[3] = 1; }
  });
  recovered = backAt; floated = highestChest;
  assert.ok(fell !== null, 'a capsized board throws him off');
  assert.ok(s.finite(), 'the fall is finite');
  assert.ok(highestChest > -0.35, `he floats up to the surface (${highestChest.toFixed(2)} m)`);
  assert.ok(backAt !== null && backAt < 8, `and is back on his board (${backAt?.toFixed(1)} s)`);
  assert.ok(seen.has('swim') && seen.has('recover'), `swimming to it and climbing on (${[...seen].join(' → ')})`);
  assert.ok(jointGap(s.rider.world) < 5e-3, 'whole');
}

// 6. Standing on a board that has stopped, he lies back down.
{
  const s = session({ speed: 3 });
  s.intent.popUp = 1;
  let liedown = false;
  s.run(4, calm, calm, () => { if (s.rider.state === 'liedown') liedown = true; });
  assert.ok(liedown && s.rider.state === 'prone', `a stopped board sends him back down to lie on it (${s.rider.state})`);
}

// 7. The leash: in the water, carried off by a current the board does not
// feel, he pulls it after him by the ankle — swimming against the current
// once he is up does not stop that.
let tow;
{
  const s = session();
  s.run(0.5, calm);
  s.state.q[0] = 0; s.state.q[1] = 0; s.state.q[2] = Math.sin(0.85); s.state.q[3] = Math.cos(0.85);
  const current = (x, z, t, out) => { calm(x, z, t, out); out.vx = 2.5; return out; };
  let pull = 0;
  s.run(2.6, calm, current, () => { if (s.rider.out.leash) pull = Math.max(pull, Math.hypot(s.rider.out.leash.fx, s.rider.out.leash.fy, s.rider.out.leash.fz)); });
  tow = { pull, towed: s.state.p[0] };
  assert.equal(s.rider.out.onBoard, false, `still in the water (${s.rider.state})`);
  assert.ok(pull > 30, `the leash comes taut (${pull.toFixed(0)} N)`);
  assert.ok(tow.towed > 1.5, `and tows the board after him (${tow.towed.toFixed(1)} m)`);
}

// 8. Swimming: off the board with it 6 m away, he comes up and swims to it —
// face down, chin out of the water, at a swimmer's pace — and climbs on.
let swam;
{
  const s = session({ leash: false });
  s.run(0.5, calm);
  s.state.q[0] = 0; s.state.q[1] = 0; s.state.q[2] = Math.sin(0.85); s.state.q[3] = Math.cos(0.85);
  s.run(0.4, calm);
  assert.equal(s.rider.state, 'fallen');
  s.state.q[2] = 0; s.state.q[3] = 1; s.state.v[0] = 0; s.state.v[2] = 0;
  s.state.p[0] += 6;
  const chest = () => s.rider.world.bodies[SEGMENT.chest];
  let from = null, reached = null, heads = 0, headUp = 0, facing = 0;
  s.run(14, calm, calm, (t) => {
    if (s.rider.state === 'swim' && s.rider.stateTime > 1.5) {
      if (!from) from = { t, x: [...chest().x] };
      const head = s.rider.world.bodies[SEGMENT.head];
      heads += 1; headUp += head.x[1] > 0 ? 1 : 0;
      // how much the chest's front (its +z) points at the bottom
      const q = chest().q;
      facing += -2 * (q[1] * q[2] - q[0] * q[3]);
    }
    if (s.rider.state === 'recover' && reached === null) {
      reached = t;
      from.speed = Math.hypot(chest().x[0] - from.x[0], chest().x[2] - from.x[2]) / (t - from.t);
    }
  });
  swam = { speed: from?.speed, headUp: headUp / heads, facing: facing / heads };
  assert.ok(reached !== null, 'he swims to the board');
  assert.ok(swam.speed > 0.6 && swam.speed < 1.4, `at a swimmer's pace (${swam.speed?.toFixed(2)} m/s)`);
  assert.ok(swam.headUp > 0.9, `his head out of the water (${(swam.headUp * 100).toFixed(0)}% of the time)`);
  assert.ok(swam.facing > 0.8, `face down (${swam.facing.toFixed(2)})`);
  assert.equal(s.rider.state, 'prone', 'and climbs on');
  assert.ok(s.finite() && jointGap(s.rider.world) < 5e-3, 'whole');
}

// 9. The beach: paddling in over a bottom that rises to dry sand, he steps
// off where the water is shallow, walks out of it and up the sand on his own
// feet, runs faster than he walks, and turned back into the sea swims where
// it is deep.
let beach;
{
  const bottom = (x, z) => -2 + 0.08 * z;
  const sea = (x, z, t, out) => { out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = bottom(x, z); return out; };
  const s = session();
  s.intent.trim = 1;
  let steppedAt = null, depthThen = null;
  s.run(30, sea, sea, (t) => {
    if (steppedAt === null && s.rider.state === 'walk') { steppedAt = t; depthThen = -bottom(0, s.state.p[2]); }
  });
  assert.ok(steppedAt !== null, 'he steps off');
  assert.ok(depthThen < 0.75, `where it is shallow (${depthThen.toFixed(2)} m)`);
  assert.equal(s.rider.state, 'walk', 'and is still on his feet');
  const pelvis = s.rider.world.bodies[SEGMENT.pelvis];
  const up = pelvis.x[2];
  assert.ok(bottom(0, up) > 0.3, `out of the water and up the sand (${up.toFixed(1)} m, ${bottom(0, up).toFixed(2)} m up)`);
  const clearance = pelvis.x[1] - bottom(pelvis.x[0], pelvis.x[2]);
  assert.ok(clearance > 0.8 && clearance < 1.0, `on his feet, his pelvis ${clearance.toFixed(2)} m over the sand`);
  let worstSole = 0;
  const pace = (seconds, each) => {
    const from = [pelvis.x[0], pelvis.x[2]];
    s.run(seconds, sea, sea, each);
    return Math.hypot(pelvis.x[0] - from[0], pelvis.x[2] - from[1]) / seconds;
  };
  const walked = pace(3, () => {
    for (const side of ['L', 'R']) {
      const foot = s.rider.world.bodies[SEGMENT[`foot${side}`]];
      const sole = bodyPoint(foot, [0, -foot.half[1], 0], [0, 0, 0]);
      worstSole = Math.min(worstSole, sole[1] - bottom(sole[0], sole[2]));
    }
  });
  assert.ok(worstSole > -0.03, `his feet do not sink into the sand (${(worstSole * 100).toFixed(1)} cm at worst)`);
  s.intent.crouch = 1;
  s.run(1.5, sea, sea);
  const ran = pace(3);
  s.intent.crouch = 0;
  assert.ok(walked > 1.1 && walked < 1.5, `he walks (${walked.toFixed(2)} m/s)`);
  assert.ok(ran > 2.6, `and runs faster (${ran.toFixed(2)} m/s)`);
  // Turned round, back into the sea: he swims where it is deep.
  s.intent.trim = 0; s.intent.lean = 1;
  s.run(1.4, sea, sea);
  s.intent.lean = 0; s.intent.trim = 1;
  let swamAt = null;
  s.run(60, sea, sea, (t) => { if (swamAt === null && s.rider.state === 'swim') swamAt = t; });
  assert.ok(swamAt !== null, `back in the sea he swims (${s.rider.state})`);
  assert.ok(s.finite() && jointGap(s.rider.world) < 8e-3, 'whole throughout');
  beach = { depthThen, walked, ran };
}

// The same beach as the scene runs it (Surfboard.jsx, the lab's «Берег»): the
// board not stepped while he holds it, and what he does to it done after him.
const bottom = (x, z) => -2 + 0.08 * z;
const sea = (x, z, t, out) => { out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = bottom(x, z); return out; };
function shore({ z = 5, leash = true } = {}) {
  const state = createBoardState({ y: -0.07, z });
  const rider = createRider(board, { leash });
  const intent = { ...intentOf(), board: 0, leash: 0 };
  const view = () => ({ p: state.p, q: state.q, v: state.v, w: state.w, speed: Math.hypot(state.v[0], state.v[2]), wipeout: state.wipeout });
  resetRider(rider, view());
  let t = 0;
  const step = () => {
    t += 1 / 60;
    const on = rider.out.onBoard;
    if (!rider.out.carry) stepBoard(state, on ? ridden : empty, on ? rider.out.input : null, sea, t, 1 / 60, { substep: 1 / 120, external: rider.out.leash });
    stepRider(rider, { dt: 1 / 60, board: view(), intent, water: (x, z2, out) => sea(x, z2, t, out), ground: bottom });
    boardFollows(rider, state, 1 / 60);
  };
  const run = (seconds, each) => { for (let k = 0; k < Math.round(seconds * 60); k += 1) { step(); each?.(t); } };
  const until = (test, seconds) => { for (let k = 0; k < Math.round(seconds * 60) && !test(); k += 1) step(); return test(); };
  const body = (name) => rider.world.bodies[SEGMENT[name]];
  const whole = () => rider.world.bodies.every((b) => Number.isFinite(b.x[0] + b.x[1] + b.x[2] + b.q[3])) && jointGap(rider.world) < 8e-3;
  return { state, rider, intent, run, until, body, whole, time: () => t };
}
// Out of the water on his feet, facing up the beach, standing.
function ashore(s) {
  s.intent.trim = 1;
  s.until(() => s.rider.state === 'walk', 40);
  s.until(() => bottom(0, s.body('pelvis').x[2]) > 0.3, 30);
  s.intent.trim = 0;
  s.run(1.5);
}

// 10. Off the board he steps smoothly — no part of him jumps between frames —
// and in the shallows his trunk rocks only as a walker's does.
let stepOff;
{
  const s = shore();
  s.intent.trim = 1;
  s.until(() => s.rider.state === 'walk', 40);
  const last = s.rider.world.bodies.map((b) => [...b.x]);
  let jump = 0, roll = 0;
  s.run(3, () => {
    s.rider.world.bodies.forEach((b, i) => {
      jump = Math.max(jump, Math.hypot(b.x[0] - last[i][0], b.x[1] - last[i][1], b.x[2] - last[i][2]));
      last[i][0] = b.x[0]; last[i][1] = b.x[1]; last[i][2] = b.x[2];
    });
    const q = s.body('chest').q, yaw = s.rider.walker.yaw;
    const ux = 2 * (q[0] * q[1] - q[2] * q[3]), uz = 2 * (q[1] * q[2] + q[0] * q[3]);
    roll = Math.max(roll, Math.abs(Math.asin(ux * Math.cos(yaw) - uz * Math.sin(yaw))));
  });
  stepOff = { jump, roll: roll * 180 / Math.PI };
  assert.ok(jump < 0.09, `stepping off and wading, no part of him jumps (${(jump * 100).toFixed(1)} cm in a frame at most, a swinging foot's)`);
  assert.ok(stepOff.roll < 2.5, `his chest rocks as a walker's (${stepOff.roll.toFixed(1)}° at most)`);
  assert.ok(s.whole(), 'whole');
}

// 11. Jumps on the sand: standing and running, up and down on his feet.
let jumps;
{
  const s = shore();
  ashore(s);
  const leap = (running) => {
    s.intent.trim = running ? 1 : 0; s.intent.crouch = running ? 1 : 0;
    if (running) s.run(2);
    const from = [...s.body('pelvis').x];
    let top = -Infinity, air = 0;
    s.intent.popUp += 1;
    s.until(() => s.rider.state === 'jump', 0.2);
    const ok = s.until(() => {
      top = Math.max(top, s.body('pelvis').x[1] - bottom(s.body('pelvis').x[0], s.body('pelvis').x[2]));
      if (s.rider.leap.air) air += 1 / 60;
      return s.rider.state === 'walk';
    }, 3);
    const far = Math.hypot(s.body('pelvis').x[0] - from[0], s.body('pelvis').x[2] - from[2]);
    s.intent.trim = 0; s.intent.crouch = 0;
    s.run(1.5);
    return { ok, top, air, far };
  };
  const standing = leap(false), running = leap(true);
  jumps = { standing, running };
  assert.ok(standing.ok && running.ok, 'he comes down on his feet');
  assert.ok(standing.top > 1.2, `a standing jump lifts him (pelvis ${standing.top.toFixed(2)} m over the sand at the top)`);
  assert.ok(standing.air > 0.45 && standing.air < 0.8, `for a moment (${standing.air.toFixed(2)} s in the air)`);
  assert.ok(running.far > 1.8, `a running jump goes far (${running.far.toFixed(2)} m)`);
  assert.equal(s.rider.state, 'walk');
  assert.ok(s.whole(), 'whole');
}

// 12. Off the board into the sea (F, D held: over the right rail): the board
// kicked back the other way, he goes in, comes up and swims where he is
// steered — not back to the board by himself — and on F beside it climbs on.
let leapt;
{
  const s = shore({ z: -20 });
  s.run(1);
  const toLocalX = (p) => {
    const q = s.state.q, dx = p[0] - s.state.p[0], dz = p[2] - s.state.p[2];
    const yaw = Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
    return dx * Math.cos(yaw) - dz * Math.sin(yaw);
  };
  s.intent.lean = 1; s.intent.board += 1;
  s.until(() => s.rider.state === 'jump' && s.rider.leap.air, 1);
  s.intent.lean = 0;
  const kicked = toLocalX(s.state.v.map((v, k) => v + s.state.p[k]));
  let top = -Infinity;
  s.until(() => { top = Math.max(top, s.body('pelvis').x[1]); return s.rider.state !== 'jump'; }, 3);
  const inAt = [...s.body('pelvis').x];
  assert.equal(s.rider.state, 'swim', 'into the water');
  assert.ok(toLocalX(inAt) < -1.0, `off the right rail (${toLocalX(inAt).toFixed(2)} m across)`);
  assert.ok(kicked > 0.5, `the board kicked the other way (${kicked.toFixed(2)} m/s)`);
  assert.ok(top > 0.9, `high (${top.toFixed(2)} m over the water at the top)`);
  s.run(4);
  assert.equal(s.rider.state, 'swim', 'let go, he stays in the water and does not swim back by himself');
  // Steered to the board, and asked, he climbs on.
  const steer = () => {
    const pelvis = s.body('pelvis').x, want = Math.atan2(s.state.p[0] - pelvis[0], s.state.p[2] - pelvis[2]);
    const off = Math.atan2(Math.sin(want - s.rider.swimYaw), Math.cos(want - s.rider.swimYaw));
    s.intent.lean = Math.max(-1, Math.min(1, -off * 3)); s.intent.trim = Math.abs(off) < 0.5 ? 1 : 0;
  };
  s.until(() => { steer(); s.intent.board += 1; return s.rider.state === 'recover'; }, 20);
  s.intent.lean = 0; s.intent.trim = 0;
  assert.equal(s.rider.state, 'recover', 'steered to the board and asked, he climbs on');
  s.until(() => s.rider.state === 'prone', 5);
  assert.equal(s.rider.state, 'prone');
  assert.ok(s.whole(), 'whole');
  leapt = { top, across: toLocalX(inAt), kicked };
}

// 13. The leash off at the ankle: walking away he leaves the board behind;
// back on only near its plug.
{
  const s = shore();
  ashore(s);
  s.intent.leash += 1;
  s.run(0.1);
  assert.equal(s.rider.leashed, false, 'L takes the leash off');
  const from = [...s.state.p];
  s.intent.trim = 1;
  s.run(4);
  s.intent.trim = 0;
  const pelvis = s.body('pelvis').x;
  assert.ok(Math.hypot(pelvis[0] - s.state.p[0], pelvis[2] - s.state.p[2]) > 4 && Math.hypot(s.state.p[0] - from[0], s.state.p[2] - from[2]) < 0.3, 'walking off, he leaves the board where it was');
  s.intent.leash += 1;
  s.run(0.1);
  assert.equal(s.rider.leashed, false, 'far from its plug it stays off');
}

// 14. The board under his arm: off it in the shallows he picks it up (F), it
// stays at his side as he walks up the sand, he puts it down there (F), picks
// it up again, and walked back into the sea, puts it on the water and lies on it.
let carried;
{
  const s = shore();
  s.intent.trim = 1;
  s.until(() => s.rider.state === 'walk', 40);
  s.intent.trim = 0;
  s.run(1);
  const stopped = Math.hypot(s.state.v[0], s.state.v[2]);
  assert.ok(stopped < 0.2, `stepping off, he stops the board beside him (${stopped.toFixed(2)} m/s)`);
  s.intent.board += 1;
  s.until(() => s.rider.carry.phase === 'held', 1.5);
  assert.equal(s.rider.carry.phase, 'held', 'F beside the board in the shallows: he picks it up');
  let far = 0;
  s.intent.trim = 1;
  s.until(() => {
    const p = s.body('pelvis').x;
    far = Math.max(far, Math.hypot(s.state.p[0] - p[0], s.state.p[2] - p[2]));
    return bottom(p[0], p[2]) > 0.3;
  }, 25);
  s.intent.trim = 0;
  s.run(1);
  const p = s.body('pelvis').x;
  assert.ok(bottom(p[0], p[2]) > 0.1, `up the sand with it (${bottom(p[0], p[2]).toFixed(2)} m up)`);
  assert.ok(far < 0.45, `the board at his side all the way (${far.toFixed(2)} m from his hips at most)`);
  s.intent.board += 1;
  s.until(() => s.rider.carry.phase === 'none', 1.5);
  s.run(1);
  const lying = up(s.state.q), rest = s.state.p[1] - bottom(s.state.p[0], s.state.p[2]);
  assert.ok(lying > 0.95 && Math.abs(rest) < 0.1, `F again: it lies on the sand beside him (up ${lying.toFixed(2)}, ${rest.toFixed(2)} m over it)`);
  s.intent.board += 1;
  s.until(() => s.rider.carry.phase === 'held', 1.5);
  assert.equal(s.rider.carry.phase, 'held', 'and he picks it up again');
  // Back down the beach into the sea.
  s.intent.lean = 1;
  s.until(() => Math.cos(s.rider.walker.yaw) < -0.98, 4);
  s.intent.lean = 0; s.intent.trim = 1;
  s.until(() => s.rider.state === 'prone', 30);
  s.intent.trim = 0;
  assert.equal(s.rider.state, 'prone', `walked into the sea, he lies on it (${s.rider.state})`);
  const at = -bottom(s.state.p[0], s.state.p[2]);
  assert.ok(at > 0.8 && at < 1.3, `where it is deep enough to float him (${at.toFixed(2)} m)`);
  assert.ok(s.whole(), 'whole');
  carried = { far, at };
}

// 15. Turning lying down: A held, the right arm sweeps wide stroke after
// stroke and the board comes round half a turn in about two seconds, from
// rest or paddling (Denis: it handled badly — 27° in three seconds).
let turning;
{
  const yawOf = (q) => Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
  const halfTurn = (warm) => {
    const s = session();
    s.intent.trim = warm ? 1 : 0;
    s.run(warm ? 4 : 0.5, calm);
    s.intent.lean = -1;
    let turned = 0, last = yawOf(s.state.q), at = null, swept = 0, other = 0;
    s.run(3, calm, calm, (t) => {
      const y = yawOf(s.state.q);
      turned += Math.atan2(Math.sin(y - last), Math.cos(y - last));
      last = y;
      if (at === null && turned >= Math.PI) at = t;
      if (s.rider.strokeR >= 0) swept += 1;
      if (s.rider.strokeL >= 0) other += 1;
    });
    return { at: at === null ? Infinity : at - s.time() + 3, swept, other, sweep: s.rider.sweepR };
  };
  const still = halfTurn(false), paddling = halfTurn(true);
  turning = { still: still.at, paddling: paddling.at };
  assert.ok(still.at < 2.5, `from rest, half a turn in ${still.at.toFixed(2)} s`);
  assert.ok(paddling.at < 2.8, `paddling, half a turn in ${paddling.at.toFixed(2)} s`);
  assert.ok(still.swept > 120 && still.other === 0 && still.sweep > 0.9, `from rest the right arm sweeps alone, wide (${still.swept} frames stroking, the left ${still.other})`);
}

// 16. Life in the pose: coming down from a jump his hands dip and swing back
// (never far), standing they settle on the pose; no two jumps look the same,
// yet the same jumps come out the same.
let alive;
{
  const s = shore();
  ashore(s);
  const flightOf = () => {
    let apex = null, dip = 0, far = 0;
    s.intent.popUp += 1;
    s.until(() => s.rider.state === 'jump', 0.2);
    s.until(() => {
      const f = s.rider.follow, pelvis = s.body('pelvis').x;
      far = Math.max(far, Math.hypot(...f.handL), Math.hypot(...f.handR));
      if (s.rider.leap.air && s.rider.leap.v[1] < 0 && apex === null) {
        const hand = s.body('forearmL').x;
        apex = [hand[0] - pelvis[0], hand[1] - pelvis[1], hand[2] - pelvis[2]];
      }
      return s.rider.state === 'walk';
    }, 3);
    s.run(0.5, () => { dip = Math.min(dip, s.rider.follow.handL[1]); far = Math.max(far, Math.hypot(...s.rider.follow.handL)); });
    s.run(2.5);
    return { apex, dip, far, settled: Math.hypot(...s.rider.follow.handL) };
  };
  const first = flightOf(), second = flightOf();
  const apart = Math.hypot(first.apex[0] - second.apex[0], first.apex[1] - second.apex[1], first.apex[2] - second.apex[2]);
  assert.ok(first.dip < -0.03, `landing, his hands dip (${(first.dip * 100).toFixed(1)} cm)`);
  assert.ok(first.far <= 0.15 + 1e-9 && second.far <= 0.15 + 1e-9, `and never far (${(Math.max(first.far, second.far) * 100).toFixed(1)} cm)`);
  assert.ok(first.settled < 0.005, `standing, they settle on the pose (${(first.settled * 1000).toFixed(1)} mm)`);
  assert.ok(apart > 0.05, `two jumps, two flights (the left hand ${(apart * 100).toFixed(0)} cm apart at the top)`);
  const firstStyle = () => {
    const t = shore({ z: -20 });
    t.run(0.5);
    t.intent.board += 1;
    t.until(() => t.rider.state === 'jump', 0.2);
    return JSON.stringify(t.rider.leap.style);
  };
  assert.equal(firstStyle(), firstStyle(), 'the same first jump, the same style');
  assert.ok(s.whole(), 'whole');
  alive = { dip: first.dip, apart };
}

console.log(`riderController: lying still and whole, paddling ${paddled.toFixed(2)} m/s, up on the wave in ${rode.stoodAt.toFixed(2)} s and ridden ${rode.travelled.toFixed(1)} m with the soles within ${(rode.worstSole * 1000).toFixed(1)} mm of the deck, knocked off by foam in ${(knocked - 1.2).toFixed(2)} s, a capsize floats him to ${floated.toFixed(2)} m, back on the board in ${recovered.toFixed(1)} s, a stopped board lays him down, a current tows the board ${tow.towed.toFixed(1)} m by the leash (${tow.pull.toFixed(0)} N), he swims ${swam.speed.toFixed(2)} m/s with his head up; at a beach he steps off ${beach.depthThen.toFixed(2)} m deep, walks up the sand at ${beach.walked.toFixed(2)} m/s, runs at ${beach.ran.toFixed(2)} m/s and swims back out; stepping off nothing jumps (${(stepOff.jump * 100).toFixed(1)} cm a frame), his chest rocks ${stepOff.roll.toFixed(1)}°; he jumps ${jumps.standing.air.toFixed(2)} s standing and ${jumps.running.far.toFixed(1)} m running; off the board he leaps ${leapt.top.toFixed(2)} m up into the sea and swims where steered; the leash comes off; he carries the board up the sand at his side and walks it back out to ${carried.at.toFixed(2)} m to paddle; lying he turns half round in ${turning.still.toFixed(1)} s from rest, ${turning.paddling.toFixed(1)} s paddling; landing his hands dip ${(-alive.dip * 100).toFixed(0)} cm and two jumps differ by ${(alive.apart * 100).toFixed(0)} cm`);
