import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createFlightAgents,
  FLIGHT_ROUTE,
  getWingPose,
  LANDING_STATE,
  updateFlightAgents,
} from '../src/seagull-lab/seagullFlight.js';
import { PERCHED_SOLE_HEIGHT_METERS } from '../src/seagull-lab/seagullLanding.js';
import {
  BOAT_LANDING_SPECS,
  createNormalizedSurfaceClone,
  projectLandingSites,
  SCULPTURE_LANDING_SPECS,
} from '../src/seagull-lab/seagullLandingSurfaces.js';

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
  let minPhysicalHeight = Infinity;
  let maxPhysicalHeight = -Infinity;
  const routeExtents = Object.fromEntries(Object.values(FLIGHT_ROUTE).map((route) => [route, {
    count: agents.filter((agent) => agent.route === route).length,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }]));

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
      minPhysicalHeight = Math.min(minPhysicalHeight, agent.physicalHeight);
      maxPhysicalHeight = Math.max(maxPhysicalHeight, agent.physicalHeight);
      const routeExtent = routeExtents[agent.route];
      routeExtent.minX = Math.min(routeExtent.minX, agent.position.x);
      routeExtent.maxX = Math.max(routeExtent.maxX, agent.position.x);
      routeExtent.minY = Math.min(routeExtent.minY, agent.position.y);
      routeExtent.maxY = Math.max(routeExtent.maxY, agent.position.y);

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
  if (mode === 'flight') {
    assert.equal(routeExtents[FLIGHT_ROUTE.FLOCK].count, 5, 'default scene must keep a five-bird flock');
    assert.equal(routeExtents[FLIGHT_ROUTE.WATERLINE].count, 2, 'default scene must include two waterline birds');
    assert.equal(routeExtents[FLIGHT_ROUTE.HIGH].count, 1, 'default scene must include one high circling bird');
    assert.equal(routeExtents[FLIGHT_ROUTE.LONG].count, 1, 'default scene must include one long transit bird');
    assert.ok(routeExtents[FLIGHT_ROUTE.WATERLINE].maxY < -0.42, 'waterline birds must stay close to the water plane');
    assert.ok(routeExtents[FLIGHT_ROUTE.HIGH].minY > 2.7, 'high bird must stay clearly above the flock');
    assert.ok(
      routeExtents[FLIGHT_ROUTE.LONG].maxX - routeExtents[FLIGHT_ROUTE.LONG].minX > 10,
      'long transit route must span more than 10 meters in the lab',
    );
    assert.ok(minPhysicalHeight <= 2.1, 'waterline route must reach the 2 m physical band');
    assert.ok(maxPhysicalHeight >= 37, 'high route must reach the upper physical band');
  }

  return {
    count,
    mode,
    minHorizontalSeparationMeters: minHorizontalSeparation,
    minBodyUpDot,
    maxOrientationStepDegrees,
    maxHeaveMeters: maxHeave,
    physicalHeightMeters: [minPhysicalHeight, maxPhysicalHeight],
    routeExtents,
  };
}

const flightChecks = [
  checkFlight(3, 'glide'),
  checkFlight(9, 'flight'),
  checkFlight(18, 'stress'),
];

function createLandingFixture() {
  const root = new THREE.Object3D();
  const boatRoot = new THREE.Object3D();
  const sculptureRoot = new THREE.Object3D();
  boatRoot.position.x = -2;
  sculptureRoot.position.x = 2;
  root.add(boatRoot, sculptureRoot);
  const sites = Array.from({ length: 8 }, (_, index) => {
    const object = new THREE.Object3D();
    const boat = index < 4;
    object.position.set(
      boat ? (index - 1.5) * 0.45 : (index - 5.5) * 0.34,
      boat ? -0.68 : -0.18 + (index - 4) * 0.08,
      (index % 2 ? 1 : -1) * 0.24,
    );
    object.rotation.y = boat ? 0.08 : -0.2;
    (boat ? boatRoot : sculptureRoot).add(object);
    return { object, surface: boat ? 'boat' : 'sculpture' };
  });
  root.updateMatrixWorld(true);
  return { root, boatRoot, sculptureRoot, sites };
}

