// Run: node src/components/effects/deviceCapabilityProfile.check.js

import assert from 'node:assert/strict';
import {
  DEVICE_PERFORMANCE_TIER,
  classifyDevicePerformance,
} from './deviceCapabilityProfile.js';

assert.equal(
  classifyDevicePerformance({ deviceMemory: 4, hardwareConcurrency: 8 }),
  DEVICE_PERFORMANCE_TIER.medium,
  'a modern 4GB multi-core Android device must retain the medium scene/canvas profile',
);
assert.equal(
  classifyDevicePerformance({ deviceMemory: 2, hardwareConcurrency: 8 }),
  DEVICE_PERFORMANCE_TIER.low,
  'very small memory remains a low-power signal even with many logical cores',
);
assert.equal(
  classifyDevicePerformance({ deviceMemory: null, hardwareConcurrency: 4 }),
  DEVICE_PERFORMANCE_TIER.medium,
  'Safari-like devices without memory hints should not be demoted to low by four cores alone',
);
assert.equal(
  classifyDevicePerformance({ deviceMemory: 8, hardwareConcurrency: 8 }),
  DEVICE_PERFORMANCE_TIER.high,
  'ample memory and cores retain the high profile',
);

console.log('deviceCapabilityProfile: all checks passed');
