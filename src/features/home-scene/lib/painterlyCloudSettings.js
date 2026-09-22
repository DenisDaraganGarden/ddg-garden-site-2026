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
  // The storm is one switch; its strength, rain and lightning adapt the same
  // procedural field. Off means every storm term is exactly zero.
  painterlyCloudStormEnabled: false,
  painterlyCloudStorm: 0.7,
  painterlyCloudRain: 0.6,
  painterlyCloudLightning: 0.5,
  // How much of the field rains (the cell threshold) and how dark those bases get.
  painterlyCloudRainCells: 0.5,
  painterlyCloudRainDarkness: 0.6,
  // Drops in front of the lens: how many, and how long and thick they streak.
  painterlyCloudRainDrops: 0.6,
  painterlyCloudRainDropSize: 1,
});

// These deliberately exclude sun, HDRI, camera and wind: applying weather
// shape must never move an authored frame or relight it behind the author's back.
export const PAINTERLY_CLOUD_PRESETS = Object.freeze({
  clear: Object.freeze({ painterlyCloudCoverage: .5, painterlyCloudDensity: .9, painterlyCloudHeight: 1, painterlyCloudStormEnabled: false }),
  sunset: Object.freeze({ painterlyCloudCoverage: .62, painterlyCloudDensity: 1.35, painterlyCloudHeight: 1, painterlyCloudStormEnabled: false }),
  storm: Object.freeze({ painterlyCloudCoverage: .94, painterlyCloudDensity: 2.2, painterlyCloudHeight: 1.25, painterlyCloudStormEnabled: true, painterlyCloudStorm: .8, painterlyCloudRain: .7, painterlyCloudLightning: .6, painterlyCloudRainCells: .65 }),
  broken: Object.freeze({ painterlyCloudCoverage: .35, painterlyCloudDensity: .8, painterlyCloudHeight: .6, painterlyCloudStormEnabled: false }),
});

const QUALITIES = new Set(['auto', 'low', 'balanced', 'high', 'ultra']);

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
  painterlyCloudStormEnabled: typeof settings.painterlyCloudStormEnabled === 'boolean'
    ? settings.painterlyCloudStormEnabled : DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudStormEnabled,
  painterlyCloudStorm: clamp(settings.painterlyCloudStorm, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudStorm),
  painterlyCloudRain: clamp(settings.painterlyCloudRain, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRain),
  painterlyCloudLightning: clamp(settings.painterlyCloudLightning, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudLightning),
  painterlyCloudRainCells: clamp(settings.painterlyCloudRainCells, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRainCells),
  painterlyCloudRainDarkness: clamp(settings.painterlyCloudRainDarkness, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRainDarkness),
  painterlyCloudRainDrops: clamp(settings.painterlyCloudRainDrops, 0, 1, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRainDrops),
  painterlyCloudRainDropSize: clamp(settings.painterlyCloudRainDropSize, 0.5, 2, DEFAULT_PAINTERLY_CLOUD_SETTINGS.painterlyCloudRainDropSize),
});

// Effective storm scalars: the switch gates every term, so an authored scene
// with the storm off renders exactly as it did before the storm existed.
export const resolveStormScalars = (settings = {}) => {
  const normalized = normalizePainterlyCloudSettings(settings);
  const on = normalized.painterlyCloudsEnabled && normalized.painterlyCloudStormEnabled;
  return {
    storm: on ? normalized.painterlyCloudStorm : 0,
    rain: on ? normalized.painterlyCloudRain * normalized.painterlyCloudStorm : 0,
    lightning: on ? normalized.painterlyCloudLightning : 0,
    rainCells: normalized.painterlyCloudRainCells,
    rainDarkness: normalized.painterlyCloudRainDarkness,
    rainDrops: normalized.painterlyCloudRainDrops,
    rainDropSize: normalized.painterlyCloudRainDropSize,
  };
};

// The renderer only receives its compact contract. `auto` selects the safe
// desktop/mobile profile here, without writing that effective choice to scenes.
export const resolvePainterlyCloudSettings = (settings = {}, qualityProfile = {}) => {
  const normalized = normalizePainterlyCloudSettings(settings);
  const small = Boolean(qualityProfile.isMobileDevice || qualityProfile.isLowPower);
  const requested = normalized.painterlyCloudQuality === 'auto' ? (small ? 'low' : 'balanced') : normalized.painterlyCloudQuality;
  // High and ultra are desktop profiles; a phone that receives an authored
  // one renders balanced, without writing that choice back into the scene.
  const quality = small && (requested === 'high' || requested === 'ultra') ? 'balanced' : requested;
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
    ...resolveStormScalars(normalized),
  };
};
