// Run: node src/components/effects/homeSceneLighting.check.js

import assert from 'node:assert/strict';
import { publishedHomeSceneSettings } from '../../features/home-scene/data/publishedHomeSceneSettings.js';
import { SKY, buildSkyLut } from './sky/skyModel.js';
import { buildHomeSceneLighting } from './homeSceneLighting.js';
import { resolveDirectionalShadowContact } from './shadowContactContract.js';

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
  assert.equal(lighting.shadow.waterBias, 0, 'unfitted water maps must start with a neutral bias');
  const contacts = [16, 160, 320].map((span) => resolveDirectionalShadowContact({
    contactOffsetMeters: lighting.shadow.contactOffsetMeters, near: 0.5, far: span + 0.5,
  }));
  contacts.forEach((contact) => {
    assert.ok(closeTo(contact.bias * contact.depthRange, lighting.shadow.contactOffsetMeters),
      'the same physical contact must survive near and distant shadow volumes');
    assert.ok(closeTo(contact.waterBias, contact.bias * 0.55),
      'water applies its smaller physical offset after fitting the map');
  });
  assert.equal(buildHomeSceneLighting({ shadowRadius: 0 }).shadow.radius, 0);
  assert.equal(buildHomeSceneLighting({ shadowRadius: 8 }).shadow.radius, 8,
    'the full editor softness range must reach the renderer');
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

// Parameters that used to change nothing: each must act, and each must leave
// the frame exactly as it was at the value every existing scene carries.
{
  const lightingOf = (settings) => buildHomeSceneLighting({ ...publishedHomeSceneSettings, ...settings });
  const tint = (envTint) => lightingOf({ envTint }).environment.tint;

  // envTint: neutral at the scene default, a tone otherwise, bounded either way.
  assert.deepEqual(tint('#6b7484'), [1, 1, 1], 'the default reflection tone must be neutral');
  assert.deepEqual(buildHomeSceneLighting({}).environment.tint, [1, 1, 1]);
  const warm = tint('#b0805a');
  assert.ok(warm[0] > 1 && warm[2] < 1, `a warm tone must warm the environment light (${warm})`);
  const [lighter, darker] = [tint('#ffffff'), tint('#1a1d21')];
  assert.ok(lighter.every((value, index) => value > darker[index]), 'a lighter tone must give more light');
  ['#ff0000', '#00ff00', '#0000ff', '#000000', '#ffffff'].forEach((hex) => {
    tint(hex).forEach((value) => assert.ok(value > 0.4 && value < 2.5, `${hex} stays a tone, not a switch (${value})`));
  });

  // envMode: «Небо + HDRI» keeps the painted sky in view unless asked; «Только
  // HDRI» puts the panorama behind the scene as well as into its light.
  const environment = (envMode, showHdriBackground = false) => {
    const { hdri, hdriBackdrop } = lightingOf({ envMode, showHdriBackground }).environment;
    return { hdri, hdriBackdrop };
  };
  assert.deepEqual(environment('sky'), { hdri: false, hdriBackdrop: false });
  assert.deepEqual(environment('sky', true), { hdri: false, hdriBackdrop: false }, 'no panorama without an HDRI mode');
  assert.deepEqual(environment('sky+hdri'), { hdri: true, hdriBackdrop: false }, 'the site look: HDRI light behind the painted sky');
  assert.deepEqual(environment('sky+hdri', true), { hdri: true, hdriBackdrop: true });
  assert.deepEqual(environment('hdri'), { hdri: true, hdriBackdrop: true }, 'HDRI only is the backdrop too');

  // The painterly sky takes turbidity and the distant surface relative to the
  // defaults it is painted for: identity there, and the right direction away.
  const painted = (settings) => {
    const { paintedHaze, paintedGroundShift } = lightingOf(settings).sky;
    return { paintedHaze, paintedGroundShift };
  };
  assert.deepEqual(painted({ skyTurbidity: 2.6, distantSurfaceColor: '#70716d' }), { paintedHaze: 1, paintedGroundShift: [0, 0, 0] });
  assert.ok(painted({ skyTurbidity: 10 }).paintedHaze > 2.9, 'hazier air must thicken the painted haze');
  assert.ok(painted({ skyTurbidity: 1 }).paintedHaze < 0.6, 'clear air must thin it');
  assert.ok(painted({ distantSurfaceColor: '#fafafa' }).paintedGroundShift.every((value) => value > 0.7), 'a white surface returns more light');
  assert.ok(painted({ distantSurfaceColor: '#000000' }).paintedGroundShift.every((value) => value < 0), 'a black one less');
}

console.log('homeSceneLighting: all checks passed');
