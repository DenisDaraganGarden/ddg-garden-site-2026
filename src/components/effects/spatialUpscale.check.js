import assert from 'node:assert/strict';
import { getSpatialUpscaleSize, UPSCALE_SCALES } from './spatialUpscale.js';
assert.deepEqual(getSpatialUpscaleSize(1920, 1080, UPSCALE_SCALES.quality), { width: 1280, height: 720 });
assert.deepEqual(getSpatialUpscaleSize(520, 187, UPSCALE_SCALES.balanced), { width: 520, height: 187 });
assert.deepEqual(getSpatialUpscaleSize(780, 280, .4), { width: 669, height: 240 });
assert.deepEqual(getSpatialUpscaleSize(1920, 1080, .2), { width: 960, height: 540 });
assert.deepEqual(getSpatialUpscaleSize(1920, 1080, Infinity), { width: 1920, height: 1080 });
console.log('spatialUpscale: aspect, small-frame detail floor and 2x limit passed');
