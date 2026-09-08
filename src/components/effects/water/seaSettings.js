// Published scene settings for the sea developed in the water laboratory.
// The runtime speaks the lab's short names; the scene must keep them flat and
// namespaced so they can travel through publishing and camera snapshots safely.

export const SEA_SETTINGS_DEFAULTS = Object.freeze({
  seaEnabled: true,
  seaWavelength: 11.5, seaAmplitude: 0.57, seaSteepness: 0.7, seaSpeed: 0.55,
  seaWindDirection: 94, seaSets: 0.37, seaGusts: 0.44, seaCrossWaves: 0.01,
  seaFadeStart: 260, seaFadeEnd: 2440, seaRipple: 0.63, seaRippleScale: 0.09,
  seaFoamThreshold: 0.55, seaFoamSoftness: 0.15, seaFoamLaceScale: 0.13,
  seaFoamBrightness: 0.5, seaFoamMemory: true, seaFoamLife: 7, seaFoamDeposit: 0.65,
  seaFoamWindow: 228, seaFoamDrift: 1.3, seaFoamSwirl: 0.3, seaFoamDry: 43,
  seaWindPatches: 0.65,
  seaWaterColor: '#2c7a64', seaDeepColor: '#143a40', seaBedColor: '#c4b08a',
  seaBedTurbidity: 0.5, seaCrestGlow: 0.6, seaGlint: 2.05, seaSkyReflection: 0.3,
  seaMeshRings: 152, seaMeshSegments: 104,
  seaSurfEnabled: true, seaSurfHeight: 0.45, seaSurfWidth: 9, seaSurfBreakDistance: 0,
  seaSurfBreakLength: 16, seaSurfLean: 0.29, seaSurfJet: 1.9, seaSurfLift: 0.25,
  seaSurfSheet: 0.16, seaSurfRoller: 0.5, seaSurfRollerDensity: 1, seaSurfPeel: 0.06,
  seaSurfRefraction: 0.7, seaSurfBoreLength: 14, seaSurfRunup: 6, seaSurfSpeed: 4.5,
  seaSurfPeriod: 9, seaSurfSets: 0.5, seaSurfFreeze: false, seaSurfPhase: 0.5,
  seaSwashFilm: 0.03,
});

