import assert from 'node:assert/strict';
import { boardDiagnostics, boardPose, createBoardBody, createBoardState, resetBoard, stepBoard } from './boardPhysics.js';

// A hull that follows the contract without importing the real one: an
// elliptic 1.78 × 0.5 × 0.062 planform with nose and tail rocker, cut into a
// tail cell, seven rows of three and a nose cell, each point standing at the
// centroid of the planform it carries. Integrating on a fine grid keeps Σ area
// and Σ volume exact, which is the part of the contract the physics leans on.
function contractHull({ length = 1.78, width = 0.5, thickness = 0.062, noseRocker = 0.115, tailRocker = 0.045 } = {}) {
  const halfWidth = (u) => width / 2 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
  const bottomY = (x, z) => {
    const s = 2 * (z / length);
    return s > 0 ? noseRocker * s ** 3 : tailRocker * (-s) ** 2.5;
  };
  const thick = (x, z) => {
    const u = z / length + 0.5;
    const hw = halfWidth(u);
    if (hw <= 0) return 0;
    const along = Math.max(0, 1 - (2 * u - 1) ** 2) ** 0.35;
    const across = Math.sqrt(Math.max(0, 1 - (x / hw) ** 2));
    return thickness * along * (0.35 + 0.65 * across);
  };
  const deckY = (x, z) => bottomY(x, z) + thick(x, z);
  const cells = new Map();
  const nu = 700, nx = 60;
  let planformArea = 0, volume = 0;
  for (let a = 0; a < nu; a += 1) {
    const u = (a + 0.5) / nu;
    const z = (u - 0.5) * length;
    const hw = halfWidth(u);
    for (let b = 0; b < nx; b += 1) {
      const f = (b + 0.5) / nx * 2 - 1;
      const x = f * hw;
      const dA = (length / nu) * (2 * hw / nx);
      const dV = dA * thick(x, z);
      planformArea += dA; volume += dV;
      let key, kind;
      if (u < 0.05) { key = 'tail'; kind = 'tail'; } else if (u > 0.95) { key = 'nose'; kind = 'nose'; } else {
        const row = Math.min(6, Math.floor((u - 0.05) / 0.9 * 7));
        const zone = f < -1 / 3 ? 0 : f > 1 / 3 ? 2 : 1;
        key = `${row}:${zone}`; kind = zone === 1 ? 'bottom' : 'rail';
      }
      const cell = cells.get(key) ?? { kind, area: 0, volume: 0, x: 0, z: 0 };
      cell.area += dA; cell.volume += dV; cell.x += x * dA; cell.z += z * dA;
      cells.set(key, cell);
    }
  }
  const points = [...cells.values()].map((cell) => {
    const x = cell.x / cell.area, z = cell.z / cell.area;
    return { x, y: bottomY(x, z), z, area: cell.area, volume: cell.volume, height: cell.volume / cell.area, kind: cell.kind };
  });
  const fin = (x, z, area, depth, toe, cant) => ({ x, y: bottomY(x, z) - 0.4 * depth, z, area, depth, toe, cant });
  return {
    length, width, thickness, volume, planformArea, points, deckY, bottomY,
    fins: [fin(0.13, -0.6, 0.0095, 0.115, -0.05, 0.1), fin(-0.13, -0.6, 0.0095, 0.115, 0.05, -0.1), fin(0, -0.78, 0.0085, 0.105, 0, 0)],
  };
}

const hull = contractHull();
assert.equal(hull.points.length, 23);
assert.ok(Math.abs(hull.points.reduce((s, p) => s + p.area, 0) - hull.planformArea) < 1e-9);

// --- instruments --------------------------------------------------------------
const rotate = (q, x, y, z) => {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
};
const worldOf = (state, x, y, z) => {
  const r = rotate(state.q, x, y, z);
  return [state.p[0] + r[0], state.p[1] + r[1], state.p[2] + r[2]];
};
const deg = (rad) => rad * 180 / Math.PI;
const attitude = (state) => {
  const nose = rotate(state.q, 0, 0, 1), side = rotate(state.q, 1, 0, 0), up = rotate(state.q, 0, 1, 0);
  return { pitch: deg(Math.asin(nose[1])), roll: deg(Math.asin(side[1])), yaw: deg(Math.atan2(nose[0], nose[2])), up: up[1], nose };
};
const sideslip = (state) => {
  const { nose } = attitude(state);
  const v = Math.hypot(state.v[0], state.v[2]);
  if (v < 1e-3) return 0;
  const cross = nose[0] * state.v[2] - nose[2] * state.v[0];
  const dot = nose[0] * state.v[0] + nose[2] * state.v[2];
  return deg(Math.atan2(Math.abs(cross), dot) );
};
const finiteState = (s) => [...s.p, ...s.v, ...s.q, ...s.w].every(Number.isFinite);

