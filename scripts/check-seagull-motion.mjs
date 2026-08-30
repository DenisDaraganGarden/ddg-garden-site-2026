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
import {
  PERCHED_SOLE_HEIGHT_METERS,
  scareLandingAgent,
} from '../src/seagull-lab/seagullLanding.js';
import {
  BOAT_LANDING_SPECS,
  createNormalizedSurfaceClone,
  projectLandingSites,
  SCULPTURE_LANDING_SPECS,
} from '../src/seagull-lab/seagullLandingSurfaces.js';
import {
  advancePointerResponse,
  createPointerSample,
  measurePointerInteraction,
  pointerAvoidanceOffset,
  SEAGULL_POINTER_LAW,
} from '../src/seagull-lab/seagullPointerInteraction.js';
import {
  advanceDownedSeagulls,
  advanceSeagullShootingRuntime,
  createSeagullShootingRuntime,
  findSeagullShotTarget,
  fireSeagullShot,
  SEAGULL_DOWNED_STATE,
  SEAGULL_SHOOTING_LAW,
} from '../src/seagull-lab/seagullShooting.js';
import {
  resolveSeagullShadowCasters,
  SEAGULL_SHADOW_LOD,
} from '../src/seagull-lab/seagullShadowLod.js';
import {
  measureSeagullReflection,
  resolveSeagullReflectionParticipants,
  SEAGULL_REFLECTION_LOD,
} from '../src/seagull-lab/seagullReflectionLod.js';

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

function checkShadowLod() {
  const waterY = -1.14;
  const agents = [
    { index: 0, position: new THREE.Vector3(0, -0.48, 0), landingState: 'perched' },
    { index: 1, position: new THREE.Vector3(1.1, -0.62, 0), route: FLIGHT_ROUTE.WATERLINE },
    { index: 2, position: new THREE.Vector3(-1.2, -0.55, 0), route: FLIGHT_ROUTE.WATERLINE },
    { index: 3, position: new THREE.Vector3(0.4, 3.4, 0), route: FLIGHT_ROUTE.HIGH },
    { index: 4, position: new THREE.Vector3(0.2, -0.7, 0), shotState: 'removed' },
    { index: 5, position: new THREE.Vector3(12, -0.72, 0), route: FLIGHT_ROUTE.WATERLINE },
    { index: 6, position: new THREE.Vector3(11, 2.2, 0), shotState: 'falling' },
  ];
  const options = {
    waterY,
    maxCasters: SEAGULL_SHADOW_LOD.maximumLabCasters,
    receiverPoints: [new THREE.Vector3(0, waterY, 0)],
  };
  const first = resolveSeagullShadowCasters(agents, options);
  const second = resolveSeagullShadowCasters(agents, {
    ...options,
    previousCasterIds: first,
  });

  assert.deepEqual([...first], [0, 1, 2], 'near surface birds must win the shadow budget');
  assert.deepEqual([...second], [...first], 'shadow caster selection must remain stable');
  assert.ok(!first.has(3), 'high circling birds must not consume a native shadow draw');
  assert.ok(!first.has(4), 'removed birds must never cast');
  assert.ok(!first.has(5), 'airborne birds outside the receiver footprint must not cast');
  assert.ok(!first.has(6), 'falling birds outside the receiver footprint must not consume the shadow budget');
  assert.equal(resolveSeagullShadowCasters(agents, { ...options, enabled: false }).size, 0);
  assert.equal(resolveSeagullShadowCasters(agents, { ...options, isLowPower: true }).size, 0);
  assert.equal(resolveSeagullShadowCasters(agents, { ...options, isMobile: true }).size, 0);

  return {
    selected: [...first],
    maximumDesktopCasters: SEAGULL_SHADOW_LOD.maximumDesktopCasters,
    maximumLabCasters: SEAGULL_SHADOW_LOD.maximumLabCasters,
    lowPowerCasters: 0,
  };
}

const shadowLodCheck = checkShadowLod();

