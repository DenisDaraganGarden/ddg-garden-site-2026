// Denis's corrections to the rider's poses (riderPose.js), set with the
// manipulators of the surfboard lab («Править позу») and saved into
// riderPoseTuning.js by the dev server (vite.config.js, POST /__rider-pose).
// Each is on top of the pose the code builds, so it holds on any board.
//
//   prone   lying still, in the board's frame (+Z the nose, +Y up, +X his left):
//     pelvis   m, where the pelvis sits (up: more belly under him)
//     chest    °, the back's arch (+ lifts the chest)
//     head     [°, °], the head's nod (+ up) and turn (+ to his left)
//     handL/R  m, where each resting hand is
//     elbowL/R the way each elbow points, or null for the code's
//     kneeL/R  the way each knee points, or null for the code's
//     footL/R  m, where each foot is
//   paddle  the strokes lying (the torso and legs are prone's):
//     strokeL/R  m, the hand's path moved at four moments of the stroke —
//                in the water ahead of the shoulder, deepest, out at the
//                hip, over the water on the way back (STROKE_KEYS)
//     elbowL/R   the way the elbow points through the stroke, or null
//   swim    the crawl, in the swimmer's frame (+Z the way he swims, y = 0
//           the surface): pelvis, chest, head as prone's; strokeL/R and
//           elbowL/R as paddle's (at SWIM_KEYS); footL/R and kneeL/R the kick.

// The phases of the four moments of a stroke: lying (riderPose's paddle, in
// the water until 0.55) and swimming (the crawl, in the water until 0.5).
export const STROKE_KEYS = Object.freeze([0, 0.275, 0.55, 0.775]);
export const SWIM_KEYS = Object.freeze([0, 0.25, 0.5, 0.75]);

const zero3 = () => [0, 0, 0];
const keys = () => STROKE_KEYS.map(zero3);
export const POSE_FACTORY = Object.freeze({
  prone: {
    pelvis: zero3(), chest: 0, head: [0, 0],
    handL: zero3(), handR: zero3(),
    elbowL: null, elbowR: null, kneeL: null, kneeR: null,
    footL: zero3(), footR: zero3(),
  },
  paddle: { strokeL: keys(), strokeR: keys(), elbowL: null, elbowR: null },
  swim: {
    pelvis: zero3(), chest: 0, head: [0, 0],
    strokeL: keys(), strokeR: keys(), elbowL: null, elbowR: null,
    footL: zero3(), footR: zero3(), kneeL: null, kneeR: null,
  },
});
// How far each may go: a pose, not a teleport.
const REACH = 0.5, ANGLE = 60;

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const clampTo = (value, limit) => Math.max(-limit, Math.min(limit, value));
const vector = (value, limit, length = 3) => (Array.isArray(value) && value.length === length
  ? value.map((v) => clampTo(finite(Number(v), 0), limit))
  : new Array(length).fill(0));
const direction = (value) => {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const v = value.map((n) => finite(Number(n), 0));
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-6 ? v.map((n) => n / length) : null;
};
const angle = (value) => clampTo(finite(Number(value), 0), ANGLE);
const strokeKeys = (value) => STROKE_KEYS.map((_, i) => vector(Array.isArray(value) ? value[i] : null, REACH));

const torso = (t) => ({ pelvis: vector(t.pelvis, REACH), chest: angle(t.chest), head: vector(t.head, ANGLE, 2) });
const limbs = (t, part) => ({ [`${part}L`]: direction(t[`${part}L`]), [`${part}R`]: direction(t[`${part}R`]) });
const moves = (t, part) => ({ [`${part}L`]: vector(t[`${part}L`], REACH), [`${part}R`]: vector(t[`${part}R`], REACH) });
const strokes = (t) => ({ strokeL: strokeKeys(t.strokeL), strokeR: strokeKeys(t.strokeR) });
const section = (source, name) => (source && typeof source[name] === 'object' && source[name] ? source[name] : {});

export function normalizePoseTuning(source = {}) {
  const prone = section(source, 'prone'), paddle = section(source, 'paddle'), swim = section(source, 'swim');
  return {
    prone: { ...torso(prone), ...moves(prone, 'hand'), ...limbs(prone, 'elbow'), ...limbs(prone, 'knee'), ...moves(prone, 'foot') },
    paddle: { ...strokes(paddle), ...limbs(paddle, 'elbow') },
    swim: { ...torso(swim), ...strokes(swim), ...limbs(swim, 'elbow'), ...moves(swim, 'foot'), ...limbs(swim, 'knee') },
  };
}

// The stroke's correction at `phase` (0..1, periodic): straight between the
// moments on either side.
export function strokeOffset(corrections, moments, phase, out) {
  const t = ((phase % 1) + 1) % 1;
  let i = moments.length - 1;
  while (i > 0 && moments[i] > t) i -= 1;
  const next = (i + 1) % moments.length;
  const span = (next === 0 ? 1 : moments[next]) - moments[i];
  const u = span > 0 ? (t - moments[i]) / span : 0;
  for (let c = 0; c < 3; c += 1) out[c] = corrections[i][c] * (1 - u) + corrections[next][c] * u;
  return out;
}

// The module the dev server writes: plain data, rounded to a tenth of a
// millimetre and a hundredth of a degree.
export function poseTuningModule(tuning) {
  const round = (value) => (Array.isArray(value) ? value.map(round) : value === null ? null : Math.round(value * 1e4) / 1e4);
  const normal = normalizePoseTuning(tuning);
  const block = (name) => [
    `  ${name}: {`,
    ...Object.entries(normal[name]).map(([key, value]) => `    ${key}: ${JSON.stringify(round(value))},`),
    '  },',
  ].join('\n');
  return `// Denis's rider poses, saved from the surfboard lab («Править позу»).
// Written by the dev server (POST /__rider-pose); read by riderPose.js.
// Not edited by hand: the lab's manipulators are how it changes.
export default {
${['prone', 'paddle', 'swim'].map(block).join('\n')}
};
`;
}
