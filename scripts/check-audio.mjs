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
import { SOUNDSCAPE_ASSETS } from '../src/features/audio/data/soundscapeManifest.js';
import { publishedHomeSceneSettings } from '../src/features/home-scene/data/publishedHomeSceneSettings.js';
import { publishedHomeSceneKeys } from '../src/features/home-scene/data/publishedHomeSceneKeys.js';
import { SCENE_CAMERA_SNAPSHOT_EXCLUDED_KEYS } from '../src/features/home-scene/lib/sceneCameras.js';

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
const publishedAudibleModes = new Set(['music', 'soundscape', 'hybrid']);
assert.ok(
  publishedAudibleModes.has(publishedHomeSceneSettings.audio.mode),
  'published audio must use one of the supported audible composition modes',
);
assert.ok(publishedHomeSceneSettings.audio.tracks.water, 'published soundscape must include tracks');
assert.ok(
  SCENE_CAMERA_SNAPSHOT_EXCLUDED_KEYS.includes('audio'),
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

// «Предел слышимости» is a real limit (audibleShare): the panner's inverse level
// is kept near the source, the sound fades out on the way to maxDistance and is
// silent from there on, whatever the browser does with maxDistance itself.
const { audibleShare } = soundscapeEngineInternals;
assert.equal(audibleShare(3, 5, 80), 1, 'inside the reference distance the level is full');
assert.ok(audibleShare(5 + 75 * 0.5, 5, 80) > 0.99, 'half way to the limit the level is as it was');
assert.equal(audibleShare(80, 5, 80), 0, 'silent at the limit');
assert.equal(audibleShare(400, 5, 80), 0, 'and beyond it');
for (let d = 5, previous = 1; d <= 80; d += 0.5) {
  const share = audibleShare(d, 5, 80);
  assert.ok(share >= 0 && share <= previous, 'the level only falls with distance');
  previous = share;
}
assert.equal(audibleShare(81, 80, 80), 0, 'a limit inside the reference distance still silences');

// The limit follows the listener and the source: a fake context whose params
// take their target at once, a shore track, a camera walking away and back.
const param = (value = 1) => ({ value, setTargetAtTime(next) { this.value = next; }, setValueAtTime(next) { this.value = next; }, linearRampToValueAtTime(next) { this.value = next; }, cancelAndHoldAtTime() {} });
const fakeNode = () => new Proxy({ connect: (next) => next, disconnect() {} }, { get: (node, key) => (key in node ? node[key] : (node[key] = param())) });
const fakeContext = new Proxy({ currentTime: 0, destination: fakeNode(), listener: fakeNode() }, { get: (context, key) => (key in context ? context[key] : () => fakeNode()) });
const limitEngine = new SoundscapeEngine({ contextFactory: () => fakeContext });
limitEngine.ensureContext();
limitEngine.unlocked = true;
const shore = limitEngine.createTrack(SOUNDSCAPE_ASSETS.shore, null);
limitEngine.tracks.set('shore', shore);
const { x: shoreX, y: shoreY, z: shoreZ } = DEFAULT_SOUNDSCAPE_SETTINGS.emitters.shore;
const listenAt = (x) => limitEngine.updateListener({ x, y: shoreY, z: shoreZ }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
listenAt(shoreX + 30);
assert.ok(shore.limit.gain.value > 0.99, 'a camera 30 m from the shore hears it as before');
listenAt(shoreX + 80);
assert.equal(shore.limit.gain.value, 0, 'at the shore\'s 80 m limit it is silent');
limitEngine.updateEmitter('shore', shoreX + 60, shoreY, shoreZ);
assert.ok(shore.limit.gain.value > 0.99, 'the source coming closer brings it back');

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
