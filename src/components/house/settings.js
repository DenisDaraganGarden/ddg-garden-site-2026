import { HOUSE_COLORS, HOUSE_DEFAULTS, HOUSE_RANGES } from './beachHouse.js';
import { CAMP_COLORS } from './surfCamp.js';

// Bikini Point as scene settings: the house, its shed and the surfers'
// things, flat keys like every object's. Off by default, so a scene only has
// it once it is switched on in the editor. Global to the scene, not per
// camera: a house that moved with the camera would be no house.
const title = (word) => word[0].toUpperCase() + word.slice(1);

// Scene key → the builder's own name (beachHouse.js, surfCamp.js).
export const HOUSE_SHAPE = Object.freeze({
  houseWidth: 'houseWidth', houseLength: 'houseLength', houseFloorHeight: 'floorHeight', houseRoofPitch: 'roofPitch',
  housePorchDepth: 'porchDepth', houseWeather: 'weather', houseDamage: 'damage', houseSag: 'sag', houseSeed: 'seed',
});
export const HOUSE_PAINT = Object.freeze(Object.fromEntries(Object.keys(HOUSE_COLORS).map((role) => [`house${title(role)}Color`, role])));
export const CAMP_PAINT = Object.freeze(Object.fromEntries(Object.keys(CAMP_COLORS).map((thing) => [`houseCamp${title(thing)}Color`, thing])));

export const DEFAULT_HOUSE_SETTINGS = Object.freeze({
  houseEnabled: false,
  // Where it stands: the house's middle on the ground, turned (degrees).
  houseX: 0, houseZ: 0, houseHeading: 0,
  ...Object.fromEntries(Object.entries(HOUSE_SHAPE).map(([key, name]) => [key, HOUSE_DEFAULTS[name]])),
  ...Object.fromEntries(Object.entries(HOUSE_PAINT).map(([key, role]) => [key, HOUSE_COLORS[role]])),
  houseShed: true,
  houseLamps: 0.8, houseGarlands: 0.9,
  // The surfers' things: whether they are out, how they are thrown about,
  // the wind in the cloth, and their colours turned round the hue circle
  // and faded by the sun.
  houseCamp: true, houseCampSeed: 79, houseCampWind: 1, houseCampHue: 0, houseCampFade: 0,
  ...Object.fromEntries(Object.entries(CAMP_PAINT).map(([key, thing]) => [key, CAMP_COLORS[thing]])),
});

export const HOUSE_SETTING_RANGES = Object.freeze({
  houseX: [-5000, 5000, 0.1], houseZ: [-5000, 5000, 0.1], houseHeading: [-180, 180, 1],
  ...Object.fromEntries(Object.entries(HOUSE_SHAPE).filter(([, name]) => HOUSE_RANGES[name]).map(([key, name]) => [key, HOUSE_RANGES[name]])),
  houseSeed: [1, 99, 1],
  houseLamps: [0, 1, 0.01], houseGarlands: [0, 1, 0.01],
  houseCampSeed: [1, 99, 1], houseCampWind: [0, 2, 0.01], houseCampHue: [-180, 180, 1], houseCampFade: [0, 1, 0.01],
});
const WHOLE = new Set(['houseSeed', 'houseCampSeed']);
const COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeHouseSettings(source = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_HOUSE_SETTINGS).map(([key, fallback]) => {
    const value = source[key];
    if (typeof fallback === 'boolean') return [key, typeof value === 'boolean' ? value : fallback];
    if (typeof fallback === 'string') return [key, typeof value === 'string' && COLOR.test(value) ? value : fallback];
    const number = Number(value), [min, max] = HOUSE_SETTING_RANGES[key];
    const clamped = value != null && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    return [key, WHOLE.has(key) ? Math.round(clamped) : clamped];
  }));
}

// What the builders and models take, from the scene's settings.
export const houseShapeOf = (settings) => Object.fromEntries(Object.entries(HOUSE_SHAPE).map(([key, name]) => [name, settings[key]]));
export const housePaintOf = (settings) => Object.fromEntries(Object.entries(HOUSE_PAINT).map(([key, role]) => [role, settings[key]]));
export const campPaintOf = (settings) => Object.fromEntries(Object.entries(CAMP_PAINT).map(([key, thing]) => [thing, settings[key]]));
