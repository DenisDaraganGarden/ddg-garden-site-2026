import * as THREE from 'three';

export const LANDING_STATE = Object.freeze({
  AIRBORNE: 'airborne',
  APPROACH: 'approach',
  FLARE: 'flare',
  SETTLE: 'settle',
  PERCHED: 'perched',
  TAKEOFF: 'takeoff',
  REJOIN: 'rejoin',
});

export const MAX_ACTIVE_LANDINGS = 3;

const SURFACE_CAPACITY = Object.freeze({ boat: 2, sculpture: 1 });
const BODY_CLEARANCE_METERS = 0.134;
const APPROACH_SECONDS = 2.7;
const FLARE_SECONDS = 0.95;
const SETTLE_SECONDS = 0.62;
const TAKEOFF_SECONDS = 1.35;
const REJOIN_SECONDS = 1.9;
const MAX_LANDING_PITCH_DOWN = 0.31;
const MAX_LANDING_PITCH_UP = 0.22;
const MAX_LANDING_TURN_RATE = 2.35;

const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
const scratchSitePosition = new THREE.Vector3();
const scratchSiteQuaternion = new THREE.Quaternion();
const scratchSiteForward = new THREE.Vector3();
const scratchSiteUp = new THREE.Vector3();
const scratchBodyPosition = new THREE.Vector3();
const scratchControlA = new THREE.Vector3();
const scratchControlB = new THREE.Vector3();
const scratchEnd = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchStableUp = new THREE.Vector3();
const scratchBasis = new THREE.Matrix4();
const scratchPitch = new THREE.Quaternion();
const scratchTargetQuaternion = new THREE.Quaternion();
const scratchBlendedQuaternion = new THREE.Quaternion();
const scratchLevelForward = new THREE.Vector3();

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function cubicBezier(out, a, b, c, d, t) {
  const inverse = 1 - t;
  const inverse2 = inverse * inverse;
  const t2 = t * t;
  return out.set(0, 0, 0)
    .addScaledVector(a, inverse2 * inverse)
    .addScaledVector(b, 3 * inverse2 * t)
    .addScaledVector(c, 3 * inverse * t2)
    .addScaledVector(d, t2 * t);
}

function readSite(site) {
  if (!site?.object?.parent) return false;
  site.object.getWorldPosition(scratchSitePosition);
  site.object.getWorldQuaternion(scratchSiteQuaternion);
  scratchSiteForward.copy(FORWARD).applyQuaternion(scratchSiteQuaternion).normalize();
  scratchSiteUp.copy(UP).applyQuaternion(scratchSiteQuaternion).normalize();
  scratchBodyPosition.copy(scratchSitePosition).addScaledVector(
    scratchSiteUp,
    site.bodyClearance ?? BODY_CLEARANCE_METERS,
  );
  return true;
}

function writeQuaternion(out, forward, up, pitch = 0) {
  scratchRight.crossVectors(forward, up);
  if (scratchRight.lengthSq() < 1e-6) scratchRight.copy(RIGHT);
  else scratchRight.normalize();
  scratchStableUp.crossVectors(scratchRight, forward).normalize();
  scratchBasis.makeBasis(forward, scratchStableUp, scratchRight);
  out.setFromRotationMatrix(scratchBasis);
  if (Math.abs(pitch) > 1e-5) {
    scratchPitch.setFromAxisAngle(RIGHT, pitch);
    out.multiply(scratchPitch);
  }
  return out.normalize();
}

function writeLevelledQuaternion(out, direction, up, pitchBias = 0) {
  const vertical = THREE.MathUtils.clamp(direction.dot(up), -1, 1);
  scratchLevelForward.copy(direction).addScaledVector(up, -vertical);
  if (scratchLevelForward.lengthSq() < 1e-6) {
    scratchLevelForward.copy(FORWARD).addScaledVector(up, -FORWARD.dot(up));
  }
  if (scratchLevelForward.lengthSq() < 1e-6) {
    scratchLevelForward.copy(RIGHT).addScaledVector(up, -RIGHT.dot(up));
  }
  scratchLevelForward.normalize();
  const pitch = THREE.MathUtils.clamp(
    Math.asin(vertical) + pitchBias,
    -MAX_LANDING_PITCH_DOWN,
    MAX_LANDING_PITCH_UP,
  );
  return writeQuaternion(out, scratchLevelForward, up, pitch);
}

function turnAgentTowards(agent, target, delta, rate = MAX_LANDING_TURN_RATE) {
  agent.quaternion.rotateTowards(target, Math.max(delta, 1 / 240) * rate).normalize();
}

