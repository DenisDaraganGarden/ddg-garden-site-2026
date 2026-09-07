// Run: node src/features/home-scene/lib/editorCameraState.check.js
//
// This is deliberately a pure-state regression suite. It exercises the editor
// camera contract without WebGL, React timing, localStorage, or an editor DOM.

import assert from 'node:assert/strict';
import {
  addEditorCamera,
  initializeEditorCameras,
  removeEditorCamera,
  selectEditorCamera,
  syncActiveEditorCamera,
  updateEditorLayout,
} from './editorCameraState.js';
import { normalizeWorkCameras } from './sceneCameras.js';

const SNAPSHOT_KEYS = Object.freeze(['filmEnabled', 'timeOfDay', 'layouts']);

const layout = (x, fov = 40, frameInset = 0.18) => ({
  customized: true,
  cameraPosition: { x, y: 10 + x, z: 20 + x },
  cameraTarget: { x: x - 1, y: 2, z: x + 3 },
  cameraFov: fov,
  frameInset,
  boatPosition: { x: x + 0.1, z: x + 0.2 },
  sculpturePosition: { x: x + 0.3, z: x + 0.4 },
});

const scene = (marker, filmEnabled, timeOfDay, desktopX, portraitX) => ({
  marker,
  filmEnabled,
  timeOfDay,
  layouts: {
    desktop: layout(desktopX, 40 + desktopX),
    portrait: layout(portraitX, 50 + portraitX, 0.12),
  },
});

