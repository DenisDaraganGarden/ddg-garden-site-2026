import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'assets-source/seagull/source/seagull-albedo-source.png');
const OUTPUT = path.join(ROOT, 'public/models/seagull/textures');
const SIZE = 1024;

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });

  const sourceImage = sharp(SOURCE).resize(SIZE, SIZE, { fit: 'fill' }).ensureAlpha();
  const { data, info } = await sourceImage.clone().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const luma = new Float32Array(pixels);
  const normal = Buffer.alloc(pixels * 4);
  const orm = Buffer.alloc(pixels * 4);
  const specular = Buffer.alloc(pixels * 4);
  const height = Buffer.alloc(pixels);

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const alpha = data[offset + 3];
    const value = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    luma[index] = value;
    height[index] = alpha < 8 ? 128 : clampByte(96 + value * 96);

    const redness = Math.max(0, r - (g + b) * 0.5) / 255;
    const darkness = 1 - value;
    const featherRoughness = 205 - darkness * 22;
    const roughness = featherRoughness * (1 - redness) + 112 * redness;
    const spec = 68 + redness * 82 + darkness * 18;

    orm[offset] = 255;
    orm[offset + 1] = clampByte(roughness);
    orm[offset + 2] = 0;
    orm[offset + 3] = 255;

    const specularIntensity = alpha < 8 ? 0 : clampByte(spec);
    specular[offset] = specularIntensity;
    specular[offset + 1] = specularIntensity;
    specular[offset + 2] = specularIntensity;
    specular[offset + 3] = 255;
  }

  const sample = (x, y) => {
    const safeX = Math.max(0, Math.min(info.width - 1, x));
    const safeY = Math.max(0, Math.min(info.height - 1, y));
    return luma[safeY * info.width + safeX];
  };

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      const offset = index * 4;
      if (data[offset + 3] < 8) {
        normal[offset] = 128;
        normal[offset + 1] = 128;
        normal[offset + 2] = 255;
        normal[offset + 3] = 255;
        continue;
      }

      const dx = (
        sample(x + 1, y - 1) + sample(x + 1, y) * 2 + sample(x + 1, y + 1)
        - sample(x - 1, y - 1) - sample(x - 1, y) * 2 - sample(x - 1, y + 1)
      ) * 0.85;
      const dy = (
        sample(x - 1, y + 1) + sample(x, y + 1) * 2 + sample(x + 1, y + 1)
        - sample(x - 1, y - 1) - sample(x, y - 1) * 2 - sample(x + 1, y - 1)
      ) * 0.85;
      const length = Math.hypot(dx, dy, 1);
      normal[offset] = clampByte(((-dx / length) * 0.5 + 0.5) * 255);
      normal[offset + 1] = clampByte(((-dy / length) * 0.5 + 0.5) * 255);
      normal[offset + 2] = clampByte((1 / length * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;
    }
  }

  await Promise.all([
    sourceImage.clone().flatten({ background: { r: 220, g: 223, b: 222 } }).webp({ quality: 92, smartSubsample: true }).toFile(path.join(OUTPUT, 'seagull_albedo.webp')),
    sharp(normal, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ lossless: true }).toFile(path.join(OUTPUT, 'seagull_normal.webp')),
    sharp(orm, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ lossless: true }).toFile(path.join(OUTPUT, 'seagull_orm.webp')),
    sharp(specular, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ lossless: true }).toFile(path.join(OUTPUT, 'seagull_specular.webp')),
    sharp(height, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toFile(path.join(OUTPUT, 'seagull_height.png')),
  ]);

  const files = ['albedo', 'normal', 'orm', 'specular'].reduce((result, map) => ({
    ...result,
    [map]: `/models/seagull/textures/seagull_${map}.webp`,
  }), {});
  await fs.writeFile(
    path.join(OUTPUT, 'textures-manifest.json'),
    `${JSON.stringify({ source: 'assets-source/seagull/source/seagull-albedo-source.png', size: SIZE, files }, null, 2)}\n`,
  );
  console.log(`Generated seagull PBR maps at ${OUTPUT}`);
}

await main();
