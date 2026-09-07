import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Portable authoring model. The coast still uses its reviewed collision mesh;
// this collection is reviewed in the lab before adopting it in the coast.
export const ROCK_TYPES = Object.freeze(['limestone', 'coquina', 'worn']);
export const ROCK_DETAIL = Object.freeze({ boulder: 20, debris: 4, pebble: 2, mobileBoulder: 12, mobilePebble: 1 });

export function rockRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, t) => a + (b - a) * t;
const saturate = (x) => Math.max(0, Math.min(1, x));
function hash(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rockNoise(x, y, z, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const u = smooth(x - ix), v = smooth(y - iy), w = smooth(z - iz);
  return mix(
    mix(mix(hash(ix, iy, iz, seed), hash(ix + 1, iy, iz, seed), u), mix(hash(ix, iy + 1, iz, seed), hash(ix + 1, iy + 1, iz, seed), u), v),
    mix(mix(hash(ix, iy, iz + 1, seed), hash(ix + 1, iy, iz + 1, seed), u), mix(hash(ix, iy + 1, iz + 1, seed), hash(ix + 1, iy + 1, iz + 1, seed), u), v), w,
  );
}

function fracturePlanes(random, rounded) {
  const planes = [];
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const normal = new THREE.Vector3((random() - .5) * .48, (random() - .5) * .48, (random() - .5) * .48);
    normal.setComponent(axis, sign);
    planes.push({ normal: normal.normalize(), distance: .35 + random() * .12 });
  }
  for (let i = 0; i < 11; i++) {
    const normal = new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize();
    planes.push({ normal, distance: .39 + random() * .18 + rounded * .09 });
  }
  return planes;
}

/** A closed radial surface with geological fracture planes and continuous
 * erosion. Welding before deformation removes the icosphere's UV seam. Detail
 * only changes sampling: the same seed describes the same shape at every LOD.
 * Unit size stays close to one metre; caller transforms own the physical size. */
