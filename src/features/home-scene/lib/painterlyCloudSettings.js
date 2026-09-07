const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
};

export const DEFAULT_PAINTERLY_CLOUD_SETTINGS = Object.freeze({
  painterlyCloudsEnabled: true,
  painterlyCloudSeed: 7,
  painterlyCloudCoverage: 0.65,
  painterlyCloudDensity: 1.1,
  painterlyCloudAltitude: 1400,
  painterlyCloudHeight: 1,
  painterlyCloudScale: 1,
  painterlyCloudWindSpeed: 12,
  painterlyCloudWindDirection: 35,
  painterlyCloudShadowStrength: 0.82,
  painterlyCloudShadowSoftness: 0.35,
  painterlyCloudHaze: 0.3,
  painterlyCloudRays: 0.35,
  painterlyCloudQuality: 'auto',
});

// These deliberately exclude sun, HDRI, camera and wind: applying weather
// shape must never move an authored frame or relight it behind the author's back.
export const PAINTERLY_CLOUD_PRESETS = Object.freeze({
  clear: Object.freeze({ painterlyCloudCoverage: .5, painterlyCloudDensity: .9, painterlyCloudHeight: 1 }),
  sunset: Object.freeze({ painterlyCloudCoverage: .62, painterlyCloudDensity: 1.35, painterlyCloudHeight: 1 }),
  storm: Object.freeze({ painterlyCloudCoverage: .94, painterlyCloudDensity: 2.2, painterlyCloudHeight: 1.25 }),
  broken: Object.freeze({ painterlyCloudCoverage: .35, painterlyCloudDensity: .8, painterlyCloudHeight: .6 }),
});

const QUALITIES = new Set(['auto', 'low', 'balanced', 'high']);

export const normalizePainterlyCloudSettings = (settings = {}) => ({
  painterlyCloudsEnabled: typeof settings.painterlyCloudsEnabled === 'boolean'
    ? settings.painterlyCloudsEnabled : DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudsEnabled,
  painterlyCloudSeed: Math.round(clamp(settings.painterlyCloudSeed, 1, 99, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudSeed)),
  painterlyCloudCoverage: clamp(settings.painterlyCloudCoverage, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudCoverage),
  painterlyCloudDensity: clamp(settings.painterlyCloudDensity, .2, 2.5, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudDensity),
  painterlyCloudAltitude: clamp(settings.painterlyCloudAltitude, 300, 5000, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudAltitude),
  painterlyCloudHeight: clamp(settings.painterlyCloudHeight, .2, 2, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudHeight),
  painterlyCloudScale: clamp(settings.painterlyCloudScale, .35, 2.5, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudScale),
  painterlyCloudWindSpeed: clamp(settings.painterlyCloudWindSpeed, 0, 40, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudWindSpeed),
  painterlyCloudWindDirection: clamp(settings.painterlyCloudWindDirection, 0, 360, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudWindDirection),
  painterlyCloudShadowStrength: clamp(settings.painterlyCloudShadowStrength, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudShadowStrength),
  painterlyCloudShadowSoftness: clamp(settings.painterlyCloudShadowSoftness, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudShadowSoftness),
  painterlyCloudHaze: clamp(settings.painterlyCloudHaze, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudHaze),
  painterlyCloudRays: clamp(settings.painterlyCloudRays, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRays),
  painterlyCloudQuality: QUALITIES.has(settings.painterlyCloudQuality)
    ? settings.painterlyCloudQuality : DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudQuality,
});

// The renderer only receives its compact contract. `auto` selects the safe
// desktop/mobile profile here, without writing that effective choice to scenes.
export const resolvePainterlyCloudSettings = (settings = {}, qualityProfile = {}) => {
  const normalized = normalizePainterlyCloudSettings(settings);
  const quality = normalized.painterlyCloudQuality === 'auto'
    ? (qualityProfile.isMobileDevice || qualityProfile.isLowPower ? 'low' : 'balanced')
    : normalized.painterlyCloudQuality;
  return {
    enabled: normalized.painterlyCloudsEnabled,
    seed: normalized.painterlyCloudSeed,
    coverage: normalized.painterlyCloudCoverage,
    density: normalized.painterlyCloudDensity,
    altitude: normalized.painterlyCloudAltitude,
    height: normalized.painterlyCloudHeight,
    scale: normalized.painterlyCloudScale,
    windSpeed: normalized.painterlyCloudWindSpeed,
    windDirection: normalized.painterlyCloudWindDirection,
    shadowStrength: normalized.painterlyCloudShadowStrength,
    shadowSoftness: normalized.painterlyCloudShadowSoftness,
    haze: normalized.painterlyCloudHaze,
    rays: normalized.painterlyCloudRays,
    quality,
  };
};
