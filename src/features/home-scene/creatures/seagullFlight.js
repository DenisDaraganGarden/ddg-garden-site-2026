import * as THREE from 'three';
import {
  getLandingRigPose,
  LANDING_STATE,
  prepareLandingMode,
  resetLandingMode,
  scareLandingAgent,
  scheduleLanding,
  updateLandingMotion,
} from './seagullLanding.js';
import { pointerAvoidanceOffset } from './seagullPointerInteraction.js';
import {
  advanceShotFear,
  getDownedRigPose,
  shotFearOffset,
} from './seagullShooting.js';

const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const MIN_SEPARATION_METERS = 1.12;
const MAX_BANK_RADIANS = 0.3;
const FORMATION_TRAIL_SPACING = 0.68;
const FORMATION_LATERAL_SPACING = 1.28;

// The production water surface is y=0. Route centres are authored directly in
// home-scene coordinates so the low pass never inherits the asset-lab floor at
// y=-1.14 when this module is mounted in WaterScene.
export const HOME_SEAGULL_WATER_Y = 0;
export const SEAGULL_ROUTE_PROFILE = Object.freeze({
  flock: Object.freeze({ height: 1.64 }),
  waterline: Object.freeze({ height: 0.36 }),
  long: Object.freeze({ height: 2.22 }),
  high: Object.freeze({ height: 4.59 }),
});

export const FLIGHT_ROUTE = Object.freeze({
  FLOCK: 'flock',
  WATERLINE: 'waterline',
  HIGH: 'high',
  LONG: 'long',
});

const SOLO_ROUTE_SEQUENCE = Object.freeze([
  FLIGHT_ROUTE.HIGH,
  FLIGHT_ROUTE.WATERLINE,
  FLIGHT_ROUTE.LONG,
  FLIGHT_ROUTE.WATERLINE,
]);

const scratchForward = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchStableUp = new THREE.Vector3();
const scratchInstantVelocity = new THREE.Vector3();
const scratchPreviousHeading = new THREE.Vector3();
const scratchTurn = new THREE.Vector3();
const scratchHorizontalHeading = new THREE.Vector3();
const scratchDesiredHorizontal = new THREE.Vector3();
const scratchSeparation = new THREE.Vector3();
const scratchBasis = new THREE.Matrix4();
const scratchBank = new THREE.Quaternion();
const scratchHeadingRotation = new THREE.Quaternion();
const scratchTargetOrientation = new THREE.Quaternion();

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function formationAgentCount(count) {
  if (count <= 3) return count;
  if (count <= 9) return Math.min(count, 5);
  return Math.min(count, 7);
}

function formationOffset(index) {
  if (index === 0) return new THREE.Vector3();
  const row = Math.ceil(index / 2);
  const side = index % 2 === 0 ? 1 : -1;
  return new THREE.Vector3(
    -row * FORMATION_TRAIL_SPACING,
    (index % 3 - 1) * 0.055,
    side * row * FORMATION_LATERAL_SPACING,
  );
}

function sampleFormationTarget(time, agent) {
  const delay = Math.ceil(agent.index / 2) * 0.14;
  const angle = time * 0.27 - delay;
  agent.target.set(
    Math.cos(angle) * 0.82,
    SEAGULL_ROUTE_PROFILE.flock.height + Math.sin(angle * 1.7) * 0.2,
    Math.sin(angle) * 0.54,
  );
  agent.plannedHeading.set(
    -Math.sin(angle) * 0.82,
    0,
    Math.cos(angle) * 0.54,
  ).normalize();
  scratchRight.crossVectors(agent.plannedHeading, UP).normalize();
  agent.target.addScaledVector(agent.plannedHeading, agent.offset.x);
  agent.target.addScaledVector(scratchRight, agent.offset.z);
  agent.target.y += agent.offset.y;
}

