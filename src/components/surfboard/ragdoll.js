// A small rigid-body world for one articulated body: the rider's skeleton.
//
// It is Extended Position Based Dynamics (Müller et al. 2020, «Detailed Rigid
// Body Simulation with Extended Position Based Dynamics»): every substep the
// bodies are moved ballistically, the constraints then move them straight back
// to where they must be, and the velocities are read off what happened. A
// joint therefore never stretches, at any mass ratio, and a muscle is a
// compliance — how far a torque bends it — rather than a force that could
// overshoot and blow up. Many small substeps of one pass each are both stabler
// and cheaper than many solver iterations.
//
// Frames. Every body has its own frame; in the skeleton's rest pose all of them
// are the world frame (identity rotations), so an axis written for a joint in
// the rest pose is the same vector in the parent's and the child's frame.
// Quaternions are [x, y, z, w], body → world.
//
// A body is either dynamic or kinematic. A kinematic body has no inverse mass:
// the caller moves it (from a pose to a pose over the frame) and the joints to
// it pull the dynamic bodies along. That is how the rider stands confidently on
// his board — pelvis and feet go where the pose says, knees, spine, arms and
// head follow on muscles — and a fall is nothing more than making them dynamic.
//
// Nothing here knows about water, boards or three.js: forces come in through a
// callback, the ground through a height function.

const EPS = 1e-9;

// --- quaternions and vectors (plain arrays, no allocation in the step) ------

export function qMul(a, b, out) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
export function qConj(a, out) {
  out[0] = -a[0]; out[1] = -a[1]; out[2] = -a[2]; out[3] = a[3];
  return out;
}
export function qNormalize(q) {
  const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}
