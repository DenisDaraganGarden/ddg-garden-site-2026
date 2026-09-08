import assert from 'node:assert/strict';
import { GERSTNER_MAX_STEEPNESS, GERSTNER_WEATHER, gerstnerShader, gerstnerSigma, gerstnerSteepnessBudget, gerstnerWeatherAt, gerstnerWhitecapCoverage, resolveGerstnerTrains } from './gerstnerWaves.js';
import { buildRadialWaterGeometry } from './radialWaterGeometry.js';

// The steepness budget is the no-self-intersection guarantee: whatever the
// sliders say, Σ Q·k·A never exceeds the cap.
for (const steepness of [0, 0.3, 0.8, 1.5, 40, -3, 'x']) {
  for (const amplitude of [0, 0.05, 0.6, 3]) {
    const trains = resolveGerstnerTrains({ wavelength: 14, amplitude, steepness, windDirection: 200, crossWaves: 0.5 });
    assert.equal(trains.length, 4);
    assert.ok(gerstnerSteepnessBudget(trains) <= GERSTNER_MAX_STEEPNESS + 1e-9, `budget exceeded for ${steepness}/${amplitude}`);
    trains.forEach((train) => assert.ok(Number.isFinite(train.q) && train.q >= 0));
  }
}
assert.ok(Math.abs(gerstnerSteepnessBudget(resolveGerstnerTrains({ wavelength: 10, amplitude: 0.4, steepness: 0.5, windDirection: 0, crossWaves: 1 })) - 0.5) < 1e-9);
// Silent crossing trains leave the budget to the live ones.
const noCross = resolveGerstnerTrains({ wavelength: 10, amplitude: 0.4, steepness: 0.6, windDirection: 0, crossWaves: 0 });
assert.equal(noCross.filter((train) => train.q * train.k * train.amplitude > 0).length, 2);
assert.ok(Math.abs(gerstnerSteepnessBudget(noCross) - 0.6) < 1e-9);

// The mesh: expected triangle count, and every face wound to face +Y.
const geometry = buildRadialWaterGeometry({ innerRadius: 1, outerRadius: 3000, rings: 112, segments: 144 });
assert.equal(geometry.userData.triangles, 144 + 111 * 144 * 2);
const position = geometry.getAttribute('position');
const index = geometry.getIndex();
for (let face = 0; face < index.count; face += 3) {
  const [a, b, c] = [0, 1, 2].map((corner) => index.getX(face + corner));
  const ux = position.getX(b) - position.getX(a), uz = position.getZ(b) - position.getZ(a);
  const vx = position.getX(c) - position.getX(a), vz = position.getZ(c) - position.getZ(a);
  // Y of the cross product of two XZ edges: positive means the face looks up.
  assert.ok(uz * vx - ux * vz > 0, `face ${face / 3} is wound downward`);
}
// The weather: GLSL and JS read one table (the CPU break line and the loft's
// crest heights must agree), the envelope never exceeds 1 (the steepness
// budget holds) and never falls below 1 - 0.7 * gusts.
for (const [fx, fz] of [...GERSTNER_WEATHER.gusts, ...GERSTNER_WEATHER.wander]) {
  assert.ok(gerstnerShader.includes(`p.x * ${fx.toFixed(4)} + p.y * ${fz.toFixed(4)}`), `weather term ${fx}/${fz} missing from the GLSL`);
}
for (let i = 0; i < 2000; i += 1) {
  const w = gerstnerWeatherAt(Math.sin(i * 7.3) * 900, Math.cos(i * 3.1) * 900, 1);
  assert.ok(w <= 1 + 1e-9 && w >= 0.3 - 1e-9, `weather envelope ${w}`);
}
assert.equal(gerstnerWeatherAt(123, -456, 0), 1);
// The whitecap patches must not come from a sine field: a lattice on the sea
// is the one thing Denis will not accept. They are hashed value noise.
assert.ok(!/caps/.test(gerstnerShader), 'the whitecap mask must not be a sine table');
assert.ok(gerstnerShader.includes('gerstnerHash'), 'the whitecap patches must be hashed noise');
// The whitecap coverage the shader falls back on where a wave no longer
// resolves in a pixel must be the coverage the wave field actually has, or the
// foam appears and vanishes as the camera moves. Re-measure the Jacobian's
// distribution and compare with the fit.
const sampleCoverage = (trains, threshold) => {
  let hit = 0, total = 0;
  for (let i = 0; i < 300; i += 1) {
    for (let j = 0; j < 300; j += 1) {
      const x = i * 0.37, z = j * 0.41;
      let dxx = 0, dzz = 0, dxz = 0;
      trains.forEach((train, index) => {
        const phase = train.k * (train.direction[0] * x + train.direction[1] * z) + index * 1.7;
        const wa = train.q * train.k * train.amplitude * Math.sin(phase);
        dxx -= wa * train.direction[0] ** 2;
        dzz -= wa * train.direction[1] ** 2;
        dxz -= wa * train.direction[0] * train.direction[1];
      });
      total += 1;
      if ((1 + dxx) * (1 + dzz) - dxz * dxz < threshold) hit += 1;
    }
  }
  return hit / total;
};
let worst = 0;
for (const steepness of [0.3, 0.5, 0.7, 0.8]) {
  const trains = resolveGerstnerTrains({ wavelength: 11.5, amplitude: 0.57, steepness, windDirection: 90, crossWaves: 0.3 });
  const sigma = gerstnerSigma(trains);
  for (const threshold of [0.4, 0.55, 0.7, 0.85]) {
    const measured = sampleCoverage(trains, threshold);
    const fitted = gerstnerWhitecapCoverage(sigma, threshold);
    worst = Math.max(worst, Math.abs(measured - fitted));
    assert.ok(Math.abs(measured - fitted) < 0.045, `coverage ${steepness}/${threshold}: measured ${measured.toFixed(3)}, fit ${fitted.toFixed(3)}`);
  }
}
// Calm water does not whitecap; a storm does, and more of it with a higher threshold.
assert.equal(gerstnerWhitecapCoverage(gerstnerSigma(resolveGerstnerTrains({ wavelength: 9, amplitude: 0.12, steepness: 0.25, windDirection: 0, crossWaves: 0.3 })), 0.55), 0);
assert.ok(gerstnerWhitecapCoverage(0.38, 0.7) > gerstnerWhitecapCoverage(0.38, 0.5));

console.log(`gerstnerWaves: steepness capped at ${GERSTNER_MAX_STEEPNESS}, whitecap coverage within ${worst.toFixed(3)} of measured, radial mesh ${geometry.userData.triangles} triangles facing up`);
