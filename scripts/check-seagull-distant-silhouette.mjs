import assert from 'node:assert/strict';
import { createSeagullDistantSilhouetteAlpha } from '../src/features/home-scene/creatures/seagullDistantSilhouette.js';

const size = 64;
const pixels = createSeagullDistantSilhouetteAlpha(size);
const alphaAt = (x, y) => pixels[(y * size + x) * 4 + 1];
const opaque = Array.from({ length: size * size }, (_, index) => pixels[index * 4 + 1])
  .filter((alpha) => alpha > 0).length;

assert.equal(alphaAt(0, 0), 0, 'silhouette must not leave an opaque rectangular corner');
assert.equal(alphaAt(size - 1, 0), 0, 'both far corners remain transparent');
assert.equal(alphaAt(size >> 1, size >> 1), 255, 'bird body is opaque');
assert.equal(alphaAt(Math.round(size * 0.77), Math.round(size * 0.48)), 0, 'space beneath a wing stays empty');
assert.ok(opaque > size * size * 0.1, 'mask retains readable thin wings');
assert.ok(opaque < size * size * 0.2, 'mask stays a sparse gull, never a filled diamond');

const shouldDrawSprite = (modes, index) => modes.get(index) === 'sprite';
assert.equal(shouldDrawSprite(new Map([[0, 'full']]), 0), false, 'full rig must not receive a sprite overlay');
assert.equal(shouldDrawSprite(new Map([[1, 'sprite']]), 1), true, 'only sprite LOD draws a billboard');

console.log(JSON.stringify({ size, opaquePixels: opaque, coverage: Number((opaque / (size * size)).toFixed(3)) }));
