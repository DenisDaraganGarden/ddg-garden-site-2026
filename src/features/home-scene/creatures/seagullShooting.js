import * as THREE from 'three';
import { worldUnitsPerPixel } from './seagullPointerInteraction.js';

export const SEAGULL_DOWNED_STATE = Object.freeze({
  STUN: 'hit-stun',
  FALLING: 'falling',
  SLIDING: 'sliding',
  RESTING: 'resting',
  WATER: 'water',
  REMOVED: 'removed',
});

export const SEAGULL_SHOOTING_LAW = Object.freeze({
  capacity: 2,
  reloadSeconds: 7.8,
  fireIntervalSeconds: 0.28,
  minimumVisibleBodyPixels: 9,
  hitRadiusPixels: [9, 30],
  bodyLengthMeters: 0.48,
  bodyRadiusMeters: 0.115,
  bodyHalfSpanMeters: 0.14,
  gravity: 6.4,
  quadraticDrag: 0.11,
  terminalSpeed: 8,
  restitution: 0.08,
  dynamicFriction: 0.28,
  staticFriction: 0.42,
  returnDelaySeconds: [40, 47],
  returnWindowSeconds: [12, 21],
  despawnSeconds: 12,
});

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
const shotRaycaster = new THREE.Raycaster();
const collisionRaycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();
const scratchCameraSpace = new THREE.Vector3();
const scratchProjected = new THREE.Vector3();
const scratchRayDirection = new THREE.Vector3();
const scratchTravel = new THREE.Vector3();
const scratchNextPosition = new THREE.Vector3();
const scratchRayOrigin = new THREE.Vector3();
const scratchBodyForward = new THREE.Vector3();
const scratchOffset = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchSupportNormal = new THREE.Vector3();
const scratchRelativeVelocity = new THREE.Vector3();
const scratchTangentVelocity = new THREE.Vector3();
const scratchSurfaceWorld = new THREE.Vector3();
const scratchSurfaceDelta = new THREE.Vector3();
const scratchStableUp = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchBasis = new THREE.Matrix4();
const scratchTargetQuaternion = new THREE.Quaternion();
const scratchSurfaceQuaternion = new THREE.Quaternion();
const scratchInverseQuaternion = new THREE.Quaternion();
const scratchRollQuaternion = new THREE.Quaternion();

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function finiteVector(vector) {
  return vector?.isVector3 && vector.toArray().every(Number.isFinite);
}

function readWorldNormal(hit, out = new THREE.Vector3()) {
  out.copy(hit.face.normal)
    .applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  return out;
}

function collisionObjects(landingSites) {
  const seen = new Set();
  const objects = [];
  for (const site of landingSites ?? []) {
    const object = site?.collisionObject;
    if (!object?.parent || seen.has(object)) continue;
    seen.add(object);
    objects.push(object);
  }
  return objects;
}

export function createSeagullShootingRuntime(scopeKey = 'default') {
  return {
    scopeKey,
    shells: SEAGULL_SHOOTING_LAW.capacity,
    reloadEndsAt: 0,
    lastShotAt: -Infinity,
    shotCount: 0,
    hitCount: 0,
    dryFireCount: 0,
    reloadCount: 0,
    flockAlarmUntil: 0,
    lastTargetIndex: -1,
    lastEvent: 'ready',
  };
}

export function advanceSeagullShootingRuntime(runtime, time) {
  if (
    runtime.shells === 0
    && runtime.reloadEndsAt > 0
    && time >= runtime.reloadEndsAt
  ) {
    runtime.shells = SEAGULL_SHOOTING_LAW.capacity;
    runtime.reloadEndsAt = 0;
    runtime.reloadCount += 1;
    runtime.lastEvent = 'reloaded';
    return true;
  }
  return false;
}

function nearestSurfaceDistance(ray, landingSites) {
  const objects = collisionObjects(landingSites);
  if (objects.length === 0) return Infinity;
  for (const object of objects) object.updateWorldMatrix(true, true);
  shotRaycaster.ray.copy(ray);
  shotRaycaster.near = 0;
  shotRaycaster.far = Infinity;
  const hit = shotRaycaster.intersectObjects(objects, true)[0];
  return hit?.distance ?? Infinity;
}

