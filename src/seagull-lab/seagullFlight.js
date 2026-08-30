import * as THREE from 'three';

const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const scratchForward = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();
const scratchPrevious = new THREE.Vector3();
const scratchBank = new THREE.Quaternion();

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

function formationOffset(index) {
  if (index === 0) return new THREE.Vector3();
  const row = Math.ceil(index / 2);
  const side = index % 2 === 0 ? 1 : -1;
  return new THREE.Vector3(-row * 0.34, (index % 3 - 1) * 0.035, side * row * 0.43);
}

export function createFlightAgents(count) {
  const formationCount = Math.min(count, Math.max(1, Math.round(count * 0.67)));
  return Array.from({ length: count }, (_, index) => {
    const random = seededRandom(701 + index * 977);
    return {
      index,
      formation: index < formationCount,
      offset: formationOffset(index),
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(1, 0, 0),
      quaternion: new THREE.Quaternion(),
      phase: random() * Math.PI * 2,
      flapFrequency: 3.33 + random() * 0.96,
      state: index % 4 === 0 ? 'glide' : 'flap',
      stateTime: 0.8 + random() * 2.2,
      orbitPhase: random() * Math.PI * 2,
      orbitScale: 0.88 + random() * 0.26,
      altitudeBias: (random() - 0.5) * 0.26,
      bank: 0,
      physicalHeight: 12,
      random,
    };
  });
}

function sampleFormationPath(time, delay, target) {
  const angle = time * 0.31 - delay;
  target.set(
    Math.cos(angle) * 0.76,
    0.48 + Math.sin(angle * 1.7) * 0.28,
    Math.sin(angle) * 0.5,
  );
  return angle;
}

function sampleSoloPath(time, agent, target) {
  const angle = time * (0.24 + agent.index * 0.007) + agent.orbitPhase;
  target.set(
    Math.cos(angle) * (0.95 + agent.orbitScale * 0.24),
    0.58 + agent.altitudeBias + Math.sin(angle * 2.1 + agent.index) * 0.34,
    Math.sin(angle * 0.93) * (0.72 + agent.orbitScale * 0.26),
  );
  return angle;
}

function chooseState(agent, mode) {
  if (mode === 'glide') {
    agent.state = agent.random() < 0.2 ? 'flap' : 'glide';
    agent.stateTime = 2.2 + agent.random() * 3.4;
    return;
  }
  const roll = agent.random();
  if (roll < 0.54) {
    agent.state = 'flap';
    agent.stateTime = 0.75 + agent.random() * 1.25;
  } else if (roll < 0.9) {
    agent.state = 'glide';
    agent.stateTime = 1.4 + agent.random() * 3.2;
  } else {
    agent.state = 'thermal';
    agent.stateTime = 2.8 + agent.random() * 3.8;
  }
}

export function updateFlightAgents(agents, time, delta, mode) {
  const specimen = mode === 'specimen';
  for (const agent of agents) {
    if (specimen) {
      agent.state = 'flap';
      agent.position.set(0, 0.08, 0);
      agent.velocity.set(1, 0, 0);
      agent.quaternion.identity();
      agent.physicalHeight = 18;
      agent.phase += delta * agent.flapFrequency * Math.PI * 2 * 0.72;
      continue;
    }

    agent.stateTime -= delta;
    if (agent.stateTime <= 0) chooseState(agent, mode);
    if (agent.state === 'flap') {
      agent.phase += delta * agent.flapFrequency * Math.PI * 2;
    } else {
      agent.phase += delta * Math.PI * 0.32;
    }

    const delay = agent.formation ? Math.ceil(agent.index / 2) * 0.18 : 0;
    const angle = agent.formation
      ? sampleFormationPath(time, delay, scratchTarget)
      : sampleSoloPath(time, agent, scratchTarget);
    scratchPrevious.copy(agent.position);

    scratchForward.set(-Math.sin(angle), 0, Math.cos(angle) * 0.66).normalize();
    scratchRight.crossVectors(scratchForward, UP).normalize();
    if (agent.formation) {
      scratchTarget.addScaledVector(scratchForward, agent.offset.x);
      scratchTarget.addScaledVector(scratchRight, agent.offset.z);
      scratchTarget.y += agent.offset.y;
    }
    if (agent.state === 'thermal') {
      scratchTarget.y += Math.sin(time * 0.52 + agent.index) * 0.16 + 0.2;
    }

    const stageScale = mode === 'glide' ? 0.58 : 0.72;
    scratchTarget.x *= stageScale;
    scratchTarget.z *= stageScale;

    const response = 1 - Math.exp(-delta * (agent.formation ? 3.9 : 2.4));
    agent.position.lerp(scratchTarget, response);
    const safeDelta = Math.max(delta, 1 / 240);
    agent.velocity.lerp(
      scratchForward.copy(agent.position).sub(scratchPrevious).multiplyScalar(1 / safeDelta),
      1 - Math.exp(-delta * 7),
    );
    if (agent.velocity.lengthSq() < 1e-5) agent.velocity.set(1, 0, 0);
    scratchForward.copy(agent.velocity).normalize();
    agent.quaternion.setFromUnitVectors(FORWARD, scratchForward);
    const desiredBank = THREE.MathUtils.clamp(-scratchForward.z * 0.34, -0.42, 0.42);
    agent.bank = THREE.MathUtils.damp(agent.bank, desiredBank, 4.5, delta);
    scratchBank.setFromAxisAngle(FORWARD, agent.bank);
    agent.quaternion.multiply(scratchBank);
    agent.physicalHeight = THREE.MathUtils.clamp(18 + agent.position.y * 8.5, 12, 28);
  }
}

export function getWingPose(agent) {
  if (agent.state !== 'flap') {
    const thermalLift = agent.state === 'thermal' ? 0.16 : 0.09;
    return {
      shoulder: thermalLift,
      inner: -0.04,
      outer: 0.03,
      tip: 0.035,
      heave: 0,
    };
  }
  const wave = Math.sin(agent.phase);
  const upstroke = Math.max(0, wave);
  const downstroke = Math.max(0, -wave);
  return {
    shoulder: wave * 0.92,
    inner: wave * 0.28,
    outer: upstroke * 0.42 - downstroke * 0.08,
    tip: upstroke * 0.26 - downstroke * 0.04,
    heave: downstroke * 0.018,
  };
}
