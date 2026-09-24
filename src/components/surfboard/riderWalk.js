import { qFromAxisAngle, qMul, qRotate } from './ragdoll.js';

// Walking, running and jumping on his own feet, procedurally. A walker — where he is
// on the ground, which way he faces, how fast he goes — and a gait over it:
// each foot stands where it was put while it carries him and swings to where
// its next step must land while the other one does; the pelvis rides over
// them, lowest where a walking step lands and a running one gives, highest in
// between, over the standing foot and dropped on the side of the swinging leg;
// the trunk leans into the speed and turns against the hips, the head level;
// the arms swing against the legs like pendulums, bent to run. What it gives
// is the pose's controls in the world's frame (riderPose.js solvePose), the
// pose the physics carries all of him by (riderController's 'walk', 'jump').
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
const ARM_SWING = [0.15, 0.25];
// Over the standing foot: the pelvis this far toward it (m) and dropped this
// much on the other side (°); the chest leans back over most of it, the head
// stays level.
const SWAY = [0.016, 0.008];
const TILT = [3.5, 5];
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
// A landing's give: the pelvis lower by the landing's depth at its deepest,
// this long (s) after the feet come down, and up again soon after.
const DIP_TIME = 0.12;
// Standing still: a breath every ~5 s lifting the chest (°), his weight
// drifting side to side every ~8 s (m, °), a look about every ~20 s (°).
const IDLE = { breath: 0.21, breathe: 1.4, drift: 0.13, shift: 0.012, tilt: 1.5, look: 0.05, turn: 7 };

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
const Y = [0, 1, 0], X = [1, 0, 0], Z = [0, 0, 1];
const qa = [0, 0, 0, 1], qb = [0, 0, 0, 1];
// A turn about the vertical, then a pitch, then a roll — each small, about his
// own axes as they are after the one before.
function turned(out, yaw, pitch, roll) {
  qFromAxisAngle(Y, yaw, qa); qFromAxisAngle(X, pitch, qb); qMul(qa, qb, qa);
  qFromAxisAngle(Z, roll, qb);
  return qMul(qa, qb, out);
}

