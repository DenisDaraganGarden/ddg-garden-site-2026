import * as THREE from 'three';

// Instanced scatter for the planting. The randomness is seeded, so the same
// settings always produce the same meadow - moving a slider adjusts one
// arrangement rather than reshuffling it under the author.

export function createDeterministicRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPointInDisk(random, radius = 1) {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * radius;

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}

export function createSurfaceVegetationGeometry(maxInstances) {
  const random = createDeterministicRandom(0x5ea1f00d);
  const baseGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  const scatter = new Float32Array(maxInstances * 2);
  const clustered = new Float32Array(maxInstances * 2);
  const scales = new Float32Array(maxInstances);
  const rotations = new Float32Array(maxInstances);
  const types = new Float32Array(maxInstances);
  const tones = new Float32Array(maxInstances);
  const phases = new Float32Array(maxInstances);
  const clusterCenters = Array.from({ length: 11 }, () => randomPointInDisk(random, 0.76));

  geometry.index = baseGeometry.index;
  geometry.setAttribute('position', baseGeometry.getAttribute('position'));
  geometry.setAttribute('uv', baseGeometry.getAttribute('uv'));

  for (let index = 0; index < maxInstances; index += 1) {
    const point = randomPointInDisk(random, 0.96);
    const center = clusterCenters[Math.floor(random() * clusterCenters.length)];
    const local = randomPointInDisk(random, 0.08 + random() * 0.2);
    const targetX = center.x + local.x;
    const targetY = center.y + local.y;
    const targetLength = Math.hypot(targetX, targetY);
    const targetScale = targetLength > 0.96 ? 0.96 / targetLength : 1;

    scatter[index * 2] = point.x;
    scatter[index * 2 + 1] = point.y;
    clustered[index * 2] = targetX * targetScale;
    clustered[index * 2 + 1] = targetY * targetScale;
    scales[index] = random();
    rotations[index] = random() * Math.PI * 2;
    types[index] = random();
    tones[index] = random();
    phases[index] = random() * Math.PI * 2;
  }

  geometry.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 2));
  geometry.setAttribute('aCluster', new THREE.InstancedBufferAttribute(clustered, 2));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1));
  geometry.setAttribute('aType', new THREE.InstancedBufferAttribute(types, 1));
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = maxInstances;

  return geometry;
}

export function createUnderwaterAlgaeGeometry(maxInstances, segments = 8) {
  const random = createDeterministicRandom(0xa19ae5e1);
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = [];
  const uvs = [];
  const ribbonPlanes = [];

  const pushVertex = (x, y, plane) => {
    positions.push(x, y, 0);
    uvs.push(x + 0.5, y);
    ribbonPlanes.push(plane);
  };

  for (let plane = 0; plane < 2; plane += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const lower = segment / segments;
      const upper = (segment + 1) / segments;

      pushVertex(-0.5, lower, plane);
      pushVertex(0.5, lower, plane);
      pushVertex(0.5, upper, plane);
      pushVertex(-0.5, lower, plane);
      pushVertex(0.5, upper, plane);
      pushVertex(-0.5, upper, plane);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aRibbonPlane', new THREE.Float32BufferAttribute(ribbonPlanes, 1));

  const scatter = new Float32Array(maxInstances * 2);
  const clustered = new Float32Array(maxInstances * 2);
  const heights = new Float32Array(maxInstances);
  const widths = new Float32Array(maxInstances);
  const yaws = new Float32Array(maxInstances);
  const phases = new Float32Array(maxInstances);
  const tones = new Float32Array(maxInstances);
  const species = new Float32Array(maxInstances);
  const patchCenters = Array.from({ length: 19 }, () => randomPointInDisk(random, 0.82));

  for (let index = 0; index < maxInstances; index += 1) {
    const patch = patchCenters[Math.floor(random() * patchCenters.length)];
    const local = randomPointInDisk(random, 0.035 + random() * 0.16);
    const freePoint = randomPointInDisk(random, 0.97);
    const clusteredX = patch.x + local.x;
    const clusteredY = patch.y + local.y;
    const clusterLength = Math.hypot(clusteredX, clusteredY);
    const clusterFit = clusterLength > 0.97 ? 0.97 / clusterLength : 1;

    scatter[index * 2] = freePoint.x;
    scatter[index * 2 + 1] = freePoint.y;
    clustered[index * 2] = clusteredX * clusterFit;
    clustered[index * 2 + 1] = clusteredY * clusterFit;
    heights[index] = random();
    widths[index] = 0.62 + random() * 1.28;
    yaws[index] = random() * Math.PI * 2;
    phases[index] = random() * Math.PI * 2;
    tones[index] = random();
    species[index] = random();
  }

  geometry.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 2));
  geometry.setAttribute('aCluster', new THREE.InstancedBufferAttribute(clustered, 2));
  geometry.setAttribute('aHeight', new THREE.InstancedBufferAttribute(heights, 1));
  geometry.setAttribute('aWidth', new THREE.InstancedBufferAttribute(widths, 1));
  geometry.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaws, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1));
  geometry.setAttribute('aSpecies', new THREE.InstancedBufferAttribute(species, 1));
  geometry.instanceCount = maxInstances;

  return geometry;
}
