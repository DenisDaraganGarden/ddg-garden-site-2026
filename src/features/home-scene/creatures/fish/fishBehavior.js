import * as THREE from 'three';
import {
  FISH_CATALOG,
  FISH_DEFAULT_COUNTS,
  FISH_MAX_AGENTS,
  FISH_MIN_AGENTS,
  FISH_SPECIES_ORDER,
} from './fishCatalog.js';
import { createFishHabitat, fishVerticalBounds, constrainFishToWater } from './fishHabitat.js';

export const FISH_STATE = Object.freeze({
  CRUISE: 'cruise', SURFACE: 'surface', BOTTOM: 'bottom', AMBUSH: 'ambush', BURST: 'burst',
});

export const FISH_QUALITY_LIMITS = Object.freeze({ high: 50, medium: 30, low: 14 });
const CELL_SIZE = 0.52;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const AXES = ['x', 'y', 'z'];
const NEIGHBOR_OFFSETS = Array.from({ length: 27 }, (_, index) => [
  index % 3 - 1,
  Math.floor(index / 3) % 3 - 1,
  Math.floor(index / 9) - 1,
]);
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();

const ROUTE_TUNING = Object.freeze({
  pike: Object.freeze({ rate: 0.19, trail: 0, lane: 0.34, position: 0.16, heading: 0.24 }),
  perch: Object.freeze({ rate: 0.23, trail: 0.46, lane: 0.28, position: 0.36, heading: 0.48 }),
  roach: Object.freeze({ rate: 0.27, trail: 0.17, lane: 0.22, position: 0.46, heading: 0.62 }),
});

function seedFor(species, index) {
  const speciesSeed = species === 'pike' ? 0x51f2 : species === 'perch' ? 0x8c17 : 0xda31;
  return (speciesSeed + index * 0x9e37) >>> 0;
}

function random(agent) {
  agent.randomState = (Math.imul(agent.randomState, 1664525) + 1013904223) >>> 0;
  return agent.randomState / 0x100000000;
}

function signedRandom(agent) { return random(agent) * 2 - 1; }
function clampAgents(value) {
  const numeric = Number(value);
  return THREE.MathUtils.clamp(
    Number.isFinite(numeric) ? Math.round(numeric) : FISH_MAX_AGENTS,
    FISH_MIN_AGENTS,
    FISH_MAX_AGENTS,
  );
}

export function resolveFishQuality({ quality = 'high', qualityProfile, mobile = false, requestedCount = FISH_MAX_AGENTS } = {}) {
  const tier = qualityProfile?.isLowPower ? 'low' : quality === 'medium' || quality === 'low' ? quality : 'high';
  const profileLimit = Number.isFinite(qualityProfile?.fishMaxInstances)
    ? qualityProfile.fishMaxInstances
    : FISH_QUALITY_LIMITS[tier];
  const limit = Math.max(0, Math.round(mobile ? Math.min(profileLimit, 18) : profileLimit));
  return Object.freeze({ tier, limit, requestedCount: clampAgents(requestedCount), effectiveCount: Math.min(clampAgents(requestedCount), limit) });
}

export function resolveFishCounts(options = {}) {
  const { effectiveCount } = resolveFishQuality(options);
  if (effectiveCount <= 0) return { pike: 0, perch: 0, roach: 0 };
  if (effectiveCount === FISH_MAX_AGENTS) return { ...FISH_DEFAULT_COUNTS };
  if (effectiveCount === 1) return { pike: 1, perch: 0, roach: 0 };
  if (effectiveCount === 2) return { pike: 1, perch: 1, roach: 0 };
  const counts = { pike: 1, perch: 0, roach: 0 };
  const remaining = effectiveCount - 1;
  counts.perch = Math.max(1, Math.round(remaining * (11 / 49)));
  counts.roach = remaining - counts.perch;
  return counts;
}