function sampleSoloTarget(time, agent) {
  const speed = agent.route === FLIGHT_ROUTE.HIGH
    ? 0.13
    : agent.route === FLIGHT_ROUTE.LONG
      ? 0.155
      : 0.185;
  const angle = time * (speed + agent.index * 0.0015) + agent.orbitPhase;
  const route = {
    [FLIGHT_ROUTE.HIGH]: {
      radiusX: 4.45 + agent.orbitScale * 0.55,
      radiusZ: 3.15 + agent.orbitScale * 0.35,
      zFrequency: 0.82,
      height: SEAGULL_ROUTE_PROFILE.high.height,
      verticalAmplitude: 0.62,
      verticalFrequency: 1.12,
    },
    [FLIGHT_ROUTE.LONG]: {
      radiusX: 6.15 + agent.orbitScale * 0.5,
      radiusZ: 1.65 + agent.orbitScale * 0.32,
      zFrequency: 0.58,
      height: SEAGULL_ROUTE_PROFILE.long.height,
      verticalAmplitude: 0.34,
      verticalFrequency: 1.34,
    },
    [FLIGHT_ROUTE.WATERLINE]: {
      radiusX: 5.2 + agent.orbitScale * 0.5,
      radiusZ: 2.65 + agent.orbitScale * 0.38,
      zFrequency: 0.72,
      height: SEAGULL_ROUTE_PROFILE.waterline.height,
      verticalAmplitude: 0.1,
      verticalFrequency: 1.46,
    },
  }[agent.route];
  const {
    radiusX, radiusZ, zFrequency, height, verticalAmplitude, verticalFrequency,
  } = route;
  agent.target.set(
    Math.cos(angle) * radiusX,
    height + agent.altitudeBias * 0.24
      + Math.sin(angle * verticalFrequency + agent.index) * verticalAmplitude,
    Math.sin(angle * zFrequency) * radiusZ,
  );
  agent.plannedHeading.set(
    -Math.sin(angle) * radiusX,
    0,
    Math.cos(angle * zFrequency) * radiusZ * zFrequency,
  ).normalize();
}

function writeTarget(agent, time, mode = 'flight') {
  if (agent.formation) sampleFormationTarget(time, agent);
  else sampleSoloTarget(time, agent);
  if (agent.state === 'thermal') {
    agent.target.y += Math.sin(time * 0.52 + agent.index) * 0.13 + 0.18;
  }
  if (mode === 'landing') {
    if (agent.route === FLIGHT_ROUTE.FLOCK) {
      agent.target.x *= 1.45;
      agent.target.z *= 1.35;
      agent.target.y += 1.35;
    } else if (agent.route === FLIGHT_ROUTE.HIGH) {
      agent.target.x *= 1.08;
      agent.target.y += 0.24;
    } else if (agent.route === FLIGHT_ROUTE.LONG) {
      agent.target.x *= 1.04;
      agent.target.z *= 1.08;
      agent.target.y += 0.42;
    }
  }
  const avoidanceOffset = pointerAvoidanceOffset(agent);
  if (avoidanceOffset > 0) {
    agent.target.addScaledVector(agent.pointerAvoidance, avoidanceOffset);
  }
  const fearOffset = shotFearOffset(agent);
  if (fearOffset > 0 && agent.shotFearDirection) {
    agent.target.addScaledVector(agent.shotFearDirection, fearOffset);
    agent.target.y += fearOffset * 0.16;
  }
}

function routeHeightMeters(agent) {
  if (agent.route === FLIGHT_ROUTE.WATERLINE) {
    return THREE.MathUtils.clamp(
      2.8 + (agent.position.y - SEAGULL_ROUTE_PROFILE.waterline.height) * 8,
      2,
      6,
    );
  }
  if (agent.route === FLIGHT_ROUTE.HIGH) {
    return THREE.MathUtils.clamp(
      34 + (agent.position.y - SEAGULL_ROUTE_PROFILE.high.height) * 8,
      28,
      42,
    );
  }
  if (agent.route === FLIGHT_ROUTE.LONG) {
    return THREE.MathUtils.clamp(
      12 + (agent.position.y - SEAGULL_ROUTE_PROFILE.long.height) * 8,
      8,
      19,
    );
  }
  return THREE.MathUtils.clamp(
    18 + (agent.position.y - 1.14) * 8.5,
    12,
    28,
  );
}

