// Run: node src/components/effects/water/renderTargets.check.js

import assert from 'node:assert/strict';
import { fitRenderTargetSize } from './renderTargets.js';

assert.deepEqual(
  fitRenderTargetSize(1024, 2.5),
  { width: 1024, height: 410 },
  'wide captures must preserve the camera aspect without exceeding the budget',
);
assert.deepEqual(
  fitRenderTargetSize(768, 0.5),
  { width: 384, height: 768 },
  'portrait captures must preserve the camera aspect without exceeding the budget',
);
assert.deepEqual(
  fitRenderTargetSize(512, Number.NaN),
  { width: 512, height: 512 },
  'invalid aspect ratios must fall back to a square target',
);

console.log('renderTargets: all checks passed');
