import assert from 'node:assert/strict';
import { DEFAULT_RENDER_QUALITY_SETTINGS, normalizeRenderQualitySettings } from './renderQualitySettings.js';
import { publishedHomeSceneKeys } from '../../features/home-scene/data/publishedHomeSceneKeys.js';

assert.deepEqual(normalizeRenderQualitySettings(), DEFAULT_RENDER_QUALITY_SETTINGS, 'missing settings use the complete quality defaults');
assert.deepEqual(normalizeRenderQualitySettings(null), DEFAULT_RENDER_QUALITY_SETTINGS, 'malformed settings do not crash migration');

const malformed = normalizeRenderQualitySettings({
  frameRateLimit: 75,
  adaptiveQuality: 'true',
  postAntiAliasing: 'taa',
  contactAoEnabled: 1,
  contactAoIntensity: Number.NaN,
  contactAoRadius: Infinity,
  shadowCascades: '4',
  shadowDistance: '160',
  shadowNearDistance: -Infinity,
  shadowContactOffset: '0.01',
});
assert.deepEqual(malformed, DEFAULT_RENDER_QUALITY_SETTINGS, 'invalid types and non-finite values fall back safely');

const nearAtShortFar = normalizeRenderQualitySettings({ shadowDistance: 20 });
assert.equal(nearAtShortFar.shadowDistance, 20);
assert.equal(nearAtShortFar.shadowNearDistance, 16, 'missing near remains inside 80% of the minimum far distance');

const finite = normalizeRenderQualitySettings({
  frameRateLimit: 40,
  adaptiveQuality: false,
  postAntiAliasing: 'fxaa',
  contactAoEnabled: true,
  contactAoIntensity: .7,
  contactAoRadius: 1.25,
  shadowCascades: 2,
  shadowDistance: 100,
  shadowNearDistance: 99,
  shadowContactOffset: .02,
});
assert.equal(finite.shadowNearDistance, 80, 'near is always at most 80% of far');
const upscale = normalizeRenderQualitySettings({ upscaleMode: 'fsr1', upscaleQuality: 'balanced', upscaleSharpness: 9 });
assert.equal(upscale.upscaleMode, 'fsr1');
assert.equal(upscale.upscaleQuality, 'balanced');
assert.equal(upscale.upscaleSharpness, 1);
assert.equal(normalizeRenderQualitySettings({ upscaleMode: 'unknown', upscaleSharpness: -1 }).upscaleMode, 'off');
assert.equal(normalizeRenderQualitySettings({ upscaleSharpness: -1 }).upscaleSharpness, 0);
assert.deepEqual(
  Object.keys(DEFAULT_RENDER_QUALITY_SETTINGS).filter((key) => !publishedHomeSceneKeys.includes(key)),
  [],
  'every render-quality default has a publication key',
);

console.log('renderQualitySettings: normalization and publication contract are stable');