export function findSeagullShotTarget(
  agents,
  camera,
  viewport,
  pointerNdc,
  landingSites = [],
) {
  if (!camera || viewport.width <= 0 || viewport.height <= 0 || !pointerNdc?.isVector2) {
    return null;
  }

  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  shotRaycaster.setFromCamera(pointerNdc, camera);
  const surfaceDistance = nearestSurfaceDistance(shotRaycaster.ray, landingSites);
  let best = null;

  for (const agent of agents) {
    if (agent.shotState) continue;
    scratchCameraSpace.copy(agent.position).applyMatrix4(camera.matrixWorldInverse);
    const depth = -scratchCameraSpace.z;
    if (depth <= Math.max(camera.near, 0.001) || depth >= camera.far) continue;

    const unitsPerPixel = worldUnitsPerPixel(camera, viewport.height, depth);
    if (!Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0) continue;
    const modelScale = agent.modelScale ?? 1;
    const visibleBodyPixels = (
      SEAGULL_SHOOTING_LAW.bodyLengthMeters * modelScale
    ) / unitsPerPixel;
    if (visibleBodyPixels < SEAGULL_SHOOTING_LAW.minimumVisibleBodyPixels) continue;

    scratchProjected.copy(agent.position).project(camera);
    if (
      scratchProjected.z < -1 || scratchProjected.z > 1
      || Math.abs(scratchProjected.x) > 1.08 || Math.abs(scratchProjected.y) > 1.08
    ) continue;
    const deltaX = (scratchProjected.x - pointerNdc.x) * viewport.width * 0.5;
    const deltaY = (scratchProjected.y - pointerNdc.y) * viewport.height * 0.5;
    const screenDistancePixels = Math.hypot(deltaX, deltaY);
    const hitRadiusPixels = THREE.MathUtils.clamp(
      5 + visibleBodyPixels * 0.34,
      ...SEAGULL_SHOOTING_LAW.hitRadiusPixels,
    );
    if (screenDistancePixels > hitRadiusPixels) continue;

    const rayDistance = scratchTravel
      .subVectors(agent.position, shotRaycaster.ray.origin)
      .dot(shotRaycaster.ray.direction);
    if (rayDistance <= 0) continue;
    const bodyRadius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * modelScale;
    const supported = ['settle', 'perched', 'takeoff'].includes(agent.landingState);
    const occlusionAllowance = bodyRadius * (supported ? 1.55 : 0.72);
    if (surfaceDistance < rayDistance - occlusionAllowance) continue;

    const score = screenDistancePixels / hitRadiusPixels + rayDistance * 0.0001;
    if (best && score >= best.score) continue;
    best = {
      agent,
      index: agent.index,
      score,
      rayDistance,
      visibleBodyPixels,
      screenDistancePixels,
      hitRadiusPixels,
      rayDirection: shotRaycaster.ray.direction.clone(),
    };
  }

  return best;
}

function clearLanding(agent) {
  agent.landingState = 'airborne';
  agent.landingSiteIndex = -1;
  agent.landingClock = 0;
  agent.landingProgress = 0;
  agent.nextLandingTime = Infinity;
}

