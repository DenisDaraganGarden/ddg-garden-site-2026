import assert from 'node:assert/strict';
import { buildCloudNoise } from '../sky/painterly/cloudNoise.js';
import { RIPPLE_PLANES } from './waterRipplePlanes.js';
import { WAVE_CHOPPINESS_DEFAULT, rippleChopFactor } from './seaSettings.js';

// The wind ripple read two axis-aligned slices of the periodic noise volume,
// so its slope repeated exactly every 1/(2.9 x scale) metres along world x and
// z: a square tile parallel to the beach, the diagonal waffle on the shallows.
// The slices are now planes tilted through the volume and drifted along their
// normals. This twin of waterRippleHeight measures the repeat on the real
// volume, old way and new.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
for (const plane of RIPPLE_PLANES) {
  const [u, v, n] = plane.map(([axis]) => axis);
  for (const axis of [u, v, n]) assert.ok(Math.abs(dot(axis, axis) - 1) < 1e-3, 'plane axes are unit');
  assert.ok(Math.abs(dot(u, v)) < 1e-3 && Math.abs(dot(u, n)) < 1e-3 && Math.abs(dot(v, n)) < 1e-3, 'plane axes are orthogonal');
  assert.ok(n.every((c) => Math.abs(c) >= 0.45), 'the drift normal has no small component');
}

