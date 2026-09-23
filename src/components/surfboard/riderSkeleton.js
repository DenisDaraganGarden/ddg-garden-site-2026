import { createRagdoll, createRagdollBody } from './ragdoll.js';

// The rider's skeleton: fourteen segments a 1.74 m, 75 kg man is made of, as
// the physics sees them (boxes of his real volume and mass) and as Denis sees
// them (square wooden sticks, like an architect's model, until a model of his
// own takes their place on the same bones).
//
// The rest pose is standing upright, facing +Z, arms hanging, feet on y = 0.
// In it every segment's frame is the world frame, so each joint below is
// written once, in world numbers, and holds for both segments it joins. A
// person facing +Z has his LEFT on +X.
//
// Masses are Winter's segment shares (Biomechanics and Motor Control of Human
// Movement) of 75 kg; densities put the lungs in the chest, so a limp body
// floats face down with its back awash, as a real one does.

export const RIDER_MASS = 75;
export const RIDER_HEIGHT = 1.74;
const WATER_DENSITY = 1025;

// name: [mass share, collision size [x, y, z], centre, density]
const SEGMENTS = [
  ['pelvis', 0.142, [0.30, 0.16, 0.20], [0, 0.97, 0], 1040],
  ['abdomen', 0.139, [0.28, 0.16, 0.18], [0, 1.13, 0], 1000],
  ['chest', 0.216, [0.34, 0.29, 0.22], [0, 1.355, 0], 820],
  ['head', 0.081, [0.16, 0.26, 0.20], [0, 1.62, 0.01], 1060],
  ['upperArmL', 0.028, [0.09, 0.30, 0.09], [0.2, 1.30, 0], 1070],
  ['forearmL', 0.022, [0.07, 0.44, 0.07], [0.215, 0.93, 0], 1110],
  ['upperArmR', 0.028, [0.09, 0.30, 0.09], [-0.2, 1.30, 0], 1070],
  ['forearmR', 0.022, [0.07, 0.44, 0.07], [-0.215, 0.93, 0], 1110],
  ['thighL', 0.100, [0.14, 0.42, 0.14], [0.09, 0.72, 0], 1050],
  ['shinL', 0.0465, [0.10, 0.43, 0.10], [0.09, 0.295, 0], 1090],
  ['footL', 0.0145, [0.09, 0.07, 0.26], [0.09, 0.035, 0.06], 1100],
  ['thighR', 0.100, [0.14, 0.42, 0.14], [-0.09, 0.72, 0], 1050],
  ['shinR', 0.0465, [0.10, 0.43, 0.10], [-0.09, 0.295, 0], 1090],
  ['footR', 0.0145, [0.09, 0.07, 0.26], [-0.09, 0.035, 0.06], 1100],
];
export const SEGMENT_NAMES = Object.freeze(SEGMENTS.map(([name]) => name));
export const SEGMENT = Object.freeze(Object.fromEntries(SEGMENT_NAMES.map((name, i) => [name, i])));

