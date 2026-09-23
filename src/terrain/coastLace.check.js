import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The sand's foam lace thresholded value noise at 0.5. Value noise spreads
// fully at its lattice corners and to a quarter at cell centres, so the lace
// lines were brighter mid-cell than at corners: a lattice at 45 degrees, the
// waffle on the shallows. This twin of coastNoise/coastLace measures how much
// the mean lace depends on the place in the cell, before and after.

const shader = readFileSync(new URL('./terrainShader.js', import.meta.url), 'utf8');
assert.ok(shader.includes('float n=coastLaceNoise(world*scale+drift);'), 'the lace reads the spread-corrected noise');

const fract = (x) => x - Math.floor(x);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const fade = (t) => t * t * (3 - 2 * t);
const noise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
};
const corrected = (x, y) => {
  const fx = fade(fract(x)), fy = fade(fract(y));
  const g = ((1 - fx) ** 2 + fx ** 2) * ((1 - fy) ** 2 + fy ** 2);
  return Math.min(Math.max(0.5 + (noise(x, y) - 0.5) * 0.743 / Math.sqrt(g), 0), 1);
};
const web = (n) => 1 - Math.abs(2 * n - 1);
// Mean web by the place in the cell (8x8 bins over many cells): its spread
// across bins, against the spread of the web itself, is the lattice.
const lattice = (field) => {
  const bins = new Float64Array(64), counts = new Float64Array(64);
  let sum = 0, sq = 0, n = 0;
  for (let j = 0; j < 400; j += 1) for (let i = 0; i < 400; i += 1) {
    const x = i * 0.1371 + 3.3, y = j * 0.1293 - 7.1;
    const w = web(field(x, y));
    const b = Math.floor(fract(x) * 8) + 8 * Math.floor(fract(y) * 8);
    bins[b] += w; counts[b] += 1; sum += w; sq += w * w; n += 1;
  }
  const mean = sum / n, sd = Math.sqrt(sq / n - mean * mean);
  const means = Array.from(bins, (v, k) => v / counts[k]);
  return { range: (Math.max(...means) - Math.min(...means)) / sd, mean };
};
const before = lattice(noise), after = lattice(corrected);
assert.ok(before.range > 0.6, `the twin sees the old lattice (${before.range.toFixed(2)})`);
assert.ok(after.range < before.range / 2.5, `the lace keeps no lattice: ${before.range.toFixed(2)} -> ${after.range.toFixed(2)}`);
assert.ok(Math.abs(after.mean - before.mean) < 0.05, 'the lace keeps its mean');
console.log(`coastLace: place-in-cell lattice ${before.range.toFixed(2)} -> ${after.range.toFixed(2)} of the lace's spread, mean ${before.mean.toFixed(2)} -> ${after.mean.toFixed(2)}`);
