// Run: node src/components/effects/water/surfaceVegetationAnchors.check.js

import assert from 'node:assert/strict';
import { createSurfaceVegetationGeometry } from './vegetationGeometry.js';
import {
  createSurfacePlantContactMap,
  getSurfaceVegetationAnchor,
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

const contactMap = createSurfacePlantContactMap(8);
const pixels = contactMap.image.data;
const centreAlpha = pixels[(4 * 8 + 4) * 4 + 3];
const edgeAlpha = pixels[3];
assert.ok(centreAlpha > edgeAlpha, 'contact mark must soften outwards instead of reading as a hard disc');

geometry.dispose();
contactMap.dispose();
console.log('surfaceVegetationAnchors: all checks passed');
