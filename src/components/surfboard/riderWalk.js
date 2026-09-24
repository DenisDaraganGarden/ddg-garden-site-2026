import { qFromAxisAngle, qMul, qRotate } from './ragdoll.js';

// Walking and running on his own feet, procedurally. A walker — where he is
// on the ground, which way he faces, how fast he goes — and a gait over it:
// each foot stands where it was put while it carries him and swings to where
// its next step must land while the other one does; the pelvis rides over
// them, lowest where a walking step lands and a running one gives, highest in
// between; the trunk leans into the speed and turns against the hips; the arms
// swing against the legs, bent to run. What it gives is the pose's controls
// in the world's frame (riderPose.js solvePose), for the physics to carry his
// pelvis and feet by and to pull the rest of him toward (riderController's
// 'walk').
//
// A step lands where the hip will be half a stance later, so the foot passes
// under the hip mid-stance, whatever the speed; it is aimed again every frame
// of its swing, so a turn or a stop is followed at once. Stopped, the steps
// go on until both feet stand at his sides, and then he stands still.

// Speeds (m/s): walking, running, backing; how fast he gets up to them and
// stops (m/s²); how fast he turns walking and running (rad/s).
export const WALK_SPEED = 1.35, RUN_SPEED = 3.4, BACK_SPEED = 0.7;
const ACCEL = 2.4, DECEL = 4.5;
const TURN_WALK = 2.3, TURN_RUN = 1.3;
// The gait from walking to running, by speed (m/s): a step's length from the
// speed, how much of a stride a foot stands (walking both feet stand at once
// for a moment; running both are off at once), how high a foot swings, how far
// the pelvis rises and falls and how low it rides, the trunk's lean, the
// arms' swing.
const RUN_FROM = 1.9, RUN_FULL = 2.6;
const stepLength = (v, r) => lerp(0.3 + 0.26 * v, 0.6 + 0.18 * v, r);
const DUTY = [0.62, 0.36];
const LIFT = [0.07, 0.15];
const BOB = [0.018, 0.045];
const BEND = [0.025, 0.075];
const LEAN = [4, 13];
const ARM_SWING = [0.17, 0.27];
// Steps a second at least — turning on the spot, settling at a stop.
const MIN_CADENCE = 1.8;
// His build (riderSkeleton.js REST): the feet under the hips this far apart
// sideways, the pelvis's centre this high over the soles standing straight,
// the hip this far under it, the leg from hip to sole this long.
const HALF_STANCE = 0.1;
const PELVIS_HEIGHT = 0.97, HIP_DROP = 0.04, LEG = 0.85;
// A standing foot rolls: it lands on its heel, toes up, and leaves off its
// ball, heel up — the contact holding still while the ankle goes over it.
// The heel and the ball are this far behind and ahead of the point under the
// ankle (m); the heel lands this far pitched (rad), the toes leave this far.
const HEEL = 0.06, BALL = 0.13;
const HEEL_STRIKE = 0.22, TOE_OFF = 0.6;
// Feet turned out (rad); settled within this of where they stand (m).
const TOE_OUT = 0.12;
const SETTLED = 0.035;
// Wading slows him: at this depth (m) and more, to this share of his speed.
const WADE_DEPTH = 1.0, WADE_SPEED = 0.35;

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (pair, t) => lerp(pair[0], pair[1], t);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x) => x - Math.floor(x);
const SIDES = [['L', 1, 0], ['R', -1, 0.5]];

// A foot: `at` the point under its ankle standing flat (in the air: where it
// is), the swing's from and to, and how it rolls: `sole` and `q` the point
// under the ankle and the foot's turn as the pose takes them.
const foot = () => ({ at: [0, 0, 0], from: [0, 0, 0], to: [0, 0, 0], swing: false, u: 0, p: 0, pitch: 0, sole: [0, 0, 0], q: [0, 0, 0, 1] });
export function createWalker() {
  return {
    x: 0, z: 0, yaw: 0, speed: 0, run: 0, phase: 0, idle: true, groundY: 0, pelvisY: PELVIS_HEIGHT,
    feet: { L: foot(), R: foot() },
  };
}

// Where a foot stands at rest: at his side, on the ground.
function restSpot(w, sign, ground, out) {
  out[0] = w.x + Math.cos(w.yaw) * HALF_STANCE * sign;
  out[2] = w.z - Math.sin(w.yaw) * HALF_STANCE * sign;
  out[1] = ground ? ground(out[0], out[2]) : 0;
  return out;
}