// The joints in the rest pose. A ball's cone is centred on coneAxis (the
// parent's side) and measured to axis (the bone, the child's side); twist is
// about the bone. Hinges bend about their axis: + is a knee's or an ankle's
// flexion (foot back), − an elbow's (hand forward); an elbow's axis is square
// to the arm, which hangs a few degrees out. The ankle is a ball: with
// the knee's own give, a foot square across the stringer under a knee turned
// toward the nose is a twist the leg really makes.
// The shoulder, with its blade, is the most mobile joint there is: its cone
// leans out to the side and takes the crawl's recovery over the water.
// Muscles: stiffness N·m/rad, damping 1/s — legs and spine strong, the neck
// firm, the arms loose enough to swing with the board.
export const JOINTS = Object.freeze([
  { name: 'lumbar', parent: 'pelvis', child: 'abdomen', anchor: [0, 1.05, 0], type: 'ball', axis: [0, 1, 0], ref: [0, 0, 1], swing: 0.75, twist: [-0.4, 0.4], stiffness: 1400, damping: 40 },
  { name: 'thoracic', parent: 'abdomen', child: 'chest', anchor: [0, 1.21, 0], type: 'ball', axis: [0, 1, 0], ref: [0, 0, 1], swing: 0.4, twist: [-0.4, 0.4], stiffness: 1400, damping: 40 },
  { name: 'neck', parent: 'chest', child: 'head', anchor: [0, 1.50, 0], type: 'ball', axis: [0, 1, 0], ref: [0, 0, 1], swing: 0.8, twist: [-1.1, 1.1], stiffness: 300, damping: 30 },
  { name: 'shoulderL', parent: 'chest', child: 'upperArmL', anchor: [0.19, 1.45, 0], type: 'ball', axis: [0, -1, 0], coneAxis: [0.8, -0.1, 0.4], ref: [0, 0, 1], swing: 2.25, stiffness: 160, damping: 25 },
  { name: 'elbowL', parent: 'upperArmL', child: 'forearmL', anchor: [0.21, 1.15, 0], type: 'hinge', axis: [1, 0.0536, 0], ref: [0, 0, 1], range: [-2.5, 0], stiffness: 90, damping: 25 },
  { name: 'shoulderR', parent: 'chest', child: 'upperArmR', anchor: [-0.19, 1.45, 0], type: 'ball', axis: [0, -1, 0], coneAxis: [-0.8, -0.1, 0.4], ref: [0, 0, 1], swing: 2.25, stiffness: 160, damping: 25 },
  { name: 'elbowR', parent: 'upperArmR', child: 'forearmR', anchor: [-0.21, 1.15, 0], type: 'hinge', axis: [1, -0.0536, 0], ref: [0, 0, 1], range: [-2.5, 0], stiffness: 90, damping: 25 },
  { name: 'hipL', parent: 'pelvis', child: 'thighL', anchor: [0.09, 0.93, 0], type: 'ball', axis: [0, -1, 0], coneAxis: [0.2, -0.64, 0.76], ref: [0, 0, 1], swing: 1.3, twist: [-0.85, 0.85], stiffness: 1800, damping: 40 },
  { name: 'kneeL', parent: 'thighL', child: 'shinL', anchor: [0.09, 0.51, 0], type: 'hinge', axis: [1, 0, 0], ref: [0, 0, 1], range: [0, 2.5], stiffness: 1600, damping: 40 },
  { name: 'ankleL', parent: 'shinL', child: 'footL', anchor: [0.09, 0.08, 0], type: 'ball', axis: [0, 1, 0], ref: [0, 0, 1], swing: 1.2, twist: [-0.6, 0.6], stiffness: 400, damping: 30 },
  { name: 'hipR', parent: 'pelvis', child: 'thighR', anchor: [-0.09, 0.93, 0], type: 'ball', axis: [0, -1, 0], coneAxis: [-0.2, -0.64, 0.76], ref: [0, 0, 1], swing: 1.3, twist: [-0.85, 0.85], stiffness: 1800, damping: 40 },
  { name: 'kneeR', parent: 'thighR', child: 'shinR', anchor: [-0.09, 0.51, 0], type: 'hinge', axis: [1, 0, 0], ref: [0, 0, 1], range: [0, 2.5], stiffness: 1600, damping: 40 },
  { name: 'ankleR', parent: 'shinR', child: 'footR', anchor: [-0.09, 0.08, 0], type: 'ball', axis: [0, 1, 0], ref: [0, 0, 1], swing: 1.2, twist: [-0.6, 0.6], stiffness: 400, damping: 30 },
]);
export const JOINT = Object.freeze(Object.fromEntries(JOINTS.map((joint, i) => [joint.name, i])));