const calm = (x, z, t, out) => {
  out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = -Infinity;
  return out;
};
const NONE = { forward: 0, back: 0, left: 0, right: 0, pop: false, pump: false };
const hold = (keys) => ({ ...NONE, ...keys });

const run = (state, body, input, water, t0, seconds, dt = 1 / 60, each = null) => {
  let t = t0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    t += dt;
    stepBoard(state, body, typeof input === 'function' ? input(t) : input, water, t, dt);
    each?.(state, t);
  }
  return t;
};

const results = [];
const note = (line) => results.push(line);

const empty = createBoardBody(hull, { boardMass: 3.2, riderMass: 0 });
const ridden = createBoardBody(hull, { boardMass: 3.2, riderMass: 75 });

// 1. An empty board floats on its bottom, a few mm deep, level.
{
  const s = createBoardState({ x: 0, y: 0.03, z: 0, yaw: 0.3 });
  run(s, empty, NONE, calm, 0, 3);
  const draft = Math.max(...hull.points.map((p) => -worldOf(s, p.x, p.y, p.z)[1]));
  const a = attitude(s);
  note(`empty draft ${(draft * 1000).toFixed(1)} mm pitch ${a.pitch.toFixed(2)}° roll ${a.roll.toFixed(2)}°`);
  assert.ok(draft > 0.002 && draft < 0.012, `empty draft ${draft}`);
  assert.ok(Math.abs(a.pitch) < 1 && Math.abs(a.roll) < 1, `empty board level: ${a.pitch} ${a.roll}`);
  assert.ok(Math.hypot(...s.v) < 0.01 && Math.hypot(...s.w) < 0.02, 'settled within 3 s');
}

// 2. With a 75 kg rider lying on it at rest the board sinks until his body
// floats him: the deck a few cm under, not the sitting rider's 0.3 m.
const settled = createBoardState({ x: 0, y: 0, z: 0, yaw: 0 });
{
  run(settled, ridden, NONE, calm, 0, 10);
  const deck = -worldOf(settled, 0, hull.deckY(0, 0), 0)[1];
  const a = attitude(settled);
  note(`prone rider deck ${deck.toFixed(3)} m under`);
  assert.ok(deck > 0.03 && deck < 0.1, `deck depth ${deck}`);
  assert.ok(Math.abs(a.pitch) < 3 && Math.abs(a.roll) < 3, 'rider upright at rest');
}

// 3. Paddling from rest.
{
  const s = structuredClone(settled);
  let worst = 0;
  run(s, ridden, hold({ forward: 1 }), calm, 0, 10, 1 / 60, (st) => { worst = Math.max(worst, Math.abs(attitude(st).yaw), Math.abs(attitude(st).roll)); });
  note(`paddle ${s.speed.toFixed(2)} m/s`);
  assert.ok(s.speed >= 1.5 && s.speed <= 2.6, `paddle speed ${s.speed}`);
  assert.ok(worst < 5, 'paddles straight and upright');
}