function solveSeparation(agents, property, iterations = 6) {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let first = 0; first < agents.length; first += 1) {
      for (let second = first + 1; second < agents.length; second += 1) {
        const firstPosition = agents[first][property];
        const secondPosition = agents[second][property];
        scratchSeparation.subVectors(firstPosition, secondPosition);
        scratchSeparation.y = 0;
        let distance = scratchSeparation.length();
        if (distance >= MIN_SEPARATION_METERS) continue;
        if (distance < 1e-5) {
          const angle = (first * 2.39996 + second * 0.917) % (Math.PI * 2);
          scratchSeparation.set(Math.cos(angle), 0, Math.sin(angle));
          distance = 0;
        } else {
          scratchSeparation.multiplyScalar(1 / distance);
        }
        const correction = (MIN_SEPARATION_METERS - distance) * 0.505;
        firstPosition.addScaledVector(scratchSeparation, correction);
        secondPosition.addScaledVector(scratchSeparation, -correction);
      }
    }
  }
}

function setStableOrientation(agent, delta = null) {
  scratchForward.copy(agent.heading).normalize();
  scratchRight.crossVectors(scratchForward, UP);
  if (scratchRight.lengthSq() < 1e-6) scratchRight.set(0, 0, 1);
  else scratchRight.normalize();
  scratchStableUp.crossVectors(scratchRight, scratchForward).normalize();
  scratchBasis.makeBasis(scratchForward, scratchStableUp, scratchRight);
  scratchTargetOrientation.setFromRotationMatrix(scratchBasis);
  scratchBank.setFromAxisAngle(FORWARD, agent.bank);
  scratchTargetOrientation.multiply(scratchBank).normalize();
  if (delta === null) agent.quaternion.copy(scratchTargetOrientation);
  else agent.quaternion.rotateTowards(scratchTargetOrientation, delta * 2.8).normalize();
}

export function createFlightAgents(count) {
  const formationCount = formationAgentCount(count);
  const soloCount = Math.max(0, count - formationCount);
  const agents = Array.from({ length: count }, (_, index) => {
    const random = seededRandom(701 + index * 977);
    const formation = index < formationCount;
    const soloIndex = index - formationCount;
    const route = formation
      ? FLIGHT_ROUTE.FLOCK
      : SOLO_ROUTE_SEQUENCE[soloIndex % SOLO_ROUTE_SEQUENCE.length];
    const orbitPhase = formation || soloCount === 0
      ? random() * Math.PI * 2
      : (soloIndex / soloCount) * Math.PI * 2 + (random() - 0.5) * 0.24;
    return {
      index,
      formation,
      offset: formationOffset(index),
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      target: new THREE.Vector3(),
      velocity: new THREE.Vector3(1, 0, 0),
      heading: new THREE.Vector3(1, 0, 0),
      plannedHeading: new THREE.Vector3(1, 0, 0),
      quaternion: new THREE.Quaternion(),
      phase: random() * Math.PI * 2,
      flapFrequency: 3.33 + random() * 0.96,
      state: route === FLIGHT_ROUTE.WATERLINE
        ? 'flap'
        : route === FLIGHT_ROUTE.HIGH || index % 4 === 0
          ? 'glide'
          : 'flap',
      stateTime: 0.8 + random() * 2.2,
      orbitPhase,
      orbitScale: 0.88 + random() * 0.26,
      altitudeBias: (random() - 0.5) * 0.32,
      route,
      bank: 0,
      physicalHeight: 12,
      pointerAvoidance: new THREE.Vector3(1, 0.18, 0).normalize(),
      pointerAvoidanceStrength: 0,
      pointerAvoidanceTime: 0,
      pointerThreat: 0,
      pointerCooldown: 0,
      pointerLatched: false,
      pointerInfluence: 0,
      pointerStartleCount: 0,
      random,
    };
  });

  for (const agent of agents) {
    writeTarget(agent, 0);
    agent.position.copy(agent.target);
    agent.previousPosition.copy(agent.position);
    agent.heading.copy(agent.plannedHeading);
    agent.velocity.copy(agent.heading);
  }
  solveSeparation(agents, 'position');
  for (const agent of agents) setStableOrientation(agent);
  return agents;
}

