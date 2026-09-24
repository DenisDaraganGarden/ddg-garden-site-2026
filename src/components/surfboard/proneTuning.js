// Denis's corrections to the lying pose (riderPose.js proneControls), set with
// the manipulators of the surfboard lab («Править позу лёжа») and saved into
// riderPoseTuning.js by the dev server (vite.config.js, POST /__rider-pose).
// All in the board's frame (+Z the nose, +Y up, +X his left), on top of the
// pose the code builds, so they hold on any board:
//   pelvis   m, where the pelvis sits (up: more belly under him)
//   chest    °, the back's arch (+ lifts the chest)
//   head     [°, °], the head's nod (+ up) and turn (+ to his left)
//   handL/R  m, where each resting hand is
//   elbowL/R the way each elbow points, or null for the code's
//   kneeL/R  the way each knee points, or null for the code's
//   footL/R  m, where each foot is

export const PRONE_FACTORY = Object.freeze({
  pelvis: [0, 0, 0], chest: 0, head: [0, 0],
  handL: [0, 0, 0], handR: [0, 0, 0],
  elbowL: null, elbowR: null, kneeL: null, kneeR: null,
  footL: [0, 0, 0], footR: [0, 0, 0],
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

export function normalizeProneTuning(source = {}) {
  const t = source && typeof source === 'object' ? source : {};
  return {
    pelvis: vector(t.pelvis, REACH),
    chest: clampTo(finite(Number(t.chest), 0), ANGLE),
    head: vector(t.head, ANGLE, 2),
    handL: vector(t.handL, REACH), handR: vector(t.handR, REACH),
    elbowL: direction(t.elbowL), elbowR: direction(t.elbowR),
    kneeL: direction(t.kneeL), kneeR: direction(t.kneeR),
    footL: vector(t.footL, REACH), footR: vector(t.footR, REACH),
  };
}

// The module the dev server writes: plain data, rounded to a tenth of a
// millimetre and a hundredth of a degree.
export function proneTuningModule(tuning) {
  const round = (value) => (Array.isArray(value) ? value.map(round) : value === null ? null : Math.round(value * 1e4) / 1e4);
  const prone = Object.fromEntries(Object.entries(normalizeProneTuning(tuning)).map(([key, value]) => [key, round(value)]));
  const lines = Object.entries(prone).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`);
  return `// Denis's lying pose, saved from the surfboard lab («Править позу лёжа»).
// Written by the dev server (POST /__rider-pose); read by riderPose.js.
// Not edited by hand: the lab's manipulators are how it changes.
export default {
  prone: {
${lines.join('\n')}
  },
};
`;
}