function describePerspectiveCamera(camera) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return {
    position: camera.position.clone(),
    forward,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
    fovDegrees: camera.fov,
    aspect: camera.aspect,
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  };
}

function checkReflectionLod() {
  const waterY = -1.14;
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 120);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, -0.35, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const descriptor = describePerspectiveCamera(camera);
  const viewport = { width: 1600, height: 900 };
  const agents = [
    { index: 0, position: new THREE.Vector3(0, -0.56, 0), physicalHeight: 3.2, landingState: 'perched', modelScale: 1 },
    { index: 1, position: new THREE.Vector3(1.1, -0.5, -0.3), physicalHeight: 4.6, route: FLIGHT_ROUTE.WATERLINE, modelScale: 1 },
    { index: 2, position: new THREE.Vector3(-1.2, -0.34, 0.2), physicalHeight: 7, route: FLIGHT_ROUTE.FLOCK, modelScale: 1 },
    { index: 3, position: new THREE.Vector3(0, 3.36, 0), physicalHeight: 38, route: FLIGHT_ROUTE.HIGH, modelScale: 1 },
    { index: 4, position: new THREE.Vector3(24, -0.69, 0), physicalHeight: 2, route: FLIGHT_ROUTE.WATERLINE, modelScale: 1 },
    { index: 5, position: new THREE.Vector3(0, -0.74, 0), physicalHeight: 2, shotState: 'removed', modelScale: 1 },
    { index: 6, position: new THREE.Vector3(0, -0.64, 20), physicalHeight: 3, route: FLIGHT_ROUTE.WATERLINE, modelScale: 1 },
  ];
  const options = {
    camera: descriptor,
    viewport,
    waterY,
  };
  const high = resolveSeagullReflectionParticipants(agents, options);
  const repeat = resolveSeagullReflectionParticipants([...agents].reverse(), options);
  const medium = resolveSeagullReflectionParticipants(agents, { ...options, quality: 'medium' });
  const retained = resolveSeagullReflectionParticipants(agents, {
    ...options,
    previousParticipantIds: high.participantIds,
  });

  assert.deepEqual([...high.participantIds], [0, 1, 2], 'high desktop must select the three useful low reflections');
  assert.deepEqual([...repeat.participantIds], [...high.participantIds], 'reflection selection must not depend on input order');
  assert.equal(medium.participantIds.size, SEAGULL_REFLECTION_LOD.maximumMediumParticipants);
  assert.deepEqual([...retained.participantIds], [...high.participantIds], 'reflection hysteresis must retain valid participants');
  assert.equal(high.dynamic, true, 'an animated selected bird must keep the planar pass active');
  assert.ok(!high.participantIds.has(3), 'high routes must not enter the planar capture');
  assert.ok(!high.participantIds.has(4), 'off-screen birds must not enter the planar capture');
  assert.ok(!high.participantIds.has(5), 'removed birds must not enter the planar capture');
  assert.ok(!high.participantIds.has(6), 'birds behind the camera must not enter the planar capture');
  assert.equal(resolveSeagullReflectionParticipants(agents, { ...options, isMobile: true }).dynamic, false);
  assert.equal(resolveSeagullReflectionParticipants(agents, { ...options, isLowPower: true }).participantIds.size, 0);
  assert.equal(resolveSeagullReflectionParticipants(agents, { ...options, enabled: false }).participantIds.size, 0);

  const measurement = measureSeagullReflection(agents[0], options);
  assert.ok(Number.isFinite(measurement.screenPixels) && measurement.screenPixels >= 4);

  return {
    selected: [...high.participantIds],
    mediumSelected: [...medium.participantIds],
    maximumHighParticipants: SEAGULL_REFLECTION_LOD.maximumHighParticipants,
    maximumMediumParticipants: SEAGULL_REFLECTION_LOD.maximumMediumParticipants,
    mobileParticipants: 0,
    dynamic: high.dynamic,
  };
}

const reflectionLodCheck = checkReflectionLod();