function checkLandingCycle() {
  const {
    root, boatRoot, sculptureRoot, sites,
  } = createLandingFixture();
  const agents = createFlightAgents(9);
  agents.forEach((agent, index) => {
    agent.modelScale = 0.92 + (index % 5) * 0.025;
  });
  const previousQuaternions = agents.map((agent) => agent.quaternion.clone());
  const seenStates = new Set();
  const sitePosition = new THREE.Vector3();
  const siteQuaternion = new THREE.Quaternion();
  const siteUp = new THREE.Vector3();
  const expectedPerchPosition = new THREE.Vector3();
  let maxActiveLandings = 0;
  let maxBoatLandings = 0;
  let maxSculptureLandings = 0;
  let maxOrientationStepDegrees = 0;
  let worstOrientationStep = null;
  let maxPerchedOffsetError = 0;
  let minBodyUpDot = 1;

  for (let frame = 1; frame <= 90 * 60; frame += 1) {
    const time = frame * FRAME_DELTA;
    boatRoot.position.y = Math.sin(time * 0.64) * 0.018;
    boatRoot.rotation.x = Math.sin(time * 0.45) * 0.018;
    boatRoot.rotation.z = Math.sin(time * 0.5) * 0.022;
    sculptureRoot.position.x = 2 + Math.sin(time * 0.17) * 0.045;
    sculptureRoot.position.y = Math.sin(time * 0.24 + 1.1) * 0.018;
    sculptureRoot.position.z = Math.sin(time * 0.13) * 0.035;
    sculptureRoot.rotation.set(
      0.07 + Math.sin(time * 0.19) * 0.025,
      0.18 + Math.sin(time * 0.15) * 0.08,
      -0.14 + Math.sin(time * 0.21) * 0.035,
    );
    root.updateMatrixWorld(true);
    updateFlightAgents(agents, time, FRAME_DELTA, 'landing', sites);

    const occupiedBySurface = { boat: 0, sculpture: 0 };
    let activeLandings = 0;
    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      seenStates.add(agent.landingState);
      assert.ok(
        agent.position.toArray().every(Number.isFinite)
          && agent.quaternion.toArray().every(Number.isFinite),
        `landing agent ${index} must keep finite transforms`,
      );

      const orientationStep = THREE.MathUtils.radToDeg(
        previousQuaternions[index].angleTo(agent.quaternion),
      );
      if (orientationStep > maxOrientationStepDegrees) {
        maxOrientationStepDegrees = orientationStep;
        worstOrientationStep = {
          agent: index,
          timeSeconds: time,
          state: agent.landingState,
        };
      }
      previousQuaternions[index].copy(agent.quaternion);
      localUp.copy(WORLD_UP).applyQuaternion(agent.quaternion);
      minBodyUpDot = Math.min(minBodyUpDot, localUp.dot(WORLD_UP));

      if (agent.landingSiteIndex >= 0) {
        activeLandings += 1;
        const site = sites[agent.landingSiteIndex];
        occupiedBySurface[site.surface] += 1;
        if (agent.landingState === LANDING_STATE.PERCHED) {
          site.object.getWorldPosition(sitePosition);
          site.object.getWorldQuaternion(siteQuaternion);
          siteUp.copy(WORLD_UP).applyQuaternion(siteQuaternion).normalize();
          expectedPerchPosition.copy(sitePosition).addScaledVector(
            siteUp,
            PERCHED_SOLE_HEIGHT_METERS * agent.modelScale,
          );
          maxPerchedOffsetError = Math.max(
            maxPerchedOffsetError,
            agent.position.distanceTo(expectedPerchPosition),
          );
        }
      }
    }
    maxActiveLandings = Math.max(maxActiveLandings, activeLandings);
    maxBoatLandings = Math.max(maxBoatLandings, occupiedBySurface.boat);
    maxSculptureLandings = Math.max(maxSculptureLandings, occupiedBySurface.sculpture);
  }

  for (const state of Object.values(LANDING_STATE)) {
    assert.ok(seenStates.has(state), `landing cycle must visit ${state}`);
  }
  assert.ok(agents.every((agent) => agent.landingCycle >= 1), 'every bird must complete a landing cycle');
  assert.ok(maxActiveLandings <= 3, 'no more than three birds may occupy landing traffic at once');
  assert.ok(maxBoatLandings <= 2, 'the boat may host no more than two birds at once');
  assert.ok(maxSculptureLandings <= 1, 'the sculpture may host no more than one bird at once');
  assert.ok(
    maxOrientationStepDegrees < 3,
    `landing orientation must not snap between frames (${maxOrientationStepDegrees.toFixed(3)} degrees at ${JSON.stringify(worstOrientationStep)})`,
  );
  assert.ok(minBodyUpDot > 0.9, 'landing body-up axis must stay stable');
  assert.ok(maxPerchedOffsetError < 1e-5, 'perched birds must inherit moving surface transforms');

  return {
    durationSeconds: 90,
    visitedStates: [...seenStates],
    completedCycles: agents.map((agent) => agent.landingCycle),
    maxActiveLandings,
    maxBoatLandings,
    maxSculptureLandings,
    maxOrientationStepDegrees,
    worstOrientationStep,
    minBodyUpDot,
    maxPerchedOffsetErrorMeters: maxPerchedOffsetError,
  };
}

