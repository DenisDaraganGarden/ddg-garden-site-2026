import * as THREE from 'three';
import { FISH_CATALOG, SCHOOL_COUNTS, SPECIMEN_COUNTS } from './fishCatalog';

const WORLD = Object.freeze({
  min: new THREE.Vector3(-2.75, -1.02, -1.55),
  max: new THREE.Vector3(2.75, 1.12, 1.55),
  margin: new THREE.Vector3(0.58, 0.38, 0.45),
  surface: 1.02,
  bottom: -0.92,
});

const CELL_SIZE = 0.48;
const NEIGHBOR_OFFSETS = [];
for (let x = -1; x <= 1; x += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let z = -1; z <= 1; z += 1) {
      NEIGHBOR_OFFSETS.push([x, y, z]);
    }
  }
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempC = new THREE.Vector3();

function seedFor(species, index) {
  const speciesSeed = species === 'pike' ? 0x51f2 : species === 'perch' ? 0x8c17 : 0xda31;
  return (speciesSeed + index * 0x9e37) >>> 0;
}

function nextRandom(agent) {
  agent.randomState = (Math.imul(agent.randomState, 1664525) + 1013904223) >>> 0;
  return agent.randomState / 0x100000000;
}

function randomSigned(agent) {
  return nextRandom(agent) * 2 - 1;
}

function randomizeState(agent) {
  const roll = nextRandom(agent);
  if (agent.species === 'pike') {
    if (roll < 0.17) {
      agent.state = 'burst';
      agent.stateTime = 0.8 + nextRandom(agent) * 0.8;
    } else if (roll < 0.42) {
      agent.state = 'bottom';
      agent.stateTime = 4.5 + nextRandom(agent) * 5.0;
    } else if (roll < 0.47) {
      agent.state = 'surface';
      agent.stateTime = 2.4 + nextRandom(agent) * 2.2;
    } else {
      agent.state = 'ambush';
      agent.stateTime = 4.0 + nextRandom(agent) * 7.0;
    }
    return;
  }

  if (roll < (agent.species === 'roach' ? 0.11 : 0.055)) {
    agent.state = 'surface';
    agent.stateTime = 2.2 + nextRandom(agent) * 3.4;
  } else if (roll < (agent.species === 'perch' ? 0.25 : 0.2)) {
    agent.state = 'bottom';
    agent.stateTime = 3.0 + nextRandom(agent) * 4.2;
  } else {
    agent.state = 'cruise';
    agent.stateTime = 4.0 + nextRandom(agent) * 7.0;
  }
}

function startingPosition(agent, mode, ordinal, totalForSpecies) {
  if (mode === 'specimens') {
    const positions = {
      pike: [-0.45, 0.54, 0],
      perch: [-0.16, -0.05, 0.16],
      roach: [0.08, -0.52, -0.02],
    };
    return new THREE.Vector3(...positions[agent.species]);
  }

  const spread = agent.species === 'roach' ? 0.72 : agent.species === 'perch' ? 1.18 : 0.15;
  const row = ordinal / Math.max(1, totalForSpecies - 1) - 0.5;
  const centerX = agent.species === 'pike' ? -1.55 : agent.species === 'perch' ? 0.55 : 0.15;
  const centerY = agent.species === 'pike' ? -0.18 : agent.species === 'perch' ? 0.18 : -0.08;
  return new THREE.Vector3(
    centerX + randomSigned(agent) * spread,
    centerY + randomSigned(agent) * spread * 0.42 + row * 0.25,
    randomSigned(agent) * spread * 0.72,
  );
}

export function createFishAgents(mode = 'school') {
  const counts = mode === 'specimens' ? SPECIMEN_COUNTS : SCHOOL_COUNTS;
  const agents = [];
  let id = 0;
  for (const [species, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      const agent = {
        id: id += 1,
        species,
        index,
        randomState: seedFor(species, index),
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        force: new THREE.Vector3(),
        separation: new THREE.Vector3(),
        alignment: new THREE.Vector3(),
        cohesion: new THREE.Vector3(),
        orientation: new THREE.Quaternion(),
        state: 'cruise',
        stateTime: 1 + index * 0.17,
        phase: index * 1.618,
        wanderPhase: index * 2.417,
        scale: 1,
        specimen: mode === 'specimens',
      };
      agent.position.copy(startingPosition(agent, mode, index, count));
      agent.anchor = agent.position.clone();
      const direction = new THREE.Vector3(
        species === 'pike' ? 1 : 0.8 + nextRandom(agent) * 0.2,
        randomSigned(agent) * 0.08,
        randomSigned(agent) * 0.32,
      ).normalize();
      agent.velocity.copy(direction).multiplyScalar(FISH_CATALOG[species].physics.cruiseSpeed);
      agent.orientation.setFromUnitVectors(X_AXIS, direction);
      agent.scale = mode === 'specimens' ? 1 : 0.86 + nextRandom(agent) * 0.28;
      agents.push(agent);
    }
  }
  return agents;
}