function makePerspectiveCamera(distance, zoom = 1) {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, 0, distance);
  camera.zoom = zoom;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return camera;
}

function makeOrthographicCamera(visibleHeight) {
  const camera = new THREE.OrthographicCamera(
    -visibleHeight * 8 / 9,
    visibleHeight * 8 / 9,
    visibleHeight * 0.5,
    -visibleHeight * 0.5,
    0.1,
    200,
  );
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return camera;
}

function checkPointerInteractionLaw() {
  const viewport = { width: 1920, height: 1080 };
  const pointer = new THREE.Vector2(0, 0);
  const habitat = [new THREE.Vector3(0, 0, 0)];
  const agent = createFlightAgents(1)[0];
  agent.position.set(0, 0, 0);
  agent.modelScale = 1;

  const nearSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makePerspectiveCamera(8),
    viewport,
    pointer,
    true,
    habitat,
  );
  const distantSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makePerspectiveCamera(80),
    viewport,
    pointer,
    true,
    habitat,
  );
  const zoomedSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makePerspectiveCamera(24, 3),
    viewport,
    pointer,
    true,
    habitat,
  );
  const orthographicVisibleHeight = (
    SEAGULL_POINTER_LAW.bodyLengthMeters * viewport.height
  ) / nearSample.visibleBodyPixels;
  const orthographicSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makeOrthographicCamera(orthographicVisibleHeight),
    viewport,
    pointer,
    true,
    habitat,
  );
  const outsideHabitatSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makePerspectiveCamera(8),
    viewport,
    pointer,
    true,
    [new THREE.Vector3(10, 0, 0)],
  );
  const offCursorSample = measurePointerInteraction(
    createPointerSample(),
    agent,
    makePerspectiveCamera(8),
    viewport,
    new THREE.Vector2(0.5, 0.5),
    true,
    habitat,
  );

  assert.ok(nearSample.influence > 0.98, 'near visible bird must react at cursor center');
  assert.equal(distantSample.influence, 0, 'visually tiny distant bird must ignore the cursor');
  assert.ok(zoomedSample.influence > 0.98, 'camera zoom must restore interaction with a visibly large bird');
  assert.ok(
    Math.abs(zoomedSample.visibleBodyPixels - nearSample.visibleBodyPixels)
      / nearSample.visibleBodyPixels < 0.12,
    'equivalent framing must produce an equivalent projected bird size',
  );
  assert.ok(orthographicSample.influence > 0.98, 'orthographic camera must use the same visibility law');
  assert.ok(
    Math.abs(orthographicSample.visibleBodyPixels - nearSample.visibleBodyPixels) < 1e-6,
    'perspective and orthographic cameras with equivalent framing must agree',
  );
  assert.equal(outsideHabitatSample.influence, 0, 'airborne bird outside object habitat must ignore cursor');
  assert.equal(offCursorSample.influence, 0, 'cursor outside the screen-space radius must not steer bird');

  const responseAgent = createFlightAgents(1)[0];
  const activeSample = createPointerSample();
  activeSample.influence = 1;
  activeSample.away.set(0.9, 0.18, 0.2).normalize();
  let triggered = false;
  for (let frame = 0; frame < 7; frame += 1) {
    triggered ||= advancePointerResponse(responseAgent, activeSample, FRAME_DELTA);
  }
  assert.ok(triggered, 'focused hover must trigger after the authored dwell time');
  assert.equal(responseAgent.pointerStartleCount, 1, 'one hover dwell must count as one startle');
  assert.equal(responseAgent.state, 'flap', 'startled flying bird must switch to active flapping');
  assert.ok(pointerAvoidanceOffset(responseAgent) > 1.5, 'focused bird must receive a visible avoidance offset');
  for (let frame = 0; frame < 180; frame += 1) {
    advancePointerResponse(responseAgent, activeSample, FRAME_DELTA);
  }
  assert.equal(responseAgent.pointerStartleCount, 1, 'held cursor must stay latched to one startle');
  advancePointerResponse(responseAgent, createPointerSample(), FRAME_DELTA);
  for (let frame = 0; frame < 7; frame += 1) {
    advancePointerResponse(responseAgent, activeSample, FRAME_DELTA);
  }
  assert.equal(responseAgent.pointerStartleCount, 2, 'leaving and hovering again may trigger a new startle');

  const perchedAgent = createFlightAgents(1)[0];
  perchedAgent.landingState = LANDING_STATE.PERCHED;
  perchedAgent.landingSiteIndex = 0;
  perchedAgent.landingClock = 3;
  const perchResult = scareLandingAgent(perchedAgent, 5, activeSample.away);
  assert.equal(perchResult, 'takeoff', 'hovered perched bird must enter takeoff');
  assert.equal(perchedAgent.landingState, LANDING_STATE.TAKEOFF);
  assert.ok(perchedAgent.startleDirection.dot(activeSample.away) > 0.999, 'startled takeoff must remember cursor escape direction');

  const approachingAgent = createFlightAgents(1)[0];
  approachingAgent.landingState = LANDING_STATE.APPROACH;
  approachingAgent.landingSiteIndex = 0;
  const approachResult = scareLandingAgent(approachingAgent, 5, activeSample.away);
  assert.equal(approachResult, 'abort', 'hovered approaching bird must abort landing');
  assert.equal(approachingAgent.landingState, LANDING_STATE.REJOIN);
  assert.equal(approachingAgent.landingSiteIndex, -1);

  const controlAgents = createFlightAgents(1);
  const interactiveAgents = createFlightAgents(1);
  const inactiveSample = createPointerSample();
  let maxTrajectoryDeviation = 0;
  for (let frame = 1; frame <= 4 * 60; frame += 1) {
    const sample = frame <= 12 ? activeSample : inactiveSample;
    advancePointerResponse(interactiveAgents[0], sample, FRAME_DELTA);
    updateFlightAgents(controlAgents, frame * FRAME_DELTA, FRAME_DELTA, 'flight');
    updateFlightAgents(interactiveAgents, frame * FRAME_DELTA, FRAME_DELTA, 'flight');
    maxTrajectoryDeviation = Math.max(
      maxTrajectoryDeviation,
      controlAgents[0].position.distanceTo(interactiveAgents[0].position),
    );
    assert.ok(
      interactiveAgents[0].position.toArray().every(Number.isFinite)
        && interactiveAgents[0].quaternion.toArray().every(Number.isFinite),
      'pointer avoidance must keep finite transforms',
    );
  }
  assert.ok(maxTrajectoryDeviation > 0.55, 'near cursor must visibly bend the airborne trajectory');

  return {
    law: SEAGULL_POINTER_LAW,
    nearVisibleBodyPixels: nearSample.visibleBodyPixels,
    distantVisibleBodyPixels: distantSample.visibleBodyPixels,
    zoomedVisibleBodyPixels: zoomedSample.visibleBodyPixels,
    orthographicVisibleBodyPixels: orthographicSample.visibleBodyPixels,
    maxTrajectoryDeviationMeters: maxTrajectoryDeviation,
  };
}