function beginDownedMotion(agent, rayDirection, time) {
  const modelScale = agent.modelScale ?? 1;
  const random = agent.random ?? Math.random;
  const supported = ['perched', 'settle'].includes(agent.landingState);
  const speed = supported
    ? 0.2 + random() * 0.16
    : THREE.MathUtils.clamp(agent.velocity?.length() ?? 0, 0.78, 2.4);
  const direction = finiteVector(agent.heading)
    ? agent.heading.clone().normalize()
    : new THREE.Vector3(1, 0, 0);
  const impactDirection = finiteVector(rayDirection)
    ? rayDirection.clone().normalize()
    : direction.clone();

  agent.shotState = SEAGULL_DOWNED_STATE.STUN;
  agent.shotClock = 0;
  agent.shotStateClock = 0;
  agent.shotVelocity ??= new THREE.Vector3();
  agent.shotVelocity.copy(direction).multiplyScalar(speed)
    .addScaledVector(impactDirection, supported ? 0.08 : 0.24 + random() * 0.12);
  agent.shotVelocity.y += supported ? 0.015 : 0.08 + random() * 0.12;
  agent.shotAngularVelocity ??= new THREE.Vector3();
  agent.shotAngularVelocity.set(
    (random() < 0.5 ? -1 : 1) * (1.6 + random() * 1.4),
    (random() - 0.5) * 1.1,
    (random() < 0.5 ? -1 : 1) * (0.8 + random() * 1.2),
  );
  agent.shotRoll = 0;
  agent.shotSide = random() < 0.5 ? -1 : 1;
  agent.shotContactObject = null;
  agent.shotContactLocalPosition ??= new THREE.Vector3();
  agent.shotContactWorldPosition ??= new THREE.Vector3();
  agent.shotContactNormal ??= new THREE.Vector3(0, 1, 0);
  agent.shotSurfaceVelocity ??= new THREE.Vector3();
  agent.shotLocalQuaternion ??= new THREE.Quaternion();
  agent.shotLastImpactAt = -Infinity;
  agent.shotAt = time;
  agent.previousPosition.copy(agent.position);
  agent.velocity.copy(agent.shotVelocity);
  agent.state = 'glide';
  agent.stateTime = Infinity;
  agent.pointerAvoidanceStrength = 0;
  agent.pointerAvoidanceTime = 0;
  clearLanding(agent);
  return modelScale;
}

function armFlockFear(runtime, agents, hitAgent, time) {
  const hitPosition = hitAgent.position;
  for (const agent of agents) {
    if (agent === hitAgent || agent.shotState) continue;
    const random = agent.random ?? Math.random;
    const distance = agent.position.distanceTo(hitPosition);
    agent.shotFearDirection ??= new THREE.Vector3();
    agent.shotFearDirection.subVectors(agent.position, hitPosition);
    agent.shotFearDirection.y = 0;
    if (agent.shotFearDirection.lengthSq() < 1e-5) {
      const angle = (agent.index * 2.39996 + random() * 0.7) % (Math.PI * 2);
      agent.shotFearDirection.set(Math.cos(angle), 0, Math.sin(angle));
    }
    scratchOffset.crossVectors(WORLD_UP, agent.shotFearDirection).normalize();
    agent.shotFearDirection.addScaledVector(scratchOffset, (random() - 0.5) * 0.72);
    agent.shotFearDirection.y = 0.16 + random() * 0.18;
    agent.shotFearDirection.normalize();

    const delay = THREE.MathUtils.clamp(
      0.08 + distance * 0.035 + random() * 0.34,
      0.08,
      0.82,
    );
    const returnStart = time
      + THREE.MathUtils.lerp(...SEAGULL_SHOOTING_LAW.returnDelaySeconds, random());
    const returnWindow = THREE.MathUtils.lerp(
      ...SEAGULL_SHOOTING_LAW.returnWindowSeconds,
      random(),
    );
    agent.shotFearStartTime = time + delay;
    agent.shotFearPanicUntil = agent.shotFearStartTime + 2.8 + random() * 1.9;
    agent.shotFearReturnStart = returnStart;
    agent.shotFearReturnEnd = returnStart + returnWindow;
    agent.shotFearDistance = 4.6 + random() * 2.8;
    agent.shotFearStrength = 0;
    agent.shotFearStartlePending = true;
    runtime.flockAlarmUntil = Math.max(runtime.flockAlarmUntil, agent.shotFearReturnEnd);
  }
}

