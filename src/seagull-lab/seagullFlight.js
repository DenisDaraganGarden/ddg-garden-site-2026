import * as THREE from 'three';

const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const MIN_SEPARATION_METERS = 1.12;
const MAX_BANK_RADIANS = 0.3;
const FORMATION_TRAIL_SPACING = 0.68;
const FORMATION_LATERAL_SPACING = 1.28;

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
    0.5 + Math.sin(angle * 1.7) * 0.2,
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
  const angle = time * (0.2 + agent.index * 0.004) + agent.orbitPhase;
  const radiusX = 3.15 + agent.orbitScale * 0.72;
  const radiusZ = 2.4 + agent.orbitScale * 0.58;
  agent.target.set(
    Math.cos(angle) * radiusX,
    0.62 + agent.altitudeBias + Math.sin(angle * 1.8 + agent.index) * 0.28,
    Math.sin(angle * 0.93) * radiusZ,
  );
  agent.plannedHeading.set(
    -Math.sin(angle) * radiusX,
    0,
    Math.cos(angle * 0.93) * radiusZ * 0.93,
  ).normalize();
}

function writeTarget(agent, time) {
  if (agent.formation) sampleFormationTarget(time, agent);
  else sampleSoloTarget(time, agent);
  if (agent.state === 'thermal') {
    agent.target.y += Math.sin(time * 0.52 + agent.index) * 0.13 + 0.18;
  }
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

function setStableOrientation(agent) {
  scratchForward.copy(agent.heading).normalize();
  scratchRight.crossVectors(scratchForward, UP);
  if (scratchRight.lengthSq() < 1e-6) scratchRight.set(0, 0, 1);
  else scratchRight.normalize();
  scratchStableUp.crossVectors(scratchRight, scratchForward).normalize();
  scratchBasis.makeBasis(scratchForward, scratchStableUp, scratchRight);
  agent.quaternion.setFromRotationMatrix(scratchBasis);
  scratchBank.setFromAxisAngle(FORWARD, agent.bank);
  agent.quaternion.multiply(scratchBank).normalize();
}

export function createFlightAgents(count) {
  const formationCount = formationAgentCount(count);
  const soloCount = Math.max(0, count - formationCount);
  const agents = Array.from({ length: count }, (_, index) => {
    const random = seededRandom(701 + index * 977);
    const formation = index < formationCount;
    const soloIndex = index - formationCount;
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
      state: index % 4 === 0 ? 'glide' : 'flap',
      stateTime: 0.8 + random() * 2.2,
      orbitPhase,
      orbitScale: 0.88 + random() * 0.26,
      altitudeBias: (random() - 0.5) * 0.32,
      bank: 0,
      physicalHeight: 12,
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
  if (roll < 0.56) {
    agent.state = 'flap';
    agent.stateTime = 0.8 + agent.random() * 1.25;
  } else if (roll < 0.9) {
    agent.state = 'glide';
    agent.stateTime = 1.5 + agent.random() * 3.2;
  } else {
    agent.state = 'thermal';
    agent.stateTime = 2.8 + agent.random() * 3.8;
  }
}

export function updateFlightAgents(agents, time, delta, mode) {
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
    agent.previousPosition.copy(agent.position);
    agent.stateTime -= delta;
    if (agent.stateTime <= 0) chooseState(agent, mode);
    if (agent.state === 'flap') {
      agent.phase += delta * agent.flapFrequency * Math.PI * 2;
    } else {
      agent.phase += delta * Math.PI * 0.25;
    }
    writeTarget(agent, time);
  }

  solveSeparation(agents, 'target');

  for (const agent of agents) {
    const response = 1 - Math.exp(-delta * (agent.formation ? 3.4 : 2.15));
    agent.position.lerp(agent.target, response);
  }
  solveSeparation(agents, 'position', 5);

  const safeDelta = Math.max(delta, 1 / 240);
  for (const agent of agents) {
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
    setStableOrientation(agent);
    agent.physicalHeight = THREE.MathUtils.clamp(18 + agent.position.y * 8.5, 12, 28);
  }
}

export function getWingPose(agent) {
  if (agent.state !== 'flap') {
    const lift = agent.state === 'thermal' ? -0.1 : -0.065;
    return {
      shoulder: lift,
      inner: -0.02,
      outer: -0.025,
      tip: -0.015,
      heave: 0,
    };
  }

  const wave = Math.sin(agent.phase);
  const upstroke = Math.max(0, -wave);
  return {
    shoulder: wave * 0.58,
    inner: wave * 0.06 - upstroke * 0.04,
    outer: wave * 0.025 - upstroke * 0.085,
    tip: wave * 0.015 - upstroke * 0.055,
    heave: 0,
  };
}