// 4. Planing: launched at 5 m/s, the rider trimmed, the deck stays dry while
// the speed is up, and the speed falls away without the trim running away.
{
  const s = createBoardState({ x: 0, y: 0, z: 0, yaw: 0, speed: 5 });
  let lowestDeck = Infinity, maxPitch = 0, rise = 0, previous = 5, planingAt = 0, slowAt = null;
  const stanceZ = ridden.stance[2] + ridden.com[2];
  run(s, ridden, NONE, calm, 0, 6, 1 / 60, (st, t) => {
    const a = attitude(st);
    const speed = Math.hypot(st.v[0], st.v[2]);
    maxPitch = Math.max(maxPitch, Math.abs(a.pitch));
    // After the landing: dropped at the waterline, the tail rocker's slam
    // honestly pushes it on for the first tenth of a second.
    if (t > 0.3) rise = Math.max(rise, speed - previous);
    previous = speed;
    if (speed > 3.5) {
      lowestDeck = Math.min(lowestDeck, worldOf(st, 0, hull.deckY(0, stanceZ), stanceZ)[1]);
      planingAt = Math.max(planingAt, st.planing);
    } else if (slowAt === null) slowAt = t;
  });
  note(`planing deck ≥ ${(lowestDeck * 100).toFixed(1)} cm dry until ${slowAt?.toFixed(2)} s, trim ≤ ${maxPitch.toFixed(1)}°`);
  assert.ok(lowestDeck >= 0, `the deck went under while planing: ${lowestDeck}`);
  assert.ok(slowAt !== null && slowAt > 0.5, 'it planes for a while before it slows');
  assert.ok(rise < 0.005 && maxPitch < 20 && finiteState(s), `the speed decays smoothly: rose ${rise}, pitch ${maxPitch}`);
}

// 5. Tracking: the fins turn a skid back into a line, and it is the fins:
// without them the rails alone take twice as long.
{
  const recovery = (body) => {
    const s = createBoardState({ x: 0, y: 0, z: 0, yaw: 0 });
    const slip = 20 * Math.PI / 180;
    s.v[0] = 4 * Math.sin(slip); s.v[2] = 4 * Math.cos(slip);
    let recovered = null;
    run(s, body, NONE, calm, 0, 1.5, 1 / 60, (st, t) => { if (recovered === null && sideslip(st) < 5) recovered = t; });
    return recovered ?? Infinity;
  };
  const finned = recovery(ridden);
  const finless = recovery(createBoardBody({ ...hull, fins: [] }, { boardMass: 3.2, riderMass: 75 }));
  note(`sideslip 20°→5° in ${finned.toFixed(2)} s (${finless.toFixed(2)} s without fins)`);
  assert.ok(finned <= 1.5, 'fins recover the sideslip');
  assert.ok(finned < 0.7 * finless, `the fins do the tracking: ${finned} vs ${finless} without`);
}

// 6. Carving right and left.
for (const [side, sign] of [['right', -1], ['left', 1]]) {
  const s = createBoardState({ x: 0, y: 0, z: 0, yaw: 0, speed: 5 });
  let worstSlip = 0, lowestUp = 1;
  run(s, ridden, hold({ [side]: 1 }), calm, 0, 1.5, 1 / 60, (st) => {
    worstSlip = Math.max(worstSlip, sideslip(st));
    lowestUp = Math.min(lowestUp, attitude(st).up);
  });
  const turned = attitude(s).yaw * sign;
  note(`carve ${side} ${turned.toFixed(1)}° slip ≤ ${worstSlip.toFixed(1)}°`);
  assert.ok(turned >= 25, `carve ${side} turned ${turned}`);
  assert.ok(worstSlip < 12 && lowestUp > 0.5, `carve ${side} holds`);
}

// 7. Catching a wave: a solitary wave over 2 m, the board on its front face.
{
  const g = 9.81, d = 2, H = 1.2, lambda = 4, c = Math.sqrt(g * (d + H));
  const wave = (x, z, t, out) => {
    const xi = (x - c * t) / lambda;
    const sech = 1 / Math.cosh(xi);
    const eta = H * sech * sech;
    const etaX = -2 * eta * Math.tanh(xi) / lambda;
    const u = c * eta / (d + eta);
    out.height = eta; out.vx = u; out.vy = (u - c) * etaX; out.vz = 0; out.whitewater = 0; out.ground = -d;
    return out;
  };
  const etaAt = (x, t) => H / Math.cosh((x - c * t) / lambda) ** 2;
  const front = lambda * Math.acosh(1 / Math.sqrt(0.6));
  const ride = (x0, input) => {
    const s = createBoardState({ x: x0, y: etaAt(x0, 0), z: 0, yaw: Math.PI / 2, speed: 4 });
    run(s, ridden, input, wave, 0, 4);
    return { travelled: s.p[0] - x0, behindCrest: c * 4 - s.p[0], eta: etaAt(s.p[0], 4), up: attitude(s).up, s };
  };
  const caught = ride(front, hold({ forward: 1 }));
  const missed = ride(-6, NONE);
  note(`wave caught ${caught.travelled.toFixed(1)} m (need ${(0.8 * c * 4).toFixed(1)}) at η ${(caught.eta / H).toFixed(2)}H, from behind ${missed.travelled.toFixed(1)} m and left ${missed.behindCrest.toFixed(1)} m behind the crest`);
  assert.ok(caught.travelled >= 0.8 * c * 4, `caught board travelled ${caught.travelled}`);
  assert.ok(caught.eta >= 0.15 * H && caught.up > 0.5, 'still riding the wave after 4 s');
  assert.ok(missed.behindCrest > 0 && missed.eta < 0.15 * H, 'a board behind the crest is left behind');
}

