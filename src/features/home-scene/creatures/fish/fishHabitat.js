import * as THREE from 'three';

const DEFAULT_MIN = new THREE.Vector3(-3.4, -1.35, -2.2);
const DEFAULT_MAX = new THREE.Vector3(3.4, -0.1, 2.2);
const DEFAULT_MARGIN = new THREE.Vector3(0.48, 0.16, 0.42);

function vector3(value, fallback) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(...value);
  return fallback.clone();
}

function finiteBounds(min, max) {
  return min.x < max.x && min.y < max.y && min.z < max.z;
}

export function createFishHabitat({
  min,
  max,
  margin,
  waterY = 0,
  surfaceClearance = 0.12,
  bottomClearance = 0.11,
  sampleSurfaceY,
  obstacles = [],
} = {}) {
  const habitatMin = vector3(min, DEFAULT_MIN);
  const habitatMax = vector3(max, DEFAULT_MAX);
  if (!finiteBounds(habitatMin, habitatMax)) {
    throw new Error('Fish habitat requires min < max on x, y and z.');
  }

  return {
    min: habitatMin,
    max: habitatMax,
    margin: vector3(margin, DEFAULT_MARGIN),
    waterY,
    surfaceClearance: Math.max(0, surfaceClearance),
    bottomClearance: Math.max(0, bottomClearance),
    sampleSurfaceY: typeof sampleSurfaceY === 'function' ? sampleSurfaceY : null,
    obstacles: obstacles.map(normalizeFishObstacle).filter(Boolean),
  };
}

export function normalizeFishObstacle(obstacle) {
  if (!obstacle) return null;
  const min = vector3(obstacle.min, null);
  const max = vector3(obstacle.max, null);
  if (!min || !max || !finiteBounds(min, max)) return null;
  return Object.freeze({
    id: String(obstacle.id ?? 'obstacle'),
    min,
    max,
    clearance: Math.max(0, obstacle.clearance ?? 0.18),
  });
}

export function fishSurfaceY(habitat, x, z) {
  const sampled = habitat.sampleSurfaceY?.(x, z);
  return Number.isFinite(sampled) ? sampled : habitat.waterY;
}

export function fishVerticalBounds(agent, habitat) {
  const radius = Math.max(0.03, (agent.radius ?? 0.08) * (agent.scale ?? 1));
  const lower = habitat.min.y + habitat.bottomClearance + radius;
  const upper = Math.min(
    habitat.max.y - radius,
    fishSurfaceY(habitat, agent.position.x, agent.position.z) - habitat.surfaceClearance - radius,
  );
  return { lower, upper: Math.max(lower, upper) };
}