function chooseState(agent, mode) {
  if (mode === 'glide') {
    agent.state = agent.random() < 0.16 ? 'flap' : 'glide';
    agent.stateTime = 2.4 + agent.random() * 3.6;
    return;
  }
  const roll = agent.random();
  const flapThreshold = agent.route === FLIGHT_ROUTE.WATERLINE
    ? 0.72
    : agent.route === FLIGHT_ROUTE.HIGH
      ? 0.28
      : 0.56;
  const glideThreshold = agent.route === FLIGHT_ROUTE.HIGH ? 0.82 : 0.9;
  if (roll < flapThreshold) {
    agent.state = 'flap';
    agent.stateTime = 0.8 + agent.random() * 1.25;
  } else if (roll < glideThreshold) {
    agent.state = 'glide';
    agent.stateTime = 1.5 + agent.random() * 3.2;
  } else {
    agent.state = 'thermal';
    agent.stateTime = 2.8 + agent.random() * 3.8;
  }
}

export function updateFlightAgents(
  agents,
  time,
  delta,
  mode,
  landingSites = [],
  interactionTime = time,
) {
  const specimen = mode === 'specimen';
  if (specimen) {
    for (const agent of agents) {
      agent.state = 'flap';
      agent.position.set(0, 0.08, 0);
      agent.previousPosition.copy(agent.position);
      agent.velocity.set(1, 0, 0);
      agent.heading.set(1, 0, 0);
      agent.quaternion.identity();
      agent.bank = 0;
      agent.physicalHeight = 18;
      agent.phase += delta * agent.flapFrequency * Math.PI * 2 * 0.72;
    }
    return;
  }

  for (const agent of agents) {
    if (agent.shotState) continue;
    const fear = advanceShotFear(agent, interactionTime);
    if (
      Number.isFinite(agent.shotFearReturnStart)
      && interactionTime < agent.shotFearReturnStart
    ) {
      agent.nextLandingTime = Math.max(
        Number.isFinite(agent.nextLandingTime) ? agent.nextLandingTime : 0,
        time + 3.2,
      );
    }
    if (!fear.startle) continue;
    scareLandingAgent(agent, time, agent.shotFearDirection);
    agent.state = 'flap';
    agent.stateTime = Math.max(agent.stateTime ?? 0, 2.4);
  }

  const landingMode = mode === 'landing';
  if (landingMode) {
    prepareLandingMode(agents);
    scheduleLanding(agents, time, landingSites);
  } else if (agents.landingSchedule) {
    resetLandingMode(agents);
  }

  const freeAgents = [];
  for (const agent of agents) {
    if (agent.shotState) continue;
    if (landingMode && updateLandingMotion(agent, time, delta, landingSites)) {
      if (agent.state === 'flap') agent.phase += delta * agent.flapFrequency * Math.PI * 2;
      else agent.phase += delta * Math.PI * 0.25;
      continue;
    }

    agent.previousPosition.copy(agent.position);
    agent.stateTime -= delta;
    if (agent.stateTime <= 0) chooseState(agent, mode);
    if (agent.state === 'flap') {
      agent.phase += delta * agent.flapFrequency * Math.PI * 2;
    } else {
      agent.phase += delta * Math.PI * 0.25;
    }
    writeTarget(agent, time, mode);
    freeAgents.push(agent);
  }

  solveSeparation(freeAgents, 'target');

  for (const agent of freeAgents) {
    const response = 1 - Math.exp(-delta * (agent.formation ? 3.4 : 2.15));
    agent.position.lerp(agent.target, response);
  }
  solveSeparation(freeAgents, 'position', 5);

  const safeDelta = Math.max(delta, 1 / 240);
  for (const agent of freeAgents) {
    scratchInstantVelocity.subVectors(agent.position, agent.previousPosition).multiplyScalar(1 / safeDelta);
    if (scratchInstantVelocity.lengthSq() < 1e-5) scratchInstantVelocity.copy(agent.plannedHeading);
    agent.velocity.lerp(scratchInstantVelocity, 1 - Math.exp(-delta * 5.2));

    scratchForward.copy(agent.velocity);
    const horizontalSpeed = Math.hypot(scratchForward.x, scratchForward.z);
    const maxVerticalSpeed = Math.max(0.01, horizontalSpeed * 0.24);
    scratchForward.y = THREE.MathUtils.clamp(scratchForward.y, -maxVerticalSpeed, maxVerticalSpeed);
    if (scratchForward.lengthSq() < 1e-5) scratchForward.copy(agent.plannedHeading);
    scratchForward.normalize();

    scratchPreviousHeading.copy(agent.heading);
    scratchHorizontalHeading.set(agent.heading.x, 0, agent.heading.z);
    if (scratchHorizontalHeading.lengthSq() < 1e-6) scratchHorizontalHeading.copy(agent.plannedHeading).setY(0);
    scratchHorizontalHeading.normalize();
    scratchDesiredHorizontal.set(scratchForward.x, 0, scratchForward.z);
    if (scratchDesiredHorizontal.lengthSq() < 1e-6) scratchDesiredHorizontal.copy(scratchHorizontalHeading);
    else scratchDesiredHorizontal.normalize();

    scratchTurn.crossVectors(scratchHorizontalHeading, scratchDesiredHorizontal);
    const signedYaw = Math.atan2(
      scratchTurn.dot(UP),
      THREE.MathUtils.clamp(scratchHorizontalHeading.dot(scratchDesiredHorizontal), -1, 1),
    );
    const maxTurnStep = delta * (agent.formation ? 1.65 : 1.35);
    scratchHeadingRotation.setFromAxisAngle(
      UP,
      THREE.MathUtils.clamp(signedYaw, -maxTurnStep, maxTurnStep),
    );
    scratchHorizontalHeading.applyQuaternion(scratchHeadingRotation).normalize();

    const currentPitch = Math.asin(THREE.MathUtils.clamp(agent.heading.y, -0.24, 0.24));
    const desiredPitch = Math.asin(THREE.MathUtils.clamp(scratchForward.y, -0.24, 0.24));
    const maxPitchStep = delta * 0.55;
    const pitch = currentPitch + THREE.MathUtils.clamp(
      desiredPitch - currentPitch,
      -maxPitchStep,
      maxPitchStep,
    );
    agent.heading.copy(scratchHorizontalHeading).multiplyScalar(Math.cos(pitch));
    agent.heading.y = Math.sin(pitch);

    scratchTurn.crossVectors(scratchPreviousHeading, agent.heading);
    const signedTurnRate = scratchTurn.dot(UP) / safeDelta;
    const desiredBank = THREE.MathUtils.clamp(
      -signedTurnRate * 0.62,
      -MAX_BANK_RADIANS,
      MAX_BANK_RADIANS,
    );
    agent.bank = THREE.MathUtils.damp(agent.bank, desiredBank, 3.8, delta);
    setStableOrientation(agent, delta);
    agent.physicalHeight = routeHeightMeters(agent);
  }
}

