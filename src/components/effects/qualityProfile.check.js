// Run: node src/components/effects/qualityProfile.check.js

import assert from 'node:assert/strict';
import { trimProfileForMobile } from './qualityProfile.js';

const desktopProfile = {
  simulationMaxResolution: 512,
  reflectionTextureSize: 384,
  reflectionActiveFps: 30,
  reflectionIdleFps: 15,
  refractionActiveFps: 30,
  refractionIdleFps: 15,
  postSamples: 2,
  sunRaySampleCount: 18,
  fogSampleCount: 8,
  shadowMapSize: 768,
  boatProbeInterval: 1 / 20,
  waterMeshDensityCap: 224,
};

assert.equal(
  trimProfileForMobile(desktopProfile, false),
  desktopProfile,
  'desktop must keep the exact authored runtime profile',
);

assert.deepEqual(
  trimProfileForMobile(desktopProfile, true),
  {
    ...desktopProfile,
    simulationMaxResolution: 256,
    reflectionTextureSize: 512,
    reflectionActiveFps: 20,
    reflectionIdleFps: 12,
    refractionActiveFps: 12,
    refractionIdleFps: 8,
    postSamples: 0,
    sunRaySampleCount: 12,
    fogSampleCount: 4,
    shadowMapSize: 512,
    // A tile GPU flushes on every synchronous probe readback: 12 Hz floor.
    boatProbeInterval: 1 / 12,
    waterMeshDensityCap: 160,
  },
  'capable phones should trade duplicate transient work for clean optics and stable motion',
);

console.log('qualityProfile: all checks passed');
