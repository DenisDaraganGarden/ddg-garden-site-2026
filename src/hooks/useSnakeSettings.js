import { useEffect, useState } from 'react';
import { publishedSnakeSettings } from '../data/publishedSnakeSettings';

export const SNAKE_SETTINGS_STORAGE_KEY = 'ddg_snake_settings_v4';
export const LEGACY_SNAKE_SETTINGS_STORAGE_KEY = 'ddg_snake_settings_v3';
export const PUBLISHED_SNAKE_SETTINGS_STORAGE_KEY = 'ddg_published_snake_settings_v1';
export const SNAKE_SETTINGS_SYNC_EVENT = 'ddg:snake-settings-sync';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LOCAL_SNAKE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const PUBLISHED_SNAKE_KEYS = [
  'planeAlbedo',
  'planeRoughness',
  'planeMetalness',
  'planeHeight',
  'planeRadius',
  'planeTrailSpan',
  'planeTrailPersistence',
  'planeSharpness',
  'planeHeadTaper',
  'planeTailTaper',
  'planeMeshDensity',
  'hdrExposure',
  'lightIntensity',
  'lightColor',
  'lightAngle',
  'lightDistance',
  'lightHeight',
  'cameraFov',
  'planePos',
];

export const getBaseSnakeSettings = () => ({
  planeAlbedo: '#dddddd',
  planeRoughness: 96,
  planeMetalness: 4,
  planeHeight: 200,
  planeRadius: 350,
  planeTrailSpan: 30,
  planeTrailPersistence: 15,
  planeSharpness: 20,
  planeHeadTaper: 15,
  planeTailTaper: 50,
  planeMeshDensity: 128,
  hdrExposure: 60,
  lightIntensity: 450,
  lightColor: '#ffffff',
  lightAngle: 45,
  lightDistance: 200,
  lightHeight: 350,
  cameraFov: 35,
  freeCamera: false,
  devWireframe: false,
  devNormals: false,
  devAxes: false,
  devStats: false,
  planePos: { x: 0, y: -1, z: 0 },
});

const mergeSnakeSettings = (baseSettings, overrideSettings = {}) => ({
  planeAlbedo: overrideSettings.planeAlbedo ?? overrideSettings.planeColor ?? baseSettings.planeAlbedo,
  planeRoughness: overrideSettings.planeRoughness ?? baseSettings.planeRoughness,
  planeMetalness: overrideSettings.planeMetalness ?? baseSettings.planeMetalness,
  planeHeight: overrideSettings.planeHeight ?? baseSettings.planeHeight,
  planeRadius: overrideSettings.planeRadius ?? baseSettings.planeRadius,
  planeTrailSpan: overrideSettings.planeTrailSpan ?? baseSettings.planeTrailSpan,
  planeTrailPersistence: overrideSettings.planeTrailPersistence ?? baseSettings.planeTrailPersistence,
  planeSharpness: overrideSettings.planeSharpness ?? baseSettings.planeSharpness,
  planeHeadTaper: overrideSettings.planeHeadTaper ?? baseSettings.planeHeadTaper,
  planeTailTaper: overrideSettings.planeTailTaper ?? baseSettings.planeTailTaper,
  planeMeshDensity: overrideSettings.planeMeshDensity ?? baseSettings.planeMeshDensity,
  hdrExposure: overrideSettings.hdrExposure ?? baseSettings.hdrExposure,
  lightIntensity: overrideSettings.lightIntensity ?? baseSettings.lightIntensity,
  lightColor: overrideSettings.lightColor ?? baseSettings.lightColor,
  lightAngle: overrideSettings.lightAngle ?? baseSettings.lightAngle,
  lightDistance: overrideSettings.lightDistance ?? baseSettings.lightDistance,
  lightHeight: overrideSettings.lightHeight ?? baseSettings.lightHeight,
  cameraFov: overrideSettings.cameraFov ?? baseSettings.cameraFov,
  freeCamera: overrideSettings.freeCamera ?? baseSettings.freeCamera,
  devWireframe: overrideSettings.devWireframe ?? baseSettings.devWireframe,
  devNormals: overrideSettings.devNormals ?? baseSettings.devNormals,
  devAxes: overrideSettings.devAxes ?? baseSettings.devAxes,
  devStats: overrideSettings.devStats ?? baseSettings.devStats,
  planePos: {
    ...baseSettings.planePos,
    ...(overrideSettings.planePos ?? {}),
  },
});

export const sanitizeSnakeSettingsForPublish = (settings = {}) => PUBLISHED_SNAKE_KEYS.reduce((accumulator, key) => {
  if (settings[key] !== undefined) {
    accumulator[key] = settings[key];
  }

  return accumulator;
}, {});

export const getPublishedSnakeSettings = () => mergeSnakeSettings(
  getBaseSnakeSettings(),
  sanitizeSnakeSettingsForPublish(publishedSnakeSettings),
);