// Standing at (x, z) facing yaw (0: +Z), both feet down at his sides.
export function resetWalker(w, { x = 0, z = 0, yaw = 0, ground = null } = {}) {
  w.x = x; w.z = z; w.yaw = yaw; w.speed = 0; w.run = 0; w.phase = 0; w.idle = true;
  for (const [side, sign] of SIDES) {
    const f = w.feet[side];
    restSpot(w, sign, ground, f.at);
    f.from = [...f.at]; f.to = [...f.at]; f.swing = false; f.u = 0; f.pitch = 0;
  }
  w.groundY = (w.feet.L.at[1] + w.feet.R.at[1]) / 2;
  w.pelvisY = w.groundY + PELVIS_HEIGHT - BEND[0];
  for (const [side, sign] of SIDES) roll(w, w.feet[side], sign, slopeUnder(w, w.feet[side], ground));
  return w;
}

// The ground's pitch along his heading under a foot (rad, + where it falls
// away ahead): a foot lies along it.
function slopeUnder(w, f, ground) {
  if (!ground) return 0;
  const x = f.swing ? f.to[0] : f.at[0], z = f.swing ? f.to[2] : f.at[2];
  const dx = Math.sin(w.yaw) * 0.12, dz = Math.cos(w.yaw) * 0.12;
  return -Math.atan2(ground(x + dx, z + dz) - ground(x - dx, z - dz), 0.24);
}

// The foot as the pose takes it: turned to his heading (toes a little out)
// and pitched, the rolling contact — heel landing, ball leaving — held still.
const qy = [0, 0, 0, 1], qx = [0, 0, 0, 1], pivot = [0, 0, 0], arm = [0, 0, 0];
function roll(w, f, sign, slope = 0) {
  // In the air it turns about the ball it left from, then the heel it will
  // land on; standing, about the heel as it lands, the ball as it leaves; and
  // it lies along the ground's slope.
  let pitch = f.pitch, pivotZ = f.swing ? lerp(BALL, -HEEL, smoothstep(0, 1, f.u)) : 0;
  if (!f.swing && !w.idle) {
    if (f.p < 0.15) { pitch = -HEEL_STRIKE * (1 - f.p / 0.15) ** 2; pivotZ = -HEEL; }
    else if (f.p > 0.55) { pitch = TOE_OFF * ((f.p - 0.55) / 0.45) ** 2; pivotZ = BALL; }
  }
  pitch += slope;
  qFromAxisAngle([0, 1, 0], w.yaw + TOE_OUT * sign, qy);
  qFromAxisAngle([1, 0, 0], pitch, qx);
  qMul(qy, qx, f.q);
  // The pivot where it lies flat, the point under the ankle turned about it.
  qRotate(qy, [0, 0, pivotZ], pivot);
  qRotate(f.q, [0, 0, -pivotZ], arm);
  f.sole[0] = f.at[0] + pivot[0] + arm[0];
  f.sole[1] = f.at[1] + pivot[1] + arm[1];
  f.sole[2] = f.at[2] + pivot[2] + arm[2];
}

