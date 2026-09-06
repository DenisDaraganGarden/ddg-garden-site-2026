import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTankerMaterials } from './materials.js';
import { createTankerLights, disposeTankerLights } from './lights.js';

export const TANKER_DIMENSIONS = Object.freeze({ length: 138, beam: 16.6, draft: 4.5, deck: 3.3, mast: 28 });

// Metres, Y up, bow +X, port -Z. Waterline is always y=0.
// The reference is a river/sea product tanker, not a container ship.
const STATIONS = [
  [-69, 5.6, 0.3], [-65, 7.2, 0.1], [-57, 8.3, 0],
  [-40, 8.3, 0], [0, 8.3, 0], [35, 8.3, 0],
  [49, 7.4, 0.35], [59, 5.5, 1.15], [65, 2.7, 1.9], [69, 0.18, 2.4],
];

function shellSection(x, width, sheer) {
  return [
    [x, 3.3 + sheer, -width], [x, -0.35, -width * 0.95],
    [x, -3.0, -width * 0.8], [x, -4.5, -width * 0.4],
    [x, -4.5, width * 0.4], [x, -3.0, width * 0.8],
    [x, -0.35, width * 0.95], [x, 3.3 + sheer, width],
  ];
}

function hullParts() {
  const red = [], underwater = [], deck = [];
  const tri = (list, a, b, c) => list.push(...a, ...b, ...c);
  const rings = STATIONS.map((station) => shellSection(...station));
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      const k = (j + 1) % 8;
      const target = j === 7 ? deck : (j === 0 || j === 6 ? red : underwater);
      tri(target, rings[i][j], rings[i + 1][j], rings[i][k]);
      tri(target, rings[i][k], rings[i + 1][j], rings[i + 1][k]);
    }
  }
  for (const [index, flip] of [[0, false], [rings.length - 1, true]]) {
    const ring = rings[index];
    const center = [ring[0][0], 0, 0];
    for (let j = 0; j < 8; j += 1) {
      const next = (j + 1) % 8;
      tri(j === 0 || j >= 6 ? red : underwater, center, ring[flip ? next : j], ring[flip ? j : next]);
    }
  }
  return { red, underwater, deck };
}

