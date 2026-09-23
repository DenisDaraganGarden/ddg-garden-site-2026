import { bodyPoint, qRotate } from './ragdoll.js';
import { SEGMENT } from './riderSkeleton.js';
import { wakeFoam, wakeRing } from '../effects/water/waterWake.js';

// What the board and its rider leave on the water (waterWake.js draws it):
//  - running, the board leaves a ring of small waves every quarter metre,
//    which sum to its V, and foam off its tail — more and wider the harder it
//    carves or slides, as a rail thrown over in a turn does;
//  - landing from the air, a splash: one strong ring and a patch of foam;
//  - paddling and swimming, each hand going into the water leaves a ring;
//  - falling in, the body's splash.

// A running board leaves a ring every this much of its path through the water
// (m): a third of the rings' wavelength, so their fronts join into one V
// instead of reading as a chain of circles — which they did at half a metre.
// Rings that close add up, so each is half as strong as a lone one.
const RING_SPACING = 0.25;
const RING_SHARE = 0.5;
// Speed through the water (m/s) the rings start at, and where they are full.
const RING_FROM = 0.35;
const RING_FULL = 4;
// Foam off the tail from this speed through the water (m/s), full by FOAM_FULL.
const FOAM_FROM = 1.4;
const FOAM_FULL = 5;
// Where the wake comes off the board: the tail's wetted end (m from the tail).
const TAIL_IN = 0.3;
// A body going into the water faster than this (m/s, down) splashes.
const SPLASH_SPEED = 1;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function createWakeEmitter() {
  return {
    travel: 0, tail: null, airborne: false,
    strokeL: -1, strokeR: -1, swimL: null, swimR: null, chestAbove: null,
    // scratch
    at: [0, 0, 0], axis: [0, 0, 0], up: [0, 0, 0], sample: { height: 0, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity },
  };
}

// Forget the path: after a respawn the board did not travel from where it was.
export function resetWakeEmitter(emitter) {
  emitter.travel = 0; emitter.tail = null; emitter.airborne = false;
  emitter.strokeL = -1; emitter.strokeR = -1; emitter.swimL = null; emitter.swimR = null; emitter.chestAbove = null;
}

// frame: { dt, state (the board's: p, q, v, contact, airborne), length (m),
// water(x, z, out) → { height, vx, vy, vz }, rider (riderController) or null,
// scale: { waves, foam } — 1 as tuned, 0 for none }.
export function emitBoardWake(emitter, wake, { dt, state, length, water, rider = null, scale }) {
  if (!(dt > 0)) return;
  const waves = Math.max(Number(scale?.waves) || 0, 0), foam = Math.max(Number(scale?.foam) || 0, 0);
  const { at, axis, up, sample } = emitter;

  // --- the board -------------------------------------------------------------
  at[0] = 0; at[1] = 0; at[2] = -length / 2 + TAIL_IN;
  qRotate(state.q, at, at);
  const tailX = state.p[0] + at[0], tailZ = state.p[2] + at[2];
  water(state.p[0], state.p[2], sample);
  const rx = state.v[0] - sample.vx, ry = state.v[1] - sample.vy, rz = state.v[2] - sample.vz;
  const through = Math.hypot(rx, rz);
  const wet = !state.airborne && state.contact > 0.05;
  // How hard it carves: sliding sideways through the water, or laid on a rail.
  axis[0] = 1; axis[1] = 0; axis[2] = 0; qRotate(state.q, axis, axis);
  up[0] = 0; up[1] = 1; up[2] = 0; qRotate(state.q, up, up);
  const carve = clamp(Math.abs(rx * axis[0] + ry * axis[1] + rz * axis[2]) / 1.5 + (1 - up[1]) * 2.5, 0, 1);

  emitter.travel = wet && through > RING_FROM ? Math.min(emitter.travel + through * dt, 2 * RING_SPACING) : 0;
  if (emitter.travel >= RING_SPACING) {
    wakeRing(wake, tailX, tailZ, waves * RING_SHARE * (0.15 + 0.85 * smoothstep(RING_FROM, RING_FULL, through)) * (0.7 + 0.6 * carve));
    emitter.travel -= RING_SPACING;
  }
  if (wet && emitter.tail && through > FOAM_FROM) {
    const cover = foam * smoothstep(FOAM_FROM, FOAM_FULL, through) * (0.35 + 0.65 * carve);
    wakeFoam(wake, emitter.tail[0], emitter.tail[1], tailX, tailZ, 0.18 + 0.3 * carve, cover);
  }
  // Down from the air: the landing's splash, by how hard it came down.
  if (emitter.airborne && wet) {
    const hit = Math.max(-state.v[1], 0);
    if (hit > SPLASH_SPEED) {
      wakeRing(wake, state.p[0], state.p[2], waves * clamp(hit / 3, 0.4, 1.5));
      wakeFoam(wake, state.p[0], state.p[2], state.p[0], state.p[2], 0.6, foam * clamp(hit / 4, 0.3, 0.9));
    }
  }
  emitter.airborne = state.airborne;
  emitter.tail = emitter.tail ?? [0, 0];
  emitter.tail[0] = tailX; emitter.tail[1] = tailZ;

  if (!rider) return;
  // --- the rider ---------------------------------------------------------------
  const hand = (side, strength) => {
    const forearm = rider.world.bodies[SEGMENT[`forearm${side}`]];
    at[0] = 0; at[1] = -forearm.half[1]; at[2] = 0;
    bodyPoint(forearm, at, at);
    water(at[0], at[2], sample);
    if (at[1] > sample.height + 0.05) return;
    wakeRing(wake, at[0], at[2], waves * strength);
    wakeFoam(wake, at[0], at[2], at[0], at[2], 0.12, foam * strength * 0.8);
  };
  // Paddling: a stroke starting is the hand going in ahead of the shoulder.
  for (const side of ['L', 'R']) {
    const key = `stroke${side}`, now = rider[key], before = emitter[key];
    if (rider.state === 'prone' && now >= 0 && (before < 0 || now < before)) hand(side, 0.35);
    emitter[key] = rider.state === 'prone' ? now : -1;
  }
  // Swimming: each arm's pull starts as its phase turns over a whole cycle.
  if (rider.state === 'swim') {
    const left = Math.floor(rider.swimPhase), right = Math.floor(rider.swimPhase + 0.5);
    if (emitter.swimL !== null && left !== emitter.swimL) hand('L', 0.3);
    if (emitter.swimR !== null && right !== emitter.swimR) hand('R', 0.3);
    emitter.swimL = left; emitter.swimR = right;
  } else {
    emitter.swimL = null; emitter.swimR = null;
  }
  // Falling in: the chest going under, fast.
  const chest = rider.world.bodies[SEGMENT.chest];
  water(chest.x[0], chest.x[2], sample);
  const above = chest.x[1] > sample.height;
  if (emitter.chestAbove && !above && -chest.v[1] > SPLASH_SPEED) {
    const hit = -chest.v[1];
    wakeRing(wake, chest.x[0], chest.x[2], waves * clamp(hit / 3, 0.5, 1.5));
    wakeFoam(wake, chest.x[0], chest.x[2], chest.x[0], chest.x[2], 0.7, foam * clamp(hit / 4, 0.4, 1));
  }
  emitter.chestAbove = above;
}
