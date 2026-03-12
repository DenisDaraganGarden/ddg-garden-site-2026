import { useEffect, useState } from 'react';
import { publishedHomeSceneSettings } from '../data/publishedHomeSceneSettings';

export const HOME_SCENE_SETTINGS_STORAGE_KEY = 'ddg_home_scene_settings_v1';
export const LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS = ['ddg_snake_settings_v4', 'ddg_snake_settings_v3'];
export const PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY = 'ddg_published_home_scene_settings_v1';
export const LEGACY_PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEYS = ['ddg_published_snake_settings_v1'];
export const HOME_SCENE_SETTINGS_SYNC_EVENT = 'ddg:home-scene-settings-sync';

export const HOME_SCENE_HDRI_PRESETS = [
  { value: 'night', label: 'Night' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'city', label: 'City' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'studio', label: 'Studio' },
];

export const HOME_SCENE_DEBUG_VIEWS = [
  { value: 'beauty', label: 'Beauty' },
  { value: 'height', label: 'Height' },
  { value: 'normals', label: 'Normals' },
  { value: 'caustics', label: 'Caustics' },
  { value: 'seabed-depth', label: 'Seabed Depth' },
];

const DEFAULT_HDRI_PRESET = HOME_SCENE_HDRI_PRESETS[0].value;
const DEFAULT_DEBUG_VIEW = HOME_SCENE_DEBUG_VIEWS[0].value;
const LOCAL_HOME_SCENE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const VALID_HDRI_PRESETS = new Set(HOME_SCENE_HDRI_PRESETS.map((option) => option.value));
const VALID_DEBUG_VIEWS = new Set(HOME_SCENE_DEBUG_VIEWS.map((option) => option.value));
const PUBLISHED_HOME_SCENE_KEYS = [
  'waterExtent',
  'simulationResolution',
  'waterMeshDensity',
  'waveAmplitude',
  'waveLength',
  'waveChoppiness',
  'rippleDamping',
  'rippleRadius',
  'rippleImpulse',
  'normalStrength',
  'normalBlur',
  'hdrPreset',
  'hdrRotation',
  'hdrExposure',
  'envReflectionIntensity',
  'envTint',
  'moonIntensity',
  'moonColor',
  'moonAzimuth',
  'moonElevation',
  'moonSpecularStrength',
  'moonSpecularPower',
  'waterDepthMeters',
  'seabedReliefStrength',
  'seabedReliefScale',
  'causticsIntensity',
  'causticsScale',
  'causticsSharpness',
  'cameraFov',
  'debugView',
  'boatColor',
  'boatMetalness',
  'boatRoughness',
  'boatClearcoat',
  'boatClearcoatRoughness',
  'boatScale',
  'seabedTextureScale',
  'seabedSaturation',
  'seabedBrightness',
  'waterTurbidity',
  'ambientWaveIntensity',
  'ambientWaveSpeed',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampResolution = (value) => {
  const requested = Number(value);

  if (!Number.isFinite(requested)) {
    return 512;
  }

  if (requested <= 320) {
    return 256;
  }

  if (requested <= 448) {
    return 384;
  }

  return 512;
};
const clampFloat = (value, min, max, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? clamp(nextValue, min, max) : fallback;
};
const clampInt = (value, min, max, fallback) => Math.round(
  clampFloat(value, min, max, fallback),
);
const pickColor = (value, fallback) => (
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
);

export const getBaseHomeSceneSettings = () => ({
  waterExtent: 24,
  simulationResolution: 512,
  waterMeshDensity: 288,
  waveAmplitude: 0.055,
  waveLength: 0.72,
  waveChoppiness: 0.18,
  rippleDamping: 0.965,
  rippleRadius: 0.45,
  rippleImpulse: 0.22,
  normalStrength: 1.2,
  normalBlur: 0.85,
  hdrPreset: DEFAULT_HDRI_PRESET,
  hdrRotation: 210,
  hdrExposure: 64,
  envReflectionIntensity: 84,
  envTint: '#6b7484',
  moonIntensity: 0.95,
  moonColor: '#d9e4ff',
  moonAzimuth: 42,
  moonElevation: 18,
  moonSpecularStrength: 0.18,
  moonSpecularPower: 38,
  waterDepthMeters: 5,
  seabedReliefStrength: 0.42,
  seabedReliefScale: 1.8,
  causticsIntensity: 0.55,
  causticsScale: 1.2,
  causticsSharpness: 0.45,
  cameraFov: 36,
  debugView: DEFAULT_DEBUG_VIEW,
  boatColor: '#ffffff',
  boatMetalness: 0.15,
  boatRoughness: 0.20,
  boatClearcoat: 0.8,
  boatClearcoatRoughness: 0.1,
  boatScale: 0.001,
  seabedTextureScale: 1.0,
  seabedSaturation: 1.0,
  seabedBrightness: 1.0,
  waterTurbidity: 0.3,
  ambientWaveIntensity: 0.12,
  ambientWaveSpeed: 0.85,
});

const normalizeLegacySettings = (savedSettings, defaults) => {
  const legacy = {};

  if (savedSettings?.planeMeshDensity !== undefined) {
    legacy.waterMeshDensity = clampInt(savedSettings.planeMeshDensity, 96, 384, defaults.waterMeshDensity);
  }

  if (savedSettings?.cameraFov !== undefined) {
    legacy.cameraFov = clampInt(savedSettings.cameraFov, 24, 75, defaults.cameraFov);
  }

  if (savedSettings?.planeHeight !== undefined) {
    legacy.waveAmplitude = clampFloat(savedSettings.planeHeight / 1200, 0.01, 0.2, defaults.waveAmplitude);
  }

  if (savedSettings?.planeRadius !== undefined) {
    legacy.waterExtent = clampFloat(savedSettings.planeRadius / 20, 12, 40, defaults.waterExtent);
  }

  if (savedSettings?.planeTrailLength !== undefined) {
    legacy.rippleRadius = clampFloat(savedSettings.planeTrailLength / 40, 0.1, 2.4, defaults.rippleRadius);
    legacy.rippleDamping = clampFloat(1 - (savedSettings.planeTrailLength / 1300), 0.93, 0.992, defaults.rippleDamping);
  }

  if (savedSettings?.planeTrailSpan !== undefined) {
    legacy.rippleRadius = clampFloat(savedSettings.planeTrailSpan / 45, 0.1, 2.4, legacy.rippleRadius ?? defaults.rippleRadius);
  }

  if (savedSettings?.planeTrailPersistence !== undefined) {
    legacy.rippleDamping = clampFloat(1 - (savedSettings.planeTrailPersistence / 1400), 0.93, 0.992, legacy.rippleDamping ?? defaults.rippleDamping);
  }

  if (savedSettings?.hdrExposure !== undefined) {
    legacy.hdrExposure = clampInt(savedSettings.hdrExposure, 20, 220, defaults.hdrExposure);
  }

  if (savedSettings?.lightColor !== undefined) {
    legacy.moonColor = pickColor(savedSettings.lightColor, defaults.moonColor);
  }

  if (savedSettings?.lightIntensity !== undefined) {
    legacy.moonIntensity = clampFloat(savedSettings.lightIntensity / 260, 0, 4, defaults.moonIntensity);
  }

  if (savedSettings?.lightAngle !== undefined) {
    legacy.moonAzimuth = clampFloat(savedSettings.lightAngle, 0, 360, defaults.moonAzimuth);
  }

  if (savedSettings?.lightHeight !== undefined) {
    legacy.moonElevation = clampFloat(savedSettings.lightHeight / 4, 5, 85, defaults.moonElevation);
  }

  return legacy;
};

const normalizeHomeSceneSettings = (savedSettings = {}) => {
  const defaults = getBaseHomeSceneSettings();
  const legacy = normalizeLegacySettings(savedSettings, defaults);
  const merged = {
    ...defaults,
    ...legacy,
    ...savedSettings,
  };

  return {
    waterExtent: clampFloat(merged.waterExtent, 12, 40, defaults.waterExtent),
    simulationResolution: clampResolution(merged.simulationResolution),
    waterMeshDensity: clampInt(merged.waterMeshDensity, 96, 384, defaults.waterMeshDensity),
    waveAmplitude: clampFloat(merged.waveAmplitude, 0.01, 0.2, defaults.waveAmplitude),
    waveLength: clampFloat(merged.waveLength, 0.4, 3.2, defaults.waveLength),
    waveChoppiness: clampFloat(merged.waveChoppiness, 0, 1.25, defaults.waveChoppiness),
    rippleDamping: clampFloat(merged.rippleDamping, 0.93, 0.992, defaults.rippleDamping),
    rippleRadius: clampFloat(merged.rippleRadius, 0.1, 2.4, defaults.rippleRadius),
    rippleImpulse: clampFloat(merged.rippleImpulse, 0.05, 1.2, defaults.rippleImpulse),
    normalStrength: clampFloat(merged.normalStrength, 0.4, 3.2, defaults.normalStrength),
    normalBlur: clampFloat(merged.normalBlur, 0.2, 2.5, defaults.normalBlur),
    hdrPreset: VALID_HDRI_PRESETS.has(merged.hdrPreset) ? merged.hdrPreset : defaults.hdrPreset,
    hdrRotation: clampFloat(merged.hdrRotation, 0, 360, defaults.hdrRotation),
    hdrExposure: clampInt(merged.hdrExposure, 20, 220, defaults.hdrExposure),
    envReflectionIntensity: clampInt(merged.envReflectionIntensity, 20, 220, defaults.envReflectionIntensity),
    envTint: pickColor(merged.envTint, defaults.envTint),
    moonIntensity: clampFloat(merged.moonIntensity, 0, 4, defaults.moonIntensity),
    moonColor: pickColor(merged.moonColor, defaults.moonColor),
    moonAzimuth: clampFloat(merged.moonAzimuth, 0, 360, defaults.moonAzimuth),
    moonElevation: clampFloat(merged.moonElevation, 5, 85, defaults.moonElevation),
    moonSpecularStrength: clampFloat(merged.moonSpecularStrength, 0, 2, defaults.moonSpecularStrength),
    moonSpecularPower: clampFloat(merged.moonSpecularPower, 4, 128, defaults.moonSpecularPower),
    waterDepthMeters: clampFloat(merged.waterDepthMeters, 1, 12, defaults.waterDepthMeters),
    seabedReliefStrength: clampFloat(merged.seabedReliefStrength, 0, 2, defaults.seabedReliefStrength),
    seabedReliefScale: clampFloat(merged.seabedReliefScale, 0.5, 6, defaults.seabedReliefScale),
    causticsIntensity: clampFloat(merged.causticsIntensity, 0, 3, defaults.causticsIntensity),
    causticsScale: clampFloat(merged.causticsScale, 0.5, 6, defaults.causticsScale),
    causticsSharpness: clampFloat(merged.causticsSharpness, 0.1, 1.5, defaults.causticsSharpness),
    cameraFov: clampInt(merged.cameraFov, 24, 75, defaults.cameraFov),
    debugView: VALID_DEBUG_VIEWS.has(merged.debugView) ? merged.debugView : defaults.debugView,
    boatColor: pickColor(merged.boatColor, defaults.boatColor),
    boatMetalness: clampFloat(merged.boatMetalness, 0, 1, defaults.boatMetalness),
    boatRoughness: clampFloat(merged.boatRoughness, 0, 1, defaults.boatRoughness),
    boatClearcoat: clampFloat(merged.boatClearcoat, 0, 1, defaults.boatClearcoat),
    boatClearcoatRoughness: clampFloat(merged.boatClearcoatRoughness, 0, 1, defaults.boatClearcoatRoughness),
    boatScale: clampFloat(merged.boatScale, 0.001, 0.1, defaults.boatScale),
    seabedTextureScale: clampFloat(merged.seabedTextureScale, 0.1, 10.0, defaults.seabedTextureScale),
    seabedSaturation: clampFloat(merged.seabedSaturation, 0, 2, defaults.seabedSaturation),
    seabedBrightness: clampFloat(merged.seabedBrightness, 0, 2, defaults.seabedBrightness),
    waterTurbidity: clampFloat(merged.waterTurbidity, 0, 1, defaults.waterTurbidity),
    ambientWaveIntensity: clampFloat(merged.ambientWaveIntensity, 0, 1, defaults.ambientWaveIntensity),
    ambientWaveSpeed: clampFloat(merged.ambientWaveSpeed, 0, 10, defaults.ambientWaveSpeed),
  };
};

export const sanitizeHomeSceneSettingsForPublish = (settings = {}) => PUBLISHED_HOME_SCENE_KEYS.reduce((accumulator, key) => {
  if (settings[key] !== undefined) {
    accumulator[key] = settings[key];
  }

  return accumulator;
}, {});

export const getPublishedHomeSceneSettings = () => normalizeHomeSceneSettings(
  sanitizeHomeSceneSettingsForPublish(publishedHomeSceneSettings),
);

export const normalizePublishedHomeSceneSettings = (settings = {}) => normalizeHomeSceneSettings(
  sanitizeHomeSceneSettingsForPublish(settings),
);

export const normalizeHomeSceneDraftSettings = (savedSettings = {}) => normalizeHomeSceneSettings(savedSettings);

function isLocalHomeSceneRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }

  return LOCAL_HOME_SCENE_HOSTS.has(window.location.hostname);
}