// v rotated by q, into out (out may be v).
export function qRotate(q, v, out) {
  const x = v[0], y = v[1], z = v[2];
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + qy * tz - qz * ty;
  out[1] = y + qw * ty + qz * tx - qx * tz;
  out[2] = z + qw * tz + qx * ty - qy * tx;
  return out;
}
// v rotated by the inverse of q.
export function qRotateInverse(q, v, out) {
  const x = v[0], y = v[1], z = v[2];
  const qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + qy * tz - qz * ty;
  out[1] = y + qw * ty + qz * tx - qx * tz;
  out[2] = z + qw * tz + qx * ty - qy * tx;
  return out;
}
// The rotation vector (axis × angle, the short way round) of q.
export function qToRotationVector(q, out) {
  let x = q[0], y = q[1], z = q[2], w = q[3];
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-12) { out[0] = 2 * x; out[1] = 2 * y; out[2] = 2 * z; return out; }
  const angle = 2 * Math.atan2(s, w);
  out[0] = x / s * angle; out[1] = y / s * angle; out[2] = z / s * angle;
  return out;
}
export function qFromAxisAngle(axis, angle, out = [0, 0, 0, 1]) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2) / l;
  out[0] = axis[0] * s; out[1] = axis[1] * s; out[2] = axis[2] * s; out[3] = Math.cos(angle / 2);
  return out;
}
export function qSlerp(a, b, t, out) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0, k1;
  if (cos > 0.9995) { k0 = 1 - t; k1 = t; } else {
    const angle = Math.acos(cos), s = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / s; k1 = Math.sin(t * angle) / s;
  }
  out[0] = a[0] * k0 + bx * k1; out[1] = a[1] * k0 + by * k1; out[2] = a[2] * k0 + bz * k1; out[3] = a[3] * k0 + bw * k1;
  return qNormalize(out);
}
const cross = (a, b, out) => {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// --- bodies ------------------------------------------------------------------

// size: the collision box's full extents [x, y, z] in the body frame, metres.
export function createRagdollBody({ name, mass, size, position = [0, 0, 0], quaternion = [0, 0, 0, 1], kinematic = false }) {
  const [sx, sy, sz] = size;
  const I = [mass * (sy * sy + sz * sz) / 12, mass * (sx * sx + sz * sz) / 12, mass * (sx * sx + sy * sy) / 12];
  const body = {
    name, mass, size: [sx, sy, sz], half: [sx / 2, sy / 2, sz / 2],
    invMass: 0, invInertia: [0, 0, 0], inertia: I,
    x: [...position], q: qNormalize([...quaternion]), v: [0, 0, 0], w: [0, 0, 0],
    px: [0, 0, 0], pq: [0, 0, 0, 1],
    f: [0, 0, 0], t: [0, 0, 0],
    kinematic: false,
    // A kinematic body travels from (fromX, fromQ) to (toX, toQ) over a step.
    fromX: [...position], fromQ: qNormalize([...quaternion]), toX: [...position], toQ: qNormalize([...quaternion]),
  };
  setKinematic(body, kinematic);
  return body;
}

export function setKinematic(body, kinematic) {
  body.kinematic = kinematic;
  body.invMass = kinematic ? 0 : 1 / body.mass;
  body.invInertia = kinematic ? [0, 0, 0] : body.inertia.map((i) => 1 / i);
  if (kinematic) {
    body.fromX[0] = body.x[0]; body.fromX[1] = body.x[1]; body.fromX[2] = body.x[2];
    body.fromQ[0] = body.q[0]; body.fromQ[1] = body.q[1]; body.fromQ[2] = body.q[2]; body.fromQ[3] = body.q[3];
    body.toX[0] = body.x[0]; body.toX[1] = body.x[1]; body.toX[2] = body.x[2];
    body.toQ[0] = body.q[0]; body.toQ[1] = body.q[1]; body.toQ[2] = body.q[2]; body.toQ[3] = body.q[3];
  }
}

// Where a kinematic body must be at the end of the next step.
export function driveKinematic(body, position, quaternion) {
  body.fromX[0] = body.x[0]; body.fromX[1] = body.x[1]; body.fromX[2] = body.x[2];
  body.fromQ[0] = body.q[0]; body.fromQ[1] = body.q[1]; body.fromQ[2] = body.q[2]; body.fromQ[3] = body.q[3];
  body.toX[0] = position[0]; body.toX[1] = position[1]; body.toX[2] = position[2];
  body.toQ[0] = quaternion[0]; body.toQ[1] = quaternion[1]; body.toQ[2] = quaternion[2]; body.toQ[3] = quaternion[3];
  if (dot4(body.fromQ, body.toQ) < 0) { body.toQ[0] = -body.toQ[0]; body.toQ[1] = -body.toQ[1]; body.toQ[2] = -body.toQ[2]; body.toQ[3] = -body.toQ[3]; }
}
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

// Teleport a body (a respawn, a pose set outright), at rest.
export function placeBody(body, position, quaternion) {
  body.x[0] = position[0]; body.x[1] = position[1]; body.x[2] = position[2];
  body.q[0] = quaternion[0]; body.q[1] = quaternion[1]; body.q[2] = quaternion[2]; body.q[3] = quaternion[3];
  qNormalize(body.q);
  body.v[0] = 0; body.v[1] = 0; body.v[2] = 0; body.w[0] = 0; body.w[1] = 0; body.w[2] = 0;
  if (body.kinematic) setKinematic(body, true);
}

// A world point of a body from a point in its frame.
export function bodyPoint(body, local, out) {
  qRotate(body.q, local, out);
  out[0] += body.x[0]; out[1] += body.x[1]; out[2] += body.x[2];
  return out;
}

// --- the world -----------------------------------------------------------------

// joints: [{ parent, child (body indices), anchor: [x,y,z] (the joint centre in
// the rest pose, world = both frames' origin offsets are taken from it),
// type: 'ball' | 'hinge', axis (rest world: the child's bone for a ball, the
// hinge axis), coneAxis (a ball's cone centre on the parent's side, rest
// world; default axis — a shoulder's cone points out and forward, its arm down),
// ref (a rest world vector perpendicular to axis, for twist and hinge angles),
// swing (ball: cone half-angle, rad), twist: [min, max] (ball, rad),
// range: [min, max] (hinge, rad), stiffness (N·m/rad), damping (1/s) }]
export function createRagdoll(bodies, jointSpecs) {
  const joints = jointSpecs.map((spec) => {
    const parent = bodies[spec.parent], child = bodies[spec.child];
    const toLocal = (body, point) => {
      const d = [point[0] - body.x[0], point[1] - body.x[1], point[2] - body.x[2]];
      return qRotateInverse(body.q, d, d);
    };
    const axis = normalized(spec.axis);
    const coneAxis = normalized(spec.coneAxis ?? spec.axis);
    const ref = normalized(spec.ref);
    return {
      ...spec,
      parentBody: parent,
      childBody: child,
      localParent: toLocal(parent, spec.anchor),
      localChild: toLocal(child, spec.anchor),
      // The axes in each frame: the rest pose has every frame equal to the world.
      axisParent: qRotateInverse(parent.q, coneAxis, [0, 0, 0]),
      axisChild: qRotateInverse(child.q, axis, [0, 0, 0]),
      refParent: qRotateInverse(parent.q, ref, [0, 0, 0]),
      refChild: qRotateInverse(child.q, ref, [0, 0, 0]),
      // The drive's target: the child's rotation in the parent's frame.
      target: [0, 0, 0, 1],
      stiffness: spec.stiffness ?? 0,
      damping: spec.damping ?? 0,
    };
  });
  return {
    bodies,
    joints,
    // Pins pull a body point to a world point and its rotation to a world
    // rotation, each with its own compliance: a hand on the rail, a body
    // pulled back onto the board. { body, local, target, stiffness, damping,
    // targetQ, angularStiffness, targetV }
    pins: [],
    gravity: -9.81,
    contacts: 0,
  };
}

const normalized = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// --- the corrections ------------------------------------------------------------

const r1 = [0, 0, 0], r2 = [0, 0, 0], tmp = [0, 0, 0], tmp2 = [0, 0, 0], tmp3 = [0, 0, 0];
const tq = [0, 0, 0, 1], tq2 = [0, 0, 0, 1], dq = [0, 0, 0, 1];
const p1 = [0, 0, 0], p2 = [0, 0, 0];

// The inverse inertia applied to a world vector: R · I⁻¹ · Rᵀ · v.
function inverseInertiaTimes(body, v, out) {
  qRotateInverse(body.q, v, out);
  out[0] *= body.invInertia[0]; out[1] *= body.invInertia[1]; out[2] *= body.invInertia[2];
  return qRotate(body.q, out, out);
}
// How easily a body gives way along n at arm r (world): 1/m + (r×n)·I⁻¹(r×n).
function generalizedInverseMass(body, r, n) {
  if (!body || body.invMass === 0) return 0;
  cross(r, n, tmp);
  inverseInertiaTimes(body, tmp, tmp2);
  return body.invMass + dot(tmp, tmp2);
}
// A small rotation by the vector a (world) applied to q.
function rotateBy(body, a, sign) {
  // q += ½ [a, 0] q
  const ax = a[0] * sign * 0.5, ay = a[1] * sign * 0.5, az = a[2] * sign * 0.5;
  const q = body.q;
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  q[0] += ax * qw + ay * qz - az * qy;
  q[1] += ay * qw + az * qx - ax * qz;
  q[2] += az * qw + ax * qy - ay * qx;
  q[3] += -ax * qx - ay * qy - az * qz;
  qNormalize(q);
}

// Move body point `ra` (world arm) on b1 by `e` (world): the displacement b1's
// point must make toward b2's (or toward a fixed point when b2 is null). The
// compliance α (m/N) makes it a spring: α̃ = α/h². Returns Δλ (an impulse·h).
function positional(b1, ra, b2, rb, e, compliance, h) {
  const c = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
  if (c < EPS) return 0;
  const n0 = e[0] / c, n1 = e[1] / c, n2 = e[2] / c;
  tmp3[0] = n0; tmp3[1] = n1; tmp3[2] = n2;
  const w1 = generalizedInverseMass(b1, ra, tmp3);
  const w2 = b2 ? generalizedInverseMass(b2, rb, tmp3) : 0;
  const alpha = compliance / (h * h);
  const denominator = w1 + w2 + alpha;
  if (denominator < EPS) return 0;
  const lambda = c / denominator;
  const px = n0 * lambda, py = n1 * lambda, pz = n2 * lambda;
  if (b1.invMass > 0) {
    b1.x[0] += px * b1.invMass; b1.x[1] += py * b1.invMass; b1.x[2] += pz * b1.invMass;
    tmp[0] = px; tmp[1] = py; tmp[2] = pz;
    cross(ra, tmp, tmp2);
    inverseInertiaTimes(b1, tmp2, tmp2);
    rotateBy(b1, tmp2, 1);
  }
  if (b2 && b2.invMass > 0) {
    b2.x[0] -= px * b2.invMass; b2.x[1] -= py * b2.invMass; b2.x[2] -= pz * b2.invMass;
    tmp[0] = px; tmp[1] = py; tmp[2] = pz;
    cross(rb, tmp, tmp2);
    inverseInertiaTimes(b2, tmp2, tmp2);
    rotateBy(b2, tmp2, -1);
  }
  return lambda;
}

// Rotate b1 by the rotation vector `e` (world, axis × angle) and b2 back.
function angular(b1, b2, e, compliance, h) {
  const theta = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
  if (theta < EPS) return 0;
  tmp3[0] = e[0] / theta; tmp3[1] = e[1] / theta; tmp3[2] = e[2] / theta;
  let w1 = 0, w2 = 0;
  if (b1 && b1.invMass > 0) { inverseInertiaTimes(b1, tmp3, tmp); w1 = dot(tmp3, tmp); }
  if (b2 && b2.invMass > 0) { inverseInertiaTimes(b2, tmp3, tmp); w2 = dot(tmp3, tmp); }
  const alpha = compliance / (h * h);
  const denominator = w1 + w2 + alpha;
  if (denominator < EPS) return 0;
  const lambda = theta / denominator;
  tmp2[0] = tmp3[0] * lambda; tmp2[1] = tmp3[1] * lambda; tmp2[2] = tmp3[2] * lambda;
  if (b1 && b1.invMass > 0) { inverseInertiaTimes(b1, tmp2, tmp); rotateBy(b1, tmp, 1); }
  if (b2 && b2.invMass > 0) { inverseInertiaTimes(b2, tmp2, tmp); rotateBy(b2, tmp, -1); }
  return lambda;
}

const aP = [0, 0, 0], aC = [0, 0, 0], rP = [0, 0, 0], rC = [0, 0, 0], nAvg = [0, 0, 0], corr = [0, 0, 0];

// The signed angle from u to v about n, both first flattened onto the plane of n.
function signedAngle(u, v, n) {
  const du = dot(u, n), dv = dot(v, n);
  const ux = u[0] - n[0] * du, uy = u[1] - n[1] * du, uz = u[2] - n[2] * du;
  const vx = v[0] - n[0] * dv, vy = v[1] - n[1] * dv, vz = v[2] - n[2] * dv;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return Math.atan2(cx * n[0] + cy * n[1] + cz * n[2], ux * vx + uy * vy + uz * vz);
}

function solveJoint(joint, h) {
  const P = joint.parentBody, C = joint.childBody;
  // The drive (the muscle): the child toward its target rotation in the parent.
  if (joint.stiffness > 0) {
    qMul(P.q, joint.target, tq);
    qConj(C.q, tq2);
    qMul(tq, tq2, dq);             // world rotation from the child's now to its target
    qToRotationVector(dq, corr);
    angular(C, P, corr, 1 / joint.stiffness, h);
  }
  if (joint.type === 'hinge') {
    // The hinge axes held together, then the bend inside its range.
    qRotate(P.q, joint.axisParent, aP);
    qRotate(C.q, joint.axisChild, aC);
    cross(aC, aP, corr);
    angular(C, P, corr, 0, h);
    qRotate(P.q, joint.axisParent, aP);
    qRotate(P.q, joint.refParent, rP);
    qRotate(C.q, joint.refChild, rC);
    const angle = signedAngle(rP, rC, aP);
    const limited = Math.min(Math.max(angle, joint.range[0]), joint.range[1]);
    if (limited !== angle) {
      corr[0] = aP[0] * (limited - angle); corr[1] = aP[1] * (limited - angle); corr[2] = aP[2] * (limited - angle);
      angular(C, P, corr, 0, h);
    }
  } else {
    // The swing inside its cone about the parent's axis.
    qRotate(P.q, joint.axisParent, aP);
    qRotate(C.q, joint.axisChild, aC);
    const cos = Math.min(Math.max(dot(aP, aC), -1), 1);
    const swing = Math.acos(cos);
    if (swing > joint.swing) {
      cross(aC, aP, corr);
      const l = Math.sqrt(dot(corr, corr));
      if (l > EPS) {
        const k = (swing - joint.swing) / l;
        corr[0] *= k; corr[1] *= k; corr[2] *= k;
        angular(C, P, corr, 0, h);
      }
    }
    // The twist about the mean of the two axes, inside its range.
    if (joint.twist) {
      qRotate(P.q, joint.axisParent, aP);
      qRotate(C.q, joint.axisChild, aC);
      nAvg[0] = aP[0] + aC[0]; nAvg[1] = aP[1] + aC[1]; nAvg[2] = aP[2] + aC[2];
      const l = Math.sqrt(dot(nAvg, nAvg));
      if (l > 1e-3) {
        nAvg[0] /= l; nAvg[1] /= l; nAvg[2] /= l;
        qRotate(P.q, joint.refParent, rP);
        qRotate(C.q, joint.refChild, rC);
        const angle = signedAngle(rP, rC, nAvg);
        const limited = Math.min(Math.max(angle, joint.twist[0]), joint.twist[1]);
        if (limited !== angle) {
          corr[0] = nAvg[0] * (limited - angle); corr[1] = nAvg[1] * (limited - angle); corr[2] = nAvg[2] * (limited - angle);
          angular(C, P, corr, 0, h);
        }
      }
    }
  }
  // Last, the joint's centre: the one constraint that must hold exactly.
  qRotate(P.q, joint.localParent, r1);
  qRotate(C.q, joint.localChild, r2);
  p1[0] = P.x[0] + r1[0]; p1[1] = P.x[1] + r1[1]; p1[2] = P.x[2] + r1[2];
  p2[0] = C.x[0] + r2[0]; p2[1] = C.x[1] + r2[1]; p2[2] = C.x[2] + r2[2];
  corr[0] = p1[0] - p2[0]; corr[1] = p1[1] - p2[1]; corr[2] = p1[2] - p2[2];
  positional(C, r2, P, r1, corr, 0, h);
}

function solvePin(pin, h) {
  const body = pin.body;
  if (body.invMass === 0) return;
  if (pin.stiffness > 0) {
    qRotate(body.q, pin.local, r1);
    corr[0] = pin.target[0] - body.x[0] - r1[0];
    corr[1] = pin.target[1] - body.x[1] - r1[1];
    corr[2] = pin.target[2] - body.x[2] - r1[2];
    positional(body, r1, null, null, corr, 1 / pin.stiffness, h);
  }
  if (pin.angularStiffness > 0 && pin.targetQ) {
    qConj(body.q, tq2);
    qMul(pin.targetQ, tq2, dq);
    qToRotationVector(dq, corr);
    angular(body, null, corr, 1 / pin.angularStiffness, h);
  }
}

// --- the ground ---------------------------------------------------------------------

const CORNERS = [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]];
const corner = [0, 0, 0], arm = [0, 0, 0], up = [0, 1, 0];
// Contacts found in the position pass, for friction in the velocity pass.
const contactBody = [], contactArm = [], contactLambda = [];
for (let i = 0; i < 256; i += 1) { contactArm.push([0, 0, 0]); contactBody.push(null); contactLambda.push(0); }

