// Offline PBR authoring from imagegen albedo references. No API/network at build
// or runtime. The relief is an estimate from local detail, not measured depth.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'assets-source/textures/rocks';
const OUT = 'public/textures/rocks';
const TYPES = { limestone: { relief: .0035, roughness: .82 }, coquina: { relief: .007, roughness: .89 } };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function periodic(data, channels, size, band = Math.round(size * .028)) {
  for (let axis = 0; axis < 2; axis++) for (let j = 0; j < size; j++) for (let i = 0; i < band; i++) {
    const a = (axis ? i * size + j : j * size + i) * channels;
    const b = (axis ? (size - 1 - i) * size + j : j * size + size - 1 - i) * channels;
    const blend = .5 * (1 - i / band) ** 2;
    for (let c = 0; c < channels; c++) {
      const left = data[a + c], right = data[b + c];
      data[a + c] = left + (right - left) * blend;
      data[b + c] = right + (left - right) * blend;
    }
  }
}

function blur(source, radius, size) {
  const temp = new Float32Array(source.length), result = new Float32Array(source.length);
  const wrap = (n) => (n + size) % size;
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += source[y * size + wrap(x)];
    for (let x = 0; x < size; x++) {
      temp[y * size + x] = sum / (radius * 2 + 1);
      sum += source[y * size + wrap(x + radius + 1)] - source[y * size + wrap(x - radius)];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[wrap(y) * size + x];
    for (let y = 0; y < size; y++) {
      result[y * size + x] = sum / (radius * 2 + 1);
      sum += temp[wrap(y + radius + 1) * size + x] - temp[wrap(y - radius) * size + x];
    }
  }
  return result;
}

function edgeDelta(data, size, channels) {
  let result = 0;
  for (let j = 0; j < size; j++) for (let c = 0; c < channels; c++) {
    result = Math.max(result, Math.abs(data[j * size * channels + c] - data[(j * size + size - 1) * channels + c]), Math.abs(data[j * channels + c] - data[((size - 1) * size + j) * channels + c]));
  }
  return result;
}

await fs.mkdir(path.join(OUT, 'mobile'), { recursive: true });
const manifest = {
  generator: 'node scripts/terrain/build-rock-textures.mjs', source: `${SOURCE} (built-in imagegen; full prompts in README.md)`,
  tileMetres: .6, encoding: { color: 'sRGB reflectance reference', normal: 'linear OpenGL +Y', surface: 'linear: R roughness, G occlusion, B height' },
  method: 'Periodic multiscale local-detail height; broad mineral colour does not become displacement. Roughness and cavity occlusion estimated from the same field. Not a measured scan.',
  sets: {},
};
for (const [type, spec] of Object.entries(TYPES)) {
  for (const size of [1024, 512]) {
    const destination = size === 512 ? path.join(OUT, 'mobile') : OUT;
    const { data: color } = await sharp(path.join(SOURCE, `${type}-generated.png`)).removeAlpha().resize(size, size).raw().toBuffer({ resolveWithObject: true });
    periodic(color, 3, size);
    const luma = Float32Array.from({ length: size * size }, (_, i) => (color[i * 3] * .2126 + color[i * 3 + 1] * .7152 + color[i * 3 + 2] * .0722) / 255);
    const fine = blur(luma, 1, size), broad = blur(blur(luma, Math.round(size * .016), size), Math.round(size * .016), size);
    const height = Float32Array.from(luma, (_, i) => clamp(.52 + (fine[i] - broad[i]) * 2.2 + (luma[i] - fine[i]) * .12, .04, .96));
    periodic(height, 1, size);
    const relief = blur(height, 3, size), normal = Buffer.alloc(size * size * 3), surface = Buffer.alloc(normal.length);
    const strength = spec.relief * size / manifest.tileMetres;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const nx = -(height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size]) * .5 * strength;
      const ny = (height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x]) * .5 * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      normal[i * 3] = Math.round((nx * inv * .5 + .5) * 255);
      normal[i * 3 + 1] = Math.round((ny * inv * .5 + .5) * 255);
      normal[i * 3 + 2] = Math.round((inv * .5 + .5) * 255);
      const cavity = Math.max(0, relief[i] - height[i]);
      surface[i * 3] = Math.round(clamp(spec.roughness + (broad[i] - fine[i]) * .48 + Math.abs(luma[i] - fine[i]) * .3, .66, .98) * 255);
      surface[i * 3 + 1] = Math.round(clamp(1 - cavity * 1.15, .68, 1) * 255);
      surface[i * 3 + 2] = Math.round(height[i] * 255);
    }
    periodic(normal, 3, size, 6); periodic(surface, 3, size, 6);
    const entries = {};
    for (const [channel, data] of Object.entries({ color, normal, surface })) {
      const file = path.join(destination, `${type}-${channel}.webp`);
      const outputSize = channel === 'color' ? size : size / 2;
      const pixels = await sharp(data, { raw: { width: size, height: size, channels: 3 } }).resize(outputSize, outputSize, { kernel: 'mitchell' }).raw().toBuffer();
      if (channel === 'normal') for (let i = 0; i < pixels.length; i += 3) {
        const nx = pixels[i] / 127.5 - 1, ny = pixels[i + 1] / 127.5 - 1, nz = pixels[i + 2] / 127.5 - 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        pixels[i] = Math.round((nx * inv * .5 + .5) * 255);
        pixels[i + 1] = Math.round((ny * inv * .5 + .5) * 255);
        pixels[i + 2] = Math.round((nz * inv * .5 + .5) * 255);
      }
      periodic(pixels, 3, outputSize, 4);
      await sharp(pixels, { raw: { width: outputSize, height: outputSize, channels: 3 } }).webp(channel === 'color' ? { quality: 92, effort: 5 } : { lossless: true, effort: 5 }).toFile(file);
      // Validate the actual decoded deliverable, not only the in-memory source.
      const decoded = await sharp(file).raw().toBuffer();
      const seam = edgeDelta(decoded, outputSize, 3);
      // Lossy colour introduces small boundary error; numerical surface/normal
      // channels stay lossless and exactly periodic. Do not demand colour's
      // original precision at the cost of multi-megabyte colour downloads.
      if (seam > (channel === 'color' ? 24 : 0)) throw new Error(`${file}: non-periodic edge ${seam}`);
      entries[channel] = { file, size: outputSize, bytes: (await fs.stat(file)).size, maxOppositeEdgeDelta: seam, compression: channel === 'color' ? 'WebP quality 92' : 'WebP lossless' };
    }
    manifest.sets[`${type}-${size}`] = { size, estimatedReliefMetres: spec.relief, entries };
  }
}
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output: OUT, sets: Object.keys(manifest.sets), bytes: Object.values(manifest.sets).reduce((sum, set) => sum + Object.values(set.entries).reduce((s, e) => s + e.bytes, 0), 0), maxDataMapEdgeDelta: 0 }));
