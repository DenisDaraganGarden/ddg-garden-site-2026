import { qConj, qFromAxisAngle, qMul, qNormalize, qRotate, qSlerp } from './ragdoll.js';
import { BONES, REST, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES } from './riderSkeleton.js';

// Where every segment of the rider should be, in the board's frame: the pose
// the physics body is carried by (pelvis, feet) and pulled toward (the rest,
// on muscles).
//
// A pose is not a clip. It is built each frame from a handful of controls —
// where the pelvis is and how it is turned, how the spine bends, where the
// soles stand and where the hands reach, where the head looks — and the knees
// and elbows are found by two-bone IK. Standing, lying and getting up are
// three settings of the same controls, so going from one to another is a
// blend of positions and rotations, never a cut.
//
// The board frame: +Z the nose, +Y up out of the deck, +X the rider's left
// when he lies facing the nose. He rides regular — left foot forward — so
// standing he faces the board's −X rail, his toes over it.

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// --- small vector and basis helpers ------------------------------------------

const sub = (a, b, out) => { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; return out; };
const add = (a, b, out) => { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2]; return out; };
const scale = (a, s, out) => { out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s; return out; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b, out) => {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z; return out;
};
const normalize = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
const copy = (a, out) => { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; };
const lerp3 = (a, b, t, out) => { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; };

