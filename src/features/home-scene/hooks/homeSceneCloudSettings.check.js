// Run: node src/features/home-scene/hooks/homeSceneCloudSettings.check.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishedHomeSceneKeys } from '../data/publishedHomeSceneKeys.js';
import { publishedHomeSceneSettings } from '../data/publishedHomeSceneSettings.js';

const cloudKeys = [
  'cloudPreset',
  'cloudCover',
  'cloudHorizon',
  'cloudDensity',
  'cloudScale',
  'cloudSunOcclusion',
];

{
  cloudKeys.forEach((key) => {
    assert.ok(publishedHomeSceneKeys.includes(key), `${key} must survive publishing`);
    assert.ok(key in publishedHomeSceneSettings, `${key} must exist in the authored scene`);
    publishedHomeSceneSettings.sceneCameras.forEach((camera) => {
      assert.ok(key in camera.scene, `${key} must exist in camera ${camera.id}`);
    });
  });
}

{
  // This module contains React hooks and extensionless Vite imports, so Node
  // cannot execute it directly. Verify the persistence seam structurally here;
  // the production build below remains the executable integration check.
  const source = readFileSync(new URL('./useHomeSceneSettings.js', import.meta.url), 'utf8');
  assert.match(source, /HOME_SCENE_CAMERA_SNAPSHOT_KEYS = publishedHomeSceneKeys\.filter/);
  assert.match(source, /cloudPreset: VALID_CLOUD_PRESETS\.has\(merged\.cloudPreset\)/);
  assert.match(source, /cloudCover: clampFloat\(merged\.cloudCover, 0, 1/);
  assert.match(source, /cloudHorizon: clampFloat\(merged\.cloudHorizon, 0, 1/);
  assert.match(source, /cloudDensity: clampFloat\(merged\.cloudDensity, 0, 1/);
  assert.match(source, /cloudScale: clampFloat\(merged\.cloudScale, 0\.5, 4/);
  assert.match(source, /cloudSunOcclusion: clampFloat\(/);
}

console.log('homeSceneCloudSettings: all checks passed');
