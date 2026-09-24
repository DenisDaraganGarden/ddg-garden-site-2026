// Bikini Point as scene settings: the house, its shed and the surfers'
// things, flat keys like every object's. Off by default, so a scene only has
// it once it is switched on in the editor. Global to the scene, not per
// camera: a house that moved with the camera would be no house.
// Plain data only: the editor server reads the keys at its start.

// The builder's own numbers (beachHouse.js).
export const HOUSE_DEFAULTS = Object.freeze({
  houseWidth: 6, // the gable end, m
  houseLength: 8.4, // along the ridge, m
  floorHeight: 1.44, // floor and porch above the sand: the stilts, m
  roofPitch: 38, // degrees
  porchDepth: 2.2, // m
  // Age as Denis set it (2026-09-24): lived in, a few boards gone, settled hard.
  weather: 0.35, // streaks, faded and peeling paint, rust (the material's)
  damage: 0.29, // boards gone, snapped or hanging, holes, planks on the sand
  sag: 0.93, // settling, lean, a swaybacked ridge, a drooping porch
  seed: 79, // the hand-made unevenness, and which boards the years pick
});
export const HOUSE_RANGES = Object.freeze({
  houseWidth: [5, 8, 0.1],
  houseLength: [6.5, 11, 0.1],
  floorHeight: [0.6, 2.4, 0.02],
  roofPitch: [22, 50, 1],
  porchDepth: [1.5, 3, 0.05],
  weather: [0, 1, 0.01],
  damage: [0, 1, 0.01],
  sag: [0, 1, 0.01],
});

// One colour per finish; the textures are tinted by it. Denis's palette from
// the lab (2026-09-24): pale sandy boards, grey paint, near-black stilts.
export const HOUSE_COLORS = Object.freeze({
  siding: '#c2ab91', // clapboard
  shakes: '#b9b0a5', // the lean-to's cedar shakes
  trim: '#95948b', // posts, rails, stairs, casings: the paint
  deck: '#8b867a', // porch boards
  wood: '#2c2a28', // stilts, skirting, the shed's frame
  roof: '#585654', // asphalt shingles
  metal: '#9b8e82', // corrugated iron
  glass: '#494e53',
  door: '#7f7c7a',
  awning: '#083a29', // the Bahama shutters
  shedWall: '#7fbcb0', // the turquoise shed
  shedRoof: '#88775f',
  rope: '#cdb991',
  unit: '#dcdbd5', // the air conditioner, the meter box
  void: '#534e44', // where boards and panes are gone
  lamp: '#ffe2b0', // lantern and bulb glass, lit
});

// The colours one can pick for the camp's painted things (the boards, rings
// and signs keep their own); every colour of it can also be turned round the
// hue circle and faded by the sun (SurfCampModel.jsx).
export const CAMP_COLORS = Object.freeze({
  chairs: '#a3291f', hammock: '#e9dfc8', curtain: '#f59f55', flags: '#c62f28', machine: '#e8692e', machineSide: '#5fb7b0',
});

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
