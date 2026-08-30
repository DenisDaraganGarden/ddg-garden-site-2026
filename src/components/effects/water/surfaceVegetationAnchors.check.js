// Run: node src/components/effects/water/surfaceVegetationAnchors.check.js

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceVegetationGeometry } from './vegetationGeometry.js';
import {
  createSurfacePlantContactMap,
  createSurfacePlantStemGeometry,
  getSurfaceVegetationAnchor,
  getSurfaceVegetationStemClearance,
  sampleSurfaceVegetationSeabedNormal,
  sampleSurfaceVegetationSeabedRelief,
} from './surfaceVegetationAnchors.js';

const geometry = createSurfaceVegetationGeometry(4);
const settings = {
  surfacePlantCenterX: 3,
  surfacePlantCenterZ: -2,
  surfacePlantRadius: 5,
  surfacePlantClustering: 0,
  waterExtent: 24,
  seabedReliefScale: 1.8,
  seabedReliefStrength: 0.4,
  surfacePlantFloatOffset: 0.022,
  waveAmplitude: 0.045,
};
const scatter = geometry.getAttribute('aScatter');
const anchor = getSurfaceVegetationAnchor(geometry, 0, settings);

assert.equal(anchor.x, settings.surfacePlantCenterX + scatter.getX(0) * settings.surfacePlantRadius);
assert.equal(anchor.z, settings.surfacePlantCenterZ + scatter.getY(0) * settings.surfacePlantRadius);
assert.notEqual(
  sampleSurfaceVegetationSeabedRelief(anchor.x, anchor.z, settings),
  0,
  'anchors should use the same non-flat relief field as the visible seabed',
);
assert.ok(getSurfaceVegetationStemClearance() > 0, 'the live stem cap must stay below the leaf');
const normal = sampleSurfaceVegetationSeabedNormal(anchor.x, anchor.z, settings, new THREE.Vector3());
assert.ok(normal.y > 0 && Math.abs(normal.length() - 1) < 1e-6, 'contact decals must align to an upward seabed normal');

const contactMap = createSurfacePlantContactMap(8);
const pixels = contactMap.image.data;
const centreGreen = pixels[(4 * 8 + 4) * 4 + 1];
const edgeGreen = pixels[1];
assert.ok(centreGreen > edgeGreen, 'alphaMap must read a soft green-channel falloff');

const stemGeometry = createSurfacePlantStemGeometry(4);
assert.equal(stemGeometry.getAttribute('aStemBaseY').count, 4, 'stems need one seabed base per pad');
assert.equal(stemGeometry.getAttribute('aStemWaterUv').count, 4, 'stems need one wave lookup per pad');

geometry.dispose();
contactMap.dispose();
stemGeometry.dispose();
console.log('surfaceVegetationAnchors: all checks passed');