const normalizeLegacyTrailFields = (savedSettings, defaultSettings) => {
  const trailLength = savedSettings.planeTrailLength;

  return {
    planeTrailSpan: savedSettings.planeTrailSpan ?? (
      typeof trailLength === 'number'
        ? clamp(Math.round(trailLength * 2), 8, 100)
        : defaultSettings.planeTrailSpan
    ),
    planeTrailPersistence: savedSettings.planeTrailPersistence ?? (
      typeof trailLength === 'number'
        ? clamp(trailLength, 1, 50)
        : defaultSettings.planeTrailPersistence
    ),
  };
};

export const normalizePublishedSnakeSettings = (settings = {}) => mergeSnakeSettings(
  getBaseSnakeSettings(),
  sanitizeSnakeSettingsForPublish(settings),
);

export const normalizeSnakeDraftSettings = (savedSettings = {}) => {
  const publishedSettings = getPublishedSnakeSettings();
  const {
    planeColor,
    planeAlbedo,
    planeTrailLength,
    planeTrailSpan,
    planeTrailPersistence,
    ...rest
  } = savedSettings;
  const legacyTrailFields = normalizeLegacyTrailFields(
    {
      planeTrailLength,
      planeTrailSpan,
      planeTrailPersistence,
    },
    publishedSettings,
  );

  return {
    ...mergeSnakeSettings(publishedSettings, {
      ...rest,
      planeAlbedo: planeAlbedo ?? planeColor,
    }),
    ...legacyTrailFields,
  };
};

function isLocalSnakeRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }

  return LOCAL_SNAKE_HOSTS.has(window.location.hostname);
}

function clearSnakeRuntimeStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SNAKE_SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SNAKE_SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem(PUBLISHED_SNAKE_SETTINGS_STORAGE_KEY);
}

export function readSnakeDraftSettings() {
  if (typeof window === 'undefined') {
    return null;
  }

  const saved = window.localStorage.getItem(SNAKE_SETTINGS_STORAGE_KEY)
    ?? window.localStorage.getItem(LEGACY_SNAKE_SETTINGS_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return normalizeSnakeDraftSettings(JSON.parse(saved));
  } catch (error) {
    console.error('Failed to parse snake draft settings', error);
    return null;
  }
}

function readStoredPublishedSnakeSettings() {
  if (!isLocalSnakeRuntime()) {
    return null;
  }

  const saved = window.localStorage.getItem(PUBLISHED_SNAKE_SETTINGS_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return normalizePublishedSnakeSettings(JSON.parse(saved));
  } catch (error) {
    console.error('Failed to parse published snake settings override', error);
    return null;
  }
}

export function readLivePublishedSnakeSettings() {
  if (!isLocalSnakeRuntime()) {
    return null;
  }

  const storedPublishedSettings = readStoredPublishedSnakeSettings();

  if (storedPublishedSettings) {
    return storedPublishedSettings;
  }

  const draftSettings = readSnakeDraftSettings();

  if (!draftSettings) {
    return null;
  }

  return normalizePublishedSnakeSettings(sanitizeSnakeSettingsForPublish(draftSettings));
}

function dispatchSnakeSettingsSync() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return;
  }

  window.dispatchEvent(new CustomEvent(SNAKE_SETTINGS_SYNC_EVENT));
}

export const usePublishedSnakeSettings = () => {
  const [settings, setSettings] = useState(() => readLivePublishedSnakeSettings() ?? getPublishedSnakeSettings());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (!isLocalSnakeRuntime()) {
      clearSnakeRuntimeStorage();
    }

    const syncSettings = () => {
      setSettings(readLivePublishedSnakeSettings() ?? getPublishedSnakeSettings());
    };

    const handleStorage = (event) => {
      if (
        event.key
        && event.key !== SNAKE_SETTINGS_STORAGE_KEY
        && event.key !== LEGACY_SNAKE_SETTINGS_STORAGE_KEY
        && event.key !== PUBLISHED_SNAKE_SETTINGS_STORAGE_KEY
      ) {
        return;
      }

      syncSettings();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SNAKE_SETTINGS_SYNC_EVENT, syncSettings);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SNAKE_SETTINGS_SYNC_EVENT, syncSettings);
    };
  }, []);

  return {
    settings,
  };
};

export const useSnakeDraftSettings = () => {
  const [settings, setSettings] = useState(() => readSnakeDraftSettings() ?? getPublishedSnakeSettings());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SNAKE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.removeItem(LEGACY_SNAKE_SETTINGS_STORAGE_KEY);

    if (isLocalSnakeRuntime()) {
      window.localStorage.setItem(
        PUBLISHED_SNAKE_SETTINGS_STORAGE_KEY,
        JSON.stringify(sanitizeSnakeSettingsForPublish(settings)),
      );
      dispatchSnakeSettingsSync();
    }
  }, [settings]);

  return {
    settings,
    setSettings,
  };
};

export const useSnakeSettings = useSnakeDraftSettings;