// Rest-pose joint centres by name, for the pose builder's IK.
export const REST = Object.freeze({
  hipL: [0.09, 0.93, 0], hipR: [-0.09, 0.93, 0],
  kneeL: [0.09, 0.51, 0], kneeR: [-0.09, 0.51, 0],
  ankleL: [0.09, 0.08, 0], ankleR: [-0.09, 0.08, 0],
  lumbar: [0, 1.05, 0], thoracic: [0, 1.21, 0], neck: [0, 1.50, 0],
  shoulderL: [0.19, 1.45, 0], shoulderR: [-0.19, 1.45, 0],
  elbowL: [0.21, 1.15, 0], elbowR: [-0.21, 1.15, 0],
  wristL: [0.22, 0.89, 0], wristR: [-0.22, 0.89, 0],
});
// Bone lengths the IK keeps.
export const BONES = Object.freeze({ thigh: 0.42, shin: 0.43, upperArm: 0.30, forearm: 0.26, hand: 0.18, footToAnkle: 0.08 });

// A segment's centre in its own rest frame is its offset from each rest joint:
// the pose builder places a segment by its proximal joint.
export const SEGMENT_CENTRE = Object.freeze(Object.fromEntries(SEGMENTS.map(([name, , , centre]) => [name, centre])));

// The sticks Denis sees, per segment, in the segment's rest frame: a stick is
// [centre [x,y,z], size [x,y,z]]; joints get a small block of their own. Square
// sticks of a few centimetres, a block for the skull, flat bars for the feet.
const S = 0.042, T = 0.036;
export const STICKS = Object.freeze({
  pelvis: [[[0, 0.93, 0], [0.26, S, S]], [[0, 0.99, 0], [S, 0.12, S]]],
  abdomen: [[[0, 1.13, 0], [S, 0.16, S]]],
  chest: [[[0, 1.34, 0], [S, 0.30, S]], [[0, 1.45, 0], [0.40, S, S]]],
  head: [[[0, 1.545, 0], [T, 0.09, T]], [[0, 1.66, 0.01], [0.13, 0.17, 0.155]]],
  upperArmL: [[[0.2, 1.30, 0], [T, 0.30, T]]],
  forearmL: [[[0.215, 1.02, 0], [0.032, 0.26, 0.032]], [[0.222, 0.81, 0.005], [0.028, 0.17, 0.07]]],
  upperArmR: [[[-0.2, 1.30, 0], [T, 0.30, T]]],
  forearmR: [[[-0.215, 1.02, 0], [0.032, 0.26, 0.032]], [[-0.222, 0.81, 0.005], [0.028, 0.17, 0.07]]],
  thighL: [[[0.09, 0.72, 0], [S, 0.42, S]]],
  shinL: [[[0.09, 0.295, 0], [0.038, 0.43, 0.038]]],
  footL: [[[0.09, 0.02, 0.06], [0.07, 0.03, 0.25]]],
  thighR: [[[-0.09, 0.72, 0], [S, 0.42, S]]],
  shinR: [[[-0.09, 0.295, 0], [0.038, 0.43, 0.038]]],
  footR: [[[-0.09, 0.02, 0.06], [0.07, 0.03, 0.25]]],
});
// A block at each joint, on the child segment (so it moves with it).
export const JOINT_BLOCK = 0.06;

export function segmentVolume(index) {
  const [, share, , , density] = SEGMENTS[index];
  return (share * RIDER_MASS) / density;
}
export const SEGMENT_DENSITY_RATIO = Object.freeze(SEGMENTS.map(([, , , , density]) => density / WATER_DENSITY));

// The ragdoll in the rest pose, feet on y = 0: every body dynamic. The rider
// controller moves it to the board and chooses which bodies the pose carries.
export function createRiderRagdoll() {
  const bodies = SEGMENTS.map(([name, share, size, centre]) => createRagdollBody({ name, mass: share * RIDER_MASS, size, position: centre }));
  const joints = JOINTS.map((joint) => ({
    ...joint,
    parent: SEGMENT[joint.parent],
    child: SEGMENT[joint.child],
  }));
  return createRagdoll(bodies, joints);
}
