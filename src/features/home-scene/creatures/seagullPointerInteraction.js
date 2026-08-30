import * as THREE from 'three';

export const SEAGULL_POINTER_LAW = Object.freeze({
  bodyLengthMeters: 0.48,
  minimumVisibleBodyPixels: 8,
  cursorRadiusPixels: [22, 58],
  habitatDistanceMeters: [1.2, 5.2],
  hoverDwellSeconds: 0.09,
  avoidanceMemorySeconds: 1.35,
  startleCooldownSeconds: 1.6,
  maximumAvoidanceMeters: 1.9,
});

const ACTIVE_LANDING_STATES = new Set(['approach', 'flare', 'settle', 'perched', 'takeoff']);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratchCameraSpace = new THREE.Vector3();
const scratchProjected = new THREE.Vector3();
const scratchClosestRayPoint = new THREE.Vector3();
const scratchToBird = new THREE.Vector3();
const scratchCameraRight = new THREE.Vector3();
const pointerRaycaster = new THREE.Raycaster();

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function worldUnitsPerPixel(camera, viewportHeight, depth) {
  if (!camera || viewportHeight <= 0 || depth <= 0) return Infinity;
  if (camera.isPerspectiveCamera) {
    const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
    return (2 * depth * Math.tan(effectiveFov * 0.5)) / viewportHeight;
  }
  if (camera.isOrthographicCamera) {
    return Math.abs(camera.top - camera.bottom) / (Math.max(camera.zoom, 1e-6) * viewportHeight);
  }
  return Infinity;
}

export function createPointerSample() {
  return {
    influence: 0,
    screenDistancePixels: Infinity,
    interactionRadiusPixels: 0,
    visibleBodyPixels: 0,
    screenX: NaN,
    screenY: NaN,
    habitatDistanceMeters: Infinity,
    worldRadiusMeters: 0,
    away: new THREE.Vector3(1, 0.18, 0).normalize(),
  };
}

function resetSample(sample) {
  sample.influence = 0;
  sample.screenDistancePixels = Infinity;
  sample.interactionRadiusPixels = 0;
  sample.visibleBodyPixels = 0;
  sample.screenX = NaN;
  sample.screenY = NaN;
  sample.habitatDistanceMeters = Infinity;
  sample.worldRadiusMeters = 0;
  return sample;
}

function habitatFactor(agent, habitatPoints) {
  if (ACTIVE_LANDING_STATES.has(agent.landingState)) {
    return { distance: 0, factor: 1 };
  }
  let distanceSquared = Infinity;
  for (const point of habitatPoints) {
    distanceSquared = Math.min(distanceSquared, agent.position.distanceToSquared(point));
  }
  const distance = Math.sqrt(distanceSquared);
  const [inner, outer] = SEAGULL_POINTER_LAW.habitatDistanceMeters;
  return {
    distance,
    factor: smooth01((outer - distance) / (outer - inner)),
  };
}

export function measurePointerInteraction(
  sample,
  agent,
  camera,
  viewport,
  pointerNdc,
  pointerActive,
  habitatPoints = [],
) {
  resetSample(sample);
  if (!camera || viewport.width <= 0 || viewport.height <= 0) return sample;

  scratchCameraSpace.copy(agent.position).applyMatrix4(camera.matrixWorldInverse);
  const depth = -scratchCameraSpace.z;
  if (depth <= Math.max(camera.near, 0.001) || depth >= camera.far) return sample;

  const metresPerPixel = worldUnitsPerPixel(camera, viewport.height, depth);
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return sample;
  const modelScale = agent.modelScale ?? 1;
  sample.visibleBodyPixels = (SEAGULL_POINTER_LAW.bodyLengthMeters * modelScale) / metresPerPixel;
  if (sample.visibleBodyPixels < SEAGULL_POINTER_LAW.minimumVisibleBodyPixels) return sample;

  scratchProjected.copy(agent.position).project(camera);
  if (
    scratchProjected.z < -1 || scratchProjected.z > 1
    || Math.abs(scratchProjected.x) > 1.12 || Math.abs(scratchProjected.y) > 1.12
  ) return sample;
  sample.screenX = (scratchProjected.x + 1) * viewport.width * 0.5;
  sample.screenY = (1 - scratchProjected.y) * viewport.height * 0.5;

  const habitat = habitatFactor(agent, habitatPoints);
  sample.habitatDistanceMeters = habitat.distance;
  if (!pointerActive || habitat.factor <= 0) return sample;

  const deltaX = (scratchProjected.x - pointerNdc.x) * viewport.width * 0.5;
  const deltaY = (scratchProjected.y - pointerNdc.y) * viewport.height * 0.5;
  sample.screenDistancePixels = Math.hypot(deltaX, deltaY);
  const [minimumRadius, maximumRadius] = SEAGULL_POINTER_LAW.cursorRadiusPixels;
  sample.interactionRadiusPixels = THREE.MathUtils.clamp(
    14 + sample.visibleBodyPixels * 0.46,
    minimumRadius,
    maximumRadius,
  );
  sample.worldRadiusMeters = sample.interactionRadiusPixels * metresPerPixel;
  const screenFactor = smooth01(
    1 - sample.screenDistancePixels / sample.interactionRadiusPixels,
  );
  sample.influence = screenFactor * habitat.factor;
  if (sample.influence <= 0) return sample;

  pointerRaycaster.setFromCamera(pointerNdc, camera);
  const ray = pointerRaycaster.ray;
  const rayDistance = Math.max(0, scratchToBird.copy(agent.position).sub(ray.origin).dot(ray.direction));
  ray.at(rayDistance, scratchClosestRayPoint);
  sample.away.subVectors(agent.position, scratchClosestRayPoint);
  if (sample.away.lengthSq() < 1e-6) {
    scratchCameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    sample.away.copy(scratchCameraRight).multiplyScalar(agent.index % 2 === 0 ? 1 : -1);
  }
  sample.away.y = THREE.MathUtils.clamp(sample.away.y * 0.45 + 0.16, -0.1, 0.34);
  if (sample.away.lengthSq() < 1e-6) sample.away.copy(WORLD_UP);
  else sample.away.normalize();
  return sample;
}