export function createTanker({ lod = 'near', procedural = true } = {}) {
  const near = lod === 'near';
  const materials = createTankerMaterials({ procedural });
  const buckets = new Map();
  const add = (key, geometry, position = [0, 0, 0], rotation) => {
    geometry.translate(...position);
    if (rotation) geometry.applyMatrix4(rotation);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute('uv');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(flat);
  };
  const box = (key, position, size) => add(key, new THREE.BoxGeometry(...size), position);
  const pipe = (key, from, to, radius = 0.1, segments = near ? 6 : 4) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    add(key, geometry, a.add(b).multiplyScalar(0.5).toArray());
  };
  const rails = (from, to, height = 1.08) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    for (const y of [height, height * 0.53]) pipe('metal', [a.x, a.y + y, a.z], [b.x, b.y + y, b.z], 0.045, 4);
    const count = Math.ceil(a.distanceTo(b) / 2.8);
    for (let i = 0; i <= count; i += 1) {
      const p = a.clone().lerp(b, i / count);
      pipe('metal', p.toArray(), [p.x, p.y + height, p.z], 0.045, 4);
    }
  };
  for (const [key, positions] of Object.entries(hullParts())) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    add(key, geometry);
  }

  // Aft accommodation: stepped decks, a bridge which projects over both wings,
  // and narrow window ribbons that remain legible at a distance.
  box('white', [-52, 5.2, 0], [22, 3.8, 14]);
  box('white', [-53, 8.5, 0], [18.8, 2.8, 13.5]);
  box('white', [-51.5, 11.45, 0], [19.8, 2.8, 13.5]);
  box('white', [-49.5, 14.25, 0], [17.5, 2.6, 15.5]);
  box('white', [-49.5, 15.72, 0], [19, 0.34, 16.6]);
  box('deck', [-53, 10, 0], [20.5, 0.25, 14.1]);
  box('deck', [-52, 12.95, 0], [21.5, 0.22, 15]);
  box('glass', [-40.71, 14.6, 0], [0.06, 0.95, 13.9]);
  for (const side of [-1, 1]) {
    box('glass', [-48.2, 14.6, side * 7.77], [14.8, 0.95, 0.05]);
    if (near) {
      for (let x = -60; x < -43; x += 3.2) {
        for (const y of [5.7, 8.8, 11.7]) box('glass', [x, y, side * (y < 7 ? 7.02 : 6.77)], [0.75, 0.8, 0.06]);
      }
      for (let x = -54; x < -40; x += 2.2) box('white', [x, 14.6, side * 7.82], [0.15, 1.1, 0.09]);
      for (let z = -6.8; z < 7; z += 2) box('white', [-40.65, 14.6, z], [0.09, 1.1, 0.12]);
      rails([-62, 7.15, side * 7.1], [-41, 7.15, side * 7.1]);
      rails([-62, 13.12, side * 7.55], [-41, 13.12, side * 7.55]);
      rails([-58.6, 15.9, side * 8.08], [-40, 15.9, side * 8.08]);
    }
  }
  box('white', [-58.8, 16.8, 0], [5.2, 3.0, 5]);
  box('graphite', [-58.8, 18.65, 0], [5.4, 0.8, 5.2]);
  box('red', [-58.8, 16.65, 2.54], [3.2, 1.4, 0.06]);
  pipe('graphite', [-59.8, 19, -1], [-59.8, 20.5, -1], 0.55);
  pipe('graphite', [-57.6, 19, 1], [-57.6, 20.5, 1], 0.42);

  // Tank lids, continuous fore/aft cargo pipes, cross manifolds and pipe bridges.
  for (let x = -29; x <= 40; x += near ? 10 : 20) {
    for (const side of [-1, 1]) {
      add('deck', new THREE.CylinderGeometry(1.38, 1.5, 0.42, near ? 10 : 6), [x, 3.62, side * 4.4]);
      if (near) {
        pipe('metal', [x, 3.9, side * 4.4], [x, 5.25, side * 4.4], 0.12);
        pipe('metal', [x - 0.45, 5.25, side * 4.4], [x + 0.45, 5.25, side * 4.4], 0.12);
        pipe('pipe', [x, 3.7, side * 4.5], [x, 3.7, side * 1.0], 0.22);
      }
    }
  }
  for (const z of (near ? [-2.05, -1.25, -0.4, 0.45, 1.25, 2.05] : [-1.3, 1.3])) {
    pipe('pipe', [-37, 4.2, z], [49, 4.2, z], near ? 0.21 : 0.32);
  }
  for (const x of [-31, -8, 15, 38]) {
    box('white', [x, 6.4, -3.1], [0.45, 5.6, 0.5]);
    box('white', [x, 6.4, 3.1], [0.45, 5.6, 0.5]);
    box('white', [x, 9.05, 0], [0.5, 0.48, 6.7]);
    if (near) {
      box('deck', [x, 5.4, 0], [1.4, 0.18, 7.2]);
      rails([x - 0.6, 5.5, -3.5], [x - 0.6, 5.5, 3.5]);
    }
  }
  if (near) {
    for (let x = -35; x <= 45; x += 5) box('graphite', [x, 3.85, 0], [0.22, 0.45, 5.6]);
    for (const side of [-1, 1]) {
      rails([-66, 3.6, side * 6.0], [-58, 3.3, side * 8.1]);
      rails([-58, 3.3, side * 8.1], [35, 3.3, side * 8.1]);
      rails([35, 3.3, side * 8.1], [49, 3.65, side * 7.25]);
      rails([49, 3.65, side * 7.25], [59, 4.45, side * 5.4]);
      rails([59, 4.45, side * 5.4], [68.5, 5.65, side * 0.5]);
      // Enclosed lifeboats, gravity davits, access stairs, mooring bollards.
      const lifeboat = new THREE.SphereGeometry(1, 8, 5);
      lifeboat.scale(3.5, 1.05, 1.3);
      add('orange', lifeboat, [-58, 8.8, side * 7.9]);
      for (const x of [-60, -56]) {
        pipe('white', [x, 7.2, side * 6.6], [x, 10.4, side * 8.3], 0.15);
        pipe('graphite', [x, 10.4, side * 8.3], [x, 9, side * 8.3], 0.04);
      }
      for (let i = 0; i < 10; i += 1) box('metal', [-41 + i * 0.38, 7.1 - i * 0.36, side * 6.8], [0.38, 0.12, 1]);
      for (const x of [-65, -37, 34, 57]) {
        pipe('graphite', [x, 3.4 + (x > 50 ? 1.7 : 0), side * (x > 50 ? 4.5 : 6.7)], [x, 4.2 + (x > 50 ? 1.7 : 0), side * (x > 50 ? 4.5 : 6.7)], 0.3);
      }
    }
    // Central loading manifold and valve wheels.
    for (const x of [-2, 1, 4]) {
      pipe('pipe', [x, 4.2, -6.2], [x, 4.2, 6.2], 0.26);
      for (const side of [-1, 1]) {
        add('red', new THREE.TorusGeometry(0.45, 0.08, 4, 8), [x, 4.9, side * 5.5]);
      }
    }
    box('deck', [58, 5.3, 0], [10, 0.5, 7]);
    for (const z of [-2.1, 2.1]) {
      pipe('graphite', [59, 5.65, z], [59, 6.5, z], 0.55);
      pipe('graphite', [59, 6.3, z], [65, 5.6, z * 0.45], 0.15);
    }
  }

  // Two slender masts and radar crossbars define the distant silhouette.
  pipe('white', [-47, 15.9, 0], [-47, 28, 0], 0.16);
  pipe('white', [47, 4.6, 0], [47, 22, 0], 0.16);
  for (const [x, y, span] of [[-47, 22, 3.5], [-47, 25, 2.4], [47, 16, 3.2], [47, 20, 2]]) {
    pipe('white', [x, y, -span], [x, y, span], 0.1);
  }
  if (near) {
    for (const side of [-1, 1]) {
      pipe('graphite', [-47, 26.5, 0], [-40.5, 15.9, side * 6.5], 0.024, 3);
      pipe('graphite', [47, 21, 0], [55, 5.4, side * 3.8], 0.024, 3);
    }
    for (const z of [-5.5, 5.5]) pipe('white', [-51, 15.9, z], [-51, 19.9, z], 0.045, 4);
  }
  box('port', [-40.1, 13.25, -7.7], [0.38, 0.35, 0.22]);
  box('starboard', [-40.1, 13.25, 7.7], [0.38, 0.35, 0.22]);
  box('lamp', [-47, 25.7, 0], [0.32, 0.45, 0.32]);
  box('lamp', [47, 20.5, 0], [0.32, 0.45, 0.32]);

  const group = new THREE.Group();
  group.name = `DDG_RiverSeaTanker_${lod}`;
  group.userData = { asset: 'river-sea-tanker', units: 'metres', forward: '+X', waterline: 0, lod };
  for (const [key, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `tanker_${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach((source) => source.dispose());
  }
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const triangles = group.children.reduce((count, mesh) => count + mesh.geometry.attributes.position.count / 3, 0);
  const metrics = { lod, meshes: group.children.length, triangles, length: size.x, height: size.y, beam: size.z };
  // The lights are sprites, not geometry: they join after the metrics so the
  // mesh and triangle budgets keep describing the hull.
  const lights = createTankerLights();
  group.add(lights.points);
  return { group, materials, lights, metrics };
}

export function disposeTanker(asset) {
  asset.group.traverse((object) => { if (object.isMesh) object.geometry?.dispose(); });
  Object.values(asset.materials).forEach((material) => material.dispose());
  disposeTankerLights(asset.lights);
}