const { volume } = await buildCloudNoise({ seed: 7, size: 64 });
const N = 64;
const data = volume.image.data;
const texel = (x, y, z, c) => data[((((z % N) + N) % N) * N * N + (((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4 + c] / 255;
// WebGL trilinear with repeat wrap: texel centres at (i + 0.5) / N.
const sample = (p, c) => {
  const x = p[0] * N - 0.5, y = p[1] * N - 0.5, z = p[2] * N - 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  let sum = 0;
  for (let dz = 0; dz < 2; dz += 1) for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
    sum += texel(ix + dx, iy + dy, iz + dz, c) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
  }
  return sum;
};
const fract = (x) => x - Math.floor(x);
const hash = (px, py) => {
  let x = fract(px * 127.1), y = fract(py * 311.7);
  const d = x * (x + 34.53) + y * (y + 34.53);
  x += d; y += d;
  return fract(x * y);
};
const noise = (px, py) => {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
};
const scale = 0.235;
const tilted = ([px, pz], drift) => {
  const at = (plane, x, y, base) => [0, 1, 2].map((i) => plane[0][0][i] * x + plane[1][0][i] * y + plane[2][0][i] * drift + base[i]);
  const a = [px * scale, pz * scale], b = [px * scale * 2.9, pz * scale * 2.9];
  return sample(at(RIPPLE_PLANES[0], a[0], a[1], [0, 0, 0.31]), 0) * 0.65 + sample(at(RIPPLE_PLANES[1], b[0], b[1], [0, 0, 0.67]), 2) * 0.35;
};
const flat = ([px, pz]) => sample([px * scale, pz * scale, 0.31], 0) * 0.65 + sample([px * scale * 2.9, pz * scale * 2.9, 0.67], 2) * 0.35;
const slopes = (height, drifted) => {
  const tile = 1 / (scale * 2.9);
  const step = tile / 48, size = 320, e = 0.02 / scale;
  const gx = new Float64Array(size * size), gz = new Float64Array(size * size);
  for (let j = 0; j < size; j += 1) for (let i = 0; i < size; i += 1) {
    const p = [3.1 + i * step, -7.3 + j * step];
    const drift = drifted ? (noise(p[0] * 0.23 + 5.3, p[1] * 0.23 + 1.7) - 0.5) * 2 : 0;
    const h = height(p, drift);
    gx[j * size + i] = (height([p[0] + e, p[1]], drift) - h) / e;
    gz[j * size + i] = (height([p[0], p[1] + e], drift) - h) / e;
  }
  return { gx, gz, size };
};
const correlation = ({ gx, gz, size }, lx, lz) => {
  let num = 0, den = 0;
  for (let j = 0; j + lz < size; j += 2) for (let i = 0; i + lx < size; i += 2) {
    const a = j * size + i, b = (j + lz) * size + i + lx;
    num += gx[a] * gx[b] + gz[a] * gz[b];
    den += gx[a] * gx[a] + gz[a] * gz[a];
  }
  return num / den;
};
const rms = ({ gx, gz }) => Math.sqrt(gx.reduce((s, g, k) => s + g * g + gz[k] * gz[k], 0) / gx.length);
const before = slopes(flat, false);
const after = slopes(tilted, true);
const lags = [[48, 0], [0, 48], [48, 48], [0, 144]];
const was = lags.map(([x, z]) => correlation(before, x, z));
const now = lags.map(([x, z]) => correlation(after, x, z));
assert.ok(Math.min(...was) > 0.6, `the twin sees the old tile (${was.map((c) => c.toFixed(2)).join(', ')})`);
assert.ok(Math.max(...now) < 0.2, `no tile repeat in the ripple slope: ${now.map((c) => c.toFixed(2)).join(', ')}`);
const ratio = rms(after) / rms(before);
assert.ok(ratio > 0.85 && ratio < 1.2, `the ripple keeps its strength: ${ratio.toFixed(2)}`);

// The chop (waveChoppiness; waterShading.js waterRippleChop, twinned here):
// the slope over the Jacobian of a shove toward the crests, a full crest at
// h = 0.5 + 0.15. That is the ripple's own spread, so the slider is felt over
// the whole sea rather than on a few peaks, it cannot fold (floor 0.3), and at
// the slider's default nothing changes at all.
const chop = (factor, h) => 1 / Math.max(1 - factor * Math.min(Math.max((h - 0.5) / 0.15, -1), 1), 0.3);
const heights = [];
for (let j = 0; j < 160; j += 1) for (let i = 0; i < 160; i += 1) {
  const p = [3.1 + i * 0.37, -7.3 + j * 0.41];
  heights.push(tilted(p, (noise(p[0] * 0.23 + 5.3, p[1] * 0.23 + 1.7) - 0.5) * 2));
}
const inside = heights.filter((h) => Math.abs(h - 0.5) <= 0.15).length / heights.length;
assert.ok(inside > 0.8 && inside < 0.99, `a full crest is the ripple's own spread: ${(inside * 100).toFixed(0)}% of the sea inside it`);
assert.equal(rippleChopFactor(WAVE_CHOPPINESS_DEFAULT), 0, 'the default choppiness is no chop');
assert.ok(heights.every((h) => chop(rippleChopFactor(WAVE_CHOPPINESS_DEFAULT), h) === 1), 'at the default every slope is left exactly as it was');
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const crests = heights.filter((h) => h > 0.6), troughs = heights.filter((h) => h < 0.4);
const pinch = mean(crests.map((h) => chop(rippleChopFactor(1.25), h))), open = mean(troughs.map((h) => chop(rippleChopFactor(1.25), h)));
assert.ok(pinch > 2 && open < 0.75, `full chop pinches the crests (x${pinch.toFixed(2)}) and opens the troughs (x${open.toFixed(2)})`);
const round = mean(crests.map((h) => chop(rippleChopFactor(0), h)));
assert.ok(round < 0.97 && mean(troughs.map((h) => chop(rippleChopFactor(0), h))) > 1.03, `no chop rounds the crests (x${round.toFixed(2)})`);
assert.ok(heights.every((h) => chop(rippleChopFactor(1.25), h) <= 1 / 0.3 + 1e-9), 'the chop never folds a crest');
volume.dispose();
console.log(`waterRipple: slope repeat at the old tile ${was.map((c) => c.toFixed(2)).join('/')} -> ${now.map((c) => c.toFixed(2)).join('/')}, strength x${ratio.toFixed(2)}; chop 0..1.25 takes the crests' slope x${round.toFixed(2)}..x${pinch.toFixed(2)}, 1 at the default`);