const spot = [0, 0, 0];
// One frame. frame: { dt, forward −1..1, turn −1..1 (+ to his left), run 0..1,
// ground(x, z) → height, depth(x, z) → water over the ground (m) }.
export function stepWalker(w, frame) {
  const { dt, ground = null } = frame;
  if (!(dt > 0)) return w;
  const forward = clamp(frame.forward || 0, -1, 1), turn = clamp(frame.turn || 0, -1, 1), run = clamp(frame.run || 0, 0, 1);
  // How fast he wants to go, slowed by the water he wades.
  const depth = frame.depth ? Math.max(frame.depth(w.x, w.z), 0) : 0;
  const wade = lerp(1, WADE_SPEED, smoothstep(0.1, WADE_DEPTH, depth));
  const want = (forward >= 0 ? forward * lerp(WALK_SPEED, RUN_SPEED, run) : forward * BACK_SPEED) * wade;
  const rate = Math.abs(want) > Math.abs(w.speed) && Math.sign(want) !== -Math.sign(w.speed) ? ACCEL : DECEL;
  w.speed += clamp(want - w.speed, -rate * dt, rate * dt);
  const v = Math.abs(w.speed);
  w.run = smoothstep(RUN_FROM, RUN_FULL, v);
  w.yaw += turn * lerp(TURN_WALK, TURN_RUN, w.run) * dt;
  w.x += Math.sin(w.yaw) * w.speed * dt;
  w.z += Math.cos(w.yaw) * w.speed * dt;

  // The stride: two steps; while he stands still it waits. Its rate is the
  // speed he is getting up to, not the one he has: setting off, the steps
  // come quick and short.
  const aim = Math.max(v, Math.abs(want));
  const length = stepLength(aim, smoothstep(RUN_FROM, RUN_FULL, aim));
  const cadence = Math.max(aim / length, MIN_CADENCE);
  const duty = mix(DUTY, w.run);
  const moving = v > 0.05 || Math.abs(turn) > 0.05;
  // Setting off, the first step is taken at once (the left foot's swing
  // begins), not after a stance the body would walk away from.
  if (w.idle && moving) { w.idle = false; w.phase = duty; }
  if (!w.idle) w.phase = frac(w.phase + (cadence / 2) * dt);

  for (const [side, sign, offset] of SIDES) {
    const f = w.feet[side];
    const s = frac(w.phase - offset);
    if (w.idle || s < duty) {
      // Standing: where it landed.
      if (f.swing) { f.swing = false; f.at[0] = f.to[0]; f.at[1] = f.to[1]; f.at[2] = f.to[2]; }
      f.u = 0; f.pitch = 0; f.p = w.idle ? 0.3 : s / duty;
      continue;
    }
    const u = (s - duty) / (1 - duty);
    if (!f.swing) { f.swing = true; f.from[0] = f.at[0]; f.from[1] = f.at[1]; f.from[2] = f.at[2]; }
    // Where it lands: where the hip will be half a stance after it does.
    const untilLanding = ((1 - u) * (1 - duty) * 2) / cadence;
    const halfStance = (duty * 2) / cadence / 2;
    const ahead = w.speed * (untilLanding + halfStance);
    restSpot(w, sign, null, spot);
    f.to[0] = spot[0] + Math.sin(w.yaw) * ahead;
    f.to[2] = spot[2] + Math.cos(w.yaw) * ahead;
    f.to[1] = ground ? ground(f.to[0], f.to[2]) : 0;
    const e = smoothstep(0, 1, u);
    const lift = mix(LIFT, w.run) * Math.sin(Math.PI * u) * clamp(v / 0.4 + 0.4, 0, 1);
    f.at[0] = lerp(f.from[0], f.to[0], e);
    f.at[2] = lerp(f.from[2], f.to[2], e);
    f.at[1] = lerp(f.from[1], f.to[1], e) + lift;
    f.u = u; f.p = 1;
    // Toes down as it leaves (as the stance ended), up as it comes to land.
    f.pitch = lerp(TOE_OFF, -HEEL_STRIKE, smoothstep(0, 1, u)) * (1 - Math.sin(Math.PI * u) * 0.3);
  }
  for (const [side, sign] of SIDES) roll(w, w.feet[side], sign, slopeUnder(w, w.feet[side], ground));
  // Stopped with both feet down at his sides: he stands still.
  if (!moving && !w.idle && !w.feet.L.swing && !w.feet.R.swing) {
    const settled = SIDES.every(([side, sign]) => {
      restSpot(w, sign, ground, spot);
      const f = w.feet[side].at;
      return Math.hypot(f[0] - spot[0], f[2] - spot[2]) < SETTLED;
    });
    if (settled) w.idle = true;
  }

  // The pelvis: over the ground the feet stand (or will), lower with the
  // speed, rising and falling with the step, never so high a standing leg
  // cannot reach its foot.
  const groundOf = (f) => (f.swing ? f.to[1] : f.at[1]);
  w.groundY = (groundOf(w.feet.L) + groundOf(w.feet.R)) / 2;
  const walkBob = Math.cos(4 * Math.PI * (w.phase - 0.3));
  const runBob = -Math.cos(4 * Math.PI * (w.phase - duty / 2));
  const bob = w.idle ? 0 : mix(BOB, w.run) * lerp(walkBob, runBob, w.run) * clamp(v / 0.6, 0, 1);
  let y = w.groundY + PELVIS_HEIGHT - mix(BEND, w.run) * clamp(v / 1.5, 0.3, 1) + bob;
  // The hip no further from either ankle than the leg reaches.
  for (const [side, sign] of SIDES) {
    const f = w.feet[side];
    qRotate(f.q, [0, 0.08, 0], arm);
    const ax = f.sole[0] + arm[0], ay = f.sole[1] + arm[1], az = f.sole[2] + arm[2];
    const hx = w.x + Math.cos(w.yaw) * 0.09 * sign, hz = w.z - Math.sin(w.yaw) * 0.09 * sign;
    const across = Math.hypot(ax - hx, az - hz);
    y = Math.min(y, ay + Math.sqrt(Math.max(LEG * LEG - across * across, 0.01)) + HIP_DROP);
  }
  w.pelvisY = y;
  return w;
}

