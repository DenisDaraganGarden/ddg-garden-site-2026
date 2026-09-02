// Run: node src/features/home-scene/lib/cameraLayout.check.js

import assert from 'node:assert/strict';
import {
  fitCameraFovToLayout,
  resolveLayout,
  resolveLayoutKey,
} from './layout.js';
import {
  getPlayableSceneCameras,
  normalizeSceneCameras,
  normalizeWorkCameras,
} from './sceneCameras.js';

const closeTo = (actual, expected, epsilon = 1e-10) => (
  Math.abs(actual - expected) <= epsilon
);

const narrowDesktopFov = fitCameraFovToLayout(1, 1600, 900, 'desktop', 0.18);
const fractionalDesktopFov = fitCameraFovToLayout(1.25, 3000, 900, 'desktop', 0.18);
const narrowPortraitFov = fitCameraFovToLayout(1, 390, 844, 'portrait', 0.18);

assert.ok(Number.isFinite(narrowDesktopFov) && narrowDesktopFov > 0,
  'a 1° lens must keep a finite positive fitted FOV');
assert.ok(Number.isFinite(narrowPortraitFov) && narrowPortraitFov > narrowDesktopFov,
  'portrait containment must widen instead of crop the authored view');
assert.ok(closeTo(fractionalDesktopFov, 1.25),
  'a fractional FOV must stay exact when the viewport already contains the frame');
assert.equal(resolveLayoutKey(390, 844), 'portrait');
assert.equal(resolveLayoutKey(844, 390), 'desktop');
assert.equal(resolveLayoutKey(844, 390, true), 'portrait',
  'a phone held sideways must keep the mobile capture');

const inheritedPortrait = resolveLayout({
  desktop: { customized: true, cameraFov: 1.25, frameInset: 0.18 },
  portrait: { customized: false, cameraFov: 35, frameInset: 0.12 },
}, 'portrait');
assert.equal(inheritedPortrait.cameraFov, 1.25,
  'an uncustomized portrait bucket must keep the desktop composition');
assert.equal(inheritedPortrait.frameInset, 0.12,
  'the portrait frame inset remains local while the pose inherits');

const normalized = normalizeSceneCameras([
  { id: 'one', enabled: true, scene: { marker: 1 } },
  { id: 'two', enabled: false, scene: { marker: 2 } },
  { id: 'three', enabled: true, scene: { marker: 3 } },
], { marker: 0 }, (scene) => scene);
const playable = getPlayableSceneCameras({ sceneCameras: normalized });
assert.deepEqual(playable.map((camera) => camera.id), ['one', 'three'],
  'enabled cameras must retain their authored order');
assert.equal(playable[(playable.length - 1 + 1) % playable.length].id, 'one',
  'the final enabled camera must wrap back to the first camera');

const workCameras = normalizeWorkCameras([
  { id: 'look', name: ' Overview ', cameraPosition: { x: 1, y: 2, z: 3 }, cameraTarget: { x: 0, y: 0, z: 0 }, cameraFov: 500 },
  { id: 'look', cameraPosition: { x: 'nope' }, cameraTarget: { x: 0, y: 0, z: 0 } },
  { id: 'look', cameraPosition: { x: 4, y: 5, z: 6 }, cameraTarget: { x: 1, y: 1, z: 1 } },
]);
assert.deepEqual(workCameras.map((camera) => camera.id), ['look', 'look-2'],
  'a work camera without a pose is dropped and ids stay unique');
assert.equal(workCameras[0].name, 'Overview');
assert.equal(workCameras[0].cameraFov, 75, 'a work camera fov is clamped to the slider range');
assert.equal(workCameras[1].name, 'Рабочая 3', 'an unnamed work camera is named by its slot');
assert.deepEqual(workCameras[1].cameraTarget, { x: 1, y: 1, z: 1 });

console.log('cameraLayout: all checks passed');
