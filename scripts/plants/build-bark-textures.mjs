// Denis's bark maps (assets-source/textures/bark, one set per species:
// albedo, ao, roughness, height, normal) → the maps the bark reads
// (public/textures/plants/bark): albedo, normal and a packed surface map, at
// 1024 and, in mobile/, 512. A missing or duplicated roughness is derived
// from the ambient occlusion. Run: npm run bark:textures
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets-source/textures/bark';
const OUT = 'public/textures/plants/bark';
const SIZE = 1024;
// Metres of bark one repeat of the map covers, by the size of its fissures.
export const BARK_KINDS = { oleaster: { tileMetres: 0.45 }, tamarisk: { tileMetres: 0.4 }, plum: { tileMetres: 0.3 }, elm: { tileMetres: 0.5 } };

const read = async (kind, map) => {
  const file = path.join(SRC, `${kind}-${map}.png`);
  const { data } = await sharp(file).removeAlpha().resize(SIZE, SIZE, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return data;
};
const write = async (name, data, channels, { lossless = false, colour = true } = {}) => {
  const image = sharp(data, { raw: { width: SIZE, height: SIZE, channels } });
  const options = lossless ? { lossless: true } : { quality: 92 };
  await image.clone().webp(options).toFile(path.join(OUT, `${name}.webp`));
  await image.clone().resize(SIZE / 2, SIZE / 2, { kernel: colour ? 'lanczos3' : 'mitchell' }).webp(options).toFile(path.join(OUT, 'mobile', `${name}.webp`));
};
// How much the two vertical edges differ against neighbouring columns: near 1
// for a seamless tile, several times more for a tile with a visible seam.
const seam = (rgb) => {
  let edge = 0, inner = 0;
  for (let y = 0; y < SIZE; y++) {
    const a = (y * SIZE) * 3, b = (y * SIZE + SIZE - 1) * 3, c = (y * SIZE + 100) * 3, d = (y * SIZE + 101) * 3;
    for (let k = 0; k < 3; k++) { edge += Math.abs(rgb[a + k] - rgb[b + k]); inner += Math.abs(rgb[c + k] - rgb[d + k]); }
  }
  return Number((edge / Math.max(1, inner)).toFixed(2));
};

await fs.mkdir(path.join(OUT, 'mobile'), { recursive: true });
const manifest = { generator: 'scripts/plants/build-bark-textures.mjs', source: `${SRC} (Denis, generator; albedo first, the other maps derived from it)`, format: 'WebP quality 92; mobile/ at half size', encoding: { albedo: 'sRGB', normal: 'linear, tangent-space, OpenGL +Y up', surface: 'linear, R ambient occlusion, G roughness, B height' }, entries: {} };
for (const [kind, spec] of Object.entries(BARK_KINDS)) {
  const [albedo, ao, roughness, height, normal] = await Promise.all(['albedo', 'ao', 'roughness', 'height', 'normal'].map((map) => read(kind, map)));
  const notes = [];
  let rough = roughness;
  if (Buffer.compare(roughness, height) === 0) {
    // The generator handed the height map twice: roughness follows the
    // occlusion instead - bark is rough everywhere, roughest in its cracks.
    rough = Buffer.alloc(roughness.length);
    for (let i = 0; i < rough.length; i += 3) { const v = Math.round(255 * (0.82 + 0.13 * (1 - ao[i] / 255))); rough[i] = rough[i + 1] = rough[i + 2] = v; }
    notes.push('roughness derived from ambient occlusion (source roughness was a copy of height)');
  }
  const surface = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < surface.length; i += 3) { surface[i] = ao[i]; surface[i + 1] = rough[i]; surface[i + 2] = height[i]; }
  await write(`${kind}-albedo`, albedo, 3);
  // Like the turf tiles: quality 92 is a fifth of the lossless weight with no visible loss on bark.
  await write(`${kind}-normal`, normal, 3, { colour: false });
  await write(`${kind}-surface`, surface, 3, { colour: false });
  const entry = { kind: 'bark-tile', tileMetres: spec.tileMetres, size: SIZE, seam: { albedo: seam(albedo), normal: seam(normal) }, notes };
  manifest.entries[kind] = entry;
  console.log(kind, JSON.stringify(entry));
}
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('bark textures:', Object.keys(manifest.entries).length, 'kinds →', OUT);
