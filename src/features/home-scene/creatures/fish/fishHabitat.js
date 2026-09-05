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
  sampleBottomY,
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
    sampleBottomY: typeof sampleBottomY === 'function' ? sampleBottomY : null,
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
  const bed=habitat.sampleBottomY?.(agent.position.x,agent.position.z);
  const lower = Math.max(habitat.min.y,Number.isFinite(bed)?bed:-Infinity) + habitat.bottomClearance + radius;
  const upper = Math.min(
    habitat.max.y - radius,
    fishSurfaceY(habitat, agent.position.x, agent.position.z) - habitat.surfaceClearance - radius,
  );
  return { lower, upper: Math.max(lower, upper), viable: upper>=lower };
}

// Project away from dry or too-shallow cells only when needed. This bounded
// search also handles a user moving the shoreline across the entire school.
export function constrainFishToWater(agent,habitat) {
  if(agent.hasWater===false)return false;
  let bounds=fishVerticalBounds(agent,habitat);
  if(!bounds.viable && habitat.sampleBottomY){
    const ox=agent.position.x,oz=agent.position.z;
    let found=false;
    for(let ring=1;ring<=12&&!found;ring++)for(let i=0;i<16;i++){
      const a=i*Math.PI/8;
      agent.position.x=THREE.MathUtils.clamp(ox+Math.sin(a)*ring*.75,habitat.min.x+.02,habitat.max.x-.02);
      agent.position.z=THREE.MathUtils.clamp(oz+Math.cos(a)*ring*.75,habitat.min.z+.02,habitat.max.z-.02);
      bounds=fishVerticalBounds(agent,habitat);
      if(bounds.viable){found=true;break;}
    }
    if(!found){agent.position.x=ox;agent.position.z=oz;}
  }
  agent.hasWater=bounds.viable;
  if(bounds.viable)agent.position.y=THREE.MathUtils.clamp(agent.position.y,bounds.lower,bounds.upper);
  return bounds.viable;
}
