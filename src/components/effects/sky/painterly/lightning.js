// Lightning as numbers: when a strike happens, how its flash decays, where the
// channel runs and when the thunder arrives. No three, no DOM, so the timing
// contract is checked in node (lightning.check.js) rather than by watching.

export const SOUND_SPEED = 343; // m/s
export const STRIKES_PER_MINUTE = 9; // at lightning = 1
const FLASH_ATTACK = 0.012;
const FLASH_TAU = 0.075;
const STROKE_LIFE = 0.42;
const BOLT_LIFE = 0.09;

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createLightningState(seed = 1) {
  return {
    rng: mulberry32(seed * 7919 + 13),
    elapsed: 0,
    nextStrike: Infinity,
    strike: null, // { id, x, z, top, bottom, distance, seed, pending: [t...] }
    strokes: [], // { age, peak, seed }
    flash: 0, // 0..1 envelope, the max over live strokes
    bolt: 0, // 0..1 channel visibility, first stroke frames only
    strokeId: 0, // bumps when a stroke starts; the mesh rebuilds its channel
    strikes: 0,
    thunder: [], // { at, gain, distance }, consumed by takeThunder
    force: false,
  };
}

const exponential = (rng, mean) => -Math.log(1 - Math.min(rng(), 0.999999)) * mean;

const envelope = (stroke) => {
  const t = stroke.age;
  if (t < 0) return 0;
  if (t < FLASH_ATTACK) return (t / FLASH_ATTACK) * stroke.peak;
  return Math.exp(-(t - FLASH_ATTACK) / FLASH_TAU) * stroke.peak;
};

function beginStrike(state, target, listener) {
  const rng = state.rng;
  const count = rng() < 0.35 ? 1 : rng() < 0.55 ? 2 : rng() < 0.7 ? 3 : 4;
  const pending = [];
  let at = state.elapsed;
  for (let i = 1; i < count; i += 1) {
    at += 0.045 + rng() * 0.07;
    pending.push(at);
  }
  const distance = Math.hypot(target.x - (listener?.x ?? 0), target.z - (listener?.z ?? 0));
  state.strike = {
    id: state.strikes + 1,
    x: target.x,
    z: target.z,
    top: target.top,
    bottom: target.bottom,
    distance,
    seed: Math.floor(rng() * 1e9),
    pending,
  };
  state.strikes += 1;
  state.thunder.push({
    at: state.elapsed + distance / SOUND_SPEED,
    // Sound pressure falls with distance; anything past ~12 km is a murmur.
    gain: Math.min(1, 1.6 / (1 + distance / 1800)),
    distance,
  });
  pushStroke(state, 1);
}

function pushStroke(state, peak) {
  state.strokes.push({ age: 0, peak, seed: Math.floor(state.rng() * 1e9) });
  state.strokeId += 1;
}

/**
 * Advances the storm clock by `dt` seconds. `lightning` in 0..1 sets the strike
 * rate (Poisson intervals around STRIKES_PER_MINUTE); `pickTarget(rng)` returns
 * `{ x, z, top, bottom }` for a new channel; `listener` gives the thunder its
 * distance. `state.force` requests a strike on the next frame regardless of rate.
 */
export function advanceLightning(state, dt, { lightning = 0, pickTarget, listener } = {}) {
  const step = Math.max(0, dt);
  state.elapsed += step;
  const mean = lightning > 0 ? 60 / (STRIKES_PER_MINUTE * lightning) : Infinity;
  if (!Number.isFinite(mean)) state.nextStrike = Infinity;
  else if (!Number.isFinite(state.nextStrike)) state.nextStrike = state.elapsed + exponential(state.rng, mean);

  if (state.strike && state.elapsed >= state.nextStrike && !state.force) {
    // One channel at a time: a strike still flickering postpones the next.
    state.nextStrike = state.elapsed + 0.5;
  } else if (state.force || state.elapsed >= state.nextStrike) {
    state.force = false;
    const target = pickTarget?.(state.rng) ?? { x: 0, z: -4000, top: 1800, bottom: 0 };
    beginStrike(state, target, listener);
    state.nextStrike = Number.isFinite(mean) ? state.elapsed + exponential(state.rng, mean) : Infinity;
  }

  const strike = state.strike;
  if (strike) {
    while (strike.pending.length && state.elapsed >= strike.pending[0]) {
      strike.pending.shift();
      pushStroke(state, 0.55 + state.rng() * 0.4);
    }
  }

  let flash = 0;
  let bolt = 0;
  for (const stroke of state.strokes) {
    stroke.age += step;
    flash = Math.max(flash, envelope(stroke));
    if (stroke.age < BOLT_LIFE) bolt = Math.max(bolt, (1 - stroke.age / BOLT_LIFE) * stroke.peak);
  }
  state.strokes = state.strokes.filter((stroke) => stroke.age < STROKE_LIFE);
  state.flash = flash;
  state.bolt = bolt;
  if (strike && !state.strokes.length && !strike.pending.length) state.strike = null;
  return state;
}

/** Thunder claps whose travel time has elapsed, removed from the queue. */
export function takeThunder(state) {
  const due = state.thunder.filter((clap) => clap.at <= state.elapsed);
  if (due.length) state.thunder = state.thunder.filter((clap) => clap.at > state.elapsed);
  return due;
}

/**
 * A jittered channel from `top` down to `bottom` with side branches, as flat
 * segment pairs [x0,y0,z0,x1,y1,z1,...] for LineSegmentsGeometry. Midpoint
 * displacement with a slow amplitude decay keeps the channel continuous and
 * kinked at every scale; branches taper, fork once and end in air. The main
 * channel and the branches come back separately so they can be drawn at
 * different widths.
 */
export function buildBolt({ x, z, top, bottom, seed = 1, branches = 4 }) {
  const rng = mulberry32(seed);
  const main = [];
  const side = [];
  const channel = (out, from, to, depth, amplitude) => {
    const points = [from, to];
    for (let level = 0; level < depth; level += 1) {
      const scale = amplitude * 0.58 ** level;
      for (let i = points.length - 1; i > 0; i -= 1) {
        const a = points[i - 1];
        const b = points[i];
        points.splice(i, 0, [
          (a[0] + b[0]) / 2 + (rng() - 0.5) * scale,
          (a[1] + b[1]) / 2 + (rng() - 0.5) * scale * 0.3,
          (a[2] + b[2]) / 2 + (rng() - 0.5) * scale,
        ]);
      }
    }
    for (let i = 1; i < points.length; i += 1) out.push(...points[i - 1], ...points[i]);
    return points;
  };
  const height = Math.max(top - bottom, 1);
  const trunk = channel(
    main,
    [x, top, z],
    [x + (rng() - 0.5) * height * 0.3, bottom, z + (rng() - 0.5) * height * 0.3],
    7,
    height * 0.22,
  );
  const fork = (from, length, depth, again) => {
    const angle = rng() * Math.PI * 2;
    const end = [
      from[0] + Math.cos(angle) * length * 0.75,
      from[1] - length * (0.55 + rng() * 0.45),
      from[2] + Math.sin(angle) * length * 0.75,
    ];
    const points = channel(side, from, end, depth, length * 0.3);
    if (again) fork(points[Math.floor(points.length * (0.3 + rng() * 0.4))], length * 0.45, depth - 1, false);
  };
  for (let b = 0; b < branches; b += 1) {
    const start = trunk[Math.floor(trunk.length * (0.12 + rng() * 0.6))];
    fork(start, height * (0.14 + rng() * 0.2), 4, b < 2);
  }
  return { main: new Float32Array(main), branches: new Float32Array(side) };
}