function routePoint(agent, elapsed, habitat, target, tangent) {
  const tuning = ROUTE_TUNING[agent.species];
  const spanX = Math.max(0.8, (habitat.max.x - habitat.min.x) * 0.39);
  const spanZ = Math.max(0.65, (habitat.max.z - habitat.min.z) * 0.36);
  const phase = elapsed * tuning.rate * agent.routeTempo
    + agent.routePhase
    - agent.index * tuning.trail;
  const harmonic = phase * 2.17;
  const crossHarmonic = phase * 1.79;
  target.set(
    Math.sin(phase) * spanX * 0.72 + Math.sin(harmonic) * spanX * 0.18,
    0,
    Math.cos(phase) * spanZ * 0.68 + Math.sin(crossHarmonic) * spanZ * 0.24,
  );
  tangent.set(
    Math.cos(phase) * spanX * 0.72 + Math.cos(harmonic) * spanX * 0.18 * 2.17,
    0,
    -Math.sin(phase) * spanZ * 0.68 + Math.cos(crossHarmonic) * spanZ * 0.24 * 1.79,
  ).normalize();
  const lane = agent.routeLane * tuning.lane * (agent.species === 'roach' ? 1 : 1.35);
  // Apply the lateral lane component directly. `target` may itself be one of
  // the shared scratch vectors used by the hot path, so borrowing another
  // scratch vector here would be alias-prone and could erase the route point.
  target.x -= tangent.z * lane;
  target.z += tangent.x * lane;
  target.x = THREE.MathUtils.clamp(
    target.x,
    habitat.min.x + habitat.margin.x,
    habitat.max.x - habitat.margin.x,
  );
  target.z = THREE.MathUtils.clamp(
    target.z,
    habitat.min.z + habitat.margin.z,
    habitat.max.z - habitat.margin.z,
  );
  return target;
}

function initialPosition(agent, habitat) {
  const spread = agent.species === 'roach' ? 0.88 : agent.species === 'perch' ? 1.3 : 0.16;
  const center = agent.species === 'pike' ? [-1.8, -0.58] : agent.species === 'perch' ? [0.65, -0.5] : [0.1, -0.62];
  const vertical = fishVerticalBounds(agent, habitat);
  if (agent.species !== 'pike') {
    const position = routePoint(
      agent,
      0,
      habitat,
      new THREE.Vector3(),
      new THREE.Vector3(),
    );
    position.y = THREE.MathUtils.clamp(
      center[1] + signedRandom(agent) * spread * 0.12,
      vertical.lower,
      vertical.upper,
    );
    return position;
  }
  return new THREE.Vector3(
    THREE.MathUtils.clamp(center[0] + signedRandom(agent) * spread, habitat.min.x, habitat.max.x),
    THREE.MathUtils.clamp(center[1] + signedRandom(agent) * spread * 0.25, vertical.lower, vertical.upper),
    THREE.MathUtils.clamp(signedRandom(agent) * spread * 0.72, habitat.min.z, habitat.max.z),
  );
}

function refreshMotionProfile(agent) {
  // Each animal changes pace at a different moment.  The slow envelope is
  // deliberately longer than the tail beat, so a shoal reads as living traffic
  // on an extended route rather than fifty metronomes.
  agent.speedTarget = 0.76 + random(agent) * 0.5;
  agent.speedCadence = 0.08 + random(agent) * 0.1;
  agent.speedPhase = random(agent) * Math.PI * 2;
}

function pointerThreatStrength(pointerThreat, pointerDirect, pointerDistancePx) {
  const rawThreat = THREE.MathUtils.clamp(Number(pointerThreat) || 0, 0, 1);
  if (rawThreat <= 0) return 0;
  const distance = Number(pointerDistancePx);
  // Pointer threat already accounts for projection and scene scale.  Distance is
  // only a soft final falloff, keeping the response stable across camera lenses.
  const proximity = Number.isFinite(distance)
    ? 1 - THREE.MathUtils.smoothstep(distance, 36, 520)
    : 1;
  return rawThreat * proximity * (pointerDirect ? 1 : 0.58);
}