// The rotation whose columns are x, y, z (a right-handed orthonormal basis).
function basisQuaternion(x, y, z, out) {
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out[3] = 0.25 / s; out[0] = (m21 - m12) * s; out[1] = (m02 - m20) * s; out[2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out[3] = (m21 - m12) / s; out[0] = 0.25 * s; out[1] = (m01 + m10) / s; out[2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out[3] = (m02 - m20) / s; out[0] = (m01 + m10) / s; out[1] = 0.25 * s; out[2] = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out[3] = (m10 - m01) / s; out[0] = (m02 + m20) / s; out[1] = (m12 + m21) / s; out[2] = 0.25 * s;
  }
  return qNormalize(out);
}
// The rotation of a limb bone: its long axis along `along`, turned about it
// so that its X is the limb's hinge axis — the one both bones of a knee or an
// elbow share. Taken from the pole instead, the lower bone's frame flipped
// half a turn as soon as the joint bent past a right angle. Composed with the
// same basis in the rest pose, it is the segment's rotation from rest.
const bx = [0, 0, 0], by = [0, 0, 0], bz = [0, 0, 0];
function boneBasis(along, hinge, out) {
  copy(along, by); normalize(by);
  scale(by, dot(hinge, by), bx); sub(hinge, bx, bx);
  if (dot(bx, bx) < 1e-10) { bx[0] = 1; bx[1] = 0; bx[2] = 0; scale(by, dot(bx, by), bz); sub(bx, bz, bx); }
  normalize(bx);
  cross(bx, by, bz);
  return basisQuaternion(bx, by, bz, out);
}
// A limb's hinge axis: square to the plane the IK bent it in (the reach from
// root to end and the pole it bends toward).
const hingeOf = (reach, pole, out) => normalize(cross(pole, reach, out));

// The bone bases of the rest pose, for the limbs: thigh and shin point down
// with the knee forward, the arms hang with the elbow back.
const REST_BASIS = {};
const restBone = (name, from, to, root, end, pole) => {
  const along = sub(REST[from], REST[to], [0, 0, 0]);
  const hinge = hingeOf(sub(REST[end], REST[root], [0, 0, 0]), pole, [0, 0, 0]);
  REST_BASIS[name] = qConj(boneBasis(along, hinge, [0, 0, 0, 1]), [0, 0, 0, 1]);
};
restBone('thighL', 'hipL', 'kneeL', 'hipL', 'ankleL', [0, 0, 1]);
restBone('shinL', 'kneeL', 'ankleL', 'hipL', 'ankleL', [0, 0, 1]);
restBone('thighR', 'hipR', 'kneeR', 'hipR', 'ankleR', [0, 0, 1]);
restBone('shinR', 'kneeR', 'ankleR', 'hipR', 'ankleR', [0, 0, 1]);
restBone('upperArmL', 'shoulderL', 'elbowL', 'shoulderL', 'wristL', [0, 0, -1]);
restBone('forearmL', 'elbowL', 'wristL', 'shoulderL', 'wristL', [0, 0, -1]);
restBone('upperArmR', 'shoulderR', 'elbowR', 'shoulderR', 'wristR', [0, 0, -1]);
restBone('forearmR', 'elbowR', 'wristR', 'shoulderR', 'wristR', [0, 0, -1]);

// Two-bone IK: from root `a` toward `target`, bones l1 and l2, the middle
// joint bent toward `pole`. Writes the middle joint and the reached end (the
// target, pulled in if it is out of reach).
const ikU = [0, 0, 0], ikP = [0, 0, 0];
function twoBone(a, target, l1, l2, pole, middle, end) {
  sub(target, a, ikU);
  let d = Math.hypot(ikU[0], ikU[1], ikU[2]);
  const reach = l1 + l2 - 1e-4, least = Math.abs(l1 - l2) + 1e-4;
  if (d < 1e-6) { ikU[0] = 0; ikU[1] = -1; ikU[2] = 0; d = least; }
  scale(ikU, 1 / d, ikU);
  d = clamp(d, least, reach);
  scale(ikU, d, end); add(a, end, end);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  scale(ikU, dot(pole, ikU), ikP); sub(pole, ikP, ikP);
  if (dot(ikP, ikP) < 1e-10) { ikP[0] = 0; ikP[1] = 0; ikP[2] = 1; }
  normalize(ikP);
  middle[0] = a[0] + l1 * (cosA * ikU[0] + sinA * ikP[0]);
  middle[1] = a[1] + l1 * (cosA * ikU[1] + sinA * ikP[1]);
  middle[2] = a[2] + l1 * (cosA * ikU[2] + sinA * ikP[2]);
}

// --- the pose ------------------------------------------------------------------

// A pose: every segment's centre and rotation in the board frame.
export function createPose() {
  return {
    position: SEGMENT_NAMES.map(() => [0, 0, 0]),
    rotation: SEGMENT_NAMES.map(() => [0, 0, 0, 1]),
  };
}

// The controls a pose is built from; the same object for every posture, so
// two of them blend by blending numbers.
export function createControls() {
  return {
    pelvis: [0, 0, 0], pelvisQ: [0, 0, 0, 1],
    lumbarQ: [0, 0, 0, 1], thoracicQ: [0, 0, 0, 1], neckQ: [0, 0, 0, 1],
    soleL: [0, 0, 0], soleR: [0, 0, 0], footQL: [0, 0, 0, 1], footQR: [0, 0, 0, 1],
    kneePoleL: [0, 0, 1], kneePoleR: [0, 0, 1],
    handL: [0, 0, 0], handR: [0, 0, 0],
    elbowPoleL: [0, 0, -1], elbowPoleR: [0, 0, -1],
  };
}

const QUAT_KEYS = ['pelvisQ', 'lumbarQ', 'thoracicQ', 'neckQ', 'footQL', 'footQR'];
const VEC_KEYS = ['pelvis', 'soleL', 'soleR', 'kneePoleL', 'kneePoleR', 'handL', 'handR', 'elbowPoleL', 'elbowPoleR'];
export function blendControls(a, b, t, out) {
  for (const key of VEC_KEYS) lerp3(a[key], b[key], t, out[key]);
  for (const key of QUAT_KEYS) qSlerp(a[key], b[key], t, out[key]);
  return out;
}
export function copyControls(a, out) { return blendControls(a, a, 0, out); }

const sole = [0, -0.08, 0]; // the sole under the ankle, in the foot's frame
const tA = [0, 0, 0], tB = [0, 0, 0], tC = [0, 0, 0], tQ = [0, 0, 0, 1];
const hip = [0, 0, 0], knee = [0, 0, 0], ankle = [0, 0, 0], reached = [0, 0, 0];
const shoulder = [0, 0, 0], elbow = [0, 0, 0], wrist = [0, 0, 0], joint = [0, 0, 0];

// A segment hung from a joint: its centre is the joint plus its rest offset
// from that joint, turned with it.
function hang(pose, name, jointWorld, jointRest, q) {
  const i = SEGMENT[name];
  const c = SEGMENT_CENTRE[name];
  tA[0] = c[0] - jointRest[0]; tA[1] = c[1] - jointRest[1]; tA[2] = c[2] - jointRest[2];
  qRotate(q, tA, tA);
  add(jointWorld, tA, pose.position[i]);
  const r = pose.rotation[i];
  r[0] = q[0]; r[1] = q[1]; r[2] = q[2]; r[3] = q[3];
}
// A joint's place in the board frame, from the segment that carries it.
function jointOf(pose, name, jointRest, out) {
  const i = SEGMENT[name];
  const c = SEGMENT_CENTRE[name];
  tA[0] = jointRest[0] - c[0]; tA[1] = jointRest[1] - c[1]; tA[2] = jointRest[2] - c[2];
  qRotate(pose.rotation[i], tA, tA);
  return add(pose.position[i], tA, out);
}

const hingeAxis = [0, 0, 0];
function limb(pose, upperName, lowerName, rootJoint, target, l1, l2, pole, middleOut, endOut) {
  twoBone(rootJoint, target, l1, l2, pole, middleOut, endOut);
  hingeOf(sub(endOut, rootJoint, tB), pole, hingeAxis);
  sub(rootJoint, middleOut, tB);
  boneBasis(tB, hingeAxis, tQ); qMul(tQ, REST_BASIS[upperName], tQ);
  const upperRest = upperName.startsWith('thigh') ? REST[`hip${upperName.slice(-1)}`] : REST[`shoulder${upperName.slice(-1)}`];
  hang(pose, upperName, rootJoint, upperRest, tQ);
  sub(middleOut, endOut, tB);
  boneBasis(tB, hingeAxis, tQ); qMul(tQ, REST_BASIS[lowerName], tQ);
  const lowerRest = lowerName.startsWith('shin') ? REST[`knee${lowerName.slice(-1)}`] : REST[`elbow${lowerName.slice(-1)}`];
  hang(pose, lowerName, middleOut, lowerRest, tQ);
}

// Build every segment from the controls.
export function solvePose(controls, pose) {
  const pelvisIndex = SEGMENT.pelvis;
  copy(controls.pelvis, pose.position[pelvisIndex]);
  const pq = pose.rotation[pelvisIndex];
  pq[0] = controls.pelvisQ[0]; pq[1] = controls.pelvisQ[1]; pq[2] = controls.pelvisQ[2]; pq[3] = controls.pelvisQ[3];
  // The spine: each segment turned from the one below at its joint.
  const qa = [0, 0, 0, 1], qc = [0, 0, 0, 1], qh = [0, 0, 0, 1];
  qMul(pq, controls.lumbarQ, qa);
  jointOf(pose, 'pelvis', REST.lumbar, joint);
  hang(pose, 'abdomen', joint, REST.lumbar, qa);
  qMul(qa, controls.thoracicQ, qc);
  jointOf(pose, 'abdomen', REST.thoracic, joint);
  hang(pose, 'chest', joint, REST.thoracic, qc);
  qMul(qc, controls.neckQ, qh);
  jointOf(pose, 'chest', REST.neck, joint);
  hang(pose, 'head', joint, REST.neck, qh);
  // The legs, from the hips to the ankles over the soles.
  for (const side of ['L', 'R']) {
    const footQ = controls[`footQ${side}`];
    qRotate(footQ, sole, tC);
    sub(controls[`sole${side}`], tC, ankle);
    jointOf(pose, 'pelvis', REST[`hip${side}`], hip);
    limb(pose, `thigh${side}`, `shin${side}`, hip, ankle, BONES.thigh, BONES.shin, controls[`kneePole${side}`], knee, reached);
    hang(pose, `foot${side}`, reached, REST[`ankle${side}`], footQ);
    // The arms, from the shoulders to the wrists.
    jointOf(pose, 'chest', REST[`shoulder${side}`], shoulder);
    limb(pose, `upperArm${side}`, `forearm${side}`, shoulder, controls[`hand${side}`], BONES.upperArm, BONES.forearm, controls[`elbowPole${side}`], elbow, wrist);
  }
  return pose;
}

// --- postures --------------------------------------------------------------------

// Standing: facing the board's −X rail, left foot forward. Its rotation from
// the rest pose (facing +Z) is a quarter turn about +Y the other way.
const STAND_BASE = qFromAxisAngle([0, 1, 0], -Math.PI / 2);
// Lying on the board, head to the nose, face down.
const PRONE_BASE = qFromAxisAngle([1, 0, 0], Math.PI / 2);
const Y = [0, 1, 0], X = [1, 0, 0], Z = [0, 0, 1];

// The stance on a board of `length`: the back foot over the fins, the front
// foot a shoulder-and-a-half ahead of it.
export function stanceOf(length) {
  const back = -length / 2 + 0.33;
  return { back, front: back + 0.58, centre: back + 0.29 };
}

// A point in the rider's standing frame (x his left = the nose, y up, z his
// front = the board's −X) to the board frame.
function fromStand(x, y, z, deck, stanceZ, out) {
  out[0] = -z; out[1] = deck + y; out[2] = stanceZ + x;
  return out;
}

// Standing controls. p: { crouch 0..1, lean −1..1 (+ toeside), trim −1..1,
// grab 0..1, lookBack 0..1, sink (m the legs give under an impact), sway (m
// the hips are thrown toward his front, + by a carve), armsLift 0..1 }.
// board: { length, deckY(x, z) }.
const qTmp = [0, 0, 0, 1], qTmp2 = [0, 0, 0, 1];
export function standControls(board, p, out) {
  const { back, front, centre } = stanceOf(board.length);
  const deckBack = board.deckY(0, back), deckFront = board.deckY(0, front), deck = board.deckY(0, centre);
  const lean = clamp(p.lean ?? 0, -1, 1), toe = Math.max(lean, 0), heel = Math.max(-lean, 0);
  const crouch = clamp(p.crouch ?? 0, 0, 1), trim = clamp(p.trim ?? 0, -1, 1), grab = clamp(p.grab ?? 0, 0, 1);
  // Soles on the deck: the back foot square across the stringer, the front
  // one turned 28° toward the nose.
  out.soleR[0] = 0; out.soleR[1] = deckBack + 0.004; out.soleR[2] = back;
  out.soleL[0] = 0; out.soleL[1] = deckFront + 0.004; out.soleL[2] = front;
  footOn(Math.PI / 2 + 4 * DEG, out.footQR);
  footOn(Math.PI / 2 - 28 * DEG, out.footQL);
  // The hips: over the middle of the stance, a little toward the back foot,
  // lower the deeper he crouches, forward over his toes on a toeside carve and
  // sat back over his heels on a heelside one.
  const height = 0.83 - 0.25 * crouch - 0.08 * toe - 0.13 * heel - 0.06 * grab - (p.sink ?? 0);
  const across = 0.03 + 0.1 * toe - 0.13 * heel + (p.sway ?? 0);
  fromStand(-0.035 + 0.11 * trim, height, across, deck, centre, out.pelvis);
  // Hips open a little toward the nose, tipped forward with the crouch.
  qFromAxisAngle(Y, 14 * DEG + 6 * DEG * trim, qTmp);
  qFromAxisAngle(X, (12 + 16 * crouch + 8 * toe - 4 * heel) * DEG, qTmp2);
  qMul(STAND_BASE, qTmp, out.pelvisQ); qMul(out.pelvisQ, qTmp2, out.pelvisQ);
  // The spine bends forward and turns the shoulders to the nose; a carve
  // leads with them.
  const twist = 12 * DEG + 10 * DEG * lean;
  qFromAxisAngle(Y, twist, qTmp); qFromAxisAngle(X, (14 + 18 * crouch + 10 * toe) * DEG, qTmp2);
  qMul(qTmp, qTmp2, out.lumbarQ);
  qFromAxisAngle(Y, twist * 0.8 - 14 * DEG * (p.lookBack ?? 0), qTmp); qFromAxisAngle(X, (6 + 8 * crouch) * DEG, qTmp2);
  qMul(qTmp, qTmp2, out.thoracicQ);
  // The head looks where he goes — down the line, over the front shoulder —
  // or back over the other one at the wave behind.
  const look = lerp(52 * DEG, -58 * DEG, p.lookBack ?? 0);
  qFromAxisAngle(Y, look, qTmp); qFromAxisAngle(X, (-10 - 12 * crouch) * DEG, qTmp2);
  qMul(qTmp, qTmp2, out.neckQ);
  // Knees over the toes; the back knee turned in toward the front one.
  footForward(out.footQL, out.kneePoleL); out.kneePoleL[2] += 0.2;
  footForward(out.footQR, out.kneePoleR); out.kneePoleR[2] += 0.45;
  normalize(out.kneePoleL); normalize(out.kneePoleR);
  // Arms for balance: the front one reaching down the line toward the nose,
  // the back one low behind; lower with the crouch, the front hand dropping
  // to the rail on a grab.
  const drop = 0.28 * crouch + 0.1 * heel + 0.06 * toe;
  const lift = 0.1 * (p.armsLift ?? 0);
  fromStand(0.55, 1.06 - drop + lift, 0.3 + 0.12 * toe + 0.22 * heel, deck, centre, out.handL);
  fromStand(-0.42, 0.9 - drop + lift, 0.12 + 0.1 * toe - 0.08 * heel, deck, centre, out.handR);
  if (grab > 0) {
    // The back hand to the rail: under his toes on a toeside turn, behind his
    // heels on a heelside one.
    const rail = board.halfWidth ? board.halfWidth(back + 0.18) : 0.24;
    fromStand(-0.22, 0.05, lean >= 0 ? rail : -rail, board.deckY(rail * (lean >= 0 ? -1 : 1), back + 0.18), centre, tA);
    lerp3(out.handR, tA, smoothstep(0, 1, grab), out.handR);
  }
  fromStand(0.4, -1, -0.6, 0, 0, out.elbowPoleL); normalize(out.elbowPoleL);
  fromStand(-0.5, -1, -0.5, 0, 0, out.elbowPoleR); normalize(out.elbowPoleR);
  return out;
}

// A foot flat on the deck, toes turned `yaw` from the board's +Z toward −X
// (π/2 is square across the stringer, toes over the −X rail).
function footOn(yaw, out) {
  return qFromAxisAngle(Y, -yaw, out);
}
function footForward(q, out) {
  return qRotate(q, Z, out);
}

// Lying, paddling. p: { strokeL, strokeR: the phase 0..1 of each arm's
// stroke or −1 resting on the rail, arch 0..1 (chest up), kick 0..1 }.
export function proneControls(board, p, out) {
  const chestZ = 0.08 + 0.0 * board.length;
  const deck = (z) => board.deckY(0, z);
  const arch = clamp(p.arch ?? 0.6, 0, 1);
  // Pelvis flat on the deck, chest raised by the arch of the back.
  const pelvisZ = chestZ - 0.37;
  out.pelvis[0] = 0; out.pelvis[1] = deck(pelvisZ) + 0.1; out.pelvis[2] = pelvisZ;
  qFromAxisAngle(X, -4 * DEG, qTmp);
  qMul(PRONE_BASE, qTmp, out.pelvisQ);
  qFromAxisAngle(X, -(10 + 14 * arch) * DEG, out.lumbarQ);
  qFromAxisAngle(X, -(6 + 10 * arch) * DEG, out.thoracicQ);
  qFromAxisAngle(X, -(25 + 20 * arch) * DEG, out.neckQ);
  // Legs together along the board, feet just off the tail, toes pointed.
  const tail = -board.length / 2;
  const kick = p.kick ?? 0;
  for (const [side, x] of [['L', 0.07], ['R', -0.07]]) {
    const s = out[`sole${side}`];
    s[0] = x; s[1] = deck(Math.max(tail + 0.05, pelvisZ - 0.8)) + 0.12 + 0.05 * kick; s[2] = pelvisZ - 0.86;
    // Relaxed, the toes hang down and back from the ankle.
    qFromAxisAngle(X, 0.65, qTmp);
    qMul(PRONE_BASE, qTmp, out[`footQ${side}`]);
    const pole = out[`kneePole${side}`];
    pole[0] = 0; pole[1] = -1; pole[2] = 0.1;
  }
  // Arms: each a stroke — in the water beside the rail from ahead of the
  // shoulder to the hip, out of it and forward again — or resting on the rail.
  const shoulderZ = chestZ + 0.1;
  const rail = board.halfWidth ? board.halfWidth(shoulderZ) : 0.24;
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const phase = p[`stroke${side}`];
    const hand = out[`hand${side}`];
    if (phase == null || phase < 0) {
      hand[0] = sign * (rail - 0.02); hand[1] = deck(shoulderZ) + 0.03; hand[2] = shoulderZ - 0.08;
    } else if (phase < 0.55) {
      const t = phase / 0.55;
      hand[0] = sign * (rail + 0.08); hand[1] = deck(shoulderZ) - 0.12 - 0.22 * Math.sin(Math.PI * t); hand[2] = shoulderZ + 0.42 - 0.8 * t;
    } else {
      const t = (phase - 0.55) / 0.45;
      hand[0] = sign * (rail + 0.14 + 0.08 * Math.sin(Math.PI * t)); hand[1] = deck(shoulderZ) + 0.02 + 0.22 * Math.sin(Math.PI * t); hand[2] = shoulderZ - 0.38 + 0.8 * t;
    }
    const pole = out[`elbowPole${side}`];
    pole[0] = sign * 0.6; pole[1] = 0.8; pole[2] = -0.2;
    normalize(pole);
  }
  return out;
}

