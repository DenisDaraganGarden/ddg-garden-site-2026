// Run: node src/components/effects/water/farWaterGeometry.check.js

import assert from 'node:assert/strict';
import {
  FAR_WATER_RADIUS,
  buildFarWaterFieldData,
} from './farWaterGeometry.js';

const field = buildFarWaterFieldData(34);

assert.equal(field.positions.length, 4 * 3, 'the far field must stay at four vertices');
assert.equal(field.indices.length, 2 * 3, 'the far field must stay at two triangles');
const [a, b, c] = Array.from(field.indices).slice(0, 3).map((index) => (
  Array.from(field.positions).slice(index * 3, index * 3 + 3)
));
const firstTriangleNormalY = (b[2] - a[2]) * (c[0] - a[0])
  - (b[0] - a[0]) * (c[2] - a[2]);
assert.ok(firstTriangleNormalY > 0, 'the far field must face upward');
assert.ok(field.innerHalfExtent < 17, 'the far field must overlap the simulated water edge');
assert.ok(
  Math.abs(field.pondHalfExtent - field.innerHalfExtent - field.surfaceBlendWidth) < 1e-9,
  'the geometric overlap must equal the optical blend width',
);
assert.ok(field.surfaceEdgeBlendUv < 0.012, 'the transition must remain below 1.2% of the pond');
assert.ok(field.outerRadius >= FAR_WATER_RADIUS, 'the field must exceed the camera far plane');
assert.ok(
  Array.from(field.positions).every(Number.isFinite),
  'all far-water positions must remain finite',
);
console.log('farWaterGeometry: all checks passed');