// How far forward each leg is through the stride, −1 (behind) to 1 (ahead):
// ahead as it lands, back through its stance, forward through its swing.
function reach(w, offset, duty) {
  if (w.idle) return 0;
  const s = frac(w.phase - offset);
  return s < duty ? Math.cos(Math.PI * s / duty) : -Math.cos(Math.PI * (s - duty) / (1 - duty));
}

const qa = [0, 0, 0, 1], qb = [0, 0, 0, 1];
const Y = [0, 1, 0], X = [1, 0, 0];
// The pose's controls (riderPose.js createControls), in the world's frame.
export function walkControls(w, out) {
  const v = Math.abs(w.speed), r = w.run, duty = mix(DUTY, r);
  const legL = reach(w, 0, duty), legR = reach(w, 0.5, duty);
  const going = clamp(v / 0.8, 0, 1);
  // The hips turn with the forward leg; the shoulders the other way.
  const twist = mix([5, 8], r) * DEG * ((legL - legR) / 2) * going;
  const lean = mix(LEAN, r) * DEG * clamp(v / 1.2, 0, 1) * Math.sign(w.speed || 1);
  const sin = Math.sin(w.yaw), cos = Math.cos(w.yaw);
  out.pelvis[0] = w.x; out.pelvis[1] = w.pelvisY; out.pelvis[2] = w.z;
  qFromAxisAngle(Y, w.yaw - twist, qa);
  qFromAxisAngle(X, 0.3 * lean, qb);
  qMul(qa, qb, out.pelvisQ);
  qFromAxisAngle(Y, 0.9 * twist, qa); qFromAxisAngle(X, 0.35 * lean, qb); qMul(qa, qb, out.lumbarQ);
  qFromAxisAngle(Y, 0.9 * twist, qa); qFromAxisAngle(X, 0.35 * lean, qb); qMul(qa, qb, out.thoracicQ);
  // The head level and ahead, over all of that.
  qFromAxisAngle(Y, -0.8 * twist, qa); qFromAxisAngle(X, -lean + 6 * DEG, qb); qMul(qa, qb, out.neckQ);
  for (const [side, sign] of SIDES) {
    const f = w.feet[side];
    const s = out[`sole${side}`], fq = out[`footQ${side}`];
    s[0] = f.sole[0]; s[1] = f.sole[1]; s[2] = f.sole[2];
    fq[0] = f.q[0]; fq[1] = f.q[1]; fq[2] = f.q[2]; fq[3] = f.q[3];
    // Knees ahead and a little out.
    const knee = out[`kneePole${side}`];
    knee[0] = sin + 0.15 * cos * sign; knee[1] = 0; knee[2] = cos - 0.15 * sin * sign;
    // Arms against the legs: the left one forward with the right leg; bent and
    // carried higher, closer, to run.
    const arm = side === 'L' ? legR : legL;
    const swing = mix(ARM_SWING, r) * arm * going;
    const out_ = mix([0.24, 0.19], r) * sign, up = mix([-0.03, 0.22], r);
    const hand = out[`hand${side}`];
    hand[0] = w.x + cos * out_ + sin * swing;
    hand[1] = w.pelvisY + up;
    hand[2] = w.z - sin * out_ + cos * swing;
    const elbow = out[`elbowPole${side}`];
    elbow[0] = -sin + 0.35 * cos * sign; elbow[1] = -0.25; elbow[2] = -cos - 0.35 * sin * sign;
  }
  return out;
}
