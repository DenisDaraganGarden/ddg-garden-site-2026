import assert from 'node:assert/strict';
import { boardDimensions, buildBoardHull, deckHeight, halfWidth } from './boardShape.js';
import { createBoardBody, createBoardState, stepBoard } from './boardPhysics.js';
import { createRider, resetRider, stepRider } from './riderController.js';
import { bodyPoint, jointGap } from './ragdoll.js';
import { SEGMENT } from './riderSkeleton.js';

// The rider on his board, as the scene runs him: the board steps, then he does,
// and what he says goes into the board's next step. Each case is something
// Denis will see: lying still, paddling, getting up on a wave and riding it
// with his feet planted, being knocked off by whitewater, falling when the
// board turns over, floating, the leash, and climbing back on.

const dims = boardDimensions({});
const hull = buildBoardHull(dims);
const ridden = createBoardBody(hull, { boardMass: 3.2, riderMass: 75 });
const empty = createBoardBody(hull, { boardMass: 3.2, riderMass: 0 });
const board = { length: dims.length, deckY: (x, z) => deckHeight(dims, x, z), halfWidth: (z) => halfWidth(dims, z / dims.length + 0.5) };
const calm = (x, z, t, out) => { out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = -Infinity; return out; };
const intentOf = () => ({ lean: 0, trim: 0, crouch: 0, grab: 0, lookBack: 0, strokeLeft: 0, strokeRight: 0, popUp: 0 });

function session({ x = 0, y = -0.07, yaw = 0, speed = 0 } = {}) {
  const state = createBoardState({ x, y, z: 0, yaw });
  state.v[0] = speed * Math.sin(yaw); state.v[2] = speed * Math.cos(yaw);
  const rider = createRider(board);
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

// 5. The board turned over under him: he falls, floats up, the leash comes
// taut, and he climbs back on.
let recovered, floated;
{
  const s = session();
  s.run(1, calm);
  s.state.q[0] = 0; s.state.q[1] = 0; s.state.q[2] = Math.sin(0.85); s.state.q[3] = Math.cos(0.85);
  let fell = null, backAt = null, highestChest = -Infinity;
  s.run(9, calm, calm, (t) => {
    if (s.rider.state === 'fallen' && fell === null) fell = t;
    if (fell !== null && s.rider.state === 'fallen') highestChest = Math.max(highestChest, s.rider.out.chest[1]);
    if (fell !== null && backAt === null && s.rider.state === 'prone') backAt = t - fell;
    if (s.rider.out.events.flipBoard) { s.state.q[0] = 0; s.state.q[2] = 0; s.state.q[1] = 0; s.state.q[3] = 1; }
  });
  recovered = backAt; floated = highestChest;
  assert.ok(fell !== null, 'a capsized board throws him off');
  assert.ok(s.finite(), 'the fall is finite');
  assert.ok(highestChest > -0.35, `he floats up to the surface (${highestChest.toFixed(2)} m)`);
  assert.ok(backAt !== null && backAt < 8, `and is back on his board (${backAt?.toFixed(1)} s)`);
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

// 7. The leash: fallen, carried off by a current the board does not feel, he
// pulls it after him by the ankle.
let tow;
{
  const s = session();
  s.run(0.5, calm);
  s.state.q[0] = 0; s.state.q[1] = 0; s.state.q[2] = Math.sin(0.85); s.state.q[3] = Math.cos(0.85);
  const current = (x, z, t, out) => { calm(x, z, t, out); out.vx = 2.5; return out; };
  let pull = 0;
  s.run(2.6, calm, current, () => { if (s.rider.out.leash) pull = Math.max(pull, Math.hypot(s.rider.out.leash.fx, s.rider.out.leash.fy, s.rider.out.leash.fz)); });
  tow = { pull, boardVx: s.state.v[0] };
  assert.equal(s.rider.state, 'fallen');
  assert.ok(pull > 30, `the leash comes taut (${pull.toFixed(0)} N)`);
  assert.ok(s.state.v[0] > 0.8, `and tows the board after him (${s.state.v[0].toFixed(2)} m/s)`);
}

console.log(`riderController: lying still and whole, paddling ${paddled.toFixed(2)} m/s, up on the wave in ${rode.stoodAt.toFixed(2)} s and ridden ${rode.travelled.toFixed(1)} m with the soles within ${(rode.worstSole * 1000).toFixed(1)} mm of the deck, knocked off by foam in ${(knocked - 1.2).toFixed(2)} s, a capsize floats him to ${floated.toFixed(2)} m, back on the board in ${recovered.toFixed(1)} s, a stopped board lays him down, a current tows the board by the leash at ${tow.boardVx.toFixed(2)} m/s (${tow.pull.toFixed(0)} N)`);
