// Named sea states alter motion, surf and foam only. Colour, lighting, optics,
// terrain, wind bearing and mesh budget deliberately remain authored.
export const SEA_STATE_IDS = Object.freeze(['calm', 'breeze', 'rough', 'storm']);
export const SEA_STATE_CUSTOM = 'custom';

export const SEA_STATE_LABELS = Object.freeze({
  ru: Object.freeze({ label: 'Состояние моря', custom: 'Свои', calm: 'Штиль', breeze: 'Бриз', rough: 'Волнение', storm: 'Шторм' }),
  en: Object.freeze({ label: 'Sea state', custom: 'Custom', calm: 'Calm', breeze: 'Breeze', rough: 'Swell', storm: 'Storm' }),
});

const state = (values) => Object.freeze({ surfEnabled: true, surfFreeze: false, foamMemory: true, ...values });

export const SEA_STATE_PRESETS = Object.freeze({
  calm: state({ wavelength: 15, amplitude: 0.09, steepness: 0.16, speed: 0.22, sets: 0.12, gusts: 0.08, crossWaves: 0.02, ripple: 0.2, rippleScale: 0.07, windPatches: 0.95, foamThreshold: 0.3, foamSoftness: 0.08, foamLife: 3, foamDeposit: 0.25, foamDrift: 0.2, foamSwirl: 0.04, foamDry: 28, swashFilm: 0.01, surfHeight: 0.2, surfWidth: 4, surfBreakLength: 6, surfLean: 0.1, surfJet: 0.5, surfLift: 0.05, surfSheet: 0.06, surfRoller: 0.08, surfRollerDensity: 0.35, surfPeel: 0.01, surfRefraction: 0.35, surfBoreLength: 4, surfRunup: 1, surfSpeed: 1.6, surfPeriod: 12, surfSets: 0.12 }),
  // Current laboratory balance. Applying this state preserves its tone
  // because no look, lighting, terrain or wind-direction key is present here.
  breeze: state({ wavelength: 11.5, amplitude: 0.57, steepness: 0.7, speed: 0.55, sets: 0.37, gusts: 0.44, crossWaves: 0.01, ripple: 0.63, rippleScale: 0.09, windPatches: 0.65, foamThreshold: 0.55, foamSoftness: 0.15, foamLife: 7, foamDeposit: 0.65, foamDrift: 1.3, foamSwirl: 0.3, foamDry: 43, swashFilm: 0.03, surfHeight: 0.45, surfWidth: 9, surfBreakLength: 16, surfLean: 0.29, surfJet: 1.9, surfLift: 0.25, surfSheet: 0.16, surfRoller: 0.5, surfRollerDensity: 1, surfPeel: 0.06, surfRefraction: 0.7, surfBoreLength: 14, surfRunup: 6, surfSpeed: 4.5, surfPeriod: 9, surfSets: 0.5 }),
  rough: state({ wavelength: 12, amplitude: 0.8, steepness: 0.76, speed: 0.65, sets: 0.62, gusts: 0.65, crossWaves: 0.22, ripple: 0.75, rippleScale: 0.11, windPatches: 0.5, foamThreshold: 0.68, foamSoftness: 0.2, foamLife: 10, foamDeposit: 0.9, foamDrift: 1.55, foamSwirl: 0.55, foamDry: 55, swashFilm: 0.045, surfHeight: 0.85, surfWidth: 13, surfBreakLength: 24, surfLean: 0.42, surfJet: 2.45, surfLift: 0.48, surfSheet: 0.22, surfRoller: 0.75, surfRollerDensity: 1.35, surfPeel: 0.18, surfRefraction: 0.78, surfBoreLength: 22, surfRunup: 8, surfSpeed: 5.8, surfPeriod: 7, surfSets: 0.66 }),
  storm: state({ wavelength: 16, amplitude: 1.2, steepness: 0.8, speed: 0.75, sets: 0.82, gusts: 0.9, crossWaves: 0.46, ripple: 0.9, rippleScale: 0.14, windPatches: 0.25, foamThreshold: 0.8, foamSoftness: 0.27, foamLife: 14, foamDeposit: 1.2, foamDrift: 1.9, foamSwirl: 0.9, foamDry: 70, swashFilm: 0.06, surfHeight: 1.35, surfWidth: 18, surfBreakLength: 32, surfLean: 0.58, surfJet: 3.2, surfLift: 0.78, surfSheet: 0.3, surfRoller: 1.05, surfRollerDensity: 1.8, surfPeel: 0.35, surfRefraction: 0.86, surfBoreLength: 30, surfRunup: 11, surfSpeed: 7.4, surfPeriod: 5.5, surfSets: 0.82 }),
});

const productKey = (key) => `sea${key[0].toUpperCase()}${key.slice(1)}`;
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;

export function seaStatePatch(id, target = 'lab') {
  const preset = SEA_STATE_PRESETS[id];
  if (!preset) return null;
  if (target === 'lab') return { ...preset };
  if (target === 'product') return Object.fromEntries(Object.entries(preset).map(([key, value]) => [productKey(key), value]));
  throw new Error(`Unknown sea state target: ${target}`);
}

export function resolveSeaState(settings, target = 'lab') {
  for (const id of SEA_STATE_IDS) {
    const patch = seaStatePatch(id, target);
    if (Object.entries(patch).every(([key, value]) => same(settings?.[key], value))) return id;
  }
  return SEA_STATE_CUSTOM;
}
