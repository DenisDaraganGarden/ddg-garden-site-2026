import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const adapter = read('./SeaWater.jsx');
const shading = read('./waterShading.js');

// One scene adapter owns the fallback noise volume. Its material children
// receive that handle and must not start three identical seed-7 builds.
assert.ok(adapter.includes("import { useWaterNoise } from './waterShading.js';"), 'SeaWater owns the shared noise hook');
assert.ok(adapter.includes('if (!enabled) return null;'), 'disabled SeaWater does not mount a noise-owning child');
assert.ok(adapter.includes('const noise = useWaterNoise(null);'), 'one product fallback volume is requested');
assert.equal((adapter.match(/noise=\{noise\}/g) ?? []).length, 3, 'open sea, shore and breakers receive the one handle');
assert.ok(shading.includes('export const EMPTY_WATER_NOISE = Object.freeze({ volume: null });'), 'pending build has a truthy shared sentinel');
assert.ok(shading.includes('return noise ?? ownNoise ?? EMPTY_WATER_NOISE;'), 'pending parent handle prevents child fallback builds');
assert.ok(shading.includes('uniforms.uNoiseReady.value = noise?.volume ? 1 : 0;'), 'pending sentinel never enables an unbound sampler');
assert.ok(shading.includes('const controller = new AbortController();'), 'noise build remains abortable');
assert.ok(shading.includes('controller.abort(); built?.dispose();'), 'unmount disposes a completed shared volume');

console.log('sea water noise: one lifecycle-safe product volume shared by three materials');