// 8. Stress: an empty 1.5 kg board tumbled under an 8 m/s whitewater bore over
// a chop. Every drag on it at once is far stiffer than the substep; only the
// implicit solve keeps this finite.
{
  const light = createBoardBody(hull, { boardMass: 1.5, riderMass: 0 });
  const bore = (x, z, t, out) => {
    const a1 = 0.15, k1 = 1.3, w1 = 3.6, a2 = 0.1, k2 = 1.1, w2 = 2.1;
    const p1 = k1 * x - w1 * t, p2 = k2 * z + 0.4 * x + w2 * t;
    out.height = a1 * Math.sin(p1) + a2 * Math.sin(p2);
    const hx = a1 * k1 * Math.cos(p1) + a2 * 0.4 * Math.cos(p2);
    const ht = -a1 * w1 * Math.cos(p1) + a2 * w2 * Math.cos(p2);
    out.vx = 8; out.vz = 0; out.vy = ht + 8 * hx; out.whitewater = 1; out.ground = -Infinity;
    return out;
  };
  const s = createBoardState({ x: 0, y: -0.4, z: 0, yaw: 1 });
  let fastest = 0, finite = true;
  run(s, light, NONE, bore, 0, 10, 1 / 60, (st) => { fastest = Math.max(fastest, st.speed); finite &&= finiteState(st); });
  note(`bore ≤ ${fastest.toFixed(2)} m/s`);
  assert.ok(finite, 'no NaN in the bore');
  assert.ok(fastest < 12, `speed bounded: ${fastest}`);
}

// 9. Beaching on a 1:10 sand slope.
{
  const beach = (x, z, t, out) => {
    out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = (x - 20) / 10;
    return out;
  };
  const s = createBoardState({ x: 8, y: 0, z: 0, yaw: Math.PI / 2, speed: 3 });
  let deepest = Infinity;
  run(s, ridden, hold({ forward: 1 }), beach, 0, 12, 1 / 60, (st) => {
    for (const p of hull.points) {
      const w = worldOf(st, p.x, p.y, p.z);
      deepest = Math.min(deepest, w[1] - (w[0] - 20) / 10);
    }
  });
  note(`beached ${(20 - s.p[0]).toFixed(2)} m short of the shore, clearance ≥ ${(deepest * 1000).toFixed(1)} mm`);
  assert.ok(s.speed < 0.05, `beached board at rest: ${s.speed}`);
  assert.ok(deepest > -0.002, `a hull point went into the sand: ${deepest}`);
  // Slammed down onto dry sand at 6 m/s the spring alone would give way by
  // v/ω = 10 cm; nothing may end up inside the sand.
  const dry = (x, z, t, out) => { out.height = -5; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = 0.3; return out; };
  const drop = createBoardState({ y: 0.35, yaw: 0.4 });
  drop.v[1] = -6;
  let lowest = Infinity;
  run(drop, ridden, NONE, dry, 0, 1, 1 / 60, (st) => {
    for (const p of hull.points) lowest = Math.min(lowest, worldOf(st, p.x, p.y, p.z)[1] - 0.3);
  });
  assert.ok(lowest > -0.002, `a slam pushed the hull ${lowest} m into the sand`);
}