// Swimming, in a frame of his own: +Z the way he swims, y = 0 the water's
// surface, the pelvis over x = z = 0. Head-up crawl — the stroke lifeguards
// and surfers swim to a board with, eyes on it: face forward just above the
// water, arms turning over in turn, legs in a flutter kick.
// p: { strokeL, strokeR (0..1 phase of each arm), kick (phase 0..1), lift 0..1
// (how far the head is held up) }.
export function swimControls(p, out) {
  out.pelvis[0] = 0; out.pelvis[1] = -0.16; out.pelvis[2] = 0;
  qFromAxisAngle(X, 6 * DEG, qTmp);
  qMul(PRONE_BASE, qTmp, out.pelvisQ);
  const lift = clamp(p.lift ?? 1, 0, 1);
  qFromAxisAngle(X, -(8 + 8 * lift) * DEG, out.lumbarQ);
  qFromAxisAngle(X, -(6 + 8 * lift) * DEG, out.thoracicQ);
  // The head rolls a little with the arms, held up to see where he goes.
  const roll = Math.sin(2 * Math.PI * (p.strokeL ?? 0)) * 8 * DEG;
  qFromAxisAngle(Z, roll, qTmp);
  qFromAxisAngle(X, -(22 + 26 * lift) * DEG, qTmp2);
  qMul(qTmp, qTmp2, out.neckQ);
  // Flutter kick: each leg up and down from the hip, half a beat apart, toes
  // pointed back.
  const kick = p.kick ?? 0;
  for (const [side, x, beat] of [['L', 0.09, 0], ['R', -0.09, 0.5]]) {
    const s = out[`sole${side}`];
    s[0] = x; s[1] = -0.3 + 0.13 * Math.sin(2 * Math.PI * (kick + beat)); s[2] = -0.9;
    qFromAxisAngle(X, 0.75, qTmp);
    qMul(PRONE_BASE, qTmp, out[`footQ${side}`]);
    const pole = out[`kneePole${side}`];
    pole[0] = 0; pole[1] = -1; pole[2] = -0.1;
  }
  // Crawl: in ahead of the shoulder, pulled down and back under the chest to
  // the hip, out of the water there and swung forward over it, elbow high.
  const shoulderZ = 0.47;
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const phase = ((p[`stroke${side}`] ?? 0) % 1 + 1) % 1;
    const hand = out[`hand${side}`];
    const pole = out[`elbowPole${side}`];
    if (phase < 0.5) {
      const t = phase / 0.5;
      hand[0] = sign * (0.16 + 0.06 * Math.sin(Math.PI * t));
      hand[1] = -0.14 - 0.3 * Math.sin(Math.PI * t);
      hand[2] = shoulderZ + 0.52 - 0.95 * smoothstep(0, 1, t);
      pole[0] = sign * 0.7; pole[1] = 0.7; pole[2] = 0;
    } else {
      const t = (phase - 0.5) / 0.5;
      hand[0] = sign * (0.26 + 0.12 * Math.sin(Math.PI * t));
      hand[1] = -0.12 + 0.36 * Math.sin(Math.PI * t);
      hand[2] = shoulderZ - 0.43 + 0.95 * smoothstep(0, 1, t);
      pole[0] = sign * 0.35; pole[1] = 1; pole[2] = -0.2;
    }
    normalize(pole);
  }
  return out;
}

