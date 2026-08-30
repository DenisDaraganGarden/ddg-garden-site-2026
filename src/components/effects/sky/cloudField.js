// A deterministic cloud mask sampled on the unit sphere.
//
// This is deliberately CPU-side and texture-free: buildSkyLut evaluates it
// only when an atmosphere setting changes, then the existing equirectangular
// texture becomes the single source for the visible sky, water and PMREM. The
// field is three-dimensional so the azimuth wrap is seamless by construction.

const DEG = Math.PI / 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

const PRESETS = Object.freeze({
  'clear-cumulus': Object.freeze({
    seed: 117,
    lowAmount: 1,
    highAmount: 0,
    deckAmount: 0,
    lowFrequency: 5.4,
    highFrequency: 8.2,
    lowThreshold: 0.61,
    highThreshold: 0.68,
    topMin: 0.08,
    topMax: 0.48,
    edgeSoftness: 0.18,
    sunBank: 0.08,
    shadowDepth: 0.48,
    silverLining: 0.56,
  }),
  'warm-veil': Object.freeze({
    seed: 263,
    lowAmount: 0.42,
    highAmount: 0.82,
    deckAmount: 0,
    lowFrequency: 4.1,
    highFrequency: 6.8,
    lowThreshold: 0.63,
    highThreshold: 0.57,
    topMin: 0.12,
    topMax: 0.56,
    edgeSoftness: 0.16,
    sunBank: 0.14,
    shadowDepth: 0.38,
    silverLining: 0.72,
  }),
  'red-horizon': Object.freeze({
    seed: 419,
    lowAmount: 1,
    highAmount: 0.24,
    deckAmount: 0,
    lowFrequency: 4.6,
    highFrequency: 7.4,
    lowThreshold: 0.56,
    highThreshold: 0.65,
    topMin: 0.07,
    topMax: 0.4,
    edgeSoftness: 0.16,
    sunBank: 0.28,
    shadowDepth: 0.56,
    silverLining: 0.92,
  }),
  'storm-deck': Object.freeze({
    seed: 701,
    lowAmount: 0.82,
    highAmount: 0.45,
    deckAmount: 0.88,
    lowFrequency: 3.3,
    highFrequency: 5.1,
    lowThreshold: 0.49,
    highThreshold: 0.53,
    topMin: 0.2,
    topMax: 0.72,
    edgeSoftness: 0.2,
    sunBank: 0.2,
    shadowDepth: 0.74,
    silverLining: 0.3,
  }),
});

export const CLOUD_PRESET_VALUES = Object.freeze(Object.keys(PRESETS));
export const DEFAULT_CLOUD_PRESET = 'clear-cumulus';