const landingCheck = checkLandingCycle();

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
const requiredLegBones = [
  'leg.upper.L', 'leg.lower.L', 'foot.L', 'toes.L',
  'leg.upper.R', 'leg.lower.R', 'foot.R', 'toes.R',
];
for (const boneName of [...requiredWingBones, ...requiredLegBones]) {
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

const axisX = new THREE.Vector3(1, 0, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const localZRotation = new THREE.Quaternion();
const localXRotation = new THREE.Quaternion();
const legBind = Object.fromEntries(requiredLegBones.map((name) => [name, bones[name].quaternion.clone()]));

function poseLegBone(name, xAngle, zAngle) {
  localZRotation.setFromAxisAngle(axisZ, zAngle);
  localXRotation.setFromAxisAngle(axisX, xAngle);
  bones[name].quaternion.copy(legBind[name]).multiply(localZRotation).multiply(localXRotation);
}

poseLegBone('leg.upper.L', 0, 0.3);
poseLegBone('leg.upper.R', 0.1, 0.2);
poseLegBone('leg.lower.L', 0, 1.6);
poseLegBone('leg.lower.R', 0, 1.6);
poseLegBone('foot.L', 0, -0.2);
poseLegBone('foot.R', 0, -0.2);
poseLegBone('toes.L', 0, 0.16);
poseLegBone('toes.R', 0, 0.16);
loaded.scene.updateMatrixWorld(true);
const tuckedToePositions = {
  L: bones['toes.L'].getWorldPosition(new THREE.Vector3()),
  R: bones['toes.R'].getWorldPosition(new THREE.Vector3()),
};
assert.ok(tuckedToePositions.L.z * tuckedToePositions.R.z < 0, 'tucked feet must remain on opposite body sides');
assert.ok(Math.abs(tuckedToePositions.L.x - tuckedToePositions.R.x) < 0.012, 'front-view feet must align in depth');
assert.ok(Math.abs(tuckedToePositions.L.y - tuckedToePositions.R.y) < 0.012, 'front-view feet must align vertically');
assert.ok(
  Math.abs(Math.abs(tuckedToePositions.L.z) - Math.abs(tuckedToePositions.R.z)) < 0.012,
  'front-view feet must remain laterally symmetric',
);

poseLegBone('leg.upper.L', 0, 0.18 * 0.25);
poseLegBone('leg.upper.R', 0, 0.18 * 0.25);
poseLegBone('leg.lower.L', 0, 0.18 * 0.58);
poseLegBone('leg.lower.R', 0, 0.18 * 0.58);
poseLegBone('foot.L', 0, -0.18 * 0.2);
poseLegBone('foot.R', 0, -0.18 * 0.2);
poseLegBone('toes.L', 0, -0.22 * 0.3);
poseLegBone('toes.R', 0, -0.22 * 0.3);
loaded.scene.updateMatrixWorld(true);
skinnedMesh.skeleton.update();

const skinIndices = skinnedMesh.geometry.attributes.skinIndex;
const skinWeights = skinnedMesh.geometry.attributes.skinWeight;
const skeletonBoneNames = skinnedMesh.skeleton.bones.map((bone) => bone.userData?.name ?? bone.name);
const perchedSoles = {};
for (const side of ['L', 'R']) {
  const vertices = [];
  for (let index = 0; index < vertexCount; index += 1) {
    let sideWeight = 0;
    let distalWeight = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const boneName = skeletonBoneNames[skinIndices.getComponent(index, influence)] ?? '';
      const weight = skinWeights.getComponent(index, influence);
      if (boneName.endsWith(`.${side}`) && /^(leg\.|foot|toes)/.test(boneName)) sideWeight += weight;
      if (boneName.endsWith(`.${side}`) && /^(foot|toes)/.test(boneName)) distalWeight += weight;
    }
    if (sideWeight <= 0.55 || distalWeight <= 0.15) continue;
    vertices.push(skinnedMesh.getVertexPosition(index, new THREE.Vector3()).clone());
  }
  const minY = Math.min(...vertices.map((vertex) => vertex.y));
  const supportVertices = vertices.filter((vertex) => vertex.y <= minY + 0.006);
  const centroid = supportVertices
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / supportVertices.length);
  const contactCenter = centroid.clone();
  contactCenter.y = minY;
  perchedSoles[side] = {
    minY,
    centroid,
    contactCenter,
    supportVertices: supportVertices.length,
  };
}
const combinedSoleCenter = perchedSoles.L.centroid.clone().add(perchedSoles.R.centroid).multiplyScalar(0.5);
const maxSoleGap = Math.max(...[0.92, 0.945, 0.97, 0.995, 1.02].flatMap((scale) => [
  Math.abs((PERCHED_SOLE_HEIGHT_METERS + perchedSoles.L.minY) * scale),
  Math.abs((PERCHED_SOLE_HEIGHT_METERS + perchedSoles.R.minY) * scale),
]));
assert.ok(maxSoleGap < 0.00025, 'perched sole vertices must meet the landing plane within 0.25 mm');
assert.ok(Math.abs(combinedSoleCenter.x) < 0.003, 'landing marker must align with the foot support center in depth');
assert.ok(Math.abs(combinedSoleCenter.z) < 0.003, 'landing marker must sit between left and right feet');