export const SEA_RANGES = Object.freeze({
  seaWavelength: [3, 40, 0.5], seaAmplitude: [0, 1.6, 0.01], seaSteepness: [0, 0.8, 0.01], seaSpeed: [0, 2.5, 0.05], seaWindDirection: [0, 360, 1], seaSets: [0, 1, 0.01], seaGusts: [0, 1, 0.01], seaCrossWaves: [0, 1, 0.01], seaFadeStart: [20, 1500, 10], seaFadeEnd: [40, 3000, 10], seaRipple: [0, 1, 0.01], seaRippleScale: [0.01, 0.3, 0.005],
  seaFoamThreshold: [0, 0.95, 0.01], seaFoamSoftness: [0.02, 0.4, 0.01], seaFoamLaceScale: [0.03, 0.6, 0.01], seaFoamBrightness: [0.2, 2, 0.05], seaFoamLife: [1, 20, 0.5], seaFoamDeposit: [0.2, 1.5, 0.05], seaFoamWindow: [32, 400, 4], seaFoamDrift: [0, 2, 0.05], seaFoamSwirl: [0, 1.5, 0.05], seaFoamDry: [5, 120, 1], seaWindPatches: [0, 1, 0.05], seaSwashFilm: [0, 0.08, 0.005],
  seaBedTurbidity: [0, 1, 0.05], seaCrestGlow: [0, 2, 0.05], seaGlint: [0, 3, 0.05], seaSkyReflection: [0, 3, 0.05], seaMeshRings: [32, 192, 8], seaMeshSegments: [48, 256, 8],
  seaSurfHeight: [0.2, 3, 0.05], seaSurfWidth: [3, 24, 0.5], seaSurfBreakDistance: [-20, 40, 0.5], seaSurfBreakLength: [4, 40, 1], seaSurfLean: [0, 1, 0.01], seaSurfJet: [0.3, 4, 0.05], seaSurfLift: [0, 2, 0.05], seaSurfSheet: [0.04, 0.4, 0.01], seaSurfRoller: [0, 1.2, 0.02], seaSurfRollerDensity: [0.2, 2.5, 0.05], seaSurfPeel: [0, 0.6, 0.01], seaSurfRefraction: [0, 1, 0.01], seaSurfBoreLength: [3, 40, 1], seaSurfRunup: [0, 12, 1], seaSurfSpeed: [1, 10, 0.1], seaSurfPeriod: [3, 20, 0.5], seaSurfSets: [0, 1, 0.01], seaSurfPhase: [0, 1, 0.01],
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback, range) => {
  const next = Number(value);
  return Number.isFinite(next) ? clamp(next, range[0], range[1]) : fallback;
};
const integer = (value, fallback, range) => Math.round(number(value, fallback, range));
const boolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function normalizeSeaSettings(flat = {}) {
  const normalized = {};
  for (const [key, fallback] of Object.entries(SEA_SETTINGS_DEFAULTS)) {
    if (typeof fallback === 'boolean') normalized[key] = boolean(flat[key], fallback);
    else if (typeof fallback === 'string') normalized[key] = color(flat[key], fallback);
    else if (key === 'seaMeshRings' || key === 'seaMeshSegments') normalized[key] = integer(flat[key], fallback, SEA_RANGES[key]);
    else normalized[key] = number(flat[key], fallback, SEA_RANGES[key]);
  }
  // The distant fade must remain ordered, otherwise smoothstep is undefined.
  normalized.seaFadeEnd = Math.max(normalized.seaFadeEnd, normalized.seaFadeStart + 20);
  return normalized;
}

export function resolveSeaSettings(flat = {}) {
  const sea = normalizeSeaSettings(flat);
  return {
    enabled: sea.seaEnabled,
    wavelength: sea.seaWavelength, amplitude: sea.seaAmplitude, steepness: sea.seaSteepness, speed: sea.seaSpeed,
    windDirection: sea.seaWindDirection, sets: sea.seaSets, gusts: sea.seaGusts, crossWaves: sea.seaCrossWaves,
    fadeStart: sea.seaFadeStart, fadeEnd: sea.seaFadeEnd, ripple: sea.seaRipple, rippleScale: sea.seaRippleScale,
    foamThreshold: sea.seaFoamThreshold, foamSoftness: sea.seaFoamSoftness, laceScale: sea.seaFoamLaceScale, foamBrightness: sea.seaFoamBrightness,
    foamMemory: sea.seaFoamMemory, foamLife: sea.seaFoamLife, foamDeposit: sea.seaFoamDeposit, foamWindow: sea.seaFoamWindow, foamDrift: sea.seaFoamDrift, foamSwirl: sea.seaFoamSwirl, foamDry: sea.seaFoamDry, windPatches: sea.seaWindPatches,
    waterColor: sea.seaWaterColor, deepColor: sea.seaDeepColor, bedColor: sea.seaBedColor, bedTurbidity: sea.seaBedTurbidity, crestGlow: sea.seaCrestGlow, glint: sea.seaGlint, skyReflection: sea.seaSkyReflection,
    meshRings: sea.seaMeshRings, meshSegments: sea.seaMeshSegments,
    surfEnabled: sea.seaSurfEnabled, surfHeight: sea.seaSurfHeight, surfWidth: sea.seaSurfWidth, surfBreakDistance: sea.seaSurfBreakDistance, surfBreakLength: sea.seaSurfBreakLength, surfLean: sea.seaSurfLean, surfJet: sea.seaSurfJet, surfLift: sea.seaSurfLift, surfSheet: sea.seaSurfSheet, surfRoller: sea.seaSurfRoller, surfRollerDensity: sea.seaSurfRollerDensity, surfPeel: sea.seaSurfPeel, surfRefraction: sea.seaSurfRefraction, surfBoreLength: sea.seaSurfBoreLength, surfRunup: sea.seaSurfRunup, surfSpeed: sea.seaSurfSpeed, surfPeriod: sea.seaSurfPeriod, surfSets: sea.seaSurfSets, surfFreeze: sea.seaSurfFreeze, surfPhase: sea.seaSurfPhase, swashFilm: sea.seaSwashFilm,
  };
}

// Autogenerated quality chooses a cheaper radial mesh without changing the
// authored flat settings. This resolved form is also the LOD contract for the
// CPU sampler and surface-bound assets, so keep it independent of React.
export function resolveEffectiveSeaSettings(settings, qualityProfile = null) {
  const cap = Math.max(Number(qualityProfile?.waterMeshDensityCap) || settings.meshSegments, 48);
  const ratio = Math.min(1, cap / Math.max(settings.meshSegments, 1));
  return {
    ...settings,
    meshSegments: Math.max(48, Math.round(settings.meshSegments * ratio / 8) * 8),
    meshRings: Math.max(32, Math.round(settings.meshRings * ratio / 8) * 8),
  };
}
