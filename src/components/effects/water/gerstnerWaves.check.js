import assert from 'node:assert/strict';
import { GERSTNER_MAX_STEEPNESS, gerstnerSteepnessBudget, resolveGerstnerTrains } from './gerstnerWaves.js';
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
console.log(`gerstnerWaves: steepness capped at ${GERSTNER_MAX_STEEPNESS}, radial mesh ${geometry.userData.triangles} triangles facing up`);
