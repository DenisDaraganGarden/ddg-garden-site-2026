// The shore band (ShoreWater.jsx) in chunks along the shore, each drawn with
// its rows as far apart as the open water's own cells are there (waterCell:
// distance × uCellFactor) — a metre near the camera, up to eight metres far
// along the crest, where the swell is faded to those cells anyway. Only the
// rows thin out: the half-metre columns across the beach stay, so two chunks
// share their border row vertex for vertex and never crack, whatever their
// levels. The band was one even grid, 134 thousand triangles on testy's crest.
// The half metre and the metre are the default water mesh density's; the
// density slider scales both (ShoreWater, shoreChunkRows).

export const SHORE_CHUNK = 32;
export const SHORE_ROW_STEPS = Object.freeze([1, 2, 4, 8]);

// [s0, s1] of each chunk, from sMin to sMax.
export function shoreBandChunks(sMin, sMax) {
  const chunks = [];
  for (let s0 = sMin; s0 < sMax - 1e-6; s0 += SHORE_CHUNK) chunks.push([s0, Math.min(s0 + SHORE_CHUNK, sMax)]);
  return chunks;
}

// The level (index into SHORE_ROW_STEPS) for a water cell of this size (m):
// the widest step the cell covers. It refines once the cell is well inside a
// finer level and coarsens once well outside its own, so a camera resting on a
// threshold does not flicker the rows.
export function shoreRowLevel(cell, previous = null) {
  let level = 0;
  while (level < SHORE_ROW_STEPS.length - 1 && cell >= SHORE_ROW_STEPS[level + 1]) level += 1;
  if (previous === null || level === previous) return level;
  if (level > previous) return cell >= SHORE_ROW_STEPS[previous + 1] * 1.15 ? level : previous;
  return cell < SHORE_ROW_STEPS[previous] * 0.85 ? level : previous;
}

// Row intervals for a chunk this long at this level: its first and last rows
// sit on its ends, so neighbours meet on the same row. density: the water
// mesh density factor (seaSettings.js waterMeshDensityFactor), which divides
// every step; the level is then chosen for the cell times the same factor.
export const shoreChunkRows = (length, level, density = 1) => Math.max(1, Math.round(length * density / SHORE_ROW_STEPS[level]));

// Horizontal distance (m) from a point to a chunk, in the coast's own frame:
// along-shore s and across-shore q of the point against the chunk's span.
export function shoreChunkDistance(s, q, s0, s1, qMin, qMax) {
  return Math.hypot(Math.max(s0 - s, s - s1, 0), Math.max(qMin - q, q - qMax, 0));
}