function updatePointerThreat(agent, delta) {
  const incoming = pointerThreatStrength(
    agent.pointerThreat,
    agent.pointerDirect,
    agent.pointerDistancePx,
  )
    * agent.threatSensitivity;
  const decay = Math.exp(-delta / agent.threatMemorySeconds);
  agent.threatMemory = Math.max(incoming, agent.threatMemory * decay);
  agent.threatBurstCooldown = Math.max(0, agent.threatBurstCooldown - delta);
}

export function createFishAgents(options = {}) {
  const habitat = options.habitat ?? createFishHabitat();
  const counts = resolveFishCounts(options);
  const agents = [];
  let id = 0;
  for (const species of FISH_SPECIES_ORDER) {
    for (let index = 0; index < counts[species]; index += 1) {
      const physics = FISH_CATALOG[species].physics;
      const agent = {
        id: `fish-${id += 1}`,
        species, index, randomState: seedFor(species, index), state: FISH_STATE.CRUISE,
        stateTime: 1 + index * 0.19, phase: index * 1.618, wanderPhase: index * 2.417,
        radius: FISH_CATALOG[species].halfHeight,
        scale: 0.88 + random({ randomState: seedFor(species, index) }) * 0.22,
        position: new THREE.Vector3(), velocity: new THREE.Vector3(), force: new THREE.Vector3(),
        orientation: new THREE.Quaternion(), separation: new THREE.Vector3(),
        alignment: new THREE.Vector3(), cohesion: new THREE.Vector3(),
        routePhase: 0,
        routeLane: 0,
        routeTempo: 1,
        speedTarget: 1,
        speedCadence: 0.12,
        speedPhase: 0,
        pace: 1,
        surfaceCooldown: 0,
        threatMemory: 0,
        threatSensitivity: 0.72 + random({ randomState: seedFor(species, index) }) * 0.46,
        threatMemorySeconds: 2.8 + random({ randomState: seedFor(species, index) }) * 2.4,
        threatBurstCooldown: 0,
        threatContagion: 0,
        pointerThreat: 0,
        pointerAway: null,
        pointerDirect: false,
        pointerDistancePx: Infinity,
      };
      refreshMotionProfile(agent);
      const speciesPhase = species === 'pike' ? 2.2 : species === 'perch' ? 1.08 : 0;
      // The ordered trailing term creates the ribbon; this is only a small
      // individual imperfection, not a random phase that would dissolve it.
      agent.routePhase = speciesPhase + signedRandom(agent) * 0.075;
      agent.routeLane = signedRandom(agent) * 0.5;
      // Route tempo is nearly shared so ordered trail positions survive long
      // sessions. Individual pace still varies independently inside the lane.
      agent.routeTempo = 0.998 + random(agent) * 0.004;
      agent.surfaceCooldown = 2 + random(agent) * 15;
      agent.position.copy(initialPosition(agent, habitat));
      constrainFishToWater(agent,habitat);
      const direction = new THREE.Vector3(species === 'pike' ? 1 : 0.8 + random(agent) * 0.2, signedRandom(agent) * 0.06, signedRandom(agent) * 0.3).normalize();
      agent.velocity.copy(direction).multiplyScalar(physics.cruiseSpeed);
      agent.orientation.setFromUnitVectors(X_AXIS, direction);
      agents.push(agent);
    }
  }
  return agents;
}

