import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./TankerWake.jsx', import.meta.url), 'utf8');

// A multisample point can be covered by a triangle while its pixel centre lies
// just beyond the UV edge. The wake must keep its optical depth positive there.
assert.ok(source.includes('float behind = clamp(vUv.x, 0.0, 1.0);'), 'wake clamps extrapolated MSAA UVs');
assert.ok(source.includes('max(0.006 + behind * 0.1, 0.006)'), 'wake centre-line denominator remains positive');
assert.ok(source.includes('float edgeDistance = (lateral - width) * 27.0;'), 'wake squares its signed edge distance explicitly');
assert.ok(!source.includes('pow((lateral - width) * 27.0, 2.0)'), 'wake does not use undefined pow on a negative base');
assert.ok(source.includes('float alpha = clamp('), 'wake alpha remains physical under extrapolated samples');

const wakeCenter = (behind, lateral) => {
  const safeBehind = Math.min(1, Math.max(0, behind));
  const depth = Math.max(0.006 + safeBehind * 0.1, 0.006);
  return Math.exp(-(lateral * lateral) / depth);
};

for (const behind of [-4, -0.06, -1e-6, 0, 0.4, 1, 4]) {
  for (const lateral of [0, 0.2, 1, 10]) {
    assert.ok(Number.isFinite(wakeCenter(behind, lateral)), `wake centre is finite at extrapolated UV ${behind}, ${lateral}`);
  }
}

console.log('tanker wake: extrapolated MSAA UVs retain a positive finite centre-line depth');