const pointerInteractionCheck = checkPointerInteractionLaw();

function checkShootingMechanic() {
  const viewport = { width: 1920, height: 1080 };
  const pointer = new THREE.Vector2(0, 0);
  const camera = makePerspectiveCamera(8);
  const targetAgents = createFlightAgents(1);
  targetAgents[0].position.set(0, 0, 0);
  targetAgents[0].modelScale = 1;
  const visibleTarget = findSeagullShotTarget(
    targetAgents,
    camera,
    viewport,
    pointer,
  );
  assert.equal(visibleTarget?.index, 0, 'centered visible gull must be targetable by LMB');

  const occlusionScene = new THREE.Scene();
  const occluder = new THREE.Group();
  const occluderMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 0.2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const occlusionAnchor = new THREE.Object3D();
  occluder.position.z = 2;
  occluder.add(occluderMesh, occlusionAnchor);
  occlusionScene.add(occluder);
  occlusionScene.updateMatrixWorld(true);
  const occludedTarget = findSeagullShotTarget(
    targetAgents,
    camera,
    viewport,
    pointer,
    [{ object: occlusionAnchor, collisionObject: occluder }],
  );
  assert.equal(occludedTarget, null, 'boat or sculpture in front of a gull must block the shot');
  occluderMesh.geometry.dispose();
  occluderMesh.material.dispose();

  const supportScene = new THREE.Scene();
  const supportOccluder = new THREE.Group();
  const supportMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 0.02),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const supportAnchor = new THREE.Object3D();
  supportOccluder.position.z = 0.11;
  supportOccluder.add(supportMesh, supportAnchor);
  supportScene.add(supportOccluder);
  supportScene.updateMatrixWorld(true);
  targetAgents[0].landingState = LANDING_STATE.PERCHED;
  const supportedTarget = findSeagullShotTarget(
    targetAgents,
    camera,
    viewport,
    pointer,
    [{ object: supportAnchor, collisionObject: supportOccluder }],
  );
  assert.equal(
    supportedTarget?.index,
    0,
    'a landing support may overlap the lower body without hiding a perched gull',
  );
  targetAgents[0].landingState = LANDING_STATE.AIRBORNE;
  assert.equal(
    findSeagullShotTarget(
      targetAgents,
      camera,
      viewport,
      pointer,
      [{ object: supportAnchor, collisionObject: supportOccluder }],
    ),
    null,
    'the same overlap must still occlude an airborne gull',
  );
  supportMesh.geometry.dispose();
  supportMesh.material.dispose();

  const agents = createFlightAgents(5);
  agents.forEach((agent) => { agent.modelScale = 1; });
  agents[0].landingState = LANDING_STATE.PERCHED;
  agents[0].landingSiteIndex = 0;
  agents[0].landingClock = 3;
  const runtime = createSeagullShootingRuntime('qa-ammo');
  const rayDirection = new THREE.Vector3(0, 0, -1);
  const firstShot = fireSeagullShot(runtime, agents, 0, rayDirection, 0);
  assert.equal(firstShot.kind, 'hit', 'first barrel must hit a valid gull');
  assert.equal(runtime.shells, 1, 'first shot must leave one barrel');
  assert.equal(agents[0].shotState, SEAGULL_DOWNED_STATE.STUN);
  assert.equal(agents[0].landingState, LANDING_STATE.AIRBORNE, 'hit gull must release its landing site');
  assert.equal(agents[0].landingSiteIndex, -1);
  assert.ok(
    agents[0].shotVelocity.length() < 0.6,
    'hit perched gull must collapse onto its support instead of launching away',
  );
  const downedRig = getWingPose(agents[0]);
  assert.notEqual(downedRig.shoulderL, downedRig.shoulderR, 'downed rig must lose symmetric wing motion');

  const returnStarts = agents.slice(1).map((agent) => agent.shotFearReturnStart);
  assert.ok(
    returnStarts.every((time) => (
      time >= SEAGULL_SHOOTING_LAW.returnDelaySeconds[0]
      && time <= SEAGULL_SHOOTING_LAW.returnDelaySeconds[1]
    )),
    'survivors must remain away for roughly 40 seconds',
  );
  const secondShot = fireSeagullShot(runtime, agents, 1, rayDirection, 0.3);
  assert.equal(secondShot.kind, 'hit', 'second barrel must remain available during the scatter');
  assert.equal(runtime.shells, 0);
  assert.ok(runtime.reloadEndsAt >= 8, 'two empty barrels must begin the slow hidden reload');
  const thirdShot = fireSeagullShot(runtime, agents, 2, rayDirection, 0.6);
  assert.equal(thirdShot.kind, 'dry', 'third shot before reload must not hit another gull');
  assert.equal(runtime.hitCount, 2);
  advanceSeagullShootingRuntime(runtime, 8.2);
  assert.equal(runtime.shells, 2, 'both barrels must return together after reload');

  for (let frame = 1; frame <= 90; frame += 1) {
    const time = 0.3 + frame * FRAME_DELTA;
    updateFlightAgents(agents, time, FRAME_DELTA, 'flight', [], time);
  }
  const panicking = agents.filter((agent) => !agent.shotState && agent.shotFearStrength > 0);
  assert.equal(panicking.length, 3, 'all surviving gulls must enter staggered escape routes');
  updateFlightAgents(agents, 70, FRAME_DELTA, 'flight', [], 70);
  assert.equal(
    agents.filter((agent) => !agent.shotState && agent.shotFearStrength > 0).length,
    0,
    'survivors must release the fear offset after the authored return window',
  );

  function simulateFloorFall() {
    const floorAgents = createFlightAgents(1);
    floorAgents[0].modelScale = 1;
    const floorRuntime = createSeagullShootingRuntime('qa-floor');
    fireSeagullShot(floorRuntime, floorAgents, 0, rayDirection, 0);
    const bird = floorAgents[0];
    bird.position.set(0, 1.2, 0);
    bird.previousPosition.copy(bird.position);
    bird.shotVelocity.set(1.2, 0.15, 0);
    bird.velocity.copy(bird.shotVelocity);
    const events = [];
    let minY = bird.position.y;
    for (let frame = 1; frame <= 180; frame += 1) {
      events.push(...advanceDownedSeagulls(
        floorRuntime,
        floorAgents,
        frame * FRAME_DELTA,
        FRAME_DELTA,
        [],
        -1.14,
      ));
      minY = Math.min(minY, bird.position.y);
    }
    return {
      bird,
      events,
      minY,
      position: bird.position.clone(),
      quaternion: bird.quaternion.clone(),
    };
  }

  const firstFall = simulateFloorFall();
  const secondFall = simulateFloorFall();
  assert.equal(firstFall.bird.shotState, SEAGULL_DOWNED_STATE.WATER);
  assert.equal(
    firstFall.events.filter((event) => event.kind === 'water-impact').length,
    1,
    'water plane must receive one impact event',
  );
  assert.ok(firstFall.position.x > 0.2, 'falling gull must preserve forward momentum');
  assert.ok(firstFall.minY >= -1.14, 'downed body must not tunnel through the water plane');
  assert.ok(firstFall.position.distanceTo(secondFall.position) < 1e-9, 'fixed seed fall must be deterministic');
  assert.ok(firstFall.quaternion.angleTo(secondFall.quaternion) < 1e-9);
  assert.ok(
    firstFall.position.toArray().every(Number.isFinite)
      && firstFall.quaternion.toArray().every(Number.isFinite),
    'downed physics must keep finite transforms',
  );

  const surfaceScene = new THREE.Scene();
  const tiltedSurface = new THREE.Group();
  const tiltedMesh = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.18, 4),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const surfaceAnchor = new THREE.Object3D();
  tiltedSurface.position.y = -0.18;
  tiltedSurface.rotation.z = 0.28;
  tiltedSurface.add(tiltedMesh, surfaceAnchor);
  surfaceScene.add(tiltedSurface);
  surfaceScene.updateMatrixWorld(true);
  const surfaceAgents = createFlightAgents(1);
  surfaceAgents[0].modelScale = 1;
  const surfaceRuntime = createSeagullShootingRuntime('qa-surface');
  fireSeagullShot(surfaceRuntime, surfaceAgents, 0, rayDirection, 0);
  surfaceAgents[0].position.set(0, 1.05, 0);
  surfaceAgents[0].previousPosition.copy(surfaceAgents[0].position);
  surfaceAgents[0].shotVelocity.set(2.5, -0.1, 0);
  const surfaceEvents = [];
  let consecutiveSupportFrames = 0;
  let maxConsecutiveSupportFrames = 0;
  for (let frame = 1; frame <= 150; frame += 1) {
    surfaceScene.updateMatrixWorld(true);
    surfaceEvents.push(...advanceDownedSeagulls(
      surfaceRuntime,
      surfaceAgents,
      frame * FRAME_DELTA,
      FRAME_DELTA,
      [{ object: surfaceAnchor, collisionObject: tiltedSurface }],
      -1.14,
    ));
    if (
      [SEAGULL_DOWNED_STATE.SLIDING, SEAGULL_DOWNED_STATE.RESTING]
        .includes(surfaceAgents[0].shotState)
      && surfaceAgents[0].shotContactObject === tiltedSurface
    ) {
      consecutiveSupportFrames += 1;
      maxConsecutiveSupportFrames = Math.max(
        maxConsecutiveSupportFrames,
        consecutiveSupportFrames,
      );
    } else {
      consecutiveSupportFrames = 0;
    }
  }
  assert.ok(
    surfaceEvents.some((event) => event.kind === 'surface-impact'),
    'tilted sculpture proxy must receive a swept collision',
  );
  assert.ok(
    surfaceAgents[0].position.toArray().every(Number.isFinite)
      && surfaceAgents[0].quaternion.toArray().every(Number.isFinite),
    'surface sliding must keep finite transforms',
  );
  assert.ok(
    maxConsecutiveSupportFrames >= 3,
    `sliding body must retain support contact (${maxConsecutiveSupportFrames})`,
  );
  assert.equal(
    surfaceAgents[0].shotState,
    SEAGULL_DOWNED_STATE.RESTING,
    'stable tilted support must let the body settle',
  );
  const restingLocalPosition = surfaceAgents[0].shotContactLocalPosition.clone();
  tiltedSurface.position.set(0.18, -0.12, -0.09);
  tiltedSurface.rotation.set(0.06, -0.12, 0.24);
  surfaceScene.updateMatrixWorld(true);
  advanceDownedSeagulls(
    surfaceRuntime,
    surfaceAgents,
    151 * FRAME_DELTA,
    FRAME_DELTA,
    [{ object: surfaceAnchor, collisionObject: tiltedSurface }],
    -1.14,
  );
  const movedRestPosition = restingLocalPosition.clone();
  tiltedSurface.localToWorld(movedRestPosition);
  assert.ok(
    movedRestPosition.distanceTo(surfaceAgents[0].position) < 1e-5,
    'resting body must inherit a moved and tilted support transform',
  );
  tiltedMesh.geometry.dispose();
  tiltedMesh.material.dispose();

  return {
    law: SEAGULL_SHOOTING_LAW,
    visibleTargetPixels: visibleTarget.visibleBodyPixels,
    returnStartsSeconds: returnStarts,
    panickingSurvivors: panicking.length,
    reloadEndsAtSeconds: runtime.reloadEndsAt,
    floorState: firstFall.bird.shotState,
    floorForwardTravelMeters: firstFall.position.x,
    surfaceState: surfaceAgents[0].shotState,
    surfaceImpacts: surfaceEvents.filter((event) => event.kind === 'surface-impact').length,
    maxConsecutiveSupportFrames,
  };
}

