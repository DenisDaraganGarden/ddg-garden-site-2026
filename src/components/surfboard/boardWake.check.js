import assert from 'node:assert/strict';
import { createWakeEmitter, emitBoardWake } from './boardWake.js';
import { SEGMENT } from './riderSkeleton.js';
import { WAKE_FOAM, createWaterWake, takeWakeFoam } from '../effects/water/waterWake.js';

// What the board and the rider leave on the water, from the numbers they
// really have: a still board nothing, a running one a row of rings and a
// joined foam trail, a carving one more foam and wider, a landing a splash,
// each hand going in a ring, a fall a splash — and nothing at all when the
// sliders are at zero.

const calm = (x, z, out) => { out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; return out; };
const vec4 = () => ({ x: 0, y: 0, z: 0, w: 0, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } });
const segments = Array.from({ length: WAKE_FOAM }, vec4), shapes = Array.from({ length: WAKE_FOAM }, vec4);
const full = { waves: 1, foam: 1 };

function run({ seconds = 1, state, rider = null, scale = full, each }) {
  const wake = createWaterWake(), emitter = createWakeEmitter();
  const foam = [];
  const dt = 1 / 60;
  for (let k = 0; k < Math.round(seconds * 60); k += 1) {
    each?.(k * dt, state, rider);
    state.p[0] += state.v[0] * dt; state.p[1] += state.v[1] * dt; state.p[2] += state.v[2] * dt;
    emitBoardWake(emitter, wake, { dt, state, length: 1.8, water: calm, rider, scale });
    const n = takeWakeFoam(wake, segments, shapes);
    for (let i = 0; i < n; i += 1) foam.push({ ...segments[i], halfWidth: shapes[i].x, cover: shapes[i].y });
  }
  return { rings: wake.rings.filter((ring) => ring.strength > 0), foam };
}
const board = ({ v = [0, 0, 0], q = [0, 0, 0, 1], airborne = false } = {}) => ({ p: [0, -0.05, 0], v: [...v], q, contact: airborne ? 0 : 0.6, airborne });

// Still, it leaves nothing.
{
  const { rings, foam } = run({ state: board() });
  assert.equal(rings.length + foam.length, 0, 'a still board leaves nothing');
}

// Running straight at 5 m/s: a ring every quarter metre and a trail that joins up.
let straight;
{
  const { rings, foam } = run({ state: board({ v: [0, 0, 5] }) });
  assert.ok(rings.length >= 19 && rings.length <= 21, `a ring every quarter metre (${rings.length} in 5 m)`);
  assert.ok(foam.length > 50, 'foam off the tail every frame');
  for (let i = 1; i < foam.length; i += 1) {
    assert.ok(Math.hypot(foam[i].x - foam[i - 1].z, foam[i].y - foam[i - 1].w) < 1e-9, 'each stretch starts where the last one ended');
  }
  const tailZ = foam.at(-1).w;
  assert.ok(tailZ < 5 - 0.5, `the foam comes off the tail, behind the board (${tailZ.toFixed(2)} m vs board at 5 m)`);
  straight = { cover: foam.at(-1).cover, halfWidth: foam.at(-1).halfWidth, ring: rings.at(-1).strength };
}

// Carving: laid 35° on its rail and sliding 1 m/s sideways, more foam, wider.
{
  const roll = 35 * Math.PI / 180;
  const { foam } = run({ state: board({ v: [1, 0, 5], q: [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)] }) });
  const carved = foam.at(-1);
  assert.ok(carved.cover > straight.cover * 2, `a carve throws more foam (${carved.cover.toFixed(2)} vs ${straight.cover.toFixed(2)} straight)`);
  assert.ok(carved.halfWidth > straight.halfWidth + 0.15, `and wider (${carved.halfWidth.toFixed(2)} m vs ${straight.halfWidth.toFixed(2)} m)`);
}

// Down from the air at 3 m/s: a splash ring and a patch of foam where it lands.
{
  const { rings, foam } = run({
    seconds: 0.2, state: board({ v: [0, -3, 0], airborne: true }),
    each: (t, state) => { if (t > 0.1) { state.airborne = false; state.contact = 0.5; } },
  });
  assert.equal(rings.length, 1, 'one splash');
  assert.ok(rings[0].strength >= 0.9, `a strong one (${rings[0].strength.toFixed(2)})`);
  assert.ok(foam.some((f) => f.halfWidth >= 0.6 && f.x === f.z), 'and a patch of foam');
}

// The rider: two paddling strokes, a swim of two and a bit cycles, a fall in.
const rider = () => {
  const bodies = [];
  for (const name of Object.keys(SEGMENT)) bodies[SEGMENT[name]] = { x: [0, -0.1, 0.8], q: [0, 0, 0, 1], half: [0.035, 0.22, 0.035], v: [0, 0, 0] };
  return { state: 'prone', strokeL: -1, strokeR: -1, swimPhase: 0, world: { bodies } };
};
{
  const { rings } = run({
    seconds: 2.2, state: board(), rider: rider(),
    each: (t, state, r) => { const phase = (t % 1.05) / 1.05; r.strokeL = t < 2.1 && phase < 0.95 ? phase : -1; },
  });
  assert.equal(rings.length, 2, `a ring for each hand going in (${rings.length} for 2 strokes)`);
}
{
  const { rings } = run({
    seconds: 2.2 * 1.3, state: board(), rider: rider(),
    each: (t, state, r) => { r.state = 'swim'; r.swimPhase = t / 1.3; },
  });
  assert.equal(rings.length, 4, `swimming, every arm's pull (${rings.length} in 2.2 cycles)`);
}
{
  const r = rider();
  r.state = 'fallen';
  const chest = r.world.bodies[SEGMENT.chest];
  chest.x[1] = 0.3; chest.v[1] = -2.5;
  const { rings, foam } = run({ seconds: 0.3, state: board(), rider: r, each: () => { chest.x[1] -= 2.5 / 60; } });
  assert.equal(rings.length, 1, 'falling in, one splash');
  assert.ok(foam.some((f) => f.halfWidth >= 0.7), 'with its foam');
}

// The sliders at zero: nothing, whatever happens.
{
  const { rings, foam } = run({ state: board({ v: [1, 0, 5] }), scale: { waves: 0, foam: 0 } });
  assert.equal(rings.length + foam.length, 0, 'none at zero');
}

console.log(`boardWake: still nothing, at 5 m/s a ring every 0.25 m (strength ${straight.ring.toFixed(2)}) and a joined trail (cover ${straight.cover.toFixed(2)}), a carve more and wider, a landing, strokes and a fall splash, zero is zero`);