// 10. Determinism, and the frame rate does not change the ride.
{
  const g = 9.81, c = Math.sqrt(g * 3.2);
  const wave = (x, z, t, out) => {
    const xi = (x - c * t) / 4;
    const eta = 1.2 / Math.cosh(xi) ** 2;
    const u = c * eta / (2 + eta);
    out.height = eta; out.vx = u; out.vy = (u - c) * (-2 * eta * Math.tanh(xi) / 4); out.vz = 0; out.whitewater = 0; out.ground = -2;
    return out;
  };
  // Inputs are read once per frame, so switch them between frames of both rates.
  const input = (t) => hold({ forward: 1, right: t > 1.01 && t < 2.01 ? 1 : 0 });
  const go = (dt) => {
    const s = createBoardState({ x: 3, y: 0.6, z: 0, yaw: Math.PI / 2, speed: 4 });
    run(s, ridden, input, wave, 0, 3, dt);
    return s;
  };
  const a = go(1 / 60), b = go(1 / 60), half = go(1 / 30);
  assert.deepEqual([...a.p, ...a.v, ...a.q, ...a.w], [...b.p, ...b.v, ...b.q, ...b.w], 'same inputs, same bits');
  const drift = Math.hypot(a.p[0] - half.p[0], a.p[1] - half.p[1], a.p[2] - half.p[2]);
  note(`1/60 vs 1/30 ${drift.toExponential(1)} m`);
  assert.ok(drift < 1e-3, `frame rate changes the ride by ${drift}`);
}

// Balance is the rider's: without it he rolls off and the runtime is told.
{
  const clumsy = createBoardBody(hull, { boardMass: 3.2, riderMass: 75, tuning: { balance: 0 } });
  const s = createBoardState({});
  run(s, clumsy, NONE, calm, 0, 10);
  assert.ok(s.wipeout && attitude(s).up < 0.2, 'a rider who does not balance capsizes into a wipeout');
  const steady = structuredClone(settled);
  run(steady, ridden, NONE, calm, 0, 10);
  assert.equal(steady.wipeout, false, 'a balancing rider lying still is no wipeout');
  const flipped = createBoardState({ y: 0.07 });
  flipped.q[2] = 1; flipped.q[3] = 0;
  run(flipped, empty, NONE, calm, 0, 0.5);
  assert.equal(flipped.wipeout, false, 'upside down is only a wipeout after 0.6 s');
  run(flipped, empty, NONE, calm, 0.5, 0.25);
  assert.ok(flipped.wipeout && flipped.p[1] > 0.03, 'an upside-down board floats on its deck and is flagged');
}

// Pop: one kick while on the water, none again inside the cooldown.
{
  const s = createBoardState({ speed: 5 });
  const t = run(s, ridden, NONE, calm, 0, 0.5);
  const before = s.v[1];
  stepBoard(s, ridden, hold({ pop: true }), calm, t + 1 / 60, 1 / 60);
  const kicked = s.v[1];
  stepBoard(s, ridden, hold({ pop: true }), calm, t + 2 / 60, 1 / 60);
  assert.ok(kicked - before > 1.2 && s.v[1] < kicked && s.popCooldown > 0.5, `pop ${before} → ${kicked} → ${s.v[1]}`);
}

// The runtime's read side and editor mooring.
{
  const s = createBoardState({ x: 5, y: 0, z: 5, yaw: 0 });
  run(s, ridden, NONE, calm, 0, 0.5);
  resetBoard(s, { x: 1, y: 0, z: -2, yaw: -1, speed: 0 });
  const moored = { moor: { x: 1, z: -2, yaw: -1, stiffness: 4 } };
  for (let i = 0; i < 300; i += 1) stepBoard(s, ridden, hold({ forward: 1 }), calm, i / 60, 1 / 60, moored);
  assert.ok(Math.hypot(s.p[0] - 1, s.p[2] + 2) < 0.3 && Math.abs(attitude(s).yaw + deg(1)) < 5, 'the mooring holds the board to its checkpoint');
  const position = {}, quaternion = {};
  boardPose(s, position, quaternion);
  assert.equal(position.x, s.p[0]); assert.equal(quaternion.w, s.q[3]);
  const diag = boardDiagnostics(s);
  assert.ok(['speed', 'planing', 'wetArea', 'onFace', 'airborne'].every((key) => key in diag));
  const before = [...s.p];
  stepBoard(s, ridden, NONE, calm, 10, 0);
  assert.deepEqual(s.p, before, 'dt = 0 does nothing');
}

console.log(`boardPhysics: all checks passed — ${results.join('; ')}`);