const root = () => ({
  ...scene('root-a', true, 9.4, 10, 11),
  sceneCameras: [
    { id: 'camera-2', name: 'Камера 2', enabled: true, holdSeconds: 8, scene: scene('A', true, 9.4, 10, 11) },
    { id: 'camera-4', name: 'Camera 4', enabled: true, holdSeconds: 8, scene: scene('B', false, 16.1, 30, 31) },
  ],
  activeCameraId: 'camera-2',
  workCameras: [],
  activeWorkCameraId: null,
  freeCamera: true,
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const camera = (settings, id) => settings.sceneCameras.find((entry) => entry.id === id);
const work = (settings, id) => settings.workCameras.find((entry) => entry.id === id);

// Init migrates an old flat work bookmark and keeps a chosen valid work camera.
const legacy = root();
legacy.workCameras = [{
  id: 'work-3',
  name: 'Рабочая 3',
  cameraPosition: { x: 77, y: 78, z: 79 },
  cameraTarget: { x: 1, y: 2, z: 3 },
  cameraFov: 63,
}];
legacy.activeWorkCameraId = 'work-3';
const initialized = initializeEditorCameras(legacy, SNAPSHOT_KEYS, 'desktop');
assert.equal(initialized.workCameras[0].id, 'work-main', 'init always keeps main work camera first');
assert.equal(initialized.activeWorkCameraId, 'work-3', 'init retains a valid selected work camera');
const migrated = work(initialized, 'work-3');
assert.ok(migrated?.scene, 'legacy work bookmark migrates into a local scene');
assert.deepEqual(migrated.scene.layouts.desktop.cameraPosition, { x: 77, y: 78, z: 79 });
assert.deepEqual(migrated.scene.layouts.portrait.cameraPosition, { x: 77, y: 78, z: 79 });
assert.equal(migrated.scene.layouts.desktop.customized, true);
assert.equal(migrated.scene.layouts.portrait.customized, true);
assert.equal(Object.hasOwn(migrated, 'cameraPosition'), false, 'normalized work cameras no longer retain flat poses');

// New scene/work cameras clone the viewed pose into both formats and use the
// largest visible label/id number, not the array length or a deleted slot.
const source = initializeEditorCameras(root(), SNAPSHOT_KEYS);
const pose = {
  cameraPosition: { x: 500, y: 501, z: 502 },
  cameraTarget: { x: 503, y: 504, z: 505 },
  cameraFov: 61.25,
};
const withSceneCamera = addEditorCamera(source, { kind: 'scene', layoutKey: 'desktop', pose }, SNAPSHOT_KEYS);
const createdScene = camera(withSceneCamera, withSceneCamera.activeCameraId);
assert.equal(createdScene.id, 'camera-5', 'new scene id starts after the largest existing id');
assert.equal(createdScene.name, 'Камера 5', 'new scene label starts after the largest existing label');
assert.deepEqual(createdScene.scene.layouts.desktop.cameraPosition, pose.cameraPosition);
assert.deepEqual(createdScene.scene.layouts.portrait.cameraPosition, pose.cameraPosition);
assert.equal(createdScene.scene.layouts.desktop.cameraFov, pose.cameraFov);
assert.equal(createdScene.scene.layouts.portrait.cameraFov, pose.cameraFov);
assert.notStrictEqual(createdScene.scene.layouts.desktop, createdScene.scene.layouts.portrait,
  'the paired formats are independent objects from creation');
assert.equal(withSceneCamera.activeWorkCameraId, null, 'adding a site camera exits work-camera mode');

const withWorkCamera = addEditorCamera(withSceneCamera, { kind: 'work', layoutKey: 'portrait', pose }, SNAPSHOT_KEYS);
const createdWork = work(withWorkCamera, withWorkCamera.activeWorkCameraId);
assert.equal(createdWork.id, 'work-2', 'new work id reserves work-main as the first work slot');
assert.equal(createdWork.name, 'Рабочая 2', 'new work label follows the highest label');
assert.deepEqual(createdWork.scene.layouts.desktop.cameraTarget, pose.cameraTarget);
assert.deepEqual(createdWork.scene.layouts.portrait.cameraTarget, pose.cameraTarget);
assert.equal(withWorkCamera.activeCameraId, createdScene.id, 'selecting work preserves the last site camera id');

// Capturing only Mobile changes only Mobile, including the FOV; the Desktop
// composition and nested vectors must remain completely independent.
const portraitPatch = {
  cameraPosition: { x: 900, y: 901, z: 902 },
  cameraTarget: { x: 903, y: 904, z: 905 },
  cameraFov: 12.5,
};
const capturedPortrait = updateEditorLayout(withWorkCamera, 'portrait', portraitPatch);
assert.deepEqual(capturedPortrait.layouts.portrait.cameraPosition, portraitPatch.cameraPosition);
assert.equal(capturedPortrait.layouts.portrait.cameraFov, 12.5);
assert.deepEqual(capturedPortrait.layouts.desktop.cameraPosition, pose.cameraPosition,
  'capturing portrait never changes desktop');
assert.notStrictEqual(capturedPortrait.layouts.desktop.cameraPosition, capturedPortrait.layouts.portrait.cameraPosition,
  'captured format cannot alias the other format');

// A→work→B must commit A before entering work and commit the work local scene
// before returning to B. This is the reported film/time leak in its smallest form.
let transitions = initializeEditorCameras(root(), SNAPSHOT_KEYS);
transitions = selectEditorCamera(transitions, 'work-main', 'work', SNAPSHOT_KEYS);
transitions = {
  ...transitions,
  filmEnabled: false,
  timeOfDay: 11.3,
};
transitions = syncActiveEditorCamera(transitions, SNAPSHOT_KEYS);
assert.equal(work(transitions, 'work-main').scene.filmEnabled, false, 'work scene owns work film setting');
assert.equal(camera(transitions, 'camera-2').scene.filmEnabled, true, 'editing work does not change remembered site camera');
transitions = selectEditorCamera(transitions, 'camera-4', 'scene', SNAPSHOT_KEYS);
assert.equal(transitions.filmEnabled, false, 'selecting B applies B local film setting');
assert.equal(transitions.timeOfDay, 16.1, 'selecting B applies B local time');
assert.equal(camera(transitions, 'camera-2').scene.timeOfDay, 9.4, 'A still owns its original time');
assert.equal(transitions.activeCameraId, 'camera-4');
assert.equal(transitions.activeWorkCameraId, null);
transitions = selectEditorCamera(transitions, 'camera-2', 'scene', SNAPSHOT_KEYS);
assert.equal(transitions.filmEnabled, true, 'B→A restores A film');
assert.equal(transitions.timeOfDay, 9.4, 'B→A restores A time');

// A long deterministic alternating sequence catches shared nested snapshots:
// every camera must retain its own film/time and both layout buckets throughout.
let stress = initializeEditorCameras(root(), SNAPSHOT_KEYS);
for (let index = 0; index < 240; index += 1) {
  const siteId = index % 2 === 0 ? 'camera-2' : 'camera-4';
  stress = selectEditorCamera(stress, siteId, 'scene', SNAPSHOT_KEYS);
  stress = {
    ...stress,
    filmEnabled: index % 3 === 0,
    timeOfDay: index + 0.25,
  };
  stress = syncActiveEditorCamera(stress, SNAPSHOT_KEYS);
  stress = selectEditorCamera(stress, 'work-main', 'work', SNAPSHOT_KEYS);
  stress = {
    ...stress,
    filmEnabled: index % 5 === 0,
    timeOfDay: index + 0.5,
  };
  stress = syncActiveEditorCamera(stress, SNAPSHOT_KEYS);
}
assert.equal(camera(stress, 'camera-2').scene.timeOfDay, 238.25);
assert.equal(camera(stress, 'camera-4').scene.timeOfDay, 239.25);
assert.equal(work(stress, 'work-main').scene.timeOfDay, 239.5);
assert.notStrictEqual(camera(stress, 'camera-2').scene.layouts.desktop, camera(stress, 'camera-4').scene.layouts.desktop,
  'site camera layouts remain separate through repeated switches');

// Deleting and adding cannot revive a removed identity. Reordering/renaming is
// catalog-only and must leave each nested scene untouched.
let catalogue = initializeEditorCameras(root(), SNAPSHOT_KEYS);
const beforeRename = clone(camera(catalogue, 'camera-4').scene);
catalogue = removeEditorCamera(catalogue, 'camera-2', 'scene', SNAPSHOT_KEYS);
assert.equal(catalogue.activeCameraId, 'camera-4', 'removing active site camera selects a surviving site camera');
catalogue = addEditorCamera(catalogue, { kind: 'scene', layoutKey: 'desktop', pose }, SNAPSHOT_KEYS);
assert.equal(catalogue.activeCameraId, 'camera-5', 'new camera never reuses a deleted id');
assert.equal(camera(catalogue, 'camera-4').scene.timeOfDay, beforeRename.timeOfDay,
  'delete/add does not mutate a surviving scene');
catalogue = {
  ...catalogue,
  sceneCameras: catalogue.sceneCameras.map((entry) => (
    entry.id === 'camera-4' ? { ...entry, name: 'After rename' } : entry
  )),
};
assert.deepEqual(camera(catalogue, 'camera-4').scene, beforeRename,
  'rename cannot touch scene data');

// The state helpers must be immutable even through a large mixed sequence of
// selects, local edits, captures and periodic add/remove cycles.
const immutableSource = initializeEditorCameras(root(), SNAPSHOT_KEYS);
const immutableBefore = JSON.stringify(immutableSource);
void addEditorCamera(immutableSource, { kind: 'scene', layoutKey: 'desktop', pose }, SNAPSHOT_KEYS);
assert.equal(JSON.stringify(immutableSource), immutableBefore, 'add leaves its input state untouched');

let churn = initializeEditorCameras(root(), SNAPSHOT_KEYS);
let random = 0x9e3779b9;
const nextRandom = () => {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  return random;
};
for (let index = 0; index < 1200; index += 1) {
  const operation = nextRandom() % 6;
  if (operation === 0) {
    churn = selectEditorCamera(churn, 'camera-2', 'scene', SNAPSHOT_KEYS);
  } else if (operation === 1) {
    churn = selectEditorCamera(churn, 'camera-4', 'scene', SNAPSHOT_KEYS);
  } else if (operation === 2) {
    churn = selectEditorCamera(churn, 'work-main', 'work', SNAPSHOT_KEYS);
  } else if (operation === 3) {
    const key = (nextRandom() & 1) ? 'desktop' : 'portrait';
    churn = updateEditorLayout(churn, key, {
      cameraPosition: { x: index, y: index + 1, z: index + 2 },
      cameraTarget: { x: index + 3, y: index + 4, z: index + 5 },
      cameraFov: 1 + (index % 74),
    });
  } else if (operation === 4 && index % 40 === 0) {
    churn = addEditorCamera(churn, { kind: 'scene', layoutKey: 'desktop', pose }, SNAPSHOT_KEYS);
  } else if (operation === 5 && churn.sceneCameras.length > 2) {
    churn = removeEditorCamera(churn, churn.sceneCameras.at(-1).id, 'scene', SNAPSHOT_KEYS);
  } else {
    churn = {
      ...churn,
      filmEnabled: Boolean(nextRandom() & 1),
      timeOfDay: (nextRandom() % 2400) / 100,
    };
  }
  churn = syncActiveEditorCamera(churn, SNAPSHOT_KEYS);

  if (index % 60 === 0) {
    const ids = churn.sceneCameras.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, `site ids stay unique at operation ${index}`);
    for (const entry of [...churn.sceneCameras, ...churn.workCameras]) {
      assert.notStrictEqual(entry.scene.layouts.desktop, entry.scene.layouts.portrait,
        `formats stay independently owned at operation ${index}`);
    }
  }
}

// Serialization round-trip: normalizer must preserve the two local work
// layouts and independently cloned nested objects from a saved editor draft.
const committedPortrait = syncActiveEditorCamera(capturedPortrait, SNAPSHOT_KEYS);
const serialized = JSON.parse(JSON.stringify(committedPortrait));
const normalizedWork = normalizeWorkCameras(serialized.workCameras, serialized, (snapshot) => clone(snapshot));
assert.equal(normalizedWork.length, serialized.workCameras.length);
const roundTripWork = normalizedWork.find((entry) => entry.id === serialized.activeWorkCameraId);
assert.deepEqual(roundTripWork.scene.layouts.desktop.cameraPosition, pose.cameraPosition);
assert.deepEqual(roundTripWork.scene.layouts.portrait.cameraPosition, portraitPatch.cameraPosition);
assert.notStrictEqual(roundTripWork.scene.layouts.desktop, roundTripWork.scene.layouts.portrait);

console.log('editorCameraState: all checks passed');
