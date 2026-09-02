// Run: node src/components/effects/homeSceneLighting.check.js

import assert from 'node:assert/strict';
import { publishedHomeSceneSettings } from '../../features/home-scene/data/publishedHomeSceneSettings.js';
import { SKY, buildSkyLut } from './sky/skyModel.js';
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
  assert.equal(
    lighting.surface.color.hex,
    publishedHomeSceneSettings.distantSurfaceColor,
    'the distant surface colour must reach the renderer contract',
  );
  assert.deepEqual(
    lighting.sky.groundAlbedo,
    lighting.surface.color.linear,
    'the visible lower hemisphere and distant water must share one authored colour',
  );
  const cloudyLighting = buildHomeSceneLighting({
    ...publishedHomeSceneSettings,
    cloudCover: 0.65,
  });
  assert.ok(
    cloudyLighting.shadow.intensity < publishedHomeSceneSettings.shadowIntensity,
    'cloud cover must soften direct shadows for every material path',
  );
  // The mask can only attenuate a sun that sits inside the deck, and the
  // authored sky is free to put the sun above it. Hold the sun low for this.
  const lowSunCloudyLighting = buildHomeSceneLighting({
    ...publishedHomeSceneSettings,
    cloudCover: 0.65,
    timeOfDay: 12,
    sunNoonElevation: 10,
  });
  assert.ok(
    lowSunCloudyLighting.sky.sunVisibility < 1,
    'the cloud mask must attenuate the direct source at a sun inside the deck',
  );
  const cloudyLut = buildSkyLut({
    ...cloudyLighting.sky,
    width: 32,
    height: 16,
  });
  assert.ok(
    closeTo(cloudyLut.sunVisibility, cloudyLighting.sky.sunVisibility),
    'visible sky, PMREM and direct light must sample one sun visibility',
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
