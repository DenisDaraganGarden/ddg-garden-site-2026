export const DEFAULT_TANKER_SETTINGS = Object.freeze({
  tankerVisible: true, tankerX: -1450, tankerZ: -820,
  tankerBearing: 150, tankerSpeed: 7, tankerTravel: true,
  tankerRouteLength: 8000, tankerSeaState: 0.35,
  tankerWear: 0.45, tankerWetness: 0.6, tankerRoughness: 0.65,
  tankerWake: true,
});
const ranges = {
  tankerX: [-8000, 8000], tankerZ: [-8000, 8000], tankerBearing: [0, 360],
  tankerSpeed: [0, 14], tankerRouteLength: [500, 16000], tankerSeaState: [0, 1],
  tankerWear: [0, 1], tankerWetness: [0, 1], tankerRoughness: [0.1, 1],
};
export function normalizeTankerSettings(source = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_TANKER_SETTINGS).map(([key, fallback]) => {
    const value = source[key];
    if (typeof fallback === 'boolean') return [key, typeof value === 'boolean' ? value : fallback];
    const number = Number(value), [min, max] = ranges[key];
    return [key, value != null && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback];
  }));
}