// A foot: `at` the point under its ankle standing flat (in the air: where it
// is), the swing's from and to, and how it rolls: `sole` and `q` the point
// under the ankle and the foot's turn as the pose takes them.
const foot = () => ({ at: [0, 0, 0], from: [0, 0, 0], to: [0, 0, 0], swing: false, u: 0, p: 0, pitch: 0, sole: [0, 0, 0], q: [0, 0, 0, 1] });
export function createWalker() {
  return {
    x: 0, z: 0, yaw: 0, speed: 0, run: 0, phase: 0, idle: true, groundY: 0, pelvisY: PELVIS_HEIGHT, dip: 0, dipT: 0, over: 0, clock: 0,
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

// Standing at (x, z) facing yaw (0: +Z), both feet down at his sides; going
// on at `speed` (m/s, along yaw) if he comes down from a jump moving.
export function resetWalker(w, { x = 0, z = 0, yaw = 0, ground = null, speed = 0 } = {}) {
  w.x = x; w.z = z; w.yaw = yaw; w.speed = speed; w.run = 0; w.phase = 0; w.idle = true; w.dip = 0; w.dipT = 0; w.over = 0;
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
  w.clock += dt;
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
  // +1 over the left foot mid-stance, −1 over the right: the pelvis shifts
  // onto the standing foot and drops on the other side (walkControls).
  w.over = Math.cos(2 * Math.PI * w.phase - Math.PI * duty) * (w.idle ? 0 : clamp(v / 0.8, 0, 1));
  const shift = mix(SWAY, w.run) * w.over, tilt = mix(TILT, w.run) * DEG * w.over;
  w.groundY = (groundOf(w.feet.L) + groundOf(w.feet.R)) / 2;
  const walkBob = Math.cos(4 * Math.PI * (w.phase - 0.3));
  const runBob = -Math.cos(4 * Math.PI * (w.phase - duty / 2));
  const bob = w.idle ? 0 : mix(BOB, w.run) * lerp(walkBob, runBob, w.run) * clamp(v / 0.6, 0, 1);
  let y = w.groundY + PELVIS_HEIGHT - mix(BEND, w.run) * clamp(v / 1.5, 0.3, 1) + bob;
  // The hip no further from either ankle than the leg reaches — the hip where
  // the shift and the drop put it.
  for (const [side, sign] of SIDES) {
    const f = w.feet[side];
    qRotate(f.q, [0, 0.08, 0], arm);
    const ax = f.sole[0] + arm[0], ay = f.sole[1] + arm[1], az = f.sole[2] + arm[2];
    const hx = w.x + Math.cos(w.yaw) * (0.09 * sign + shift), hz = w.z - Math.sin(w.yaw) * (0.09 * sign + shift);
    const across = Math.hypot(ax - hx, az - hz);
    y = Math.min(y, ay + Math.sqrt(Math.max(LEG * LEG - across * across, 0.01)) + HIP_DROP - 0.09 * sign * Math.sin(tilt));
  }
  // A landing gives at the knees and comes back up.
  w.dipT += dt;
  if (w.dipT > 8 * DIP_TIME) w.dip = 0;
  w.pelvisY = y - (w.dip > 0 ? w.dip * (w.dipT / DIP_TIME) * Math.exp(1 - w.dipT / DIP_TIME) : 0);
  return w;
}
// Down from a jump: the knees give by `depth` (m).
export function landWalker(w, depth) {
  w.dip = depth; w.dipT = 0;
  return w;
}

// The pose's controls (riderPose.js createControls), in the world's frame.
// carry: { side (1 his left, −1 his right), grip [x, y, z], amount 0..1 } —
// that hand on a board he carries instead of swinging.
export function walkControls(w, out, carry = null) {
  const v = Math.abs(w.speed), r = w.run;
  const stepping = w.idle ? 0 : clamp(v / 0.8, 0, 1);
  const cycle = 2 * Math.PI * w.phase, over = w.over;
  // The hips turn with the forward leg (the left forward as the left foot
  // lands), the shoulders the other way: one smooth swing a stride.
  const twist = mix([5, 8], r) * DEG * Math.cos(cycle) * stepping;
  // Standing still he is not a statue: he breathes, his weight drifts from
  // one foot to the other, now and then he looks about.
  const still = 1 - stepping, t = w.clock;
  const breath = still * Math.sin(2 * Math.PI * IDLE.breath * t);
  const drift = still * Math.sin(2 * Math.PI * IDLE.drift * t);
  const look = still * Math.sin(2 * Math.PI * IDLE.look * t + 1);
  const shift = mix(SWAY, r) * over + IDLE.shift * drift, tilt = mix(TILT, r) * DEG * over + IDLE.tilt * DEG * drift;
  const lean = mix(LEAN, r) * DEG * clamp(v / 1.2, 0, 1) * Math.sign(w.speed || 1);
  const sin = Math.sin(w.yaw), cos = Math.cos(w.yaw);
  const px = w.x + cos * shift, pz = w.z - sin * shift;
  out.pelvis[0] = px; out.pelvis[1] = w.pelvisY; out.pelvis[2] = pz;
  turned(out.pelvisQ, w.yaw - twist, 0.3 * lean, tilt);
  turned(out.lumbarQ, 0.9 * twist, 0.35 * lean, -0.9 * tilt);
  turned(out.thoracicQ, 0.9 * twist, 0.35 * lean - IDLE.breathe * DEG * breath, -0.6 * tilt);
  // The head level and ahead, over all of that.
  turned(out.neckQ, -0.8 * twist + IDLE.turn * DEG * look, -lean + 6 * DEG, 0.5 * tilt);
  for (const [side, sign] of SIDES) {
    const f = w.feet[side];
    const s = out[`sole${side}`], fq = out[`footQ${side}`];
    s[0] = f.sole[0]; s[1] = f.sole[1]; s[2] = f.sole[2];
    fq[0] = f.q[0]; fq[1] = f.q[1]; fq[2] = f.q[2]; fq[3] = f.q[3];
    // Knees ahead and a little out.
    const knee = out[`kneePole${side}`];
    knee[0] = sin + 0.15 * cos * sign; knee[1] = 0; knee[2] = cos - 0.15 * sin * sign;
    // Arms against the legs, as pendulums: the left one forward as the right
    // foot lands; rising a little at either end of the swing, more in front
    // where the elbow bends; bent and carried higher, closer, to run.
    const swing = mix(ARM_SWING, r) * Math.cos(cycle - (side === 'L' ? Math.PI : 0)) * stepping;
    const across = mix([0.24, 0.19], r) * sign;
    const up = mix([-0.03, 0.22], r) + 0.16 * Math.max(swing, 0) + 0.05 * Math.max(-swing, 0);
    const hand = out[`hand${side}`];
    hand[0] = px + cos * across + sin * swing;
    hand[1] = w.pelvisY + up;
    hand[2] = pz - sin * across + cos * swing;
    const elbow = out[`elbowPole${side}`];
    elbow[0] = -sin + 0.35 * cos * sign; elbow[1] = -0.25; elbow[2] = -cos - 0.35 * sin * sign;
    if (carry && carry.side === sign) {
      // The hand round the board's lower rail, the elbow out over it.
      const a = carry.amount, g = carry.grip;
      hand[0] += (g[0] - hand[0]) * a; hand[1] += (g[1] - hand[1]) * a; hand[2] += (g[2] - hand[2]) * a;
      elbow[0] += (0.8 * cos * sign - 0.3 * sin - elbow[0]) * a;
      elbow[1] += (-0.1 - elbow[1]) * a;
      elbow[2] += (-0.8 * sin * sign - 0.3 * cos - elbow[2]) * a;
    }
  }
  return out;
}

// Crouching to spring (u 0..1, on the controls of where he stands): the
// pelvis down, leaning in, the arms swung back.
export function crouchControls(out, yaw, u) {
  out.pelvis[1] -= 0.15 * u;
  qFromAxisAngle(X, 16 * DEG * u, qb); qMul(out.pelvisQ, qb, out.pelvisQ);
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  for (const side of ['L', 'R']) {
    const h = out[`hand${side}`];
    h[0] -= sin * 0.28 * u; h[1] -= 0.06 * u; h[2] -= cos * 0.28 * u;
  }
  return out;
}

// In the air. j: { x, y, z (the pelvis), yaw, t (s since he left), floor
// (what he left from, while his legs still push off it), tuck, reach, hug
// (0..1) }. The legs push straight as he leaves, tuck up through the flight
// and reach down for ground to land on; the arms throw up as he leaves, go
// out for balance and ahead to land — or, going into the water, the knees
// come to the chest and the arms go round the shins.
const LEG_STRAIGHT = 0.93, LEG_TUCKED = 0.45;
// How far under the pelvis the soles hang in the air (m).
export const jumpLegs = (tuck, reach) => lerp(LEG_STRAIGHT, LEG_TUCKED, tuck * (1 - reach));
// The hands, from the pelvis in his own frame: across, up, ahead (m).
const HANDS = {
  throw: [0.26, 0.62, 0.3], out: [0.62, 0.42, 0.05], hug: [0.13, -0.14, 0.36], land: [0.3, 0.2, 0.28], up: [0.22, 0.86, 0.08],
};
// Where an arm goes through a flight — a jump is never quite the last one
// (riderController draws a style for each): out, overhead, ahead, back, wide
// and high.
export const SPREADS = Object.freeze([
  HANDS.out, HANDS.up, [0.3, 0.36, 0.42], [0.42, 0.2, -0.22], [0.55, 0.66, 0.1],
]);
// style: { handL, handR (a spread each), hugUp ('L', 'R' or null: that arm
// thrown up going into the water, the other round the shins), legs (−1..1:
// the left knee higher, or the right), head [pitch, roll] (rad) }.
const PLAIN = Object.freeze({ handL: HANDS.out, handR: HANDS.out, hugUp: null, legs: 0, head: [0, 0] });
export function jumpControls(j, out) {
  const sin = Math.sin(j.yaw), cos = Math.cos(j.yaw), style = j.style ?? PLAIN;
  const curl = j.tuck * (1 - j.reach);
  out.pelvis[0] = j.x; out.pelvis[1] = j.y; out.pelvis[2] = j.z;
  turned(out.pelvisQ, j.yaw, (6 + 16 * curl) * DEG, 0);
  turned(out.lumbarQ, 0, 12 * curl * DEG, 0);
  turned(out.thoracicQ, 0, 14 * curl * DEG, 0);
  turned(out.neckQ, 0, -(10 + 22 * curl) * DEG + style.head[0] * curl, style.head[1] * curl);
  const legs = jumpLegs(j.tuck, j.reach);
  const thrown = 1 - smoothstep(0.1, 0.32, j.t);
  const hug = (1 - thrown) * j.hug, land = (1 - thrown) * (1 - j.hug) * j.reach;
  for (const [side, sign] of SIDES) {
    const weights = [[HANDS.throw, thrown], [style[`hand${side}`], 1 - thrown - hug - land], [style.hugUp === side ? HANDS.up : HANDS.hug, hug], [HANDS.land, land]];
    const s = out[`sole${side}`];
    const back = -0.12 * curl;
    s[0] = j.x + cos * 0.11 * sign + sin * back;
    s[2] = j.z - sin * 0.11 * sign + cos * back;
    s[1] = Math.max(j.y - legs + 0.07 * style.legs * sign * curl, j.floor);
    turned(out[`footQ${side}`], j.yaw + TOE_OUT * sign, 0.6 * curl, 0);
    const knee = out[`kneePole${side}`];
    knee[0] = sin + 0.2 * cos * sign; knee[1] = 0.2 * curl; knee[2] = cos - 0.2 * sin * sign;
    let across = 0, up = 0, ahead = 0;
    for (const [h, weight] of weights) {
      across += h[0] * weight; up += h[1] * weight; ahead += h[2] * weight;
    }
    const hand = out[`hand${side}`];
    hand[0] = j.x + cos * across * sign + sin * ahead;
    hand[1] = j.y + up;
    hand[2] = j.z - sin * across * sign + cos * ahead;
    const elbow = out[`elbowPole${side}`];
    elbow[0] = -sin + 0.45 * cos * sign; elbow[1] = -0.3; elbow[2] = -cos - 0.45 * sin * sign;
  }
  return out;
}

// A board carried under an arm (side 1 his left, −1 his right): on its rail
// against his side, the deck to him and the fins out, the nose ahead and a
// little up, the top rail under the armpit. at: { x, y, z (his pelvis), yaw }.
const CARRY_OUT = 0.24, CARRY_UP = 0.1, CARRY_AHEAD = 0.06, CARRY_PITCH = 8 * DEG;
export function carryPose(at, side, outP, outQ) {
  const sin = Math.sin(at.yaw), cos = Math.cos(at.yaw);
  outP[0] = at.x + cos * CARRY_OUT * side + sin * CARRY_AHEAD;
  outP[1] = at.y + CARRY_UP;
  outP[2] = at.z - sin * CARRY_OUT * side + cos * CARRY_AHEAD;
  return turned(outQ, at.yaw, -CARRY_PITCH, side * Math.PI / 2);
}
// Where the carrying hand holds it: round the lower rail a little ahead of
// the middle (in the board's frame the rail is at halfWidth, the bottom under).
const gripLocal = [0, 0, 0];
export function carryGrip(p, q, side, halfWidth, out) {
  gripLocal[0] = -side * (halfWidth + 0.02); gripLocal[1] = -0.05; gripLocal[2] = 0.12;
  qRotate(q, gripLocal, out);
  out[0] += p[0]; out[1] += p[1]; out[2] += p[2];
  return out;
}