function removeLegacyHomeSceneKeys() {
  if (typeof window === 'undefined') {
    return;
  }

  LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  LEGACY_PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

function clearHomeSceneRuntimeStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(HOME_SCENE_SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem(PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY);
  removeLegacyHomeSceneKeys();
}

export function readHomeSceneDraftSettings() {
  if (typeof window === 'undefined') {
    return null;
  }

  const saved = window.localStorage.getItem(HOME_SCENE_SETTINGS_STORAGE_KEY)
    ?? LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find(Boolean);

  if (!saved) {
    return null;
  }

  try {
    return normalizeHomeSceneDraftSettings(JSON.parse(saved));
  } catch (error) {
    console.error('Failed to parse home scene draft settings', error);
    return null;
  }
}

function readStoredPublishedHomeSceneSettings() {
  if (!isLocalHomeSceneRuntime()) {
    return null;
  }

  const saved = window.localStorage.getItem(PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY)
    ?? LEGACY_PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find(Boolean);

  if (!saved) {
    return null;
  }

  try {
    const parsed = normalizePublishedHomeSceneSettings(JSON.parse(saved));
    window.localStorage.setItem(
      PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY,
      JSON.stringify(sanitizeHomeSceneSettingsForPublish(parsed)),
    );
    LEGACY_PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    return parsed;
  } catch (error) {
    console.error('Failed to parse published home scene settings override', error);
    return null;
  }
}

export function readLivePublishedHomeSceneSettings() {
  if (!isLocalHomeSceneRuntime()) {
    return null;
  }

  const storedPublishedSettings = readStoredPublishedHomeSceneSettings();

  if (storedPublishedSettings) {
    return storedPublishedSettings;
  }

  const draftSettings = readHomeSceneDraftSettings();

  if (!draftSettings) {
    return null;
  }

  return normalizePublishedHomeSceneSettings(sanitizeHomeSceneSettingsForPublish(draftSettings));
}

function dispatchHomeSceneSettingsSync() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return;
  }

  window.dispatchEvent(new CustomEvent(HOME_SCENE_SETTINGS_SYNC_EVENT));
}

