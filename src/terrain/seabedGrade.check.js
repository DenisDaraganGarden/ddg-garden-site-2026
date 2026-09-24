// Run: node src/terrain/seabedGrade.check.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEABED_DEFAULTS, seabedFactors } from './terrainMaterial.js';

// The editor's seabed sliders («Дно») act on the terrain's underwater shelf as
// factors of their defaults. At the defaults of the parameter reference every
// factor is exactly 1 and the shader leaves the shelf exactly as it was built:
// each term multiplies by one, adds a zero, or is skipped by a uniform test.
// Every slider moves its factor over its whole range.

const reference = JSON.parse(readFileSync(new URL('../../docs/engine-parameters.json', import.meta.url), 'utf8'));
for (const [key, value] of Object.entries(SEABED_DEFAULTS)) assert.equal(reference.defaults[key], value, `${key}: the neutral value is the editor's default`);
const neutral = { grade: [1, 1, 1, 1], relief: [1, 1, 1] };
assert.deepEqual(seabedFactors(reference.defaults), neutral, 'the defaults are neutral, exactly');
assert.deepEqual(seabedFactors({}), neutral, 'missing settings are neutral');
assert.deepEqual(seabedFactors({ seabedBrightness: 'x', seabedTextureScale: NaN }), neutral, 'broken settings are neutral');

const slot = { seabedBrightness: ['grade', 0], seabedSaturation: ['grade', 1], seabedVariation: ['grade', 2], seabedAoStrength: ['grade', 3], seabedReliefStrength: ['relief', 0], seabedReliefScale: ['relief', 1], seabedTextureScale: ['relief', 2] };
for (const [key, [group, index]] of Object.entries(slot)) {
  const row = reference.rows.find((entry) => entry.key === key);
  const at = (value) => seabedFactors({ ...reference.defaults, [key]: value })[group][index];
  let previous = -Infinity;
  for (let value = row.min; value <= row.max + 1e-9; value += (row.max - row.min) / 20) {
    assert.ok(at(value) > previous, `${key} acts at ${value.toFixed(2)}`);
    previous = at(value);
  }
}

const shader = readFileSync(new URL('./terrainMaterial.js', import.meta.url), 'utf8');
for (const [fragment, why] of [
  ['float seabed=smoothstep(.02,.3,-groundY);', 'the seabed starts under the still line, the beach keeps its look'],
  ['if(seabed>0.0&&uSeabedRelief.z!=1.0)', 'the texture scale resamples only off its default'],
  ['if(seabed>0.0&&uSeabedRelief.y!=1.0)', 'the relief scale resamples only off its default'],
  ['if(seabed>0.0&&uSeabedRelief.x!=1.0)', 'the relief strength renormalises only off its default'],
  ['if(uSeabedGrade.y!=1.0)c=gradeSaturation(', 'saturation regrades only off its default'],
  ['return c*(1.0+(uSeabedGrade.x-1.0)*seabed)*(1.0+(ao-1.0)*(uSeabedGrade.w-1.0)*seabed*.5);', 'brightness and AO multiply by one at their defaults'],
  ['macroVariation+=(macroVariation-.99)*(uSeabedGrade.z-1.0)*seabed;', 'variation adds a zero at its default'],
  ['max(surfaceData.g+(surfaceData.g-1.0)*(uSeabedGrade.w-1.0)*seabed,0.0)', 'the AO map is left as it was at its default'],
  ['vec2 bedUv=sandUv*uSeabedRelief.z', 'the cover tiles with the texture scale'],
]) assert.ok(shader.includes(fragment), why);
assert.ok(!/coastHeight\(/.test(shader.slice(shader.indexOf('#include <map_fragment>'))), 'no coastHeight per pixel');

const testy = seabedFactors({ ...reference.defaults, seabedBrightness: 1.1, seabedVariation: 0.72, seabedAoStrength: 0.69, seabedReliefScale: 2.8, seabedTextureScale: 2.15 });
console.log(`seabedGrade: the shelf is exactly as built at the defaults, every slider acts over its range; testy's bed x${testy.grade[0].toFixed(2)} bright, x${testy.grade[2].toFixed(2)} patches, x${testy.grade[3].toFixed(2)} AO, bumps x${testy.relief[1].toFixed(2)} finer, texture x${testy.relief[2].toFixed(2)} finer`);
