export const SOUNDSCAPE_MODES = Object.freeze(['off', 'music', 'soundscape', 'hybrid']);

export const DEFAULT_SOUNDSCAPE_SETTINGS = Object.freeze({
  version: 1,
  enabled: true,
  mode: 'soundscape',
  masterGain: 0.72,
  musicGain: 0.36,
  ambienceGain: 0.78,
  spatialGain: 0.92,
  weatherGain: 0.72,
  uiGain: 0.16,
  homeFadeSeconds: 1.6,
  routeFadeSeconds: 0.8,
  spatialEnabled: true,
  duckOnCameraCut: true,
  cameraCutDuck: 0.72,
  tracks: {
    water: { enabled: true, gain: 0.28 },
    shore: { enabled: true, gain: 0.12 },
    boat: { enabled: true, gain: 0.58 },
    birds: { enabled: true, gain: 0.86 },
    wind: { enabled: true, gain: 0.72 },
    thunder: { enabled: true, gain: 0.24 },
    ui: { enabled: true, gain: 1 },
  },
  emitters: {
    shore: {
      x: 15.5,
      y: 0.2,
      z: 2,
      refDistance: 5,
      maxDistance: 80,
      rolloff: 1.1,
    },
    birds: {
      x: 7,
      y: 10,
      z: -1,
      refDistance: 7,
      maxDistance: 110,
      rolloff: 0.8,
    },
    wind: {
      x: 13.5,
      y: 2.2,
      z: -8,
      refDistance: 8,
      maxDistance: 95,
      rolloff: 0.7,
    },
    thunder: {
      x: 35,
      y: 10,
      z: -20,
      refDistance: 18,
      maxDistance: 180,
      rolloff: 0.55,
    },
  },
});

const clamp = (value, minimum, maximum, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numericValue));
};

const pickBoolean = (value, fallback) => (
  typeof value === 'boolean' ? value : fallback
);

const normalizeTrack = (track, fallback) => ({
  enabled: pickBoolean(track?.enabled, fallback.enabled),
  gain: clamp(track?.gain, 0, 1.5, fallback.gain),
});

const normalizeEmitter = (emitter, fallback) => ({
  x: clamp(emitter?.x, -200, 200, fallback.x),
  y: clamp(emitter?.y, -40, 200, fallback.y),
  z: clamp(emitter?.z, -200, 200, fallback.z),
  refDistance: clamp(emitter?.refDistance, 0.25, 80, fallback.refDistance),
  maxDistance: clamp(emitter?.maxDistance, 1, 400, fallback.maxDistance),
  rolloff: clamp(emitter?.rolloff, 0, 4, fallback.rolloff),
});

export function normalizeSoundscapeSettings(value = {}) {
  const defaults = DEFAULT_SOUNDSCAPE_SETTINGS;
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sourceTracks = source.tracks && typeof source.tracks === 'object' ? source.tracks : {};
  const sourceEmitters = source.emitters && typeof source.emitters === 'object' ? source.emitters : {};

  return {
    version: 1,
    enabled: pickBoolean(source.enabled, defaults.enabled),
    mode: SOUNDSCAPE_MODES.includes(source.mode) ? source.mode : defaults.mode,
    masterGain: clamp(source.masterGain, 0, 1, defaults.masterGain),
    musicGain: clamp(source.musicGain, 0, 1, defaults.musicGain),
    ambienceGain: clamp(source.ambienceGain, 0, 1, defaults.ambienceGain),
    spatialGain: clamp(source.spatialGain, 0, 1, defaults.spatialGain),
    weatherGain: clamp(source.weatherGain, 0, 1, defaults.weatherGain),
    uiGain: clamp(source.uiGain, 0, 1, defaults.uiGain),
    homeFadeSeconds: clamp(source.homeFadeSeconds, 0, 8, defaults.homeFadeSeconds),
    routeFadeSeconds: clamp(source.routeFadeSeconds, 0, 8, defaults.routeFadeSeconds),
    spatialEnabled: pickBoolean(source.spatialEnabled, defaults.spatialEnabled),
    duckOnCameraCut: pickBoolean(source.duckOnCameraCut, defaults.duckOnCameraCut),
    cameraCutDuck: clamp(source.cameraCutDuck, 0.25, 1, defaults.cameraCutDuck),
    tracks: Object.fromEntries(
      Object.entries(defaults.tracks).map(([trackId, fallback]) => [
        trackId,
        normalizeTrack(sourceTracks[trackId], fallback),
      ]),
    ),
    emitters: Object.fromEntries(
      Object.entries(defaults.emitters).map(([emitterId, fallback]) => [
        emitterId,
        normalizeEmitter(sourceEmitters[emitterId], fallback),
      ]),
    ),
  };
}