export function fireSeagullShot(runtime, agents, targetIndex, rayDirection, time) {
  advanceSeagullShootingRuntime(runtime, time);
  if (time < runtime.lastShotAt + SEAGULL_SHOOTING_LAW.fireIntervalSeconds) {
    runtime.lastEvent = 'cooldown';
    return { kind: 'cooldown' };
  }
  if (runtime.shells <= 0) {
    runtime.dryFireCount += 1;
    runtime.lastEvent = 'dry';
    return { kind: 'dry', reloadRemaining: Math.max(0, runtime.reloadEndsAt - time) };
  }

  const target = agents[targetIndex];
  if (!target || target.shotState) return { kind: 'invalid' };

  runtime.shells -= 1;
  runtime.lastShotAt = time;
  runtime.shotCount += 1;
  runtime.hitCount += 1;
  runtime.lastTargetIndex = target.index;
  runtime.lastEvent = 'hit';
  if (runtime.shells === 0) {
    runtime.reloadEndsAt = time + SEAGULL_SHOOTING_LAW.reloadSeconds;
  }

  beginDownedMotion(target, rayDirection, time);
  armFlockFear(runtime, agents, target, time);
  return {
    kind: 'hit',
    index: target.index,
    position: target.position.clone(),
    velocity: target.shotVelocity.clone(),
    seed: 1709 + runtime.shotCount * 977 + target.index * 37,
    shells: runtime.shells,
  };
}

export function advanceShotFear(agent, time) {
  if (!agent.shotFearDirection || !Number.isFinite(agent.shotFearReturnEnd)) {
    return { strength: 0, startle: false };
  }
  if (time < agent.shotFearStartTime) return { strength: 0, startle: false };

  const startle = Boolean(agent.shotFearStartlePending);
  agent.shotFearStartlePending = false;
  const attack = smooth01((time - agent.shotFearStartTime) / 1.15);
  const release = time < agent.shotFearReturnStart
    ? 1
    : 1 - smooth01(
      (time - agent.shotFearReturnStart)
      / Math.max(0.001, agent.shotFearReturnEnd - agent.shotFearReturnStart),
    );
  agent.shotFearStrength = attack * release;
  if (time >= agent.shotFearReturnEnd) {
    agent.shotFearStrength = 0;
    agent.shotFearReturnEnd = -Infinity;
  }
  return { strength: agent.shotFearStrength, startle };
}

export function shotFearOffset(agent) {
  return (agent.shotFearStrength ?? 0) * (agent.shotFearDistance ?? 0);
}

function findSurfaceCollision(agent, start, end, objects) {
  scratchTravel.subVectors(end, start);
  const travelDistance = scratchTravel.length();
  if (travelDistance < 1e-7 || objects.length === 0) return null;
  scratchRayDirection.copy(scratchTravel).multiplyScalar(1 / travelDistance);
  scratchBodyForward.copy(FORWARD).applyQuaternion(agent.quaternion).normalize();
  const scale = agent.modelScale ?? 1;
  const radius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * scale;
  const halfSpan = SEAGULL_SHOOTING_LAW.bodyHalfSpanMeters * scale;
  let best = null;

  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    for (const offsetScale of [0, halfSpan, -halfSpan]) {
      scratchOffset.copy(scratchBodyForward).multiplyScalar(offsetScale);
      scratchRayOrigin.copy(start).add(scratchOffset);
      collisionRaycaster.set(scratchRayOrigin, scratchRayDirection);
      collisionRaycaster.near = 0;
      collisionRaycaster.far = travelDistance + radius;
      const hit = collisionRaycaster.intersectObject(object, true)[0];
      if (!hit) continue;
      readWorldNormal(hit, scratchNormal);
      if (scratchNormal.dot(scratchRayDirection) > 0) scratchNormal.negate();
      const centerDistance = THREE.MathUtils.clamp(hit.distance - radius, 0, travelDistance);
      const fraction = centerDistance / travelDistance;
      if (best && fraction >= best.fraction) continue;
      best = {
        object,
        fraction,
        point: hit.point.clone(),
        position: start.clone()
          .addScaledVector(scratchRayDirection, centerDistance)
          .addScaledVector(scratchNormal, radius * 0.04),
        normal: scratchNormal.clone(),
      };
    }
  }
  return best;
}