function ensurePointerFields(agent) {
  agent.pointerAvoidance ??= new THREE.Vector3(1, 0.18, 0).normalize();
  agent.pointerAvoidanceStrength ??= 0;
  agent.pointerAvoidanceTime ??= 0;
  agent.pointerThreat ??= 0;
  agent.pointerCooldown ??= 0;
  agent.pointerLatched ??= false;
  agent.pointerInfluence ??= 0;
  agent.pointerStartleCount ??= 0;
}

export function advancePointerResponse(agent, sample, delta) {
  ensurePointerFields(agent);
  agent.pointerCooldown = Math.max(0, agent.pointerCooldown - delta);
  agent.pointerAvoidanceTime = Math.max(0, agent.pointerAvoidanceTime - delta);
  agent.pointerInfluence = THREE.MathUtils.damp(
    agent.pointerInfluence,
    sample.influence,
    sample.influence > agent.pointerInfluence ? 14 : 6,
    delta,
  );

  if (sample.influence > 0.025) {
    agent.pointerAvoidance.lerp(sample.away, 1 - Math.exp(-delta * 12)).normalize();
    agent.pointerAvoidanceStrength = Math.max(
      agent.pointerAvoidanceStrength * Math.exp(-delta * 1.2),
      sample.influence,
    );
    agent.pointerAvoidanceTime = SEAGULL_POINTER_LAW.avoidanceMemorySeconds;
    if (!agent.pointerLatched && agent.pointerCooldown <= 0) {
      agent.pointerThreat = Math.min(1, agent.pointerThreat + delta * sample.influence);
    } else {
      agent.pointerThreat = 0;
    }
  } else {
    agent.pointerAvoidanceStrength *= Math.exp(-delta * 1.8);
    agent.pointerThreat = Math.max(0, agent.pointerThreat - delta * 1.8);
    if (sample.influence < 0.008) {
      agent.pointerLatched = false;
      agent.pointerThreat = 0;
    }
  }

  if (
    agent.pointerCooldown > 0
    || agent.pointerLatched
    || agent.pointerThreat < SEAGULL_POINTER_LAW.hoverDwellSeconds
  ) return false;

  agent.pointerThreat = 0;
  agent.pointerCooldown = SEAGULL_POINTER_LAW.startleCooldownSeconds;
  agent.pointerLatched = true;
  agent.pointerStartleCount += 1;
  agent.state = 'flap';
  agent.stateTime = Math.max(agent.stateTime ?? 0, 1.15);
  return true;
}

export function pointerAvoidanceOffset(agent) {
  if (!agent.pointerAvoidance || agent.pointerAvoidanceTime <= 0) return 0;
  const memory = smooth01(
    agent.pointerAvoidanceTime / SEAGULL_POINTER_LAW.avoidanceMemorySeconds,
  );
  return SEAGULL_POINTER_LAW.maximumAvoidanceMeters
    * agent.pointerAvoidanceStrength
    * memory;
}