function ensureLandingFields(agent) {
  agent.landingState ??= LANDING_STATE.AIRBORNE;
  agent.landingSiteIndex ??= -1;
  agent.landingClock ??= 0;
  agent.landingProgress ??= 0;
  agent.landingCycle ??= 0;
  agent.nextLandingTime ??= Infinity;
  agent.approachStart ??= new THREE.Vector3();
  agent.approachControl ??= new THREE.Vector3();
  agent.flareStart ??= new THREE.Vector3();
  agent.flareQuaternion ??= new THREE.Quaternion();
}

function activeLanding(agent) {
  return ![
    LANDING_STATE.AIRBORNE,
    LANDING_STATE.REJOIN,
  ].includes(agent.landingState);
}

export function prepareLandingMode(agents) {
  if (agents.landingSchedule) return;
  agents.landingSchedule = { nextDispatchTime: 0.75, siteCursor: 0 };
  const preferred = [agents.length - 2, agents.length - 1, agents.length - 3];
  for (const agent of agents) {
    ensureLandingFields(agent);
    const rank = preferred.indexOf(agent.index);
    agent.nextLandingTime = rank >= 0
      ? 0.65 + rank * 3.6
      : 15 + agent.random() * 16;
  }
}

export function resetLandingMode(agents) {
  delete agents.landingSchedule;
  for (const agent of agents) {
    ensureLandingFields(agent);
    agent.landingState = LANDING_STATE.AIRBORNE;
    agent.landingSiteIndex = -1;
    agent.landingClock = 0;
    agent.landingProgress = 0;
  }
}

function surfaceCounts(agents, sites) {
  const counts = {};
  for (const agent of agents) {
    if (!activeLanding(agent)) continue;
    const surface = sites[agent.landingSiteIndex]?.surface;
    if (surface) counts[surface] = (counts[surface] ?? 0) + 1;
  }
  return counts;
}

export function scheduleLanding(agents, time, sites) {
  prepareLandingMode(agents);
  const schedule = agents.landingSchedule;
  const active = agents.filter(activeLanding);
  if (time < schedule.nextDispatchTime || active.length >= MAX_ACTIVE_LANDINGS || sites.length === 0) return;

  const occupied = new Set(active.map((agent) => agent.landingSiteIndex));
  const counts = surfaceCounts(agents, sites);
  const candidates = agents
    .filter((agent) => agent.landingState === LANDING_STATE.AIRBORNE && time >= agent.nextLandingTime)
    .sort((first, second) => first.nextLandingTime - second.nextLandingTime);
  const agent = candidates[0];
  if (!agent) return;

  let chosenIndex = -1;
  for (let offset = 0; offset < sites.length; offset += 1) {
    const siteIndex = (schedule.siteCursor + offset) % sites.length;
    const site = sites[siteIndex];
    const capacity = SURFACE_CAPACITY[site.surface] ?? 1;
    if (!site?.object?.parent || occupied.has(siteIndex) || (counts[site.surface] ?? 0) >= capacity) continue;
    chosenIndex = siteIndex;
    break;
  }
  if (chosenIndex < 0) return;

  agent.landingState = LANDING_STATE.APPROACH;
  agent.landingSiteIndex = chosenIndex;
  agent.landingClock = 0;
  agent.landingProgress = 0;
  agent.approachStart.copy(agent.position);
  agent.approachControl.copy(agent.position)
    .addScaledVector(agent.heading, 0.72)
    .addScaledVector(UP, 0.36);
  agent.state = 'flap';
  agent.stateTime = APPROACH_SECONDS + FLARE_SECONDS;
  schedule.siteCursor = (chosenIndex + 1) % sites.length;
  schedule.nextDispatchTime = time + 4.6 + agent.random() * 3.2;
}

function loseSite(agent, time) {
  agent.landingState = LANDING_STATE.REJOIN;
  agent.landingSiteIndex = -1;
  agent.landingClock = 0;
  agent.landingProgress = 1;
  agent.nextLandingTime = time + 18 + agent.random() * 20;
}

function orientFromMovement(agent, delta, pitch = 0) {
  scratchVelocity.subVectors(agent.position, agent.previousPosition);
  if (scratchVelocity.lengthSq() < 1e-6) scratchVelocity.copy(agent.heading);
  scratchVelocity.normalize();
  agent.heading.copy(scratchVelocity);
  writeLevelledQuaternion(scratchTargetQuaternion, scratchVelocity, UP, pitch);
  turnAgentTowards(agent, scratchTargetQuaternion, delta);
  agent.bank = 0;
}

