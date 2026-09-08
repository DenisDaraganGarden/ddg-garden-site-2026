import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { SEA_SETTINGS_DEFAULTS, normalizeSeaSettings, resolveSeaSettings } from '../src/components/effects/water/seaSettings.js';
import { publishedHomeSceneKeys } from '../src/features/home-scene/data/publishedHomeSceneKeys.js';

const seaKeys = Object.keys(SEA_SETTINGS_DEFAULTS);
const defaults = normalizeSeaSettings({});
assert.deepEqual(defaults, SEA_SETTINGS_DEFAULTS, 'an empty scene starts with Denis’s laboratory sea');
assert.equal(resolveSeaSettings({ seaEnabled: false }).enabled, true, 'legacy engine choices migrate to the only sea runtime');
const broken = normalizeSeaSettings({ seaAmplitude: 'NaN', seaSteepness: 9, seaMeshRings: 17, seaWaterColor: 'sand', seaFadeStart: 1200, seaFadeEnd: 40 });
assert.equal(broken.seaAmplitude, SEA_SETTINGS_DEFAULTS.seaAmplitude, 'NaN falls back');
assert.equal(broken.seaSteepness, 0.8, 'numeric values clamp');
assert.equal(broken.seaMeshRings, 32, 'mesh resolution clamps and rounds');
assert.equal(broken.seaWaterColor, SEA_SETTINGS_DEFAULTS.seaWaterColor, 'invalid colours fall back');
assert.equal(broken.seaFadeEnd, 1220, 'the fade remains ordered');
assert.equal(resolveSeaSettings({ seaSurfHeight: 1.25 }).surfHeight, 1.25, 'the product adapter receives lab-style settings');
for (const key of seaKeys) assert.ok(publishedHomeSceneKeys.includes(key), `${key} is publishable and belongs in cameras`);

const server = await createServer({ configFile: false, cacheDir: 'output/sea-settings-check-cache', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { createHomeSceneSnapshot, normalizePublishedHomeSceneSettings, sanitizeHomeSceneSettingsForPublish } = await server.ssrLoadModule('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const source = normalizePublishedHomeSceneSettings({ seaAmplitude: 1.1, seaSurfHeight: 1.3, seaEnabled: false, waterExtent: 73 });
  assert.equal(source.seaEnabled, true, 'saved V2 drafts migrate without editing the authored source');
  const snapshot = createHomeSceneSnapshot(source);
  const published = sanitizeHomeSceneSettingsForPublish(source);
  for (const key of seaKeys) {
    assert.equal(snapshot[key], source[key], `${key} survives a camera snapshot`);
    assert.equal(published[key], source.sceneCameras[0].scene[key], `${key} publishes from the first camera`);
  }
  assert.equal(published.waterExtent, source.sceneCameras[0].scene.waterExtent, 'unrelated scene settings remain intact');
  assert.deepEqual(sanitizeHomeSceneSettingsForPublish(normalizePublishedHomeSceneSettings(JSON.parse(JSON.stringify(published)))), published, 'publication round-trip is stable');
  console.log(`seaSettings: ${seaKeys.length} keys normalize, publish, and survive camera snapshots`);
} finally {
  await server.close();
}
