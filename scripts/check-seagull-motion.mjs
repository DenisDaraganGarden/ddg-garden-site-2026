import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createFlightAgents,
  getWingPose,
  updateFlightAgents,
} from '../src/seagull-lab/seagullFlight.js';

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const FRAME_DELTA = 1 / 60;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const localUp = new THREE.Vector3();
function checkFlight(count, mode) {
  const agents = createFlightAgents(count);
  const previousQuaternions = agents.map((agent) => agent.quaternion.clone());
  let minHorizontalSeparation = Infinity;
  let minBodyUpDot = 1;
  let maxOrientationStepDegrees = 0;
  let maxHeave = 0;

  for (let frame = 1; frame <= 60 * 60; frame += 1) {
    updateFlightAgents(agents, frame * FRAME_DELTA, FRAME_DELTA, mode);

    for (let first = 0; first < agents.length; first += 1) {
      const agent = agents[first];
      localUp.copy(WORLD_UP).applyQuaternion(agent.quaternion);
      minBodyUpDot = Math.min(minBodyUpDot, localUp.dot(WORLD_UP));
      maxOrientationStepDegrees = Math.max(
        maxOrientationStepDegrees,
        THREE.MathUtils.radToDeg(previousQuaternions[first].angleTo(agent.quaternion)),
      );
      previousQuaternions[first].copy(agent.quaternion);
      maxHeave = Math.max(maxHeave, Math.abs(getWingPose(agent).heave));

      for (let second = first + 1; second < agents.length; second += 1) {
        const dx = agent.position.x - agents[second].position.x;
        const dz = agent.position.z - agents[second].position.z;
        minHorizontalSeparation = Math.min(minHorizontalSeparation, Math.hypot(dx, dz));
      }
    }
  }

  assert.ok(minHorizontalSeparation >= 1.1, `${mode}: birds must preserve at least 1.1 m horizontal separation`);
  assert.ok(minBodyUpDot >= 0.9, `${mode}: body-up axis must stay within the stable flight envelope`);
  assert.ok(maxOrientationStepDegrees < 3, `${mode}: body orientation must not snap between frames`);
  assert.equal(maxHeave, 0, `${mode}: wing motion must not add a vertical body hop`);

  return {
    count,
    mode,
    minHorizontalSeparationMeters: minHorizontalSeparation,
    minBodyUpDot,
    maxOrientationStepDegrees,
    maxHeaveMeters: maxHeave,
  };
}

const flightChecks = [
  checkFlight(3, 'glide'),
  checkFlight(9, 'flight'),
  checkFlight(18, 'stress'),
];

const glb = await fs.readFile('public/models/seagull/seagull-flight.glb');
const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const loaded = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});
const bones = {};
let skinnedMesh;

loaded.scene.traverse((object) => {
  if (object.isBone) {
    bones[object.name] = object;
    if (object.userData?.name) bones[object.userData.name] = object;
  }
  if (object.isSkinnedMesh) skinnedMesh = object;
});

const requiredWingBones = [
  'wing.shoulder.L', 'wing.inner.L', 'wing.outer.L', 'wing.tip.L',
  'wing.shoulder.R', 'wing.inner.R', 'wing.outer.R', 'wing.tip.R',
];
for (const boneName of requiredWingBones) {
  assert.ok(bones[boneName], `runtime bone alias missing: ${boneName}`);
}
assert.ok(skinnedMesh, 'runtime skinned mesh missing');

loaded.scene.updateMatrixWorld(true);
skinnedMesh.skeleton.update();
const vertexCount = skinnedMesh.geometry.attributes.position.count;
const bindVertices = Array.from({ length: vertexCount }, (_, index) => (
  skinnedMesh.getVertexPosition(index, new THREE.Vector3()).clone()
));
const shoulderAxis = new THREE.Vector3(1, 0, 0);
const shoulderRotation = new THREE.Quaternion().setFromAxisAngle(shoulderAxis, 0.58);
const tipLift = {};

for (const side of ['L', 'R']) {
  const shoulder = bones[`wing.shoulder.${side}`];
  const tip = bones[`wing.tip.${side}`];
  const bindTipY = tip.getWorldPosition(new THREE.Vector3()).y;
  shoulder.quaternion.multiply(shoulderRotation);
  loaded.scene.updateMatrixWorld(true);
  tipLift[side] = tip.getWorldPosition(new THREE.Vector3()).y - bindTipY;
}
skinnedMesh.skeleton.update();

let maxVertexDisplacement = 0;
let movedVertices = 0;
for (let index = 0; index < vertexCount; index += 1) {
  const displacement = skinnedMesh
    .getVertexPosition(index, new THREE.Vector3())
    .distanceTo(bindVertices[index]);
  maxVertexDisplacement = Math.max(maxVertexDisplacement, displacement);
  if (displacement > 0.01) movedVertices += 1;
}

assert.ok(tipLift.L > 0.15 && tipLift.R > 0.15, 'both wing tips must lift on the same phase');
assert.ok(Math.abs(tipLift.L - tipLift.R) < 0.01, 'left and right wing lift must stay symmetric');
assert.ok(maxVertexDisplacement > 0.2, 'wing pose must deform the rendered mesh');
assert.ok(movedVertices > 7_000, 'wing pose must affect the full feather surface');

console.log(JSON.stringify({
  flightChecks,
  runtimeWingBones: requiredWingBones.length,
  tipLiftMeters: tipLift,
  maxVertexDisplacementMeters: maxVertexDisplacement,
  movedVertices,
}, null, 2));