const shootingCheck = checkShootingMechanic();

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

const realCollisionScene = new THREE.Scene();
const movingSculptureRoot = new THREE.Group();
movingSculptureRoot.position.set(2.15, -1.14, -0.08);
movingSculptureRoot.rotation.set(0.07, 0.18, -0.14);
movingSculptureRoot.add(sculptureSurface);
realCollisionScene.add(movingSculptureRoot);
const sculptureCrown = projectedSurfaces.find((site) => site.id === 'sculpture-crown');
const sculptureCollisionAnchor = new THREE.Object3D();
sculptureCollisionAnchor.position.fromArray(sculptureCrown.position);
sculptureCollisionAnchor.quaternion.copy(sculptureCrown.quaternion);
movingSculptureRoot.add(sculptureCollisionAnchor);
realCollisionScene.updateMatrixWorld(true);
const crownWorldPosition = sculptureCollisionAnchor.getWorldPosition(new THREE.Vector3());
const crownWorldQuaternion = sculptureCollisionAnchor.getWorldQuaternion(new THREE.Quaternion());
const crownWorldNormal = WORLD_UP.clone().applyQuaternion(crownWorldQuaternion).normalize();
const crownWorldForward = new THREE.Vector3(1, 0, 0)
  .applyQuaternion(crownWorldQuaternion)
  .normalize();