export function updateLandingMotion(agent, time, delta, sites) {
  ensureLandingFields(agent);
  if (agent.landingState === LANDING_STATE.AIRBORNE) return false;
  if (agent.landingState === LANDING_STATE.REJOIN) {
    agent.landingClock += delta;
    agent.landingProgress = 1 - clamp01(agent.landingClock / REJOIN_SECONDS);
    if (agent.landingClock >= REJOIN_SECONDS) {
      agent.landingState = LANDING_STATE.AIRBORNE;
      agent.landingClock = 0;
      agent.landingProgress = 0;
    }
    return false;
  }

  const site = sites[agent.landingSiteIndex];
  if (!readSite(site)) {
    loseSite(agent, time);
    return false;
  }

  agent.previousPosition.copy(agent.position);
  agent.landingClock += delta;

  if (agent.landingState === LANDING_STATE.APPROACH) {
    const progress = clamp01(agent.landingClock / APPROACH_SECONDS);
    const eased = smooth01(progress);
    scratchEnd.copy(scratchBodyPosition)
      .addScaledVector(scratchSiteForward, -0.78)
      .addScaledVector(scratchSiteUp, 0.42);
    scratchControlB.copy(scratchEnd)
      .addScaledVector(scratchSiteForward, -0.9)
      .addScaledVector(scratchSiteUp, 0.16);
    cubicBezier(
      agent.position,
      agent.approachStart,
      agent.approachControl,
      scratchControlB,
      scratchEnd,
      eased,
    );
    agent.landingProgress = progress;
    orientFromMovement(agent, delta, smooth01((progress - 0.68) / 0.32) * 0.07);
    agent.physicalHeight = Math.max(0, agent.position.y);
    if (progress >= 1) {
      agent.landingState = LANDING_STATE.FLARE;
      agent.landingClock = 0;
      agent.landingProgress = 0;
      agent.flareStart.copy(agent.position);
      agent.flareQuaternion.copy(agent.quaternion);
    }
    return true;
  }

  if (agent.landingState === LANDING_STATE.FLARE) {
    const progress = clamp01(agent.landingClock / FLARE_SECONDS);
    const eased = smooth01(progress);
    scratchControlA.copy(agent.flareStart)
      .addScaledVector(scratchSiteForward, 0.32)
      .addScaledVector(scratchSiteUp, 0.08);
    scratchControlB.copy(scratchBodyPosition)
      .addScaledVector(scratchSiteForward, -0.24)
      .addScaledVector(scratchSiteUp, 0.18);
    cubicBezier(
      agent.position,
      agent.flareStart,
      scratchControlA,
      scratchControlB,
      scratchBodyPosition,
      eased,
    );
    writeQuaternion(
      scratchTargetQuaternion,
      scratchSiteForward,
      scratchSiteUp,
      Math.sin(progress * Math.PI) * 0.19,
    );
    scratchBlendedQuaternion.copy(agent.flareQuaternion).slerp(scratchTargetQuaternion, eased).normalize();
    turnAgentTowards(agent, scratchBlendedQuaternion, delta, 2.8);
    agent.heading.copy(scratchSiteForward);
    agent.landingProgress = progress;
    agent.bank = 0;
    agent.physicalHeight = Math.max(0, agent.position.y);
    if (progress >= 1) {
      agent.landingState = LANDING_STATE.SETTLE;
      agent.landingClock = 0;
      agent.landingProgress = 0;
    }
    return true;
  }

  if (agent.landingState === LANDING_STATE.SETTLE) {
    const progress = clamp01(agent.landingClock / SETTLE_SECONDS);
    const eased = smooth01(progress);
    agent.position.copy(scratchBodyPosition).addScaledVector(
      scratchSiteUp,
      Math.sin(progress * Math.PI) * 0.018 - eased * 0.008,
    );
    writeQuaternion(scratchTargetQuaternion, scratchSiteForward, scratchSiteUp);
    turnAgentTowards(agent, scratchTargetQuaternion, delta, 2.8);
    agent.heading.copy(scratchSiteForward);
    agent.landingProgress = progress;
    agent.physicalHeight = Math.max(0, scratchSitePosition.y);
    if (progress >= 1) {
      agent.landingState = LANDING_STATE.PERCHED;
      agent.landingClock = 0;
      agent.landingProgress = 1;
      agent.perchDuration = 11 + agent.random() * 9;
      agent.landingCycle += 1;
    }
    return true;
  }

  if (agent.landingState === LANDING_STATE.PERCHED) {
    agent.position.copy(scratchBodyPosition).addScaledVector(scratchSiteUp, -0.008);
    writeQuaternion(scratchTargetQuaternion, scratchSiteForward, scratchSiteUp);
    turnAgentTowards(agent, scratchTargetQuaternion, delta, 2.8);
    agent.heading.copy(scratchSiteForward);
    agent.landingProgress = 1;
    agent.physicalHeight = Math.max(0, scratchSitePosition.y);
    if (agent.landingClock >= agent.perchDuration) {
      agent.landingState = LANDING_STATE.TAKEOFF;
      agent.landingClock = 0;
      agent.landingProgress = 0;
      agent.state = 'flap';
      agent.stateTime = TAKEOFF_SECONDS + REJOIN_SECONDS;
    }
    return true;
  }

  const progress = clamp01(agent.landingClock / TAKEOFF_SECONDS);
  const eased = smooth01(progress);
  agent.position.copy(scratchBodyPosition)
    .addScaledVector(scratchSiteForward, 0.12 + eased * 1.35)
    .addScaledVector(scratchSiteUp, 0.06 + eased * 0.88);
  scratchVelocity.copy(scratchSiteForward).multiplyScalar(0.9).addScaledVector(scratchSiteUp, 0.42).normalize();
  agent.heading.copy(scratchVelocity);
  writeLevelledQuaternion(
    scratchTargetQuaternion,
    scratchVelocity,
    scratchSiteUp,
    0.1 * (1 - eased),
  );
  turnAgentTowards(agent, scratchTargetQuaternion, delta, 2.65);
  agent.landingProgress = progress;
  agent.physicalHeight = Math.max(0, agent.position.y);
  if (progress >= 1) {
    agent.landingState = LANDING_STATE.REJOIN;
    agent.landingSiteIndex = -1;
    agent.landingClock = 0;
    agent.landingProgress = 1;
    agent.nextLandingTime = time + 18 + agent.random() * 20;
    agent.velocity.copy(agent.heading).multiplyScalar(1.4);
  }
  return true;
}