function findSlidingSupport(agent, position) {
  const object = agent.shotContactObject;
  if (!object?.parent || !finiteVector(agent.shotContactNormal)) return null;
  object.updateWorldMatrix(true, true);
  const scale = agent.modelScale ?? 1;
  const radius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * scale;
  scratchNormal.copy(agent.shotContactNormal).normalize();
  scratchRayOrigin.copy(position).addScaledVector(scratchNormal, radius * 0.22 + 0.018);
  scratchRayDirection.copy(scratchNormal).negate();
  collisionRaycaster.set(scratchRayOrigin, scratchRayDirection);
  collisionRaycaster.near = 0;
  collisionRaycaster.far = radius * 1.7 + 0.045;
  const hits = collisionRaycaster.intersectObject(object, true);
  for (const hit of hits) {
    const normal = readWorldNormal(hit, scratchSupportNormal);
    if (normal.dot(scratchRayDirection) > 0) normal.negate();
    if (normal.dot(agent.shotContactNormal) < 0.42) continue;
    return {
      object,
      fraction: 0,
      point: hit.point.clone(),
      position: hit.point.clone().addScaledVector(normal, radius * 1.02),
      normal,
      retained: true,
    };
  }
  return null;
}

function floorCollisionFraction(start, end, floorY, radius) {
  const startBottom = start.y - radius;
  const endBottom = end.y - radius;
  if (endBottom > floorY || end.y >= start.y) return Infinity;
  if (startBottom <= floorY) return 0;
  return clamp01((startBottom - floorY) / Math.max(1e-7, startBottom - endBottom));
}

function rememberSurfaceContact(agent, object, normal) {
  agent.shotContactObject = object;
  agent.shotContactNormal.copy(normal);
  agent.shotContactLocalPosition.copy(agent.position);
  object.worldToLocal(agent.shotContactLocalPosition);
  agent.shotContactWorldPosition.copy(agent.position);
}

function inheritSurfaceMotion(agent, delta) {
  const object = agent.shotContactObject;
  if (!object?.parent || !finiteVector(agent.shotContactLocalPosition)) {
    agent.shotSurfaceVelocity.set(0, 0, 0);
    return;
  }
  object.updateWorldMatrix(true, true);
  scratchSurfaceWorld.copy(agent.shotContactLocalPosition);
  object.localToWorld(scratchSurfaceWorld);
  scratchSurfaceDelta.subVectors(scratchSurfaceWorld, agent.shotContactWorldPosition);
  agent.position.add(scratchSurfaceDelta);
  agent.shotSurfaceVelocity.copy(scratchSurfaceDelta).multiplyScalar(1 / Math.max(delta, 1 / 240));
  agent.shotContactWorldPosition.copy(scratchSurfaceWorld);
}

function attachRestingAgent(agent) {
  const object = agent.shotContactObject;
  if (!object?.parent) return;
  object.getWorldQuaternion(scratchSurfaceQuaternion);
  scratchInverseQuaternion.copy(scratchSurfaceQuaternion).invert();
  agent.shotLocalQuaternion.copy(scratchInverseQuaternion).multiply(agent.quaternion).normalize();
  rememberSurfaceContact(agent, object, agent.shotContactNormal);
}

function updateRestingAgent(agent) {
  const object = agent.shotContactObject;
  if (!object?.parent) {
    agent.shotState = SEAGULL_DOWNED_STATE.FALLING;
    return;
  }
  object.updateWorldMatrix(true, true);
  agent.position.copy(agent.shotContactLocalPosition);
  object.localToWorld(agent.position);
  object.getWorldQuaternion(scratchSurfaceQuaternion);
  agent.quaternion.copy(scratchSurfaceQuaternion).multiply(agent.shotLocalQuaternion).normalize();
  agent.shotVelocity.set(0, 0, 0);
}

function resolveSurfaceVelocity(agent, normal) {
  scratchRelativeVelocity.copy(agent.shotVelocity).sub(agent.shotSurfaceVelocity);
  const normalSpeed = scratchRelativeVelocity.dot(normal);
  scratchTangentVelocity.copy(scratchRelativeVelocity).addScaledVector(normal, -normalSpeed);
  const tangentSpeed = scratchTangentVelocity.length();
  if (normalSpeed < 0) {
    const frictionScale = Math.max(
      0,
      1 - SEAGULL_SHOOTING_LAW.dynamicFriction * Math.abs(normalSpeed)
        / Math.max(tangentSpeed, 1e-5),
    );
    scratchTangentVelocity.multiplyScalar(frictionScale);
    agent.shotVelocity.copy(agent.shotSurfaceVelocity)
      .add(scratchTangentVelocity)
      .addScaledVector(normal, -normalSpeed * SEAGULL_SHOOTING_LAW.restitution);
  }
  return scratchTangentVelocity.length();
}

