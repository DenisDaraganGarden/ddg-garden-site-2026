// Bake coherent PBR data from the generated colour reference. No network/API.
// node scripts/terrain/build-shore-stone-textures.mjs
import sharp from 'sharp';
import fs from 'node:fs/promises';

const SIZE = 1024, TILE_METRES = .6, HEIGHT_METRES = .0018;
const SOURCE = 'assets-source/textures/shore-stone/limestone-generated.png';
const OUT = 'public/textures/shore-stone';
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function periodic(data, channels, band = 28) {
  for (let axis = 0; axis < 2; axis++) for (let j = 0; j < SIZE; j++) for (let i = 0; i < band; i++) {
    const a = (axis ? i * SIZE + j : j * SIZE + i) * channels;
    const b = (axis ? (SIZE - 1 - i) * SIZE + j : j * SIZE + SIZE - 1 - i) * channels;
    const blend = .5 * (1 - i / band) ** 2;
    for (let c = 0; c < channels; c++) {
      const left = data[a + c], right = data[b + c];
      data[a + c] = left + (right - left) * blend;
      data[b + c] = right + (left - right) * blend;
    }
  }
}

// Separable periodic box filter, repeated for a soft bandpass. O(pixels).
function blur(source, radius) {
  const temp = new Float32Array(source.length), result = new Float32Array(source.length);
  const wrap = (n) => (n + SIZE) % SIZE;
  for (let y = 0; y < SIZE; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += source[y * SIZE + wrap(x)];
    for (let x = 0; x < SIZE; x++) {
      temp[y * SIZE + x] = sum / (radius * 2 + 1);
      sum += source[y * SIZE + wrap(x + radius + 1)] - source[y * SIZE + wrap(x - radius)];
    }
  }
  for (let x = 0; x < SIZE; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[wrap(y) * SIZE + x];
    for (let y = 0; y < SIZE; y++) {
      result[y * SIZE + x] = sum / (radius * 2 + 1);
      sum += temp[wrap(y + radius + 1) * SIZE + x] - temp[wrap(y - radius) * SIZE + x];
    }
  }
  return result;
}

const { data: rgb } = await sharp(SOURCE).removeAlpha().resize(SIZE, SIZE).raw().toBuffer({ resolveWithObject: true });
periodic(rgb, 3);
const luma = Float32Array.from({ length: SIZE * SIZE }, (_, i) => (rgb[i * 3] * .2126 + rgb[i * 3 + 1] * .7152 + rgb[i * 3 + 2] * .0722) / 255);
const fine = blur(luma, 1), broad = blur(blur(luma, 12), 12);
const height = Float32Array.from(luma, (_, i) => clamp(.52 + (fine[i] - broad[i]) * 2.3 + (luma[i] - fine[i]) * .45, .08, .94));
periodic(height, 1);
const normal = Buffer.alloc(SIZE * SIZE * 3), surface = Buffer.alloc(normal.length);
const relief = blur(height, 2), strength = HEIGHT_METRES * SIZE / TILE_METRES;
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const i = y * SIZE + x;
  const nx = -(height[y * SIZE + (x + 1) % SIZE] - height[y * SIZE + (x + SIZE - 1) % SIZE]) * .5 * strength;
  // Image Y is down; the runtime texture V axis is up.
  const ny = (height[((y + 1) % SIZE) * SIZE + x] - height[((y + SIZE - 1) % SIZE) * SIZE + x]) * .5 * strength;
  const inv = 1 / Math.hypot(nx, ny, 1);
  normal[i * 3] = Math.round((nx * inv * .5 + .5) * 255);
  normal[i * 3 + 1] = Math.round((ny * inv * .5 + .5) * 255);
  normal[i * 3 + 2] = Math.round((inv * .5 + .5) * 255);
  surface[i * 3] = Math.round(clamp(1 - Math.max(0, relief[i] - height[i]) * .8, .83, 1) * 255);
  surface[i * 3 + 1] = Math.round(clamp(.86 + (broad[i] - fine[i]) * .5 + Math.abs(luma[i] - fine[i]) * .2, .77, .97) * 255);
  surface[i * 3 + 2] = Math.round(height[i] * 255);
}
periodic(normal, 3, 8); periodic(surface, 3, 8);
await fs.mkdir(OUT, { recursive: true });
const entries = {};
for (const [name, data] of [['albedo', rgb], ['normal', normal], ['surface', surface]]) {
  const output = `${OUT}/limestone-${name}.webp`;
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ lossless: true }).toFile(output);
  const { size: bytes } = await fs.stat(output);
  let seam = 0;
  for (let j = 0; j < SIZE; j++) for (let c = 0; c < 3; c++) {
    seam = Math.max(seam, Math.abs(data[j * SIZE * 3 + c] - data[(j * SIZE + SIZE - 1) * 3 + c]), Math.abs(data[j * 3 + c] - data[((SIZE - 1) * SIZE + j) * 3 + c]));
  }
  entries[name] = { file: output.split('/').at(-1), bytes, maxOppositeEdgeDelta: seam };
}
const manifest = { source: SOURCE, generator: 'built-in imagegen; derived PBR data via scripts/terrain/build-shore-stone-textures.mjs', size: SIZE, tileMetres: TILE_METRES, estimatedReliefMetres: HEIGHT_METRES, encoding: { albedo: 'sRGB', normal: 'linear OpenGL +Y', surface: 'linear: R AO, G roughness, B height' }, entries };
await fs.writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
