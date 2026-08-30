// Run: node src/components/effects/water/vegetationGeometry.check.js

import assert from 'node:assert/strict';
import { createUnderwaterAlgaeGeometry } from './vegetationGeometry.js';

const first = createUnderwaterAlgaeGeometry(96);
const second = createUnderwaterAlgaeGeometry(96);
const firstRootOcclusion = Array.from(first.getAttribute('aRootOcclusion').array);
const secondRootOcclusion = Array.from(second.getAttribute('aRootOcclusion').array);

assert.equal(firstRootOcclusion.length, 96, 'every algae instance must carry root contact data');
assert.deepEqual(
  firstRootOcclusion,
  secondRootOcclusion,
  'root contact data must stay deterministic while authoring the meadow',
);
assert.ok(
  firstRootOcclusion.every((value) => Number.isFinite(value) && value >= 0.24 && value <= 1),
  'root contact data must remain normalized for the shader',
);
assert.ok(
  Math.max(...firstRootOcclusion) - Math.min(...firstRootOcclusion) > 0.2,
  'cluster cores must retain a visibly stronger contact value than loose blades',
);

first.dispose();
second.dispose();

console.log('vegetationGeometry: all checks passed');
