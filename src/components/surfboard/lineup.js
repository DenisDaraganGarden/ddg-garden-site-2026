import { coastCoordinates, coastPoint, shorePosition } from '../../terrain/terrainModel.js';
import { surfRibbonBreakLine } from '../effects/water/surfRibbons.js';

// Where a surfer waits for a wave: in the lineup, a few metres seaward of
// where the waves break, lying on the board with the nose to the shore. That
// is the automatic checkpoint. It reads the break line off the same holder the
// board rides (surfRibbons.js), for a wave of the mean height, so the board
// waits where the drawn breakers will actually rise under it.

// Metres seaward of the break line, along the crest normal: the face is
// already steep here, and the wave has not yet thrown its lip.
export const LINEUP_SEAWARD = 5;
// The crest's ends taper off (the loft's end taper is 6%): wait inside them.
const CREST_MARGIN = 0.1;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// The coast s of a world point, for choosing where along the crest to wait.
export const surfAlongAt = (holder, x, z) => coastCoordinates(x, z, holder.coast.definition).s;

// holder: the createSurfRibbons() holder as BreakingWaves last wrote it;
// along: coast s (m) to wait at, clamped into the crest. Returns
// { x, z, yaw (rad, three.js rotation.y: the nose along the crest normal to
// the shore), s, q (coast q, m) }, or null while no surf is drawn.
export function surfLineup(holder, along, seaward = LINEUP_SEAWARD) {
  const coast = holder?.coast;
  if (!holder?.count || !holder.settings || !coast?.definition) return null;
  const { definition, along0, length } = coast;
  const s = clamp(along, along0 + CREST_MARGIN * length, along0 + (1 - CREST_MARGIN) * length);
  const { line, mean } = surfRibbonBreakLine(coast, holder.settings.surfHeight, holder.settings);
  // The loft keeps only the refraction share of the line's bends (the rest is
  // the mean), exactly as BreakingWaves places a section's crest.
  const refraction = holder.loft.refraction;
  const breakAt = (sAlong) => {
    const f = clamp((sAlong - along0) / length, 0, 1) * (line.length - 1);
    const i = Math.min(Math.floor(f), line.length - 2);
    return refraction * (line[i] + (line[i + 1] - line[i]) * (f - i)) + (1 - refraction) * mean;
  };
  const q = breakAt(s) - seaward;
  const { x, z } = coastPoint(q, s, definition);
  // The crest normal toward the shore, bent by the shore and the break line:
  // BreakingWaves' fwd = (land − k·along)/√(1+k²), k = du/ds of the crest.
  const k = (shorePosition(s + 1, definition) + breakAt(s + 1) - shorePosition(s - 1, definition) - breakAt(s - 1)) / 2;
  const fx = definition.landX - k * definition.alongX;
  const fz = definition.landZ - k * definition.alongZ;
  return { x, z, yaw: Math.atan2(fx, fz), s, q };
}
