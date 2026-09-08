import assert from 'node:assert/strict';
import { createGerstnerSurfaceSampler } from './gerstnerSurfaceSampler.js';

// The prepass addresses texels by visible XZ, so its bounded GLSL inverse is
// guarded by the same high-steepness carrier the actors use. The shared CPU
// sampler remains the numeric reference for this non-linear coordinate map.
const sampler = createGerstnerSurfaceSampler({
  wavelength: 3,
  amplitude: 1.6,
  steepness: 0.8,
  speed: 2.5,
  windDirection: 94,
  crossWaves: 1,
  sets: 1,
  gusts: 1,
  fadeStart: 260,
  fadeEnd: 2440,
  meshRings: 152,
  meshSegments: 104,
});
for (const [x, z, time] of [[-8, -7, 0], [-3.1, 5.7, 1.9], [4.6, -6.4, 8.3], [9, 9, 17.1]]) {
  const surface = sampler(x, z, time, {}, { fadeAt: () => 1, cellAt: () => 0, inverseIterations: 5 });
  assert.ok(Math.hypot(surface.x - x, surface.z - z) < 1e-4, `inverse horizontal displacement reconstructs visible ${x},${z}`);
  assert.ok(Number.isFinite(surface.worldY) && [surface.normal.x, surface.normal.y, surface.normal.z].every(Number.isFinite), 'carrier sample remains finite at maximum authored wave budget');
}
console.log('seaCausticNormals: shared Gerstner inverse reference remains stable at the maximum wave budget');
