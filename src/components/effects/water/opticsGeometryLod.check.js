// Run: node src/components/effects/water/opticsGeometryLod.check.js

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { parseOpticsGeometryLod, setOpticsGeometryLod } from './opticsGeometryLod.js';
import {
  projectedSphereDiameterPixels,
  shouldUseVisibleGeometryLod,
  VISIBLE_GEOMETRY_LOD,
} from './visibleGeometryLod.js';

const readLod = (path) => {
  const file = fs.readFileSync(path);
  return parseOpticsGeometryLod(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
};

const boat = readLod('public/models/boat/boat-optics.rlod');
const sculpture = readLod('public/models/sculpture/sculpture-optics.rlod');

assert.ok(boat.get('Object019_OBJ_wire_000000000')?.length < 31328 * 3);
assert.ok(sculpture.get('sculpt25_005')?.length < 59972 * 3);
assert.equal(
  [...boat.values(), ...sculpture.values()].every((indices) => indices.length % 3 === 0),
  true,
  'every optics LOD must remain a triangle list',
);

const boatThresholds = VISIBLE_GEOMETRY_LOD.boat;
assert.equal(
  shouldUseVisibleGeometryLod({
    wasReduced: false,
    distance: boatThresholds.enterDistance,
    screenPixels: boatThresholds.enterPixels,
    thresholds: boatThresholds,
  }),
  true,
  'far, small boat enters its reduced mesh',
);
assert.equal(
  shouldUseVisibleGeometryLod({
    wasReduced: false,
    distance: boatThresholds.enterDistance - 0.01,
    screenPixels: 40,
    thresholds: boatThresholds,
  }),
  false,
  'a close-up never trades its authored geometry for the reduced mesh',
);
assert.equal(
  shouldUseVisibleGeometryLod({
    wasReduced: true,
    distance: boatThresholds.exitDistance,
    screenPixels: 80,
    thresholds: boatThresholds,
  }),
  false,
  'distance hysteresis restores the close mesh before the camera reaches it',
);
assert.equal(
  shouldUseVisibleGeometryLod({
    wasReduced: true,
    distance: 120,
    screenPixels: boatThresholds.exitPixels,
    thresholds: boatThresholds,
  }),
  false,
  'screen-size hysteresis restores detail before a visible silhouette changes',
);
assert.ok(
  projectedSphereDiameterPixels({ radius: 1, distance: 10, fovDegrees: 60, viewportHeight: 1000 }) > 170,
  'projection uses the current camera field of view and viewport',
);

const lodRoot = new THREE.Group();
const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
const reducedGeometry = new THREE.BufferGeometry();
const lodMesh = new THREE.Mesh(baseGeometry);
lodMesh.userData.ddgOpticsBaseGeometry = baseGeometry;
lodMesh.userData.ddgOpticsGeometry = reducedGeometry;
lodRoot.add(lodMesh);
assert.equal(setOpticsGeometryLod(lodRoot, true), 1, 'a loaded mesh switches to its reduced indices');
assert.equal(lodMesh.geometry, reducedGeometry);
assert.equal(setOpticsGeometryLod(lodRoot, false), 1, 'the close-up source geometry is restored exactly');
assert.equal(lodMesh.geometry, baseGeometry);
baseGeometry.dispose();
reducedGeometry.dispose();

console.log('opticsGeometryLod: all checks passed');