function gridKey(position) {
  return `${Math.floor(position.x / CELL_SIZE)},${Math.floor(position.y / CELL_SIZE)},${Math.floor(position.z / CELL_SIZE)}`;
}

function cellCoordinates(position) {
  return [
    Math.floor(position.x / CELL_SIZE),
    Math.floor(position.y / CELL_SIZE),
    Math.floor(position.z / CELL_SIZE),
  ];
}

function addBoundaryForce(agent) {
  const { position, force } = agent;
  const axes = ['x', 'y', 'z'];
  for (const axis of axes) {
    const lowerDistance = position[axis] - WORLD.min[axis];
    const upperDistance = WORLD.max[axis] - position[axis];
    if (lowerDistance < WORLD.margin[axis]) {
      force[axis] += ((WORLD.margin[axis] - lowerDistance) / WORLD.margin[axis]) ** 2 * 1.9;
    }
    if (upperDistance < WORLD.margin[axis]) {
      force[axis] -= ((WORLD.margin[axis] - upperDistance) / WORLD.margin[axis]) ** 2 * 1.9;
    }
  }
}

function addDepthBehavior(agent, physics) {
  let targetDepth = agent.species === 'pike' ? -0.22 : agent.species === 'perch' ? 0.02 : 0.0;
  if (agent.state === 'surface') {
    targetDepth = WORLD.surface;
  } else if (agent.state === 'bottom') {
    targetDepth = WORLD.bottom;
  }
  const depthError = targetDepth - agent.position.y;
  agent.force.y += depthError * physics.buoyancy;
  if (agent.state === 'surface' && agent.position.y > 0.72) {
    agent.force.y += 0.28;
  }
  if (agent.state === 'bottom' && agent.position.y < -0.65) {
    agent.force.y -= 0.19;
  }
}

function addSchoolForces(agent, grid, predator) {
  if (agent.species === 'pike') {
    return;
  }
  const physics = FISH_CATALOG[agent.species].physics;
  const [cellX, cellY, cellZ] = cellCoordinates(agent.position);
  agent.separation.set(0, 0, 0);
  agent.alignment.set(0, 0, 0);
  agent.cohesion.set(0, 0, 0);
  let neighborCount = 0;

  for (const [offsetX, offsetY, offsetZ] of NEIGHBOR_OFFSETS) {
    const cell = grid.get(`${cellX + offsetX},${cellY + offsetY},${cellZ + offsetZ}`);
    if (!cell) {
      continue;
    }
    for (const other of cell) {
      if (other === agent || other.species !== agent.species) {
        continue;
      }
      tempA.subVectors(agent.position, other.position);
      const distanceSquared = tempA.lengthSq();
      if (distanceSquared > physics.neighborRadius ** 2 || distanceSquared < 1e-8) {
        continue;
      }
      neighborCount += 1;
      agent.alignment.add(other.velocity);
      agent.cohesion.add(other.position);
      if (distanceSquared < physics.separationRadius ** 2) {
        agent.separation.addScaledVector(tempA, 1 / distanceSquared);
      }
    }
  }

  if (neighborCount > 0) {
    agent.alignment.multiplyScalar(1 / neighborCount).setLength(physics.cruiseSpeed).sub(agent.velocity);
    agent.cohesion.multiplyScalar(1 / neighborCount).sub(agent.position).setLength(physics.cruiseSpeed).sub(agent.velocity);
    if (agent.separation.lengthSq() > 1e-8) {
      agent.separation.setLength(physics.cruiseSpeed).sub(agent.velocity);
    }
    const tightness = agent.species === 'roach' ? 1 : 0.62;
    agent.force.addScaledVector(agent.separation, agent.species === 'roach' ? 1.75 : 1.35);
    agent.force.addScaledVector(agent.alignment, 1.12 * tightness);
    agent.force.addScaledVector(agent.cohesion, 0.92 * tightness);
  }

  if (predator) {
    tempA.subVectors(agent.position, predator.position);
    const predatorDistance = tempA.length();
    const alertRadius = agent.species === 'roach' ? 0.82 : 0.62;
    if (predatorDistance < alertRadius && predatorDistance > 1e-5) {
      agent.force.addScaledVector(tempA.normalize(), (1 - predatorDistance / alertRadius) * 2.4);
    }
  }
}