export function getWingPose(agent) {
  const downedPose = getDownedRigPose(agent);
  if (downedPose) return downedPose;
  const landingPose = getLandingRigPose(agent);
  const rig = {
    fold: landingPose?.fold ?? 0,
    legDeploy: landingPose?.legDeploy ?? 0,
    legCompression: landingPose?.legCompression ?? 0,
    toeGrip: landingPose?.toeGrip ?? 0,
    tailSpread: landingPose?.tailSpread ?? 0,
    headLook: landingPose?.headLook ?? 0,
  };
  if (landingPose?.flapScale === 0) {
    return {
      shoulder: 0,
      inner: 0,
      outer: 0,
      tip: 0,
      heave: 0,
      ...rig,
    };
  }

  if (agent.state !== 'flap') {
    const lift = agent.state === 'thermal' ? -0.1 : -0.065;
    return {
      shoulder: lift + (landingPose?.shoulderBias ?? 0),
      inner: -0.02,
      outer: -0.025,
      tip: -0.015,
      heave: 0,
      ...rig,
    };
  }

  const wave = Math.sin(agent.phase);
  const upstroke = Math.max(0, -wave);
  const panicScale = 1 + Math.min(0.14, (agent.pointerAvoidanceStrength ?? 0) * 0.14);
  const flapScale = (landingPose?.flapScale ?? 1) * panicScale;
  return {
    shoulder: (wave * 0.58 * flapScale) + (landingPose?.shoulderBias ?? 0),
    inner: (wave * 0.06 - upstroke * 0.04) * flapScale,
    outer: (wave * 0.025 - upstroke * 0.085) * flapScale,
    tip: (wave * 0.015 - upstroke * 0.055) * flapScale,
    heave: 0,
    ...rig,
  };
}

export { LANDING_STATE };