export const usePublishedHomeSceneSettings = () => {
  const [settings, setSettings] = useState(() => readLivePublishedHomeSceneSettings() ?? getPublishedHomeSceneSettings());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (!isLocalHomeSceneRuntime()) {
      clearHomeSceneRuntimeStorage();
    }

    const syncSettings = () => {
      setSettings(readLivePublishedHomeSceneSettings() ?? getPublishedHomeSceneSettings());
    };

    const handleStorage = (event) => {
      if (
        event.key
        && event.key !== HOME_SCENE_SETTINGS_STORAGE_KEY
        && event.key !== PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY
        && !LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS.includes(event.key)
        && !LEGACY_PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEYS.includes(event.key)
      ) {
        return;
      }

      syncSettings();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(HOME_SCENE_SETTINGS_SYNC_EVENT, syncSettings);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(HOME_SCENE_SETTINGS_SYNC_EVENT, syncSettings);
    };
  }, []);

  return {
    settings,
  };
};

export const useHomeSceneDraftSettings = () => {
  const [settings, setSettings] = useState(() => readHomeSceneDraftSettings() ?? getPublishedHomeSceneSettings());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(HOME_SCENE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    removeLegacyHomeSceneKeys();

    if (isLocalHomeSceneRuntime()) {
      window.localStorage.setItem(
        PUBLISHED_HOME_SCENE_SETTINGS_STORAGE_KEY,
        JSON.stringify(sanitizeHomeSceneSettingsForPublish(settings)),
      );
      dispatchHomeSceneSettingsSync();
    }
  }, [settings]);

  return {
    settings,
    setSettings,
  };
};

export const useHomeSceneSettings = useHomeSceneDraftSettings;
