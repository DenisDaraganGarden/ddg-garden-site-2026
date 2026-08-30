// Run: node src/components/effects/homeSceneLighting.check.js

import assert from 'node:assert/strict';
import { publishedHomeSceneSettings } from '../../features/home-scene/data/publishedHomeSceneSettings.js';
import { SKY } from './sky/skyModel.js';
import { buildHomeSceneLighting } from './homeSceneLighting.js';

const closeTo = (actual, expected, epsilon = 1e-10) => (
  Math.abs(actual - expected) <= epsilon
);

{
  const lighting = buildHomeSceneLighting(publishedHomeSceneSettings);

  assert.ok(
    closeTo(lighting.key.sceneIntensity, lighting.key.intensity * SKY.sceneGain),
    'standard and custom key-light scales must come from one contract',
  );
  assert.deepEqual(
    lighting.environment.diffuseIrradiance,
    lighting.fill.irradiance,
    'environment and custom shaders must share the authored fill irradiance',
  );
  assert.equal(
    lighting.fill.ambient.color.hex,
    publishedHomeSceneSettings.ambientColor,
    'the ambient colour control must reach the renderer contract',
  );
  assert.equal(
    lighting.fill.hemisphere.skyColor.hex,
    publishedHomeSceneSettings.hemisphereSkyColor,
    'the hemisphere colour control must reach the renderer contract',
  );
  assert.ok(
    lighting.shadow.intensity < publishedHomeSceneSettings.shadowIntensity,
    'cloud cover must soften direct shadows for every material path',
  );
  assert.ok(
    Math.abs(lighting.shadow.waterBias) < Math.abs(lighting.shadow.bias),
    'water depth comparisons need a normalized, calibrated shadow bias',
  );
}

{
  const dark = buildHomeSceneLighting({
    ambientIntensity: 0,
    hemisphereIntensity: 0,
  });

  assert.equal(dark.fill.intensity, 0, 'zero fill controls must produce zero fill');
  assert.deepEqual(dark.fill.irradiance, [0, 0, 0]);
}

{
  const base = {
    keyLightType: 'sun',
    timeOfDay: 8,
    sunBearing: 140,
    sunNoonElevation: 48,
    sunIntensity: 3.2,
    sunTint: '#fff2df',
  };
  const warmLegacy = buildHomeSceneLighting({ ...base, moonColor: '#ff0000' });
  const coolLegacy = buildHomeSceneLighting({ ...base, moonColor: '#0000ff' });

  assert.deepEqual(
    warmLegacy.key.colorLinear,
    coolLegacy.key.colorLinear,
    'legacy moon colour must not recolour the physical sun path',
  );
}

console.log('homeSceneLighting: all checks passed');