function setShotOrientation(agent, delta) {
  const surfaceState = [
    SEAGULL_DOWNED_STATE.SLIDING,
    SEAGULL_DOWNED_STATE.RESTING,
  ].includes(agent.shotState);
  const up = surfaceState ? agent.shotContactNormal : WORLD_UP;
  scratchForward.copy(agent.shotVelocity);
  if (surfaceState) scratchForward.addScaledVector(up, -scratchForward.dot(up));
  if (scratchForward.lengthSq() < 1e-5) {
    scratchForward.copy(agent.heading).addScaledVector(up, -agent.heading.dot(up));
  }
  if (scratchForward.lengthSq() < 1e-5) scratchForward.copy(FORWARD);
  scratchForward.normalize();
  scratchRight.crossVectors(scratchForward, up);
  if (scratchRight.lengthSq() < 1e-6) scratchRight.copy(RIGHT);
  else scratchRight.normalize();
  scratchStableUp.crossVectors(scratchRight, scratchForward).normalize();
  scratchBasis.makeBasis(scratchForward, scratchStableUp, scratchRight);
  scratchTargetQuaternion.setFromRotationMatrix(scratchBasis);

  agent.shotRoll += agent.shotAngularVelocity.x * delta;
  agent.shotAngularVelocity.multiplyScalar(Math.exp(-delta * 0.42));
  const restingRoll = surfaceState ? agent.shotSide * 0.92 : agent.shotRoll;
  scratchRollQuaternion.setFromAxisAngle(FORWARD, restingRoll);
  scratchTargetQuaternion.multiply(scratchRollQuaternion).normalize();
  agent.quaternion.slerp(scratchTargetQuaternion, 1 - Math.exp(-delta * 5.2)).normalize();
  agent.heading.copy(scratchForward);
}

function enterWater(agent, floorY, eventTime) {
  const radius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * (agent.modelScale ?? 1);
  agent.position.y = floorY + radius * 0.56;
  agent.shotVelocity.y = 0;
  agent.shotVelocity.x *= 0.42;
  agent.shotVelocity.z *= 0.42;
  agent.shotState = SEAGULL_DOWNED_STATE.WATER;
  agent.shotStateClock = 0;
  agent.shotLastImpactAt = eventTime;
  agent.shotContactObject = null;
}

function updateWaterAgent(agent, delta, floorY) {
  const radius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * (agent.modelScale ?? 1);
  const damping = Math.exp(-delta * 3.8);
  agent.shotVelocity.multiplyScalar(damping);
  agent.position.addScaledVector(agent.shotVelocity, delta);
  agent.position.y = floorY + radius * 0.56
    + Math.sin(agent.shotClock * 2.1 + agent.index) * 0.008;
  agent.shotContactNormal.copy(WORLD_UP);
  setShotOrientation(agent, delta);
}