const realSurfaceAgents = createFlightAgents(1);
realSurfaceAgents[0].modelScale = 1;
const realSurfaceRuntime = createSeagullShootingRuntime('qa-real-sculpture');
fireSeagullShot(realSurfaceRuntime, realSurfaceAgents, 0, crownWorldNormal.clone().negate(), 0);
const realSurfaceBird = realSurfaceAgents[0];
realSurfaceBird.position.copy(crownWorldPosition).addScaledVector(WORLD_UP, 0.48);
realSurfaceBird.previousPosition.copy(realSurfaceBird.position);
realSurfaceBird.quaternion.copy(crownWorldQuaternion);
realSurfaceBird.heading.copy(crownWorldForward);
realSurfaceBird.shotVelocity.copy(crownWorldForward).multiplyScalar(0.02)
  .addScaledVector(WORLD_UP, -0.04);
const realSurfaceEvents = [];
let sculptureFollowError = Infinity;
let sculptureContactFrame = null;
let sculptureContactFrames = 0;
let consecutiveSculptureContactFrames = 0;
let maxConsecutiveSculptureContactFrames = 0;
for (let frame = 1; frame <= 240; frame += 1) {
  const time = frame * FRAME_DELTA;
  movingSculptureRoot.position.x = 2.15 + Math.sin(time * 0.5) * 0.045;
  movingSculptureRoot.position.y = -1.14 + Math.sin(time * 0.7) * 0.018;
  movingSculptureRoot.rotation.z = -0.14 + Math.sin(time * 0.8) * 0.025;
  realCollisionScene.updateMatrixWorld(true);
  realSurfaceEvents.push(...advanceDownedSeagulls(
    realSurfaceRuntime,
    realSurfaceAgents,
    time,
    FRAME_DELTA,
    [{ object: sculptureCollisionAnchor, collisionObject: sculptureSurface }],
    -10,
  ));
  if (realSurfaceBird.shotContactObject === sculptureSurface) {
    sculptureContactFrames += 1;
    consecutiveSculptureContactFrames += 1;
    maxConsecutiveSculptureContactFrames = Math.max(
      maxConsecutiveSculptureContactFrames,
      consecutiveSculptureContactFrames,
    );
    const expectedWorld = realSurfaceBird.shotContactLocalPosition.clone();
    sculptureSurface.localToWorld(expectedWorld);
    sculptureFollowError = Math.min(
      sculptureFollowError,
      expectedWorld.distanceTo(realSurfaceBird.position),
    );
    sculptureContactFrame ??= frame;
  } else {
    consecutiveSculptureContactFrames = 0;
  }
}
assert.ok(
  realSurfaceEvents.some((event) => event.kind === 'surface-impact'),
  'real sculpture GLB must receive the downed body sweep',
);
assert.ok(sculptureContactFrame, 'downed gull must contact the real sculpture crown');
assert.ok(
  sculptureFollowError < 1e-5,
  'real sculpture contact must remain in its moving local frame',
);

console.log(JSON.stringify({
  flightChecks,
  shadowLodCheck,
  reflectionLodCheck,
  pointerInteractionCheck,
  shootingCheck,
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
  realSculptureCollision: {
    impacts: realSurfaceEvents.filter((event) => event.kind === 'surface-impact').length,
    contactFrame: sculptureContactFrame,
    contactFrames: sculptureContactFrames,
    maxConsecutiveContactFrames: maxConsecutiveSculptureContactFrames,
    followErrorMeters: sculptureFollowError,
    finalState: realSurfaceBird.shotState,
  },
}, null, 2));
