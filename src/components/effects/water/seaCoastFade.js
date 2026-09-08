import { coastBreakLine, breakLineMean } from './coastBreakLine.js';
import { coastCoordinates, coastHeight, shorePosition } from '../../../terrain/terrainModel.js';

export const SEA_CREST_LENGTH = 760;
export const SEA_BREAK_SAMPLES = 8;
const smoothstep = (a, b, value) => {
  const t = Math.min(Math.max((value - a) / Math.max(b - a, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
};

// This is the CPU twin of coastSwellFade in coastFrame.js. The product's
// shader reads the depth map, while probes use the terrain function that made
// that map. Both use the same physical break line and camera-distance fade.
export function resolveSeaBreakQ(definition, seaSettings) {
  // With no terrain there is no coast renderer or break line. With surf off
  // the visual coast shader sets its hand-over width to zero, so no line is
  // needed for the CPU contract either.
  if (!definition?.terrainEnabled || !seaSettings?.surfEnabled) return 0;
  const along0 = (definition.terrainSpitPosition ?? 0) - 430;
  const line = coastBreakLine(
    definition,
    seaSettings.surfHeight ?? 0.45,
    along0,
    SEA_CREST_LENGTH,
    SEA_BREAK_SAMPLES,
  );
  return breakLineMean(line) + (seaSettings.surfBreakDistance ?? 0) - 6;
}

export function seaCoastFadeAt(definition, seaSettings, x, z) {
  return seaCoastFadeAtBreak(definition, resolveSeaBreakQ(definition, seaSettings), x, z, seaSettings);
}

export function seaCoastFadeAtBreak(definition, breakQ, x, z, seaSettings = null) {
  if (!definition?.terrainEnabled) return 1;
  const { u, s } = coastCoordinates(x, z, definition);
  const q = u - shorePosition(s, definition);
  const depth = -coastHeight(q, s, definition);
  const handover = seaSettings?.surfEnabled === false
    ? 1
    : 1 - 0.65 * smoothstep(breakQ - 30, breakQ, q);
  const shore = smoothstep(0.05, 0.9, depth);
  const shoal = Math.min(Math.max((Math.max(depth, 0.05) / 2.5) ** -0.25, 1), 1.2);
  return handover * shore * shoal;
}

export function seaCameraFadeAt(seaSettings, x, z, cameraX, cameraZ) {
  const distance = Math.hypot(x - cameraX, z - cameraZ);
  const start = Math.max(Number(seaSettings.fadeStart) || 1, 1);
  const end = Math.max(Number(seaSettings.fadeEnd) || start + 1, start + 1);
  return 1 - smoothstep(start, end, distance);
}

export function seaSurfaceFadeAt(definition, seaSettings, x, z, cameraX, cameraZ) {
  return seaCoastFadeAt(definition, seaSettings, x, z)
    * seaCameraFadeAt(seaSettings, x, z, cameraX, cameraZ);
}

export function createSeaSurfaceFade(definition, seaSettings, getCameraPosition) {
  const breakQ = resolveSeaBreakQ(definition, seaSettings);
  return (x, z) => {
    const camera = getCameraPosition();
    return seaCoastFadeAtBreak(definition, breakQ, x, z, seaSettings)
      * seaCameraFadeAt(seaSettings, x, z, camera.x, camera.z);
  };
}
