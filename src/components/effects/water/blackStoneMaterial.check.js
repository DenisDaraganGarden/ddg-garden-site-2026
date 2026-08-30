// Run: node src/components/effects/water/blackStoneMaterial.check.js

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BLACK_STONE_DEFAULTS,
  createBlackStoneMaterial,
  createBlackStoneUniforms,
  updateBlackStoneUniforms,
} from './blackStoneMaterial.js';

const uniforms = createBlackStoneUniforms();

assert.equal(uniforms.uLayering.value, 0.99);
assert.equal(uniforms.uLayerScale.value, 2.2);
assert.equal(uniforms.uLayerRelief.value, 1);
assert.equal(uniforms.uLayerSharpness.value, 1);
assert.equal(uniforms.uLayerEdgeChips.value, 0.78);
assert.equal(uniforms.uFracture.value, 0.85);
assert.equal(uniforms.uFractureScale.value, 3.15);
assert.equal(uniforms.uVeins.value, 0.19);
assert.equal(uniforms.uVeinScale.value, 3.9);
assert.equal(uniforms.uPolish.value, 0.71);
assert.equal(uniforms.uWearScale.value, 2.3);
assert.equal(uniforms.uWetness.value, 0.98);
assert.equal(uniforms.uDryRoughness.value, 0.78);
assert.equal(uniforms.uMicroRelief.value, 0.78);

const updated = {
  ...BLACK_STONE_DEFAULTS,
  layering: 0.25,
  layerScale: 4.1,
  wetness: 0.4,
};
const tint = new THREE.Color('#75869b');
updateBlackStoneUniforms(uniforms, updated, 'normal', tint);

assert.equal(uniforms.uLayering.value, 0.25);
assert.equal(uniforms.uLayerScale.value, 4.1);
assert.equal(uniforms.uWetness.value, 0.4);
assert.equal(uniforms.uDiagnostic.value, 2);
assert.ok(uniforms.uStoneTint.value.equals(tint));
assert.notEqual(uniforms.uStoneTint.value, tint, 'uniform owns its color value');

const material = createBlackStoneMaterial(uniforms, { envMapIntensity: 0.7 });
assert.ok(material.isMeshPhysicalMaterial);
assert.equal(material.envMapIntensity, 0.7);
assert.equal(material.customProgramCacheKey(), 'ddg-black-stone-production-v1');
material.dispose();

console.log('blackStoneMaterial: all checks passed');
