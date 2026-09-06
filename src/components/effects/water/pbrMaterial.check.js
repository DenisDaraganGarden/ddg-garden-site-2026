// Run: node src/components/effects/water/pbrMaterial.check.js

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { colorPickerToArtisticAlbedo, createLiftedTextureTint, createTextureTint } from './pbrMaterial.js';

{
  const raw = new THREE.Color('#2c2d30');
  const artistic = colorPickerToArtisticAlbedo('#2c2d30');

  assert.ok(artistic.r > raw.r, 'dark picker swatches must retain visible linear albedo');
  assert.ok(artistic.r <= 1 && artistic.g <= 1 && artistic.b <= 1);
}

{
  const tint = createLiftedTextureTint('#1a1b1f');

  assert.ok(tint.r > 1 && tint.g > 1 && tint.b > 1, 'dark wood maps need an HDR pre-tone-map lift');
  assert.ok(tint.b > tint.r, 'the authored cool tint must survive the albedo lift');
  assert.ok([tint.r, tint.g, tint.b].every(Number.isFinite));
}

{
  const white = createTextureTint('#ffffff', 7.5);
  const grey = createTextureTint('#808080', 7.5);
  const brown = createTextureTint('#804020', 7.5);

  assert.ok(Math.abs(white.r - 7.5) < 1e-6 && Math.abs(white.b - 7.5) < 1e-6, 'white shows the lifted map as authored');
  assert.ok(Math.abs(grey.r / white.r - 0.5) < 0.01, 'a darker swatch darkens the map in proportion');
  assert.ok(brown.r > brown.g && brown.g > brown.b, 'a hue tints the map, saturation kept');
}

console.log('pbrMaterial: all checks passed');