const hash3 = (x, y, z, seed) => {
  let h = Math.imul(x, 374761393);
  h = (h + Math.imul(y, 668265263)) | 0;
  h = (h + Math.imul(z, 2147483647)) | 0;
  h = (h + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

const gradientDot = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : ((h === 12 || h === 14) ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const simplexNoise3 = (x, y, z, seed) => {
  const skew = (x + y + z) / 3;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);
  const k = Math.floor(z + skew);
  const unskew = (i + j + k) / 6;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);
  const z0 = z - (k - unskew);

  let i1;
  let j1;
  let k1;
  let i2;
  let j2;
  let k2;
  if (x0 >= y0) {
    if (y0 >= z0) {
      [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
    } else if (x0 >= z0) {
      [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
    } else {
      [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    }
  } else if (y0 < z0) {
    [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
  } else if (x0 < z0) {
    [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
  } else {
    [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
  }

  const x1 = x0 - i1 + 1 / 6;
  const y1 = y0 - j1 + 1 / 6;
  const z1 = z0 - k1 + 1 / 6;
  const x2 = x0 - i2 + 1 / 3;
  const y2 = y0 - j2 + 1 / 3;
  const z2 = z0 - k2 + 1 / 3;
  const x3 = x0 - 0.5;
  const y3 = y0 - 0.5;
  const z3 = z0 - 0.5;

  const corner = (cx, cy, cz, ox, oy, oz) => {
    let influence = 0.6 - cx * cx - cy * cy - cz * cz;
    if (influence <= 0) return 0;
    influence *= influence;
    return influence * influence * gradientDot(hash3(i + ox, j + oy, k + oz, seed), cx, cy, cz);
  };

  const value = 32 * (
    corner(x0, y0, z0, 0, 0, 0)
    + corner(x1, y1, z1, i1, j1, k1)
    + corner(x2, y2, z2, i2, j2, k2)
    + corner(x3, y3, z3, 1, 1, 1)
  );
  return clamp(value * 0.5 + 0.5, 0, 1);
};

const fbm3 = (x, y, z, seed, octaves = 4) => {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += simplexNoise3(
      x * frequency,
      y * frequency,
      z * frequency,
      seed + octave * 101,
    ) * amplitude;
    normalizer += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }

  return normalizer > 0 ? sum / normalizer : 0;
};

const normalizeDirection = (direction, fallback = [0, 0.3, 1]) => {
  const x = finite(direction?.[0], fallback[0]);
  const y = finite(direction?.[1], fallback[1]);
  const z = finite(direction?.[2], fallback[2]);
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

export function resolveCloudState(state = {}) {
  const cloudPreset = CLOUD_PRESET_VALUES.includes(state.cloudPreset)
    ? state.cloudPreset
    : DEFAULT_CLOUD_PRESET;

  return {
    resolved: true,
    cloudPreset,
    preset: PRESETS[cloudPreset],
    cover: clamp(finite(state.cloudCover, 0), 0, 1),
    horizon: clamp(finite(state.cloudHorizon, 0.38), 0, 1),
    density: clamp(finite(state.cloudDensity, 0.62), 0, 1),
    scale: clamp(finite(state.cloudScale, 1), 0.5, 4),
    sunOcclusion: clamp(finite(state.cloudSunOcclusion, 0.72), 0, 1),
    keyDirection: normalizeDirection(state.keyDirection),
  };
}

const clearSample = Object.freeze({ opacity: 0, thickness: 0, highRatio: 0 });

export function sampleCloudField(direction, state = {}) {
  const cloud = state.resolved ? state : resolveCloudState(state);
  if (cloud.cover <= 0.0001) {
    return clearSample;
  }

  const [x, y, z] = normalizeDirection(direction);
  if (y < -0.035) {
    return clearSample;
  }

  const { preset } = cloud;
  const activation = smoothstep(0.005, 0.09, cloud.cover);
  const lowFrequency = preset.lowFrequency * cloud.scale;
  const highFrequency = preset.highFrequency * cloud.scale;
  const top = mix(preset.topMin, preset.topMax, cloud.horizon);

  const keyDot = clamp(
    x * cloud.keyDirection[0] + y * cloud.keyDirection[1] + z * cloud.keyDirection[2],
    -1,
    1,
  );
  const sunBankMask = smoothstep(Math.cos(23 * DEG), Math.cos(5 * DEG), keyDot);

  // Whatever the tower does, the low deck's envelope closes at top * 1.42, and
  // above that line every octave below is multiplied by an exact zero. Two
  // thirds of the table sits up there. The billow survives the skip only
  // inside the sun's 23-degree bank, because that is the one other term it
  // feeds - outside it the mask is already zero.
  const lowReaches = y < top * 1.42;
  let macro = 0;
  let billow = 0;

  if (lowReaches || sunBankMask > 0) {
    const billowNoise = fbm3(
      x * lowFrequency * 2.15 - 5.2,
      y * lowFrequency * 2.8 + 8.4,
      z * lowFrequency * 2.15 + 1.9,
      preset.seed + 43,
      3,
    );
    billow = 1 - Math.abs(billowNoise * 2 - 1);
  }

  if (lowReaches) {
    const warp = fbm3(
      x * lowFrequency * 0.72 + 11.3,
      y * lowFrequency * 0.9 - 7.1,
      z * lowFrequency * 0.72 + 3.7,
      preset.seed + 17,
      3,
    ) - 0.5;

    macro = fbm3(
      x * lowFrequency + warp * 0.8,
      y * lowFrequency * 1.72 - warp * 0.35,
      z * lowFrequency - warp * 0.65,
      preset.seed,
      4,
    );
  }

  const sunBank = sunBankMask
    * cloud.sunOcclusion
    * preset.sunBank
    * (0.62 + billow * 0.38);

  const lowField = macro * 0.72 + billow * 0.28 + sunBank;
  const tower = smoothstep(0.5, 0.79, macro);
  const lowerFade = smoothstep(-0.025, 0.025, y);
  const upperStart = top * mix(0.58, 0.88, tower);
  const upperEnd = top * mix(0.92, 1.42, tower);
  const lowEnvelope = lowReaches
    ? lowerFade * (1 - smoothstep(upperStart, upperEnd, y))
    : 0;
  const lowThreshold = preset.lowThreshold
    + (1 - cloud.density) * 0.14
    - cloud.cover * 0.21;
  const lowOpacity = lowEnvelope === 0
    ? 0
    : smoothstep(
      lowThreshold,
      lowThreshold + preset.edgeSoftness,
      lowField,
    ) * lowEnvelope * preset.lowAmount * activation;

  let highNoise = 0.5;
  let highOpacity = 0;
  if (preset.highAmount > 0.01 && y > 0.045 && y < 0.99) {
    const highWarp = fbm3(
      x * highFrequency * 0.42 + 2.3,
      y * highFrequency * 1.6 + 6.5,
      z * highFrequency * 0.42 - 9.1,
      preset.seed + 79,
      3,
    );
    highNoise = fbm3(
      x * highFrequency * 0.58 + highWarp * 0.35,
      y * highFrequency * 3.4 - 3.4,
      z * highFrequency * 0.58 - highWarp * 0.22,
      preset.seed + 131,
      4,
    );
    const streak = 0.5 + 0.5 * Math.sin(
      y * highFrequency * 14.5
        + (x * 0.72 + z * 1.06) * highFrequency * 1.4
        + highWarp * 5.2,
    );
    const highField = highNoise * 0.7 + streak * 0.3 + sunBank * 0.45;
    const highEnvelope = smoothstep(0.045, 0.16, y) * (1 - smoothstep(0.78, 0.99, y));
    const highThreshold = preset.highThreshold
      + (1 - cloud.density) * 0.12
      - cloud.cover * 0.16;
    highOpacity = smoothstep(
      highThreshold,
      highThreshold + preset.edgeSoftness * 1.25,
      highField,
    ) * highEnvelope * preset.highAmount * activation;
  }

  let deckField = 0.5;
  let deckOpacity = 0;
  if (preset.deckAmount > 0.01 && y > -0.02 && y < 1) {
    const deckNoise = fbm3(
      x * cloud.scale * 1.25 - 4.1,
      y * cloud.scale * 0.52 + 2.8,
      z * cloud.scale * 1.25 + 7.6,
      preset.seed + 211,
      4,
    );
    const deckEnvelope = smoothstep(-0.02, 0.08, y) * (1 - smoothstep(0.88, 1, y));
    const deckThreshold = 0.59 + (1 - cloud.density) * 0.1 - cloud.cover * 0.24;
    deckField = deckNoise + sunBank * preset.deckAmount * 1.2;
    deckOpacity = smoothstep(deckThreshold, deckThreshold + 0.22, deckField)
      * deckEnvelope * preset.deckAmount * activation;
  }

  const opacity = clamp(
    1 - (1 - lowOpacity) * (1 - highOpacity) * (1 - deckOpacity),
    0,
    1,
  );
  const lowThickness = lowOpacity * smoothstep(lowThreshold + 0.01, 0.92, lowField);
  const highThickness = highOpacity * (0.22 + highNoise * 0.34);
  const deckThickness = deckOpacity * (0.62 + deckField * 0.28);
  const thickness = clamp(
    1 - (1 - lowThickness) * (1 - highThickness) * (1 - deckThickness),
    0,
    1,
  );

  return {
    opacity,
    thickness,
    highRatio: opacity > 1e-5 ? clamp(highOpacity / opacity, 0, 1) : 0,
  };
}

export function solveCloudSunVisibility(direction, state = {}) {
  const cloud = state.resolved ? state : resolveCloudState(state);
  const sample = sampleCloudField(direction, cloud);
  // Dense cloud bodies extinguish the beam more efficiently than a thin veil
  // at the same silhouette opacity. Keep wispy cloud response close to linear,
  // then let optical thickness push a storm deck toward the authored 4% floor.
  const extinction = mix(0.94, 1.08, sample.thickness);
  return clamp(1 - sample.opacity * cloud.sunOcclusion * extinction, 0.04, 1);
}

export function getCloudPresetShading(state = {}) {
  const cloud = state.resolved ? state : resolveCloudState(state);
  return {
    shadowDepth: cloud.preset.shadowDepth,
    silverLining: cloud.preset.silverLining,
  };
}