function solveGround(world, ground, h) {
  let count = 0;
  for (const body of world.bodies) {
    if (body.invMass === 0) continue;
    for (const c of CORNERS) {
      corner[0] = c[0] * body.half[0]; corner[1] = c[1] * body.half[1]; corner[2] = c[2] * body.half[2];
      qRotate(body.q, corner, arm);
      const x = body.x[0] + arm[0], y = body.x[1] + arm[1], z = body.x[2] + arm[2];
      const g = ground(x, z);
      if (!(y < g)) continue;
      corr[0] = 0; corr[1] = g - y; corr[2] = 0;
      const lambda = positional(body, arm, null, null, corr, 0, h);
      if (count < contactBody.length) {
        contactBody[count] = body;
        // The arm is recomputed after the correction for the friction pass.
        contactArm[count][0] = c[0] * body.half[0]; contactArm[count][1] = c[1] * body.half[1]; contactArm[count][2] = c[2] * body.half[2];
        contactLambda[count] = lambda;
        count += 1;
      }
    }
  }
  return count;
}

// --- the step -------------------------------------------------------------------------

const vrel = [0, 0, 0], impulse = [0, 0, 0], dw = [0, 0, 0], spin = [0, 0, 0];

// Advance the world by dt in `substeps` equal steps. forces(world, h) may add
// to each body's f and t (world force at the centre and torque, N and N·m)
// before each substep; they are cleared after. ground(x, z) → the height of
// the solid below, or null for none. friction: the ground's Coulomb friction.
export function stepRagdoll(world, dt, { substeps = 12, forces = null, ground = null, friction = 0.6 } = {}) {
  if (!(dt > 0)) return;
  const h = dt / substeps;
  const { bodies, joints, pins } = world;
  for (let s = 0; s < substeps; s += 1) {
    const f = (s + 1) / substeps;
    if (forces) forces(world, h);
    for (const body of bodies) {
      body.px[0] = body.x[0]; body.px[1] = body.x[1]; body.px[2] = body.x[2];
      body.pq[0] = body.q[0]; body.pq[1] = body.q[1]; body.pq[2] = body.q[2]; body.pq[3] = body.q[3];
      if (body.kinematic) {
        body.x[0] = body.fromX[0] + (body.toX[0] - body.fromX[0]) * f;
        body.x[1] = body.fromX[1] + (body.toX[1] - body.fromX[1]) * f;
        body.x[2] = body.fromX[2] + (body.toX[2] - body.fromX[2]) * f;
        qSlerp(body.fromQ, body.toQ, f, body.q);
        continue;
      }
      // Ballistic: gravity, the forces, the gyroscopic term.
      body.v[0] += h * body.f[0] * body.invMass;
      body.v[1] += h * (world.gravity + body.f[1] * body.invMass);
      body.v[2] += h * body.f[2] * body.invMass;
      // ω += h·I⁻¹(τ − ω × Iω), in the body frame.
      qRotateInverse(body.q, body.w, tmp);
      const I = body.inertia;
      const Lx = I[0] * tmp[0], Ly = I[1] * tmp[1], Lz = I[2] * tmp[2];
      qRotateInverse(body.q, body.t, tmp2);
      tmp2[0] -= tmp[1] * Lz - tmp[2] * Ly;
      tmp2[1] -= tmp[2] * Lx - tmp[0] * Lz;
      tmp2[2] -= tmp[0] * Ly - tmp[1] * Lx;
      tmp[0] += h * tmp2[0] * body.invInertia[0];
      tmp[1] += h * tmp2[1] * body.invInertia[1];
      tmp[2] += h * tmp2[2] * body.invInertia[2];
      qRotate(body.q, tmp, body.w);
      body.x[0] += h * body.v[0]; body.x[1] += h * body.v[1]; body.x[2] += h * body.v[2];
      spin[0] = h * body.w[0]; spin[1] = h * body.w[1]; spin[2] = h * body.w[2];
      rotateBy(body, spin, 1);
    }
    for (const joint of joints) solveJoint(joint, h);
    for (const pin of pins) solvePin(pin, h);
    const contacts = ground ? solveGround(world, ground, h) : 0;
    world.contacts = contacts;

    // Velocities from what the corrections did.
    for (const body of bodies) {
      body.v[0] = (body.x[0] - body.px[0]) / h;
      body.v[1] = (body.x[1] - body.px[1]) / h;
      body.v[2] = (body.x[2] - body.px[2]) / h;
      qConj(body.pq, tq2);
      qMul(body.q, tq2, dq);
      const sign = dq[3] < 0 ? -1 : 1;
      body.w[0] = 2 * dq[0] / h * sign; body.w[1] = 2 * dq[1] / h * sign; body.w[2] = 2 * dq[2] / h * sign;
    }

    // Velocity pass: the muscles' damping, the pins' damping, the ground's
    // friction. Each takes away a share of a relative velocity, never more
    // than all of it, so none of them can add energy.
    for (const joint of joints) {
      if (!(joint.damping > 0)) continue;
      const P = joint.parentBody, C = joint.childBody;
      vrel[0] = C.w[0] - P.w[0]; vrel[1] = C.w[1] - P.w[1]; vrel[2] = C.w[2] - P.w[2];
      const speed = Math.sqrt(dot(vrel, vrel));
      if (speed < EPS) continue;
      const k = Math.min(joint.damping * h, 1);
      dw[0] = -vrel[0] * k; dw[1] = -vrel[1] * k; dw[2] = -vrel[2] * k;
      applyAngularVelocityChange(C, P, dw);
    }
    for (const pin of pins) {
      const body = pin.body;
      if (body.invMass === 0 || !(pin.damping > 0)) continue;
      qRotate(body.q, pin.local, r1);
      cross(body.w, r1, tmp);
      vrel[0] = body.v[0] + tmp[0] - (pin.targetV?.[0] ?? 0);
      vrel[1] = body.v[1] + tmp[1] - (pin.targetV?.[1] ?? 0);
      vrel[2] = body.v[2] + tmp[2] - (pin.targetV?.[2] ?? 0);
      const k = Math.min(pin.damping * h, 1);
      impulse[0] = -vrel[0] * k; impulse[1] = -vrel[1] * k; impulse[2] = -vrel[2] * k;
      applyPointVelocityChange(body, r1, impulse);
    }
    for (let i = 0; i < contacts; i += 1) {
      const body = contactBody[i];
      qRotate(body.q, contactArm[i], r1);
      cross(body.w, r1, tmp);
      vrel[0] = body.v[0] + tmp[0]; vrel[1] = body.v[1] + tmp[1]; vrel[2] = body.v[2] + tmp[2];
      const vn = vrel[1];
      const tx = vrel[0], tz = vrel[2];
      const vt = Math.sqrt(tx * tx + tz * tz);
      // No bounce: the ground only ever stops a corner going in.
      if (vn < 0) { impulse[0] = 0; impulse[1] = -vn; impulse[2] = 0; applyPointVelocityChange(body, r1, impulse); }
      if (vt > EPS) {
        const fn = contactLambda[i] / (h * h);
        const cut = Math.min(h * friction * fn * body.invMass, vt);
        impulse[0] = -tx / vt * cut; impulse[1] = 0; impulse[2] = -tz / vt * cut;
        applyPointVelocityChange(body, r1, impulse);
      }
    }
    for (const body of bodies) {
      body.f[0] = 0; body.f[1] = 0; body.f[2] = 0; body.t[0] = 0; body.t[1] = 0; body.t[2] = 0;
    }
  }
}

