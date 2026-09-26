import assert from 'node:assert/strict';
import { createServer } from 'vite';

// A project written by a newer engine, opened and saved by this one: what this
// code does not know must survive normalization, a camera switch and an edit
// of the active camera (src/features/home-scene/lib/preserveUnknown.js).
// Runs the real settings module; no browser, no user data, no file writes.
const server = await createServer({
  configFile: false,
  cacheDir: 'output/settings-preserve-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const settingsModule = await server.ssrLoadModule('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  // The same module instance as the settings layer: the registry of known keys lives there.
  const { selectEditorCamera, syncActiveEditorCamera } = await server.ssrLoadModule('/src/features/home-scene/lib/editorCameraState.js');
  const {
    getPublishedHomeSceneSettings, normalizeHomeSceneDraftSettings, sanitizeHomeSceneSettingsForPublish,
    HOME_SCENE_SNAPSHOT_KEYS: keys,
  } = settingsModule;
  const json = (value) => JSON.parse(JSON.stringify(value));

  // Nothing unknown: the published scene normalizes to itself, key for key.
  const published = getPublishedHomeSceneSettings();
  const plain = normalizeHomeSceneDraftSettings(published);
  assert.deepEqual(json(sanitizeHomeSceneSettingsForPublish(plain)), json(sanitizeHomeSceneSettingsForPublish(normalizeHomeSceneDraftSettings(plain))),
    'a scene without unknown keys publishes the same after a second pass');

  const [first] = published.sceneCameras;
  const second = { ...first, id: 'camera-future-2', name: 'Будущая 2', scene: { ...first.scene, futureCameraKey: 2 } };
  const newer = {
    ...published,
    futureRootKey: { depth: 3 },
    futureCameraKey: 1,
    planeTrailSpan: 45,
    placedObjects: [{ id: 'tree-1', kind: 'tree', x: 1, z: 2, futureWind: 0.4 }],
    sketchupModels: { 'tree-1': { hidden: [], futureLayer: 'roof' } },
    sceneCameras: [{ ...first, scene: { ...first.scene, futureCameraKey: 1 } }, second],
    activeCameraId: first.id,
  };

  let settings = normalizeHomeSceneDraftSettings(newer);
  assert.deepEqual(settings.futureRootKey, { depth: 3 }, 'an unknown root key survives opening');
  assert.equal('planeTrailSpan' in settings, false, 'a migrated old key is not kept');
  assert.equal(settings.placedObjects[0].futureWind, 0.4, 'an unknown field of a placed object survives');
  assert.equal(settings.sketchupModels['tree-1'].futureLayer, 'roof', 'an unknown field of a model entry survives');
  const camera = (id) => settings.sceneCameras.find((entry) => entry.id === id);
  assert.equal(camera(first.id).scene.futureCameraKey, 1, 'the active camera keeps its unknown key');
  assert.equal(camera(second.id).scene.futureCameraKey, 2, 'another camera keeps its own value');

  // The editor opens on its work camera; the site camera is chosen first.
  // An edit re-snapshots the active camera from the root.
  settings = selectEditorCamera(settings, first.id, 'scene', keys);
  assert.equal(settings.futureCameraKey, 1, 'choosing the camera applies its unknown key');
  settings = syncActiveEditorCamera({ ...settings, timeOfDay: 9.5 }, keys);
  assert.equal(camera(first.id).scene.timeOfDay, 9.5, 'the edit reached the active camera');
  assert.equal(camera(first.id).scene.futureCameraKey, 1, 'an edit does not strip the unknown key');

  // Switching cameras brings the other camera's value to the root and back.
  settings = selectEditorCamera(settings, second.id, 'scene', keys);
  assert.equal(settings.futureCameraKey, 2, 'the switched-to camera applies its unknown key');
  settings = syncActiveEditorCamera({ ...settings, timeOfDay: 16 }, keys);
  assert.equal(camera(second.id).scene.futureCameraKey, 2);
  settings = selectEditorCamera(settings, first.id, 'scene', keys);
  assert.equal(settings.futureCameraKey, 1, 'the first camera keeps its value through the round trip');

  // Saved and opened again (the next session): still there.
  const reopened = normalizeHomeSceneDraftSettings(json(settings));
  assert.deepEqual(reopened.futureRootKey, { depth: 3 });
  assert.equal(reopened.placedObjects[0].futureWind, 0.4);
  assert.equal(reopened.sceneCameras.find((entry) => entry.id === second.id).scene.futureCameraKey, 2);

  // The site publishes only what this code knows, at the root and in camera scenes.
  const site = sanitizeHomeSceneSettingsForPublish(reopened);
  assert.equal('futureRootKey' in site, false, 'publication keeps its whitelist');
  assert.ok(site.sceneCameras.every((entry) => !('futureCameraKey' in entry.scene)), 'unknown keys never reach the site');
  assert.deepEqual(json(sanitizeHomeSceneSettingsForPublish({ ...plain, obsoleteKey: 1 })), json(sanitizeHomeSceneSettingsForPublish(plain)),
    'a key this code does not know changes nothing on the site');

  console.log('settings preserve: unknown root keys, item fields and per-camera keys survive open, edit, camera switch and reopen');
} finally {
  await server.close();
}
