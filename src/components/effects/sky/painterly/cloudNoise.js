import * as THREE from 'three';

// Tileable scalar fields for a ray-marched cloud. All lattice hashes wrap at
// their period, so sampling across a world tile never exposes an atlas seam.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fade = (value) => value * value * value * (value * (value * 6 - 15) + 10);
const mix = (a, b, amount) => a + (b - a) * amount;

const makeRandom = (seed) => {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const hash = (x, y, z, seed) => {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ Math.imul(z, 0x6c8e9cf5) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

const modulo = (value, period) => ((value % period) + period) % period;

const valueNoise3 = (x, y, z, period, seed) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const sample = (dx, dy, dz) => hash(modulo(ix + dx, period), modulo(iy + dy, period), modulo(iz + dz, period), seed);
  const x00 = mix(sample(0, 0, 0), sample(1, 0, 0), fx);
  const x10 = mix(sample(0, 1, 0), sample(1, 1, 0), fx);
  const x01 = mix(sample(0, 0, 1), sample(1, 0, 1), fx);
  const x11 = mix(sample(0, 1, 1), sample(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
};

const fbm = (x, y, z, cells, seed) => {
  let sum = 0;
  let weights = 0;
  for (let octave = 0; octave < cells.length; octave += 1) {
    const weight = 1 / (1 << octave);
    sum += valueNoise3(x * cells[octave], y * cells[octave], z * cells[octave], cells[octave], seed + octave * 101) * weight;
    weights += weight;
  }
  return sum / weights;
};

const worley = (x, y, z, cells, seed) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let nearest = Infinity;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const px = cx + hash(modulo(cx, cells), modulo(cy, cells), modulo(cz, cells), seed);
        const py = cy + hash(modulo(cx, cells), modulo(cy, cells), modulo(cz, cells), seed + 29);
        const pz = cz + hash(modulo(cx, cells), modulo(cy, cells), modulo(cz, cells), seed + 61);
        nearest = Math.min(nearest, (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2);
      }
    }
  }
  return clamp(1 - Math.sqrt(nearest) / 1.732, 0, 1);
};

const abortIfNeeded = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Cloud noise generation was aborted');
  error.name = 'AbortError';
  throw error;
};

const yieldToFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

const createVolume = async (size, seed, signal) => {
  const data = new Uint8Array(size * size * size * 4);
  const scale = 1 / size;
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const px = x * scale;
        const py = y * scale;
        const pz = z * scale;
        const index = ((z * size + y) * size + x) * 4;
        data[index] = Math.round(fbm(px, py, pz, [4, 8, 16, 32], seed) * 255);
        data[index + 1] = Math.round(worley(px * 8, py * 8, pz * 8, 8, seed + 313) * 255);
        data[index + 2] = Math.round(fbm(px, py, pz, [10, 20, 40], seed + 719) * 255);
        data[index + 3] = 255;
      }
    }
    if ((z & 3) === 3) {
      abortIfNeeded(signal);
      await yieldToFrame();
    }
  }
  return data;
};

const createWeather = async (seed, signal) => {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const random = makeRandom(seed ^ 0xa5a5a5a5);
  const offsetX = random() * 16;
  const offsetZ = random() * 16;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size + offsetX;
      const v = z / size + offsetZ;
      const broad = fbm(u, 0.37, v, [4, 8, 16], seed + 1011);
      const cells = fbm(u + 3.7, 0.71, v - 1.9, [3, 6, 12], seed + 1301);
      const wisps = fbm(u - 5.1, 0.19, v + 4.3, [12, 24, 48], seed + 1601);
      const coverage = clamp((broad * 0.72 + cells * 0.28 - 0.34) * 1.55, 0, 1);
      // Towers prefer dense macro bodies, but are offset enough to avoid a
      // one-to-one copy of the coverage field.
      const tower = clamp(coverage * (0.38 + cells * 0.62) + (broad - 0.55) * 0.3, 0, 1);
      const index = (z * size + x) * 4;
      data[index] = Math.round(coverage * 255);
      data[index + 1] = Math.round(tower * 255);
      data[index + 2] = Math.round(clamp((wisps - 0.34) * 1.52, 0, 1) * 255);
      data[index + 3] = 255;
    }
    if ((z & 15) === 15) {
      abortIfNeeded(signal);
      await yieldToFrame();
    }
  }
  return data;
};

const configureTexture = (texture) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Generates the density detail and the broad world-space weather map used by
 * the painterly cloud shader. `size` controls the cubic volume; weather stays
 * at 256x256 to retain broad, stable cloud placement.
 */
export async function buildCloudNoise({ seed = 7, size = 64, signal } = {}) {
  abortIfNeeded(signal);
  const dimension = clamp(Math.round(Number(size) || 64), 16, 128);
  const [volumeData, weatherData] = await Promise.all([
    createVolume(dimension, seed, signal),
    createWeather(seed, signal),
  ]);
  abortIfNeeded(signal);
  const volume = configureTexture(new THREE.Data3DTexture(volumeData, dimension, dimension, dimension));
  volume.name = 'Painterly cloud density noise';
  volume.wrapR = THREE.RepeatWrapping;
  const weather = configureTexture(new THREE.DataTexture(weatherData, 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType));
  weather.name = 'Painterly cloud weather map';
  return {
    volume,
    weather,
    bytes: volumeData.byteLength + weatherData.byteLength,
    dispose() {
      volume.dispose();
      weather.dispose();
    },
  };
}