export function advanceDownedSeagulls(
  runtime,
  agents,
  time,
  delta,
  landingSites = [],
  waterY = 0,
) {
  advanceSeagullShootingRuntime(runtime, time);
  const events = [];
  const safeDelta = Math.min(Math.max(delta, 0), 0.05);
  const objects = collisionObjects(landingSites);

  for (const agent of agents) {
    if (!agent.shotState || agent.shotState === SEAGULL_DOWNED_STATE.REMOVED) continue;
    agent.shotClock += safeDelta;
    agent.shotStateClock += safeDelta;

    if (agent.shotState === SEAGULL_DOWNED_STATE.RESTING) {
      updateRestingAgent(agent);
      if (agent.shotStateClock >= SEAGULL_SHOOTING_LAW.despawnSeconds) {
        agent.shotState = SEAGULL_DOWNED_STATE.REMOVED;
      }
      continue;
    }
    if (agent.shotState === SEAGULL_DOWNED_STATE.WATER) {
      updateWaterAgent(agent, safeDelta, waterY);
      if (agent.shotStateClock >= SEAGULL_SHOOTING_LAW.despawnSeconds) {
        agent.shotState = SEAGULL_DOWNED_STATE.REMOVED;
      }
      continue;
    }

    if (agent.shotState === SEAGULL_DOWNED_STATE.SLIDING) {
      inheritSurfaceMotion(agent, safeDelta);
    } else {
      agent.shotSurfaceVelocity.set(0, 0, 0);
    }

    const stepCount = Math.max(1, Math.ceil(safeDelta / (1 / 120)));
    const stepDelta = safeDelta / stepCount;
    let touchedSurface = false;
    for (let step = 0; step < stepCount; step += 1) {
      if (agent.shotState === SEAGULL_DOWNED_STATE.STUN && agent.shotStateClock >= 0.12) {
        agent.shotState = SEAGULL_DOWNED_STATE.FALLING;
        agent.shotStateClock = 0;
      }

      const gravityScale = agent.shotState === SEAGULL_DOWNED_STATE.STUN ? 0.46 : 1;
      agent.shotVelocity.y -= SEAGULL_SHOOTING_LAW.gravity * gravityScale * stepDelta;
      const speed = agent.shotVelocity.length();
      if (speed > 0) {
        const drag = 1 / (1 + SEAGULL_SHOOTING_LAW.quadraticDrag * speed * stepDelta);
        agent.shotVelocity.multiplyScalar(drag);
        if (agent.shotVelocity.length() > SEAGULL_SHOOTING_LAW.terminalSpeed) {
          agent.shotVelocity.setLength(SEAGULL_SHOOTING_LAW.terminalSpeed);
        }
      }

      agent.previousPosition.copy(agent.position);
      scratchNextPosition.copy(agent.position).addScaledVector(agent.shotVelocity, stepDelta);
      let surfaceHit = findSurfaceCollision(agent, agent.position, scratchNextPosition, objects);
      if (!surfaceHit && agent.shotState === SEAGULL_DOWNED_STATE.SLIDING) {
        surfaceHit = findSlidingSupport(agent, scratchNextPosition);
      }
      const radius = SEAGULL_SHOOTING_LAW.bodyRadiusMeters * (agent.modelScale ?? 1);
      const floorFraction = floorCollisionFraction(
        agent.position,
        scratchNextPosition,
        waterY,
        radius,
      );

      if (surfaceHit && surfaceHit.fraction <= floorFraction) {
        const impactSpeed = Math.max(0, -agent.shotVelocity.dot(surfaceHit.normal));
        agent.position.copy(surfaceHit.position);
        agent.shotContactNormal.copy(surfaceHit.normal);
        rememberSurfaceContact(agent, surfaceHit.object, surfaceHit.normal);
        const tangentSpeed = resolveSurfaceVelocity(agent, surfaceHit.normal);
        touchedSurface = true;
        if (
          !surfaceHit.retained
          && time - agent.shotLastImpactAt > 0.22
          && impactSpeed > 0.42
        ) {
          agent.shotLastImpactAt = time;
          events.push({
            kind: 'surface-impact',
            index: agent.index,
            position: surfaceHit.point.clone(),
            velocity: agent.shotVelocity.clone(),
            seed: 3109 + agent.index * 131 + Math.round(time * 60),
          });
        }

        const slopeSupportsRest = surfaceHit.normal.y > (
          1 / Math.sqrt(1 + SEAGULL_SHOOTING_LAW.staticFriction ** 2)
        );
        if (slopeSupportsRest && tangentSpeed < 0.16) {
          agent.shotState = SEAGULL_DOWNED_STATE.RESTING;
          agent.shotStateClock = 0;
          agent.shotVelocity.copy(agent.shotSurfaceVelocity);
          setShotOrientation(agent, stepDelta);
          attachRestingAgent(agent);
          break;
        }
        agent.shotState = SEAGULL_DOWNED_STATE.SLIDING;
      } else if (Number.isFinite(floorFraction)) {
        scratchTravel.subVectors(scratchNextPosition, agent.position);
        agent.position.addScaledVector(scratchTravel, floorFraction);
        enterWater(agent, waterY, time);
        events.push({
          kind: 'water-impact',
          index: agent.index,
          position: agent.position.clone(),
          velocity: agent.shotVelocity.clone(),
          seed: 5107 + agent.index * 157 + Math.round(time * 60),
        });
        break;
      } else {
        agent.position.copy(scratchNextPosition);
      }
    }

    if (agent.shotState === SEAGULL_DOWNED_STATE.SLIDING && !touchedSurface) {
      agent.shotState = SEAGULL_DOWNED_STATE.FALLING;
      agent.shotStateClock = 0;
      agent.shotContactObject = null;
    }
    if (![SEAGULL_DOWNED_STATE.RESTING, SEAGULL_DOWNED_STATE.WATER].includes(agent.shotState)) {
      setShotOrientation(agent, safeDelta);
    }
    agent.velocity.copy(agent.shotVelocity);
    agent.physicalHeight = Math.max(0, (agent.position.y - waterY) * 8);

    if (
      !finiteVector(agent.position)
      || !finiteVector(agent.shotVelocity)
      || !agent.quaternion.toArray().every(Number.isFinite)
    ) {
      agent.shotState = SEAGULL_DOWNED_STATE.REMOVED;
      runtime.lastEvent = 'invalid-physics';
    }
  }

  return events;
}

