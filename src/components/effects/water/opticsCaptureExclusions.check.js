import assert from 'node:assert/strict';
import { isSeaOpticsSurfaceName } from './opticsCaptureExclusions.js';

[
  'water-surface',
  'far-water-surface',
  'gerstner-water',
  'shore-water',
  'breaking-wave-0',
  'breaking-foam-6',
  'breaking-spray-3',
].forEach((name) => assert.equal(isSeaOpticsSurfaceName(name), true, `${name} must stay out of its own optics capture`));

['breaking-wave', 'breaking-wavelet-0', 'azov-terrain', 'boat'].forEach((name) => {
  assert.equal(isSeaOpticsSurfaceName(name), false, `${name} is not a captured sea surface`);
});

console.log('optics capture exclusions: named and numbered sea surfaces are excluded');