// Change a point's velocity by dv (as far as the body lets it: the impulse is
// dv over the point's generalized inverse mass).
function applyPointVelocityChange(body, r, dv) {
  const l = Math.sqrt(dot(dv, dv));
  if (l < EPS || body.invMass === 0) return;
  tmp3[0] = dv[0] / l; tmp3[1] = dv[1] / l; tmp3[2] = dv[2] / l;
  const w = generalizedInverseMass(body, r, tmp3);
  if (w < EPS) return;
  const p = l / w;
  const px = tmp3[0] * p, py = tmp3[1] * p, pz = tmp3[2] * p;
  body.v[0] += px * body.invMass; body.v[1] += py * body.invMass; body.v[2] += pz * body.invMass;
  impulse[0] = px; impulse[1] = py; impulse[2] = pz;
  cross(r, impulse, tmp);
  inverseInertiaTimes(body, tmp, tmp2);
  body.w[0] += tmp2[0]; body.w[1] += tmp2[1]; body.w[2] += tmp2[2];
}

// Change the relative angular velocity of C against P by dw, shared by inertia.
function applyAngularVelocityChange(C, P, dwv) {
  const l = Math.sqrt(dot(dwv, dwv));
  if (l < EPS) return;
  tmp3[0] = dwv[0] / l; tmp3[1] = dwv[1] / l; tmp3[2] = dwv[2] / l;
  let w1 = 0, w2 = 0;
  if (C.invMass > 0) { inverseInertiaTimes(C, tmp3, tmp); w1 = dot(tmp3, tmp); }
  if (P.invMass > 0) { inverseInertiaTimes(P, tmp3, tmp); w2 = dot(tmp3, tmp); }
  if (w1 + w2 < EPS) return;
  const p = l / (w1 + w2);
  impulse[0] = tmp3[0] * p; impulse[1] = tmp3[1] * p; impulse[2] = tmp3[2] * p;
  if (C.invMass > 0) { inverseInertiaTimes(C, impulse, tmp); C.w[0] += tmp[0]; C.w[1] += tmp[1]; C.w[2] += tmp[2]; }
  if (P.invMass > 0) { inverseInertiaTimes(P, impulse, tmp); P.w[0] -= tmp[0]; P.w[1] -= tmp[1]; P.w[2] -= tmp[2]; }
}