function addWander(agent, elapsed) {
  const speciesOffset = agent.species === 'pike' ? 0.31 : agent.species === 'perch' ? 1.17 : 2.43;
  agent.force.x += Math.sin(elapsed * 0.23 + agent.wanderPhase + speciesOffset) * 0.12;
  agent.force.z += Math.cos(elapsed * 0.19 + agent.wanderPhase * 0.83) * 0.18;
  agent.force.y += Math.sin(elapsed * 0.13 + agent.wanderPhase * 1.27) * 0.055;
}

function integrateAgent(agent, delta) {
  const physics = FISH_CATALOG[agent.species].physics;
  const requestedSpeed = agent.state === 'burst'
    ? physics.burstSpeed
    : agent.state === 'ambush'
      ? physics.cruiseSpeed * 0.34
      : physics.cruiseSpeed;

  if (agent.velocity.lengthSq() > 1e-8) {
    tempA.copy(agent.velocity).setLength(requestedSpeed).sub(agent.velocity);
    agent.force.addScaledVector(tempA, agent.state === 'burst' ? 1.9 : 0.48);
  }

  if (agent.force.length() > physics.maxForce) {
    agent.force.setLength(physics.maxForce);
  }
  agent.velocity.addScaledVector(agent.force, delta);
  agent.velocity.multiplyScalar(Math.exp(-physics.drag * delta * 0.12));
  const speedLimit = agent.state === 'burst' ? physics.burstSpeed : physics.maxSpeed;
  if (agent.velocity.length() > speedLimit) {
    agent.velocity.setLength(speedLimit);
  }
  if (agent.velocity.length() < requestedSpeed * 0.42) {
    agent.velocity.setLength(requestedSpeed * 0.42);
  }
  agent.position.addScaledVector(agent.velocity, delta);
  agent.position.clamp(
    tempA.copy(WORLD.min).addScalar(0.015),
    tempB.copy(WORLD.max).addScalar(-0.015),
  );
  agent.phase += delta * (physics.waveFrequency + agent.velocity.length() * 3.7);
}

export function stepFishAgents(agents, delta, elapsed, paused = false) {
  if (paused) {
    return;
  }
  const step = Math.min(delta, 1 / 30);
  if (agents[0]?.specimen) {
    for (const agent of agents) {
      agent.state = 'cruise';
      agent.position.set(
        agent.anchor.x + Math.sin(elapsed * 0.24 + agent.wanderPhase) * 0.055,
        agent.anchor.y + Math.sin(elapsed * 0.38 + agent.wanderPhase * 0.71) * 0.025,
        agent.anchor.z + Math.cos(elapsed * 0.31 + agent.wanderPhase) * 0.035,
      );
      agent.velocity.set(
        FISH_CATALOG[agent.species].physics.cruiseSpeed * 0.46,
        Math.cos(elapsed * 0.38 + agent.wanderPhase * 0.71) * 0.012,
        -Math.sin(elapsed * 0.31 + agent.wanderPhase) * 0.015,
      );
      agent.phase += step * FISH_CATALOG[agent.species].physics.waveFrequency * 0.72;
    }
    return;
  }
  const grid = new Map();
  let predator = null;
  for (const agent of agents) {
    const key = gridKey(agent.position);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push(agent);
    if (agent.species === 'pike') {
      predator = agent;
    }
  }

  for (const agent of agents) {
    const physics = FISH_CATALOG[agent.species].physics;
    agent.stateTime -= step;
    if (agent.stateTime <= 0) {
      randomizeState(agent);
    }
    agent.force.set(0, 0, 0);
    addSchoolForces(agent, grid, predator);
    addWander(agent, elapsed);
    addDepthBehavior(agent, physics);
    addBoundaryForce(agent);

    if (agent.species === 'pike' && agent.state === 'burst') {
      const closestPrey = agents
        .filter((candidate) => candidate.species === 'roach')
        .reduce((best, candidate) => {
          const distance = candidate.position.distanceToSquared(agent.position);
          return !best || distance < best.distance ? { candidate, distance } : best;
        }, null);
      if (closestPrey) {
        tempC.subVectors(closestPrey.candidate.position, agent.position).normalize();
        agent.force.addScaledVector(tempC, 1.45);
      }
    }
  }

  for (const agent of agents) {
    integrateAgent(agent, step);
  }
}

export function orientationForAgent(agent, targetQuaternion) {
  tempA.copy(agent.velocity);
  if (agent.state === 'surface' && agent.position.y > 0.68) {
    tempA.y = Math.max(tempA.y, tempA.length() * 0.74);
  } else if (agent.state === 'bottom' && agent.position.y < -0.62) {
    tempA.y = Math.min(tempA.y, -tempA.length() * 0.58);
  }
  if (tempA.lengthSq() < 1e-8) {
    tempA.set(1, 0, 0);
  }
  tempA.normalize();
  targetQuaternion.setFromUnitVectors(X_AXIS, tempA);
  return targetQuaternion;
}
