import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SOUNDSCAPE_SETTINGS,
  normalizeSoundscapeSettings,
} from '../src/features/audio/data/soundscapeSettings.js';
import {
  SoundscapeEngine,
  soundscapeEngineInternals,
} from '../src/features/audio/engine/SoundscapeEngine.js';
import { publishedHomeSceneSettings } from '../src/features/home-scene/data/publishedHomeSceneSettings.js';
import { publishedHomeSceneKeys } from '../src/features/home-scene/data/publishedHomeSceneKeys.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const malformed = normalizeSoundscapeSettings({
  mode: 'unknown',
  masterGain: 12,
  routeFadeSeconds: -4,
  tracks: { boat: { enabled: 'yes', gain: 9 } },
  emitters: { thunder: { x: 900, refDistance: 0, maxDistance: 900 } },
});

assert.equal(malformed.mode, DEFAULT_SOUNDSCAPE_SETTINGS.mode, 'unknown mode must fall back');
assert.equal(malformed.masterGain, 1, 'master gain must clamp');
assert.equal(malformed.routeFadeSeconds, 0, 'route fade must clamp');
assert.equal(malformed.tracks.boat.enabled, DEFAULT_SOUNDSCAPE_SETTINGS.tracks.boat.enabled);
assert.equal(malformed.tracks.boat.gain, 1.5, 'track gain must clamp');
assert.equal(malformed.emitters.thunder.x, 200, 'emitter coordinate must clamp');
assert.equal(malformed.emitters.thunder.refDistance, 0.25, 'reference distance must clamp');
assert.equal(malformed.emitters.thunder.maxDistance, 400, 'maximum distance must clamp');

assert.ok(publishedHomeSceneKeys.includes('audio'), 'audio must be in the publish whitelist');
assert.equal(publishedHomeSceneSettings.audio.mode, 'soundscape', 'published soundscape mode must be explicit');
assert.ok(publishedHomeSceneSettings.audio.tracks.water, 'published soundscape must include tracks');
const homeSettingsSource = await fs.readFile(
  path.join(rootDir, 'src', 'features', 'home-scene', 'hooks', 'useHomeSceneSettings.js'),
  'utf8',
);
assert.match(
  homeSettingsSource,
  /key !== 'sceneCameras' && key !== 'slideshow' && key !== 'audio'/,
  'camera snapshots must exclude audio so cuts cannot reset transports',
);

const rampCalls = [];
const fakeParam = {
  value: 0.4,
  cancelAndHoldAtTime: (time) => rampCalls.push(['hold', time]),
  setValueAtTime: (value, time) => rampCalls.push(['set', value, time]),
  linearRampToValueAtTime: (value, time) => rampCalls.push(['ramp', value, time]),
};
soundscapeEngineInternals.holdAndRamp(fakeParam, 0, 0.8, 12);
assert.deepEqual(rampCalls, [
  ['hold', 12],
  ['ramp', 0, 12.8],
], 'route fades must cancel stale automation before scheduling a ramp');
assert.equal(
  soundscapeEngineInternals.randomBetween([10, 20], () => 0.25),
  12.5,
  'random event timing must stay inside its authored range',
);

const transitionEngine = new SoundscapeEngine();
transitionEngine.setRouteActive(true);
transitionEngine.setCameraTransition('fade-out', 1.2);
assert.equal(transitionEngine.getState().transitionPhase, 'fade-out');
assert.equal(
  transitionEngine.getState().worldFocusTarget,
  DEFAULT_SOUNDSCAPE_SETTINGS.cameraCutDuck,
  'camera fade-out must duck only the spatial focus bus',
);
transitionEngine.setCameraTransition('fade-in', 1.2);
assert.equal(
  transitionEngine.getState().worldFocusTarget,
  1,
  'camera fade-in must restore spatial focus without restarting tracks',
);

const expectedAssets = [
  'calm-ocean-waves.cc0.hq.mp3',
  'boat-waves.cc0.hq.mp3',
  'cliff-seagulls.cc0.hq.mp3',
  'wind-trees.cc0.hq.mp3',
  'distant-thunder.cc0.hq.mp3',
  'ui-mouse-click.cc0.hq.mp3',
];

for (const assetName of expectedAssets) {
  const assetPath = path.join(rootDir, 'public', 'audio', 'soundscape', assetName);
  const stats = await fs.stat(assetPath);
  assert.ok(stats.size > 1024, `${assetName} must contain a real checked-in recording`);
}

process.stdout.write('Audio settings, fades, camera isolation and assets: OK\n');
