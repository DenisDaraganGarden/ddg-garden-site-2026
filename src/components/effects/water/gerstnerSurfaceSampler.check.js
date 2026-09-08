import assert from 'node:assert/strict';
import { createGerstnerSurfaceSampler } from './gerstnerSurfaceSampler.js';
import { gerstnerWeatherAt, resolveGerstnerTrains } from './gerstnerWaves.js';
import { seaCoastFadeAtBreak } from './seaCoastFade.js';
import { createTerrainDefinition } from '../../../terrain/terrainModel.js';
import { DEFAULT_TERRAIN_SETTINGS } from '../../../terrain/settings.js';

const settings = {
  wavelength: 11.5, amplitude: 0.57, steepness: 0.7, windDirection: 94,
  crossWaves: 0.31, speed: 0.55, sets: 0.37, gusts: 0.44,
};
const shaderForward = (x, z, time, fade, cell) => {
  const trains = resolveGerstnerTrains(settings);
  const weather = gerstnerWeatherAt(x, z, settings.gusts);
  const wander = (
    Math.sin(0.0083 * x - 0.0097 * z + 2.1)
    + Math.sin(0.0173 * x + 0.0059 * z + 0.9) * 0.6
  ) * 1.6 * settings.gusts;
  let ox = 0, oy = 0, oz = 0;
  for (let index = 0; index < trains.length; index += 1) {
    const train = trains[index];
    const phase = train.k * (train.direction[0] * x + train.direction[1] * z)
      - train.omega * settings.speed * time + index * 1.7 + wander;
    const envelope = 1 - settings.sets * train.sets * 0.5 * (1 - Math.sin(phase * 0.1667));
    const lod = 1 - smoothstep(0.08, 0.3, cell * train.k * 0.15915494);
    const a = train.amplitude * weather * envelope * fade * lod;
    ox += train.q * a * train.direction[0] * Math.cos(phase);
    oz += train.q * a * train.direction[1] * Math.cos(phase);
    oy += a * Math.sin(phase);
  }
  return { x: x + ox, y: oy, z: z + oz };
};
const smoothstep = (a, b, value) => {
  const t = Math.min(Math.max((value - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const calm = createGerstnerSurfaceSampler({
  wavelength: 11.5,
  amplitude: 0,
  steepness: 0.7,
  windDirection: 94,
  crossWaves: 0.01,
  speed: 0.55,
  sets: 0.37,
  gusts: 0.44,
});
const flat = calm(12, -7, 4);
assert.equal(flat.worldY, 0, 'zero-amplitude sea stays on the still-water plane');
assert.ok(flat.normal.distanceToSquared({ x: 0, y: 1, z: 0 }) < 1e-12, 'zero-amplitude sea has an upward normal');

const sea = createGerstnerSurfaceSampler(settings);
for (let x = -80; x <= 80; x += 8) {
  for (let z = -80; z <= 80; z += 8) {
    const sample = sea(x, z, 9.4);
    assert.ok(Number.isFinite(sample.worldY), 'surface height is finite');
    assert.ok(Number.isFinite(sample.normal.x) && Number.isFinite(sample.normal.y) && Number.isFinite(sample.normal.z), 'surface normal is finite');
    assert.ok(Math.abs(sample.normal.length() - 1) < 1e-8, 'surface normal remains normalized');
    assert.ok(sample.normal.y > 0, 'steepness budget keeps the surface upward-facing');
  }
}

// Fade is inside the horizontal displacement as well as height. These cases
// catch the former post-fade shortcut: Q=.7 makes it visibly phase-shifted.
for (const fade of [0.35, 0.8]) {
  const cell = 0.071;
  const desired = { x: 17.2, z: -13.7 };
  const sample = sea(desired.x, desired.z, 6.2, {}, { fadeAt: () => fade, cellAt: () => cell });
  const shader = shaderForward(sample.parameterX, sample.parameterZ, 6.2, fade, cell);
  // Six fixed-point steps leave less than a tenth of a millimetre at the
  // steepest authored fade; that is below the mesh/probe precision while
  // retaining the bounded 4–6 iteration budget used at runtime.
  assert.ok(Math.hypot(shader.x - desired.x, shader.z - desired.z) < 2e-4, `fade ${fade}: inverse horizontal displacement reconstructs the visible point`);
  assert.ok(Math.abs(shader.y - sample.worldY) < 1e-10, `fade ${fade}: CPU height matches gerstnerDisplace after horizontal reconstruction`);
  assert.ok(Math.hypot(shader.x - sample.x, shader.z - sample.z) < 2e-10, `fade ${fade}: sampler and shader forward position agree`);
}

// The coast shader has two meaningful toggles. Surf off removes only the
// breaker hand-over; terrain off removes the coast entirely. These contracts
// are consumed by probes, tanker and vegetation through createSeaSurfaceFade.
const terrain = createTerrainDefinition(DEFAULT_TERRAIN_SETTINGS);
const surfOff = { surfEnabled: false };
const surfOffNear = seaCoastFadeAtBreak(terrain, -8, 0, 0, surfOff);
const surfOffFar = seaCoastFadeAtBreak(terrain, -80, 0, 0, surfOff);
assert.ok(Math.abs(surfOffNear - surfOffFar) < 1e-12, 'surf-off carrier ignores break-line hand-over but retains its physical depth fade');
assert.equal(seaCoastFadeAtBreak({ terrainEnabled: false }, -8, 0, 0, { surfEnabled: true }), 1, 'terrain-off carrier has no synthetic shore attenuation');
