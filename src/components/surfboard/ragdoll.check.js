import assert from 'node:assert/strict';
import {
  createRagdoll, createRagdollBody, driveKinematic, jointAngles, jointGap, kineticEnergy,
  qFromAxisAngle, stepRagdoll,
} from './ragdoll.js';

// The rider's skeleton is only as good as these few rules: a joint's centre
// holds, a hinge bends one way and only so far, a ball stays in its cone, a
// muscle holds a pose against gravity, a body dropped on the ground comes to
// rest, and something dragged along by a moving kinematic body stays attached.

const box = (name, mass, size, y, kinematic = false) => createRagdollBody({ name, mass, size, position: [0, y, 0], kinematic });
const run = (world, seconds, options = {}) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepRagdoll(world, 1 / 60, options);
};

// 1. A hinge: a shin hanging from a fixed thigh, the knee about +X bending
// 0..2.4 rad. Pushed forward it must stop straight, pushed back bend no further.
{
  const thigh = box('thigh', 7.5, [0.14, 0.42, 0.14], 1.2, true);
  const shin = box('shin', 3.5, [0.1, 0.43, 0.1], 0.775);
  const world = createRagdoll([thigh, shin], [{ parent: 0, child: 1, anchor: [0, 0.99, 0], type: 'hinge', axis: [1, 0, 0], ref: [0, 0, 1], range: [0, 2.4] }]);
  shin.w[0] = -12;   // whip the shin forward: past straight
  let least = Infinity;
  for (let i = 0; i < 60; i += 1) { run(world, 1 / 60); least = Math.min(least, jointAngles(world.joints[0]).bend); }
  assert.ok(least > -0.03, `a knee does not bend backwards (${least.toFixed(3)} rad)`);
  shin.w[0] = 40;    // and hard the other way
  run(world, 0.2);
  let worst = 0;
  for (let i = 0; i < 60; i += 1) { run(world, 1 / 60); worst = Math.max(worst, jointAngles(world.joints[0]).bend); }
  assert.ok(worst < 2.4 + 0.03, `nor beyond its range (${worst.toFixed(3)} rad)`);
  assert.ok(jointGap(world) < 1e-3, `the knee holds together (${jointGap(world)} m)`);
  assert.ok(jointAngles(world.joints[0]).misalign < 0.01, 'its axes stay one');
}

// 2. A ball joint's cone: an arm hanging from a fixed shoulder, flung sideways,
// may swing no further than its cone.
{
  const chest = box('chest', 16, [0.34, 0.29, 0.22], 1.3, true);
  const arm = box('arm', 2.1, [0.09, 0.3, 0.09], 0.96);
  const world = createRagdoll([chest, arm], [{ parent: 0, child: 1, anchor: [0, 1.11, 0], type: 'ball', axis: [0, -1, 0], ref: [0, 0, 1], swing: 0.8, twist: [-0.6, 0.6] }]);
  arm.w[2] = 30;
  let worst = 0, twist = 0;
  for (let i = 0; i < 120; i += 1) {
    run(world, 1 / 60);
    const a = jointAngles(world.joints[0]);
    worst = Math.max(worst, a.swing); twist = Math.max(twist, Math.abs(a.twist));
  }
  assert.ok(worst < 0.8 + 0.03, `the arm stays in its cone (${worst.toFixed(3)} rad)`);
  arm.w[1] = 25;
  for (let i = 0; i < 60; i += 1) { run(world, 1 / 60); twist = Math.max(twist, Math.abs(jointAngles(world.joints[0]).twist)); }
  assert.ok(twist < 0.6 + 0.05, `and twists only so far (${twist.toFixed(3)} rad)`);
}

// 3. A muscle holds a pose: the forearm held 90° up against gravity.
{
  const upper = box('upper', 2.1, [0.09, 0.3, 0.09], 1.2, true);
  const fore = box('fore', 1.65, [0.07, 0.44, 0.07], 0.83);
  const world = createRagdoll([upper, fore], [{ parent: 0, child: 1, anchor: [0, 1.05, 0], type: 'hinge', axis: [1, 0, 0], ref: [0, 0, 1], range: [-2.6, 0], stiffness: 120, damping: 20 }]);
  qFromAxisAngle([1, 0, 0], -Math.PI / 2, world.joints[0].target);
  run(world, 2);
  const bend = jointAngles(world.joints[0]).bend;
  assert.ok(Math.abs(bend + Math.PI / 2) < 0.15, `the elbow holds its bend against gravity (${bend.toFixed(3)} rad, want ${(-Math.PI / 2).toFixed(3)})`);
}

// 4. A limp chain dropped on the ground comes to rest on it, whole.
{
  const bodies = Array.from({ length: 6 }, (_, i) => createRagdollBody({ name: `link${i}`, mass: 3 + i, size: [0.12, 0.3, 0.12], position: [0.3 * i, 1.2, 0], quaternion: qFromAxisAngle([0, 0, 1], Math.PI / 2) }));
  const joints = bodies.slice(1).map((_, i) => ({ parent: i, child: i + 1, anchor: [0.3 * i + 0.15, 1.2, 0], type: 'ball', axis: [1, 0, 0], ref: [0, 1, 0], swing: 1.2, twist: [-0.5, 0.5], damping: 2 }));
  const world = createRagdoll(bodies, joints);
  bodies[0].v[1] = -2; bodies[5].w[2] = 5;
  const ground = () => 0;
  let lowest = Infinity;
  for (let t = 0; t < 4; t += 1 / 60) {
    stepRagdoll(world, 1 / 60, { ground });
    for (const b of bodies) lowest = Math.min(lowest, b.x[1] - 0.06);
  }
  const energy = kineticEnergy(world);
  assert.ok(Number.isFinite(energy) && energy < 0.05, `the chain lies still (${energy.toFixed(4)} J)`);
  assert.ok(jointGap(world) < 2e-3, `and whole (${jointGap(world)} m)`);
  assert.ok(lowest > -0.02, `on the ground, not in it (${lowest.toFixed(3)} m)`);
}

// 5. Dragged by a kinematic body running at 6 m/s and turning, a dynamic one
// keeps to its joint.
{
  const pelvis = box('pelvis', 10.7, [0.3, 0.18, 0.2], 1, true);
  const thigh = box('thigh', 7.5, [0.14, 0.42, 0.14], 0.7);
  const world = createRagdoll([pelvis, thigh], [{ parent: 0, child: 1, anchor: [0, 0.91, 0], type: 'ball', axis: [0, -1, 0], ref: [0, 0, 1], swing: 1.4, twist: [-0.7, 0.7], stiffness: 800, damping: 20 }]);
  let gap = 0;
  for (let t = 0; t < 2; t += 1 / 60) {
    const q = qFromAxisAngle([0, 1, 0], t * 2);
    driveKinematic(pelvis, [6 * t, 1 + 0.1 * Math.sin(t * 9), 0], q);
    stepRagdoll(world, 1 / 60);
    gap = Math.max(gap, jointGap(world));
  }
  assert.ok(gap < 1e-3, `a dragged limb stays on its joint (${(gap * 1000).toFixed(2)} mm)`);
  assert.ok(Math.abs(thigh.v[0] - 6) < 1.5, `and runs with it (${thigh.v[0].toFixed(2)} m/s)`);
}

console.log('ragdoll: joints hold, a knee bends one way and so far, an arm stays in its cone, a muscle holds a pose, a dropped chain lies still and whole, a dragged limb keeps up');