export function getDownedRigPose(agent) {
  if (!agent.shotState) return null;
  const impact = smooth01((agent.shotClock ?? 0) / 0.18);
  const resting = [
    SEAGULL_DOWNED_STATE.RESTING,
    SEAGULL_DOWNED_STATE.WATER,
    SEAGULL_DOWNED_STATE.REMOVED,
  ].includes(agent.shotState);
  const side = agent.shotSide ?? 1;
  return {
    shoulderL: THREE.MathUtils.lerp(0.08, side > 0 ? -0.34 : 0.12, impact),
    shoulderR: THREE.MathUtils.lerp(-0.06, side > 0 ? 0.14 : -0.32, impact),
    innerL: side > 0 ? -0.1 : 0.035,
    innerR: side > 0 ? 0.035 : -0.1,
    outerL: side > 0 ? -0.15 : -0.025,
    outerR: side > 0 ? -0.025 : -0.15,
    tipL: side > 0 ? -0.11 : -0.02,
    tipR: side > 0 ? -0.02 : -0.11,
    fold: resting ? 0.92 : THREE.MathUtils.lerp(0.16, 0.54, impact),
    legDeploy: resting ? 0.72 : 0.26 + impact * 0.18,
    legCompression: resting ? 0.36 : 0.08,
    toeGrip: 0,
    tailSpread: resting ? 0.08 : 0.2,
    headLook: side * 0.18,
    heave: 0,
  };
}

export function seagullShootingStats(runtime, agents, time) {
  const downedStates = agents.reduce((result, agent) => {
    if (!agent.shotState) return result;
    result[agent.shotState] = (result[agent.shotState] ?? 0) + 1;
    return result;
  }, {});
  return {
    shells: runtime.shells,
    reloading: runtime.shells === 0 && runtime.reloadEndsAt > time,
    reloadRemaining: Math.max(0, runtime.reloadEndsAt - time),
    shots: runtime.shotCount,
    hits: runtime.hitCount,
    downed: Object.values(downedStates).reduce((sum, count) => sum + count, 0),
    falling: (downedStates[SEAGULL_DOWNED_STATE.STUN] ?? 0)
      + (downedStates[SEAGULL_DOWNED_STATE.FALLING] ?? 0),
    sliding: downedStates[SEAGULL_DOWNED_STATE.SLIDING] ?? 0,
    resting: (downedStates[SEAGULL_DOWNED_STATE.RESTING] ?? 0)
      + (downedStates[SEAGULL_DOWNED_STATE.WATER] ?? 0),
    removed: downedStates[SEAGULL_DOWNED_STATE.REMOVED] ?? 0,
    flockAlarm: runtime.flockAlarmUntil > time,
    lastEvent: runtime.lastEvent,
  };
}
