// Run: node src/components/effects/sky/skyModel.check.js
//
// The sky is the one part of this scene that can be checked against physics
// instead of against a screenshot, so it is. These assertions are what a
// screenshot cannot tell you: that the sun path still lands where the legacy
// azimuth/elevation pair put it, and that the horizon reddens for the right
// reason rather than because someone picked a warmer hex.

import assert from 'node:assert/strict';
import {
  SKY,
  airMass,
  buildHomeSceneLightDirection,
  buildSkyLut,
  solveMoonElevationAzimuth,
  solveNightWeight,
  solveSunElevationAzimuth,
} from './skyModel.js';

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

const sampleLut = (lut, azimuthDeg, elevationDeg) => {
  const u = (azimuthDeg / 360) + 0.5;
  const v = (elevationDeg / 180) + 0.5;
  const x = Math.min(lut.width - 1, Math.max(0, Math.round(u * lut.width - 0.5)));
  const y = Math.min(lut.height - 1, Math.max(0, Math.round(v * lut.height - 0.5)));
  const index = (y * lut.width + x) * 3;
  return [lut.data[index], lut.data[index + 1], lut.data[index + 2]];
};

// --- direction -------------------------------------------------------------

{
  const dir = buildHomeSceneLightDirection(75, 14);
  assert.ok(Math.abs(Math.hypot(...dir) - 1) < 1e-12, 'direction must be unit length');
  assert.ok(dir[1] > 0, 'a light above the horizon must have positive y');

  const below = buildHomeSceneLightDirection(75, -10);
  assert.ok(below[1] < 0, 'a light below the horizon must have negative y');
}

// --- the sun path reproduces the legacy pair at noon ------------------------

{
  // Phase 1 derives timeOfDay/bearing/noon elevation from the published
  // moonAzimuth/moonElevation. At noon the arc must return them untouched, or
  // the migration silently moves Denis's sun.
  const bearing = 75;
  const noonElevation = 14;
  const solved = solveSunElevationAzimuth(12, bearing, noonElevation);

  assert.ok(
    Math.abs(solved.elevationDeg - noonElevation) < 1e-12,
    `noon elevation must be exact, got ${solved.elevationDeg}`,
  );
  assert.ok(
    Math.abs(solved.azimuthDeg - bearing) < 1e-12,
    `noon azimuth must be exact, got ${solved.azimuthDeg}`,
  );
}

{
  // The sun has to be able to set - the single thing the old clamp made
  // impossible (elevation was clamped at 0).
  const midnight = solveSunElevationAzimuth(0, 75, 14);
  assert.ok(midnight.elevationDeg < 0, 'the sun must be below the horizon at midnight');

  const dawn = solveSunElevationAzimuth(6, 75, 14);
  assert.ok(Math.abs(dawn.elevationDeg) < 1e-9, 'the sun must cross the horizon at 06:00');
}

// --- sun/moon handover is continuous ---------------------------------------

{
  const weights = [4, 2, 1, 0, -1, -2, -4].map(solveNightWeight);
  for (let i = 1; i < weights.length; i += 1) {
    assert.ok(weights[i] >= weights[i - 1], 'night weight must rise monotonically as the sun sets');
  }
  assert.equal(solveNightWeight(10), 0, 'full day is 0');
  assert.equal(solveNightWeight(-10), 1, 'full night is 1');
  assert.ok(
    Math.abs(solveNightWeight(0) - 0.5) > 1e-5,
    'the exact 0.5 crossover is stepped over, or mixing antipodal vectors is degenerate',
  );
}

{
  const moon = solveMoonElevationAzimuth(0, 75, 14, 0.5);
  assert.ok(moon.elevationDeg > 0, 'a full moon must be up at midnight');
  assert.ok(moon.illumination > 0.99, 'phase 0.5 is a full moon');

  const newMoon = solveMoonElevationAzimuth(0, 75, 14, 0);
  assert.ok(newMoon.illumination < 0.01, 'phase 0 is a new moon');
}

// --- the horizon reddens because of air mass, not because of a hex ----------

{
  const betaM = SKY.betaM * (0.4 + 2.6 * 0.36);
  const betaT = SKY.betaR.map((b) => b + betaM);
  const ratioAt = (elevationDeg) => {
    const mass = airMass(elevationDeg);
    return Math.exp(-betaT[0] * mass) / Math.exp(-betaT[2] * mass);
  };

  assert.ok(ratioAt(5) > 10, `red/blue transmittance at 5 deg must exceed 10, got ${ratioAt(5)}`);
  assert.ok(ratioAt(0) > 1000, `red/blue transmittance at 0 deg must exceed 1000, got ${ratioAt(0)}`);
  assert.ok(ratioAt(90) < 1.4, `overhead sun must stay near neutral, got ${ratioAt(90)}`);
}

{
  // The whole point of the two-point transmittance fit: at sunset the horizon
  // goes warm while the zenith does NOT follow it.
  const lut = buildSkyLut({
    width: 64,
    height: 32,
    keyDirection: buildHomeSceneLightDirection(0, 1.5),
    keyRadiance: [1, 1, 1],
    skyTurbidity: 2.6,
  });

  const horizon = sampleLut(lut, 0, 2);
  const zenith = sampleLut(lut, 0, 85);
  const warmth = (rgb) => rgb[0] / Math.max(rgb[2], 1e-9);

  assert.ok(
    warmth(horizon) > warmth(zenith) * 2,
    `the sunset horizon must be far warmer than the zenith, got ${warmth(horizon)} vs ${warmth(zenith)}`,
  );
  assert.ok(warmth(zenith) < 1, 'the zenith must stay cool at sunset');
}

// --- overcast moves light from the beam into the dome ----------------------

{
  const base = {
    width: 64,
    height: 32,
    keyDirection: buildHomeSceneLightDirection(75, 40),
    keyRadiance: [1, 1, 1],
  };

  const clear = buildSkyLut({ ...base, cloudCover: 0 });
  const overcast = buildSkyLut({ ...base, cloudCover: 1 });

  assert.ok(clear.directShare > 0.5, `a clear noon must be beam-dominated, got ${clear.directShare}`);
  assert.ok(
    overcast.directShare < 0.12,
    `overcast must nearly extinguish the beam share, got ${overcast.directShare}`,
  );
  assert.ok(
    luminance(overcast.skyIrradiance) > 0,
    'the overcast dome must still deliver fill light',
  );
}

// --- the table is finite and the ground is not a mirrored sky --------------

{
  const lut = buildSkyLut({
    width: 32,
    height: 16,
    keyDirection: buildHomeSceneLightDirection(75, 14),
    keyRadiance: [2.4, 1.1, 0.3],
  });

  for (let i = 0; i < lut.data.length; i += 1) {
    assert.ok(Number.isFinite(lut.data[i]), `sky table must be finite at ${i}`);
    assert.ok(lut.data[i] >= 0, `sky table must be non-negative at ${i}`);
  }

  const below = sampleLut(lut, 0, -60);
  const above = sampleLut(lut, 0, 60);
  assert.ok(
    luminance(below) < luminance(above),
    'the ground must be darker than the sky above it',
  );
  assert.ok(luminance(below) > 0, 'the ground must still bounce some light');
}

console.log('skyModel: all checks passed');