export function createFishSpatialHash(agents, cellSize = CELL_SIZE) {
  const cells = new Map();
  for (const agent of agents) {
    const key = `${Math.floor(agent.position.x / cellSize)},${Math.floor(agent.position.y / cellSize)},${Math.floor(agent.position.z / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(agent);
    cells.set(key, cell);
  }
  return { cells, cellSize };
}

function cellCoords(position, cellSize) { return [Math.floor(position.x / cellSize), Math.floor(position.y / cellSize), Math.floor(position.z / cellSize)]; }

export function fishNeighbors(agent, hash) {
  const [x, y, z] = cellCoords(agent.position, hash.cellSize);
  return NEIGHBOR_OFFSETS.flatMap(([dx, dy, dz]) => hash.cells.get(`${x + dx},${y + dy},${z + dz}`) ?? []);
}

function chooseState(agent, surfaceAllowed = true) {
  const roll = random(agent);
  refreshMotionProfile(agent);
  if (agent.species === 'pike') {
    if (roll < 0.14) { agent.state = FISH_STATE.BURST; agent.stateTime = 0.8 + random(agent) * 0.8; }
    else if (roll < 0.38) { agent.state = FISH_STATE.BOTTOM; agent.stateTime = 4.5 + random(agent) * 5; }
    else if (roll < 0.44 && surfaceAllowed && agent.surfaceCooldown <= 0) {
      agent.state = FISH_STATE.SURFACE;
      agent.stateTime = 1.8 + random(agent) * 1.4;
      agent.surfaceCooldown = 11 + random(agent) * 13;
      return true;
    }
    else { agent.state = FISH_STATE.AMBUSH; agent.stateTime = 4 + random(agent) * 7; }
    return false;
  }
  const surfaceChance = agent.species === 'roach' ? 0.11 : 0.055;
  const bottomChance = agent.species === 'perch' ? 0.25 : 0.2;
  if (roll < surfaceChance && surfaceAllowed && agent.surfaceCooldown <= 0) {
    agent.state = FISH_STATE.SURFACE;
    agent.stateTime = 1.6 + random(agent) * 1.2;
    agent.surfaceCooldown = 9 + random(agent) * 17;
    return true;
  }
  else if (roll < bottomChance) { agent.state = FISH_STATE.BOTTOM; agent.stateTime = 3 + random(agent) * 4.2; }
  else { agent.state = FISH_STATE.CRUISE; agent.stateTime = 4 + random(agent) * 7; }
  return false;
}

function addRouteForce(agent, elapsed, habitat, schooling) {
  const tuning = ROUTE_TUNING[agent.species];
  const schoolWeight = agent.species === 'pike' ? 1 : 0.34 + schooling * 0.66;
  // Ordered trailing phases distribute the school over one soft S-route. The
  // route is shared, while lanes and pace remain individual.
  routePoint(agent, elapsed, habitat, scratchC, scratchA);
  scratchC.sub(agent.position);
  scratchC.y = 0;
  agent.force.addScaledVector(scratchC, tuning.position * schoolWeight);

  // The route also gives a consistent forward heading.  Separation and obstacle
  // forces remain stronger at close range, so the line can flex around objects.
  const physics = FISH_CATALOG[agent.species].physics;
  scratchA.multiplyScalar(physics.cruiseSpeed).sub(agent.velocity);
  scratchA.y = 0;
  agent.force.addScaledVector(scratchA, tuning.heading * schoolWeight);
}

function addSchoolForce(agent, hash, predator, schooling) {
  if (agent.species === 'pike') return;
  const physics = FISH_CATALOG[agent.species].physics;
  agent.separation.set(0, 0, 0); agent.alignment.set(0, 0, 0); agent.cohesion.set(0, 0, 0);
  let neighbors = 0;
  for (const other of fishNeighbors(agent, hash)) {
    if (other === agent || other.species !== agent.species) continue;
    const delta = scratchA.subVectors(agent.position, other.position);
    const distanceSq = delta.lengthSq();
    if (distanceSq < 1e-8 || distanceSq > physics.neighborRadius ** 2) continue;
    neighbors += 1; agent.alignment.add(other.velocity); agent.cohesion.add(other.position);
    if (distanceSq < physics.separationRadius ** 2) agent.separation.addScaledVector(delta, 1 / distanceSq);
  }
  if (neighbors) {
    agent.alignment.multiplyScalar(1 / neighbors);
    const neighborSpeed = THREE.MathUtils.clamp(
      agent.alignment.length(),
      physics.cruiseSpeed * 0.68,
      physics.cruiseSpeed * 1.34,
    );
    scratchC.copy(agent.alignment);
    if (scratchC.lengthSq() > 1e-8) scratchC.normalize();
    else if (agent.velocity.lengthSq() > 1e-8) scratchC.copy(agent.velocity).normalize();
    else scratchC.copy(X_AXIS);
    agent.alignment.copy(scratchC).multiplyScalar(neighborSpeed).sub(agent.velocity);

    // Cohesion is primarily lateral to the common heading. Longitudinal pull is
    // deliberately weak: this is what turns compact bunches into a ribbon.
    agent.cohesion.multiplyScalar(1 / neighbors).sub(agent.position);
    const longitudinal = agent.cohesion.dot(scratchC);
    agent.cohesion.addScaledVector(scratchC, -longitudinal * 0.84);
    agent.cohesion.clampLength(0, physics.cruiseSpeed * 0.78);
    if (agent.separation.lengthSq() > 1e-8) agent.separation.setLength(physics.cruiseSpeed).sub(agent.velocity);
    const tightness = agent.species === 'roach' ? 1 : 0.62;
    agent.force.addScaledVector(agent.separation, agent.species === 'roach' ? 1.75 : 1.35);
    agent.force.addScaledVector(agent.alignment, 1.12 * tightness * schooling);
    agent.force.addScaledVector(agent.cohesion, 0.74 * tightness * schooling);
  }
  if (predator) {
    const away = scratchB.subVectors(agent.position, predator.position); const distance = away.length();
    const alertRadius = agent.species === 'roach' ? 0.82 : 0.62;
    if (distance > 1e-5 && distance < alertRadius) agent.force.addScaledVector(away.normalize(), (1 - distance / alertRadius) * 2.4);
  }
}

function seedThreatContagion(agents, hash) {
  for (const agent of agents) {
    if (agent.species === 'pike') {
      agent.threatContagion = 0;
      continue;
    }
    const physics = FISH_CATALOG[agent.species].physics;
    let total = 0;
    let neighbors = 0;
    for (const other of fishNeighbors(agent, hash)) {
      if (other === agent || other.species !== agent.species) continue;
      if (agent.position.distanceToSquared(other.position) > physics.neighborRadius ** 2) continue;
      total += other.threatMemory;
      neighbors += 1;
    }
    // A neighbour's alarm never becomes a full direct hit. It gives the school a
    // delayed ripple while preserving a handful of calm fish at its outer edge.
    agent.threatContagion = neighbors ? total / neighbors * 0.54 : 0;
  }
}

function addPointerThreatForce(agent) {
  const memory = Math.max(agent.threatMemory, agent.threatContagion);
  if (memory < 0.015) return;
  agent.threatMemory = Math.max(agent.threatMemory, agent.threatContagion);
  if (agent.pointerAway?.isVector3 || Array.isArray(agent.pointerAway)) {
    if (agent.pointerAway.isVector3) scratchA.copy(agent.pointerAway);
    else scratchA.fromArray(agent.pointerAway);
    scratchA.y *= 0.42;
    if (scratchA.lengthSq() > 1e-8) {
      scratchA.normalize();
      agent.force.addScaledVector(scratchA, memory * (agent.species === 'pike' ? 1.1 : 1.85));
    }
  }
  // Propagated fear steers neighbours away, but only a direct cursor approach
  // spends the short burst. That keeps the alarm legible without detonating the
  // whole school into identical motion.
  if (agent.pointerDirect > 0.1 && agent.threatMemory > 0.34 && agent.threatBurstCooldown <= 0) {
    agent.state = FISH_STATE.BURST;
    agent.stateTime = 0.55 + (1 - memory) * 0.8;
    agent.threatBurstCooldown = 2.2 + (1 - memory) * 1.8;
    refreshMotionProfile(agent);
  }
}

function addHabitatForce(agent, habitat) {
  const vertical = fishVerticalBounds(agent, habitat);
  for (const axis of AXES) {
    const lower = axis === 'y' ? vertical.lower : habitat.min[axis];
    const upper = axis === 'y' ? vertical.upper : habitat.max[axis];
    const margin = habitat.margin[axis];
    if (agent.position[axis] - lower < margin) agent.force[axis] += ((margin - (agent.position[axis] - lower)) / margin) ** 2 * 1.9;
    if (upper - agent.position[axis] < margin) agent.force[axis] -= ((margin - (upper - agent.position[axis])) / margin) ** 2 * 1.9;
  }
  const neutralY = agent.species === 'pike' ? -0.58 : agent.species === 'perch' ? -0.48 : -0.62;
  const targetY = agent.state === FISH_STATE.SURFACE ? vertical.upper : agent.state === FISH_STATE.BOTTOM ? vertical.lower : THREE.MathUtils.clamp(neutralY, vertical.lower, vertical.upper);
  agent.force.y += (targetY - agent.position.y) * FISH_CATALOG[agent.species].physics.buoyancy;
}

export function addFishObstacleAvoidance(agent, habitat, force = agent.force) {
  for (const obstacle of habitat.obstacles) {
    const nearest = scratchA.set(
      THREE.MathUtils.clamp(agent.position.x, obstacle.min.x, obstacle.max.x),
      THREE.MathUtils.clamp(agent.position.y, obstacle.min.y, obstacle.max.y),
      THREE.MathUtils.clamp(agent.position.z, obstacle.min.z, obstacle.max.z),
    );
    const away = scratchB.subVectors(agent.position, nearest);
    const clearance = obstacle.clearance + agent.radius * agent.scale;
    let distance = away.length();
    if (distance < 1e-5) {
      const exits = [
        { axis: 'x', side: -1, distance: agent.position.x - obstacle.min.x },
        { axis: 'x', side: 1, distance: obstacle.max.x - agent.position.x },
        { axis: 'y', side: -1, distance: agent.position.y - obstacle.min.y },
        { axis: 'y', side: 1, distance: obstacle.max.y - agent.position.y },
        { axis: 'z', side: -1, distance: agent.position.z - obstacle.min.z },
        { axis: 'z', side: 1, distance: obstacle.max.z - agent.position.z },
      ];
      const exit = exits.reduce((best, candidate) => (
        candidate.distance < best.distance ? candidate : best
      ));
      away.set(0, 0, 0);
      away[exit.axis] = exit.side;
      distance = 0;
    }
    if (distance < clearance) force.addScaledVector(away.normalize(), ((clearance - distance) / clearance) ** 2 * 3.2);
  }
}

function addWander(agent, elapsed) {
  const offset = agent.species === 'pike' ? 0.31 : agent.species === 'perch' ? 1.17 : 2.43;
  agent.force.x += Math.sin(elapsed * 0.23 + agent.wanderPhase + offset) * 0.12;
  agent.force.z += Math.cos(elapsed * 0.19 + agent.wanderPhase * 0.83) * 0.18;
  agent.force.y += Math.sin(elapsed * 0.13 + agent.wanderPhase * 1.27) * 0.055;
}

function integrate(agent, delta, habitat, activity, elapsed) {
  const physics = FISH_CATALOG[agent.species].physics;
  const motor = 0.45 + activity * 0.85;
  const pulse = 1
    + Math.sin(elapsed * agent.speedCadence * Math.PI * 2 + agent.speedPhase) * 0.13
    + Math.sin(elapsed * agent.speedCadence * Math.PI * 0.61 + agent.speedPhase * 1.7) * 0.07;
  const paceResponse = agent.state === FISH_STATE.BURST ? 3.4 : agent.state === FISH_STATE.AMBUSH ? 0.44 : 0.82;
  agent.pace = THREE.MathUtils.damp(agent.pace, agent.speedTarget * pulse, paceResponse, delta);
  const stateSpeed = agent.state === FISH_STATE.BURST
    ? physics.burstSpeed
    : agent.state === FISH_STATE.AMBUSH ? physics.cruiseSpeed * 0.34 : physics.cruiseSpeed;
  const requestedSpeed = stateSpeed * motor * THREE.MathUtils.clamp(agent.pace, 0.52, 1.45);
  if (agent.velocity.lengthSq() > 1e-8) agent.force.addScaledVector(scratchA.copy(agent.velocity).setLength(requestedSpeed).sub(agent.velocity), agent.state === FISH_STATE.BURST ? 1.9 : 0.48);
  if (agent.force.length() > physics.maxForce) agent.force.setLength(physics.maxForce);
  agent.velocity.addScaledVector(agent.force, delta).multiplyScalar(Math.exp(-physics.drag * delta * 0.12));
  const speedLimit = agent.state === FISH_STATE.BURST ? physics.burstSpeed : physics.maxSpeed;
  if (agent.velocity.length() > speedLimit) agent.velocity.setLength(speedLimit);
  if (agent.velocity.length() < requestedSpeed * 0.42) agent.velocity.setLength(requestedSpeed * 0.42);
  agent.position.addScaledVector(agent.velocity, delta);
  const vertical = fishVerticalBounds(agent, habitat);
  agent.position.x = THREE.MathUtils.clamp(agent.position.x, habitat.min.x + 0.015, habitat.max.x - 0.015);
  agent.position.y = THREE.MathUtils.clamp(agent.position.y, vertical.lower, vertical.upper);
  agent.position.z = THREE.MathUtils.clamp(agent.position.z, habitat.min.z + 0.015, habitat.max.z - 0.015);
  constrainFishToWater(agent,habitat);
  agent.phase += delta * (physics.waveFrequency + agent.velocity.length() * 3.7) * motor;
}

export function stepFishAgents(agents, delta, elapsed, {
  habitat = createFishHabitat(),
  paused = false,
  schooling = 1,
  activity = 1,
} = {}) {
  if (paused || !agents.length) return;
  const step = Math.min(Math.max(delta, 0), 1 / 30);
  const schoolingStrength = THREE.MathUtils.clamp(Number(schooling) || 0, 0, 1);
  const activityStrength = THREE.MathUtils.clamp(Number(activity) || 0, 0, 1);
  const hash = createFishSpatialHash(agents);
  const predator = agents.find((agent) => agent.species === 'pike') ?? null;
  let surfaceActive = agents.reduce(
    (count, agent) => count + Number(agent.state === FISH_STATE.SURFACE),
    0,
  );
  const surfaceLimit = Math.min(3, Math.max(1, Math.ceil(agents.length / 18)));
  if (!Number.isFinite(agents.surfaceGateUntil)) agents.surfaceGateUntil = 0;
  for (const agent of agents) {
    updatePointerThreat(agent, step);
  }
  seedThreatContagion(agents, hash);
  for (const agent of agents) {
    agent.stateTime -= step;
    agent.surfaceCooldown -= step;
    if (agent.stateTime <= 0) {
      if (agent.state === FISH_STATE.SURFACE) surfaceActive = Math.max(0, surfaceActive - 1);
      const enteredSurface = chooseState(
        agent,
        surfaceActive < surfaceLimit && elapsed >= agents.surfaceGateUntil,
      );
      if (enteredSurface) {
        surfaceActive += 1;
        agents.surfaceGateUntil = elapsed + 0.7 + random(agent) * 0.55;
      }
    }
    agent.force.set(0, 0, 0);
    addSchoolForce(agent, hash, predator, schoolingStrength);
    addRouteForce(agent, elapsed, habitat, schoolingStrength);
    addWander(agent, elapsed);
    addHabitatForce(agent, habitat);
    addFishObstacleAvoidance(agent, habitat);
    addPointerThreatForce(agent);
    if (agent.species === 'pike' && agent.state === FISH_STATE.BURST) {
      let prey = null;
      let preyDistance = Infinity;
      for (const candidate of agents) {
        if (candidate.species !== 'roach') continue;
        const distance = candidate.position.distanceToSquared(agent.position);
        if (distance < preyDistance) { prey = candidate; preyDistance = distance; }
      }
      if (prey) agent.force.addScaledVector(scratchA.subVectors(prey.position, agent.position).normalize(), 1.45);
    }
  }
  for (const agent of agents) integrate(agent, step, habitat, activityStrength, elapsed);
}

export function orientationForFish(agent, target = new THREE.Quaternion()) {
  const direction = agent.velocity.clone();
  if (agent.state === FISH_STATE.SURFACE) direction.y = Math.max(direction.y, direction.length() * 0.48);
  if (agent.state === FISH_STATE.BOTTOM) direction.y = Math.min(direction.y, -direction.length() * 0.32);
  return target.setFromUnitVectors(X_AXIS, direction.lengthSq() > 1e-8 ? direction.normalize() : X_AXIS);
}

function percentile(sorted, position) {
  if (!sorted.length) return 0;
  const index = THREE.MathUtils.clamp(position, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  return THREE.MathUtils.lerp(sorted[lower], sorted[upper], index - lower);
}

function measureSchoolShape(school) {
  if (!school.length) return null;
  const speeds = school.map((agent) => agent.velocity.length()).sort((a, b) => a - b);
  const xValues = school.map((agent) => agent.position.x);
  const zValues = school.map((agent) => agent.position.z);
  const normalizedNearestGaps = school.length < 2 ? [0] : school.map((agent) => {
    let nearest = Infinity;
    for (const other of school) {
      if (other === agent) continue;
      const bodySpan = Math.max(
        1e-5,
        agent.radius * agent.scale + other.radius * other.scale,
      );
      nearest = Math.min(nearest, agent.position.distanceTo(other.position) / bodySpan);
    }
    return nearest;
  }).sort((a, b) => a - b);
  return {
    count: school.length,
    spanX: Math.max(...xValues) - Math.min(...xValues),
    spanZ: Math.max(...zValues) - Math.min(...zValues),
    speedP10: percentile(speeds, 0.1),
    speedMedian: percentile(speeds, 0.5),
    speedP90: percentile(speeds, 0.9),
    medianBodyGap: percentile(normalizedNearestGaps, 0.5),
  };
}

export function measureFishRuntime(agents, options = {}) {
  const counts = Object.fromEntries(FISH_SPECIES_ORDER.map((species) => [species, 0]));
  const states = {};
  let triangles = 0;
  for (const agent of agents) { counts[agent.species] += 1; states[agent.state] = (states[agent.state] ?? 0) + 1; triangles += FISH_CATALOG[agent.species].triangles; }
  const batches = Object.values(counts).filter(Boolean).length;
  const schools = Object.fromEntries(FISH_SPECIES_ORDER.map((species) => [
    species,
    measureSchoolShape(agents.filter((agent) => agent.species === species)),
  ]));
  return Object.freeze({
    total: agents.length,
    counts,
    states,
    triangles,
    batches,
    expectedDrawCalls: batches,
    motion: {
      surfaceCount: states[FISH_STATE.SURFACE] ?? 0,
      frightenedCount: agents.filter((agent) => agent.threatMemory > 0.08).length,
      schools,
    },
    quality: resolveFishQuality(options),
  });
}
