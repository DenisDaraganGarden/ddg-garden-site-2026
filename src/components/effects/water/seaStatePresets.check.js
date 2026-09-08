import assert from 'node:assert/strict';
import { SEA_STATE_IDS, SEA_STATE_PRESETS, SEA_STATE_CUSTOM, resolveSeaState, seaStatePatch } from './seaStatePresets.js';
import { gerstnerSigma, gerstnerWhitecapCoverage, resolveGerstnerTrains } from './gerstnerWaves.js';
for (const id of SEA_STATE_IDS) {
  const lab = seaStatePatch(id, 'lab');
  const product = seaStatePatch(id, 'product');
  assert.equal(resolveSeaState(lab), id, `${id} resolves in the lab`);
  assert.equal(resolveSeaState(product, 'product'), id, `${id} resolves in product settings`);
  assert.equal(lab.surfEnabled, true); assert.equal(lab.surfFreeze, false); assert.equal(lab.foamMemory, true);
  assert.ok(!('windDirection' in lab) && !('waterColor' in lab) && !('meshSegments' in lab), `${id} preserves direction, look and budget`);
}
assert.equal(resolveSeaState({ ...SEA_STATE_PRESETS.breeze, amplitude: .58 }), SEA_STATE_CUSTOM, 'hand tuning reads as custom');
assert.ok(SEA_STATE_PRESETS.storm.amplitude > SEA_STATE_PRESETS.calm.amplitude * 8, 'storm differs visibly from calm');
assert.ok(SEA_STATE_PRESETS.calm.windPatches > SEA_STATE_PRESETS.breeze.windPatches
  && SEA_STATE_PRESETS.breeze.windPatches > SEA_STATE_PRESETS.rough.windPatches
  && SEA_STATE_PRESETS.rough.windPatches > SEA_STATE_PRESETS.storm.windPatches, 'wind patchiness falls from calm to storm');
const whitecapCoverage = SEA_STATE_IDS.map((id) => {
  const preset = SEA_STATE_PRESETS[id];
  const sigma = gerstnerSigma(resolveGerstnerTrains({ ...preset, windDirection: 94 }));
  return gerstnerWhitecapCoverage(sigma, preset.foamThreshold);
});
for (let index = 1; index < whitecapCoverage.length; index += 1) {
  assert.ok(whitecapCoverage[index] > whitecapCoverage[index - 1], `whitecap coverage rises from ${SEA_STATE_IDS[index - 1]} to ${SEA_STATE_IDS[index]}`);
}
console.log('seaStatePresets: shared hydrodynamic states preserve authored direction, look and budget');
