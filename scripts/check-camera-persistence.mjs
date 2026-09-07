import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { addEditorCamera, selectEditorCamera, syncActiveEditorCamera, updateEditorLayout } from '../src/features/home-scene/lib/editorCameraState.js';

// Execute the real Vite settings module, including migrations and publication.
// No browser, HTTP listener, user storage or published-file writes are involved.
const server = await createServer({
  configFile: false,
  cacheDir: 'output/camera-persistence-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

try {
  const {
    getPublishedHomeSceneSettings,
    createHomeSceneSnapshot,
    normalizeHomeSceneDraftSettings,
    normalizePublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
    HOME_SCENE_SNAPSHOT_KEYS: keys,
  } = await server.ssrLoadModule('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const json = (value) => JSON.parse(JSON.stringify(value));
  const commit = (settings) => syncActiveEditorCamera(settings, keys);
  const published = getPublishedHomeSceneSettings();
  const baseline = json(published.sceneCameras);
  let settings = normalizeHomeSceneDraftSettings(published);
  assert.deepEqual(settings.sceneCameras, baseline, 'initializing work cameras preserves all site snapshots');

  // Reproduce the author's last session: Work 3 is daylight with no film,
  // while the last selected site camera keeps its cinematic treatment.
  const legacyWork = {
    id: 'work-3', name: 'Рабочая 3',
    cameraPosition: { x: 3.9345, y: 0.2795, z: 2.0125 },
    cameraTarget: { x: -17.6959, y: 2.9011, z: -12.6727 },
    cameraFov: 50,
  };
  settings = normalizeHomeSceneDraftSettings({
    ...published, filmEnabled: false, timeOfDay: 11.3,
    activeWorkCameraId: 'work-3', workCameras: [legacyWork], editorLayoutKey: 'portrait',
  });
  assert.equal(settings.activeWorkCameraId, 'work-3');
  assert.equal(settings.editorLayoutKey, 'portrait');
  assert.equal(settings.filmEnabled, false);
  assert.deepEqual(settings.layouts.desktop.cameraPosition, legacyWork.cameraPosition);
  assert.deepEqual(settings.layouts.portrait.cameraPosition, legacyWork.cameraPosition);
  assert.deepEqual(settings.sceneCameras, baseline, 'migration cannot stamp the work look onto the site');

  const firstId = published.sceneCameras[0].id;
  settings = selectEditorCamera(settings, firstId, 'scene', keys);
  assert.deepEqual(createHomeSceneSnapshot(settings), baseline[0].scene, 'same site ID restores its full scene when leaving work');
  settings = selectEditorCamera(settings, 'work-3', 'work', keys);

  const beforePublish = json(settings);
  const payload = sanitizeHomeSceneSettingsForPublish(settings);
  assert.deepEqual(settings, beforePublish, 'publication is pure');
  assert.deepEqual(payload.sceneCameras, baseline);
  assert.deepEqual(createHomeSceneSnapshot(payload), baseline[0].scene, 'published root uses first site camera, never work');
  assert.ok(!('workCameras' in payload) && !('activeWorkCameraId' in payload) && !('editorLayoutKey' in payload));
  assert.deepEqual(sanitizeHomeSceneSettingsForPublish(normalizePublishedHomeSceneSettings(json(payload))), payload,
    'publish / normalize / publish is stable');

  const snapshotA = json(settings.sceneCameras[0].scene);
  const workId = settings.activeWorkCameraId;
  const lookKeys = ['filmEnabled', 'postProcessingEnabled', 'sunRaysEnabled', 'bloomEnabled', 'shadowsEnabled'];
  for (let step = 0; step < 60; step += 1) {
    settings = selectEditorCamera(settings, workId, 'work', keys);
    const toggles = Object.fromEntries(lookKeys.map((key, index) => [key, (step + index) % 2 === 0]));
    settings = commit({
      ...settings, ...toggles,
      timeOfDay: (step % 23) + 0.25, sunRaysIntensity: 0.5 + (step % 3) * 0.2,
      filmStock: step % 2 ? 'bw' : '35mm', colorSaturation: 0.75 + (step % 3) * 0.1,
      colorExposure: (step % 4) * 0.1, hdrPreset: step % 2 ? 'sunset' : 'night',
    });
    settings = commit(updateEditorLayout(settings, step % 2 ? 'desktop' : 'portrait', {
      cameraFov: 1.25 + (step % 60),
      cameraPosition: { x: step, y: 3.125, z: -step },
      cameraTarget: { x: -1, y: 0.25, z: 2 },
    }));
    const expected = json(createHomeSceneSnapshot(settings));
    const catalogue = json(settings.sceneCameras);
    settings = normalizeHomeSceneDraftSettings(json(settings));
    assert.deepEqual(createHomeSceneSnapshot(settings), expected, `all ${keys.length} scene keys survive reload ${step}`);
    assert.deepEqual(settings.sceneCameras, catalogue, 'work persistence cannot alter site snapshots');
    settings = selectEditorCamera(settings, firstId, 'scene', keys);
    assert.deepEqual(createHomeSceneSnapshot(settings), snapshotA, 'returning to the same site camera restores every field');
    settings = selectEditorCamera(settings, workId, 'work', keys);
    assert.deepEqual(createHomeSceneSnapshot(settings), expected, 'work camera restores every field');
  }

  for (const kind of ['scene', 'work']) {
    for (const layoutKey of ['desktop', 'portrait']) {
      const pose = { cameraPosition: { x: 11, y: 23, z: 45 }, cameraTarget: { x: -2, y: 3, z: 1 }, cameraFov: 1.25 };
      settings = addEditorCamera(settings, { kind, layoutKey, pose }, keys);
      const id = kind === 'work' ? settings.activeWorkCameraId : settings.activeCameraId;
      assert.deepEqual(settings.layouts.desktop, settings.layouts.portrait, `${kind} + from ${layoutKey} creates identical formats`);
      const desktop = json(settings.layouts.desktop);
      settings = commit(updateEditorLayout(settings, 'portrait', { cameraFov: 17.5, cameraPosition: { x: 80, y: 9, z: 7 } }));
      const expected = json(createHomeSceneSnapshot(settings));
      settings = normalizeHomeSceneDraftSettings(json(settings));
      assert.deepEqual(settings.layouts.desktop, desktop, `${kind} mobile capture preserves Desktop after reload`);
      assert.deepEqual(createHomeSceneSnapshot(settings), expected);
      assert.equal(kind === 'work' ? settings.activeWorkCameraId : settings.activeCameraId, id);
      for (const entry of [...settings.sceneCameras, ...settings.workCameras]) {
        for (const excluded of ['sceneCameras', 'workCameras', 'activeCameraId', 'activeWorkCameraId', 'editorLayoutKey', 'audio']) {
          assert.ok(!(excluded in entry.scene), `${excluded} must not nest inside a camera snapshot`);
        }
      }
    }
  }
  console.log(`cameraPersistence: ${keys.length} snapshot fields, 60 reload/switch cycles, paired captures and publication passed`);
} finally {
  await server.close();
}
