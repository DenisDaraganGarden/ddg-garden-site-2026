export const DEFAULT_SHORE_SETTINGS = Object.freeze({
  shoreEnabled: true, shoreSeed: 17, shoreCount: 36, shoreLength: 600, shoreAlong: 0,
  shoreSize: 1, shoreBackBeach: .65, shoreLogs: .4, shoreStakes: .15, shoreRings: 2,
  shoreBurial: .18, shoreBleach: .78, shoreGrain: .65, shoreBark: .28, shoreWetness: 0,
  shoreRenderDistance: 280,
});
export const SHORE_RANGES = Object.freeze({
  shoreSeed: [1, 999, 1], shoreCount: [0, 160, 1], shoreLength: [60, 4000, 10], shoreAlong: [-2000, 2000, 5],
  shoreSize: [.5, 1.7, .05], shoreBackBeach: [0, 1, .01], shoreLogs: [0, 1, .01], shoreStakes: [0, 1, .01], shoreRings: [0, 8, 1],
  shoreBurial: [0, .4, .01], shoreBleach: [0, 1, .01], shoreGrain: [0, 1, .01], shoreBark: [0, 1, .01], shoreWetness: [0, 1, .01],
  shoreRenderDistance: [40, 600, 10],
});
export function normalizeShoreSettings(source = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SHORE_SETTINGS)) {
    if (typeof fallback === 'boolean') { result[key] = typeof source[key] === 'boolean' ? source[key] : fallback; continue; }
    const [min, max, step] = SHORE_RANGES[key], number = Number(source[key] ?? fallback);
    const value = Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
    result[key] = step === 1 ? Math.round(value) : value;
  }
  return result;
}
export const shoreMaterialSettings = (s) => ({ bleach: s.shoreBleach, grain: s.shoreGrain, bark: s.shoreBark, wetness: s.shoreWetness });