// The worst gap at any joint centre (m): a joint that holds reads ~0.
export function jointGap(world) {
  let worst = 0;
  for (const joint of world.joints) {
    bodyPoint(joint.parentBody, joint.localParent, p1);
    bodyPoint(joint.childBody, joint.localChild, p2);
    worst = Math.max(worst, Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]));
  }
  return worst;
}

// Kinetic energy (J), for the checks.
export function kineticEnergy(world) {
  let e = 0;
  for (const body of world.bodies) {
    if (body.invMass === 0) continue;
    e += 0.5 * body.mass * dot(body.v, body.v);
    qRotateInverse(body.q, body.w, tmp);
    e += 0.5 * (body.inertia[0] * tmp[0] * tmp[0] + body.inertia[1] * tmp[1] * tmp[1] + body.inertia[2] * tmp[2] * tmp[2]);
  }
  return e;
}

// The drive's error for a joint: angle (rad) between the child's rotation and
// its target, for the checks and for telling a rider knocked off his pose.
export function driveError(joint) {
  qMul(joint.parentBody.q, joint.target, tq);
  qConj(joint.childBody.q, tq2);
  qMul(tq, tq2, dq);
  qToRotationVector(dq, corr);
  return Math.sqrt(dot(corr, corr));
}

// The joint angles, for the checks: a hinge's bend, a ball's swing and twist.
export function jointAngles(joint) {
  const P = joint.parentBody, C = joint.childBody;
  qRotate(P.q, joint.axisParent, aP);
  qRotate(C.q, joint.axisChild, aC);
  qRotate(P.q, joint.refParent, rP);
  qRotate(C.q, joint.refChild, rC);
  if (joint.type === 'hinge') return { bend: signedAngle(rP, rC, aP), misalign: Math.acos(Math.min(Math.max(dot(aP, aC), -1), 1)) };
  nAvg[0] = aP[0] + aC[0]; nAvg[1] = aP[1] + aC[1]; nAvg[2] = aP[2] + aC[2];
  const l = Math.sqrt(dot(nAvg, nAvg)) || 1;
  nAvg[0] /= l; nAvg[1] /= l; nAvg[2] /= l;
  return { swing: Math.acos(Math.min(Math.max(dot(aP, aC), -1), 1)), twist: signedAngle(rP, rC, nAvg) };
}

export const RAGDOLL_UP = up;