export function createCoastalRockGeometry({ seed = 1, type = 'limestone', detail = ROCK_DETAIL.boulder, erosion = .65, roundness = .35, fracture = .78, cavities = .65, pebble = false } = {}) {
  const random = rockRandom(seed);
  const source = new THREE.IcosahedronGeometry(1, detail);
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  let geometry = mergeVertices(source, 1e-5);
  source.dispose();
  const positions = geometry.attributes.position;
  const cavity = new Float32Array(positions.count);
  const exposure = new Float32Array(positions.count);
  const rounded = pebble ? .94 : type === 'worn' ? .74 + roundness * .2 : roundness * .18;
  const planes = fracturePlanes(random, rounded);
  const offsets = new THREE.Vector3(random() * 30, random() * 30, random() * 30);
  const direction = new THREE.Vector3(), point = new THREE.Vector3();
  const distances = new Float32Array(planes.length);
  const seedPhase = random() * 19;
  const pits = Array.from({ length: type === 'coquina' ? 42 : 6 }, () => ({
    direction: new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize(),
    width: .035 + random() ** 2 * .11,
    depth: (.008 + random() * .036) * erosion,
  }));

  // A separate stream keeps the original outline and every pebble stable.
  // Recent fractures clip the weathered body AFTER erosion: an exposed face
  // stays planar instead of inheriting the crust's rounded noise.
  const damageRandom = rockRandom(seed + 7151);
  const cuts = Array.from({ length: 8 }, () => {
    const normal = new THREE.Vector3(damageRandom() - .5, damageRandom() - .5, damageRandom() - .5).normalize();
    let distance = .72;
    for (const plane of planes) {
      const facing = normal.dot(plane.normal);
      if (facing > .01) distance = Math.min(distance, plane.distance / facing);
    }
    return { normal, distance: mix(distance, .48, rounded) - (.025 + damageRandom() * .075) * fracture };
  });
  // Angular, asymmetrical spalls have a flat floor and sloping broken walls.
  // Their footprint is a convex polygon in a local tangent frame. Unlike a
  // Gaussian dent this creates an actual rim/face transition in the silhouette.
  const spalls = Array.from({ length: type === 'coquina' ? 22 : 12 }, () => {
    const normal = new THREE.Vector3(damageRandom() - .5, damageRandom() - .5, damageRandom() - .5).normalize();
    const tangent = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    return {
      normal, tangent, bitangent: new THREE.Vector3().crossVectors(normal, tangent),
      width: .10 + damageRandom() * .17, depth: .026 + damageRandom() * .07,
      aspect: .55 + damageRandom() * .7, floor: .22 + damageRandom() * .32,
      sides: Array.from({ length: 5 }, (_, i) => ({ angle: i * Math.PI * .4 + (damageRandom() - .5) * .3, radius: .72 + damageRandom() * .35 })),
    };
  });

  function sampleBody(direction) {
    let nearest = .72;
    for (let j = 0; j < planes.length; j++) {
      const facing = direction.dot(planes[j].normal);
      distances[j] = facing > .01 ? planes[j].distance / facing : 100;
      nearest = Math.min(nearest, distances[j]);
    }
    const bevel = .003 + roundness * .009 + rounded * .012;
    let sum = Math.exp(-(.72 - nearest) / bevel);
    for (const distance of distances) sum += Math.exp(-(distance - nearest) / bevel);
    const fractured = nearest - bevel * Math.log(sum);
    let radius = mix(fractured, .48, rounded);
    point.copy(direction).multiplyScalar(radius);
    const x = point.x + offsets.x, y = point.y + offsets.y, z = point.z + offsets.z;
    const broad = rockNoise(x * 3.1, y * 3.1, z * 3.1, seed) - .5;
    const middle = rockNoise(x * 12, y * 12, z * 12, seed + 17) - .5;
    const fine = rockNoise(x * 38, y * 38, z * 38, seed + 53) - .5;
    radius += broad * (pebble ? .045 : type === 'worn' ? .10 : .025)
      + middle * (pebble ? .009 : type === 'coquina' ? .028 : .018) * erosion
      + fine * (pebble ? .001 : type === 'coquina' ? .012 : .006) * erosion;

    // Broken bedding is cut into the form; it never becomes a regular stack of
    // pancakes. Sea-worn stones retain very little of this original structure.
    const bed = point.y * (type === 'coquina' ? 12 : 17) + broad * .8 + point.x * .55 + seedPhase;
    const seam = Math.exp(-((Math.sin(bed * Math.PI) / .17) ** 2));
    const broken = smooth(Math.max(0, Math.min(1, rockNoise(x * 7, y * 2, z * 7, seed + 7) * 1.6 - .35)));
    const bedding = seam * broken * (1 - rounded) * erosion;
    radius -= bedding * (type === 'coquina' ? .009 : .02);

    let hollow = 0;
    if (!pebble) for (const pit of pits) {
      const distance = direction.distanceToSquared(pit.direction) / (pit.width * pit.width);
      if (distance < 9) hollow += pit.depth * Math.exp(-distance * 1.5);
    }
    radius -= hollow;
    return { radius, cavity: hollow * 10 + bedding * .09 };
  }
  for (const spall of spalls) {
    let radius = sampleBody(spall.normal).radius;
    for (const cut of cuts) {
      const facing = spall.normal.dot(cut.normal);
      if (facing > .05) radius = mix(radius, Math.min(radius, cut.distance / facing), smooth(fracture));
    }
    spall.floorDistance = radius - spall.depth;
  }

  for (let i = 0; i < positions.count; i++) {
    direction.fromBufferAttribute(positions, i).normalize();
    const weathered = sampleBody(direction);
    let radius = weathered.radius;
    let fresh = 0, spallDepth = 0;
    if (!pebble) {
      if (fracture > 0) for (const cut of cuts) {
        const facing = direction.dot(cut.normal);
        if (facing <= .05) continue;
        const clipped = cut.distance / facing;
        if (clipped < radius) {
          fresh = Math.max(fresh, smooth(saturate((radius - clipped) / .022)) * fracture);
          radius = mix(radius, clipped, smooth(fracture));
        }
      }
      for (const spall of spalls) {
        if (direction.dot(spall.normal) < .85) continue;
        const u = direction.dot(spall.tangent) / spall.width;
        const v = direction.dot(spall.bitangent) / (spall.width * spall.aspect);
        let edge = 0;
        for (const side of spall.sides) edge = Math.max(edge, (u * Math.cos(side.angle) + v * Math.sin(side.angle)) / side.radius);
        // The broad floor is only slightly tilted. A narrow lip meets a steep
        // wall; the floor's material exposure follows the removed volume.
        const wall = saturate((1 - edge) / (1 - spall.floor));
        const floorRadius = spall.floorDistance / direction.dot(spall.normal) + (u * .009 - v * .007) * cavities;
        const depth = Math.max(0, radius - floorRadius) * wall * smooth(cavities);
        spallDepth = Math.max(spallDepth, depth);
        fresh = Math.max(fresh, smooth(saturate(depth / .018)) * cavities * .9);
      }
      radius -= spallDepth;
    }
    cavity[i] = Math.min(.7, weathered.cavity + spallDepth * 6);
    exposure[i] = fresh;
    point.copy(direction).multiplyScalar(radius);
    // Unequal lobes, a tilted bed and a broad base survive all detail levels.
    point.x += point.y * (.10 * Math.sin(seedPhase));
    point.z += point.y * (.11 * Math.cos(seedPhase));
    if (!pebble && type === 'limestone') point.y *= .82;
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.setAttribute('rockCavity', new THREE.BufferAttribute(cavity, 1));
  geometry.setAttribute('rockFracture', new THREE.BufferAttribute(exposure, 1));
  geometry.computeVertexNormals();
  if (!pebble && detail >= ROCK_DETAIL.mobileBoulder) {
    // Preserve real fracture creases while the small weathered undulations
    // keep smooth normals. Triangle count and closed surface stay unchanged.
    const creased = toCreasedNormals(geometry, .65);
    geometry.dispose();
    geometry = creased;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `azov-${pebble ? 'pebble' : type}-${seed}-d${detail}`;
  geometry.userData = { seed, type, detail, erosion, roundness, fracture, cavities, pebble, triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3, units: 'metres' };
  return geometry;
}

export function seatRock(geometry, rotation, scale, embed = .025) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
  const point = new THREE.Vector3(), vertices = geometry.attributes.position;
  let lowest = Infinity;
  for (let i = 0; i < vertices.count; i++) lowest = Math.min(lowest, point.fromBufferAttribute(vertices, i).applyMatrix4(matrix).y);
  return -lowest - embed * scale[1];
}