export function getLandingRigPose(agent) {
  const progress = clamp01(agent.landingProgress ?? 0);
  switch (agent.landingState) {
    case LANDING_STATE.APPROACH:
      return {
        flapScale: 1.08,
        fold: 0,
        legDeploy: smooth01((progress - 0.62) / 0.38),
        legCompression: 0,
        toeGrip: 1 - smooth01((progress - 0.84) / 0.16),
        tailSpread: smooth01((progress - 0.55) / 0.45) * 0.28,
      };
    case LANDING_STATE.FLARE:
      return {
        flapScale: 1.28,
        shoulderBias: 0.08 * (1 - progress),
        fold: 0,
        legDeploy: 1,
        legCompression: smooth01((progress - 0.72) / 0.28) * 0.18,
        toeGrip: progress < 0.72 ? 0 : smooth01((progress - 0.72) / 0.28) * 0.22,
        tailSpread: 0.42,
      };
    case LANDING_STATE.SETTLE:
      return {
        flapScale: 1 - smooth01(progress),
        shoulderBias: (1 - smooth01(progress)) * 0.22,
        fold: smooth01(progress) * 1.16,
        legDeploy: 1,
        legCompression: 0.18 + Math.sin(progress * Math.PI) * 0.16,
        toeGrip: 0.22,
        tailSpread: (1 - smooth01(progress)) * 0.42,
      };
    case LANDING_STATE.PERCHED:
      return {
        flapScale: 0,
        fold: 1.16,
        legDeploy: 1,
        legCompression: 0.18,
        toeGrip: 0.22,
        tailSpread: 0,
        headLook: Math.sin(agent.landingClock * 0.72 + agent.index) * 0.16,
      };
    case LANDING_STATE.TAKEOFF:
      return {
        flapScale: 1.38,
        fold: 1.16 * (1 - smooth01(progress / 0.24)),
        legDeploy: 1 - smooth01(progress / 0.62),
        legCompression: (1 - progress) * 0.34,
        toeGrip: (1 - smooth01(progress / 0.22)) * 0.22,
        tailSpread: (1 - progress) * 0.24,
      };
    case LANDING_STATE.REJOIN:
      return {
        flapScale: 1.16,
        fold: 0,
        legDeploy: progress,
        legCompression: 0,
        toeGrip: 0,
        tailSpread: progress * 0.12,
      };
    default:
      return null;
  }
}

export function countLandingStates(agents) {
  return agents.reduce((result, agent) => {
    const state = agent.landingState ?? LANDING_STATE.AIRBORNE;
    result[state] = (result[state] ?? 0) + 1;
    return result;
  }, {});
}