// Getting up: t 0..1 from lying (with the hands pressed on the deck by the
// chest) to standing. Each part moves on its own clock, as a real pop-up
// goes: chest up on straight arms, the feet swung through under him, then up.
const popA = createControls(), popB = createControls();
export function popUpControls(board, t, standParams, out) {
  proneControls(board, { strokeL: -1, strokeR: -1, arch: 1 }, popA);
  // Hands flat on the deck beside the chest, pushing.
  const chestZ = 0.08;
  popA.handL[0] = 0.16; popA.handL[1] = board.deckY(0.16, chestZ) + 0.01; popA.handL[2] = chestZ;
  popA.handR[0] = -0.16; popA.handR[1] = board.deckY(-0.16, chestZ) + 0.01; popA.handR[2] = chestZ;
  standControls(board, { ...standParams, crouch: Math.max(standParams.crouch ?? 0, 0.55) }, popB);
  const body = smoothstep(0.08, 0.9, t);
  const feet = smoothstep(0.3, 0.78, t);
  const hands = smoothstep(0.55, 1, t);
  blendControls(popA, popB, body, out);
  // The feet on their own, later clock, lifted as they swing through.
  lerp3(popA.soleL, popB.soleL, feet, out.soleL);
  lerp3(popA.soleR, popB.soleR, feet, out.soleR);
  const swing = 0.16 * Math.sin(Math.PI * feet);
  out.soleL[1] += swing; out.soleR[1] += swing;
  qSlerp(popA.footQL, popB.footQL, feet, out.footQL);
  qSlerp(popA.footQR, popB.footQR, feet, out.footQR);
  // The hands stay pressed until the feet are under him.
  lerp3(popA.handL, popB.handL, hands, out.handL);
  lerp3(popA.handR, popB.handR, hands, out.handR);
  // The chest pushed up on straight arms before the hips follow.
  const push = 0.28 * Math.sin(Math.PI * smoothstep(0, 0.6, t));
  out.pelvis[1] += push * 0.35;
  return out;
}

// The joint targets for the muscles: each child's rotation in its parent's
// frame, read off a pose.
export function jointTargets(pose, joints, out) {
  for (let i = 0; i < joints.length; i += 1) {
    const j = joints[i];
    const parentQ = pose.rotation[SEGMENT[j.parent]];
    const childQ = pose.rotation[SEGMENT[j.child]];
    qConj(parentQ, qTmp);
    qMul(qTmp, childQ, out[i]);
  }
  return out;
}

export { STAND_BASE, PRONE_BASE };