async function loadGlb(file) {
  const fileBuffer = await fs.readFile(file);
  const fileArrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  );
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(fileArrayBuffer, '', resolve, reject);
  });
}

const [boatGltf, sculptureGltf] = await Promise.all([
  loadGlb('public/models/boat/OBJ_boat2.0.glb'),
  loadGlb('public/models/sculpture/sculpture.glb'),
]);
const boatSurface = createNormalizedSurfaceClone(boatGltf.scene, 0.0007, Math.PI);
const sculptureSurface = createNormalizedSurfaceClone(sculptureGltf.scene, 0.075, 0);
const projectedSurfaces = [
  ...projectLandingSites(boatSurface, BOAT_LANDING_SPECS).map((site) => ({ ...site, object: boatSurface })),
  ...projectLandingSites(sculptureSurface, SCULPTURE_LANDING_SPECS).map((site) => ({ ...site, object: sculptureSurface })),
];
const contactRay = new THREE.Raycaster();
let maxSurfaceProjectionError = 0;
let minProjectedUp = 1;
let maxFootSurfaceGap = 0;
let worstFootSurfaceGap = null;
let maxFootFitError = 0;
for (const site of projectedSurfaces) {
  const point = new THREE.Vector3().fromArray(site.position);
  const normal = new THREE.Vector3().fromArray(site.surfaceNormal).normalize();
  const siteUp = WORLD_UP.clone().applyQuaternion(site.quaternion).normalize();
  minProjectedUp = Math.min(minProjectedUp, normal.dot(WORLD_UP));
  maxFootFitError = Math.max(maxFootFitError, site.footFitError);
  assert.ok(siteUp.angleTo(normal) < 1e-5, `${site.id}: anchor up-axis must match the surface normal`);
  contactRay.set(point.clone().addScaledVector(normal, 0.025), normal.clone().negate());
  const hit = contactRay.intersectObject(site.object, true)[0];
  assert.ok(hit, `${site.id}: projected anchor must resolve back to support geometry`);
  maxSurfaceProjectionError = Math.max(maxSurfaceProjectionError, hit.point.distanceTo(point));

  for (const scale of [0.92, 0.97, 1.02]) {
    const root = point.clone().addScaledVector(
      normal,
      PERCHED_SOLE_HEIGHT_METERS * scale,
    );
    for (const side of ['L', 'R']) {
      const footPoint = perchedSoles[side].contactCenter
        .clone()
        .multiplyScalar(scale)
        .applyQuaternion(site.quaternion)
        .add(root);
      contactRay.set(footPoint.clone().addScaledVector(normal, 0.04), normal.clone().negate());
      const footHit = contactRay.intersectObject(site.object, true)[0];
      assert.ok(footHit, `${site.id}: ${side} foot must remain above support geometry`);
      const footGap = Math.abs(footPoint.clone().sub(footHit.point).dot(normal));
      if (footGap > maxFootSurfaceGap) {
        maxFootSurfaceGap = footGap;
        worstFootSurfaceGap = { site: site.id, side, scale };
      }
    }
  }
}
assert.ok(minProjectedUp > 0.82, 'landing sites must stay on stable top-facing polygons');
assert.ok(maxSurfaceProjectionError < 0.005, 'landing support plane must stay within 5 mm of geometry');
assert.ok(maxFootFitError < 0.002, 'both feet must fit each landing support plane within 2 mm');
assert.ok(maxFootSurfaceGap < 0.001, 'both feet must meet real support geometry within 1 mm');

console.log(JSON.stringify({
  flightChecks,
  landingCheck,
  runtimeWingBones: requiredWingBones.length,
  runtimeLegBones: requiredLegBones.length,
  tipLiftMeters: tipLift,
  maxVertexDisplacementMeters: maxVertexDisplacement,
  movedVertices,
  tuckedToePositionsMeters: {
    L: tuckedToePositions.L.toArray(),
    R: tuckedToePositions.R.toArray(),
  },
  perchedSoles: {
    L: { minY: perchedSoles.L.minY, centroid: perchedSoles.L.centroid.toArray() },
    R: { minY: perchedSoles.R.minY, centroid: perchedSoles.R.centroid.toArray() },
    combinedCenter: combinedSoleCenter.toArray(),
    maxGapMeters: maxSoleGap,
  },
  landingSurfaceProjection: {
    sites: projectedSurfaces.length,
    minSurfaceUpDot: minProjectedUp,
    maxProjectionErrorMeters: maxSurfaceProjectionError,
    maxFootFitErrorMeters: maxFootFitError,
    maxFootSurfaceGapMeters: maxFootSurfaceGap,
    worstFootSurfaceGap,
  },
}, null, 2));
