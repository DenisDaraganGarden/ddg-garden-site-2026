// Denis's generator output (public/textures/grass/source) → the maps the grass
// reads (public/textures/grass): albedo RGBA, normal, and a packed surface map.
// Cutout atlases keep their maps from the generator, checked for size and
// encoding; the turf tiles get seamless edges and derived maps here, and the
// fresh turf is the dry tile recoloured. Run: npm run grass:textures
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'public/textures/grass/source';
const OUT = 'public/textures/grass';
const TILES = [
  { id: 'turf-dry', tileMetres: 2, heightRangeMetres: 0.05 },
  { id: 'turf-trampled', tileMetres: 2, heightRangeMetres: 0.03 },
];
const TILE_SIZE = 1024;
const files = await fs.readdir(SRC);
const source = (id, kind) => {
  const stem = id.replace('-blades', '');
  const hit = files.find((f) => new RegExp(`^\\d\\d-(${id}|${stem})-${kind}`).test(f) || f === `${id}-${kind}.png`);
  if (!hit) throw new Error(`${id}: no ${kind} in ${SRC}`);
  return path.join(SRC, hit);
};
const write = async (name, data, width, height, channels, { lossless = false, colour = true } = {}) => {
  const image = sharp(data, { raw: { width, height, channels } });
  const full = path.join(OUT, `${name}.webp`);
  const mobile = path.join(OUT, 'mobile', `${name}.webp`);
  const options = lossless ? { lossless: true } : { quality: 92, alphaQuality: 100 };
  await image.clone().webp(options).toFile(full);
  await image.clone().resize({ width: Math.round(width / 2), height: Math.round(height / 2), kernel: colour ? 'lanczos3' : 'mitchell' }).webp(options).toFile(mobile);
};

// Spreads edge colour into the transparent pixels so mipmaps and bilinear
// filtering never blend a blade against black. Alpha is untouched.
function bleedAlpha(rgba, width, height, passes = 10) {
  const filled = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) filled[i] = rgba[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(filled);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (filled[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (!filled[j]) continue;
        r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; n++;
      }
      if (n) { rgba[i * 4] = r / n; rgba[i * 4 + 1] = g / n; rgba[i * 4 + 2] = b / n; next[i] = 1; }
    }
    filled.set(next);
  }
}

// One atlas per species: blades and parts side by side, cell rectangles
// written to src/plants/grassAtlas.js for the tuft builder. Surface packing
// follows Three's map channels (aoMap R, roughnessMap G) plus translucency in B.
const SPECIES = {
  stipa: { parts: [{ part: 'blades', id: 'stipa-blades', cells: [4, 1], at: [0, 0] }, { part: 'awns', id: 'stipa-awns', cells: [4, 1], at: [0, 512] }], size: [1024, 1024] },
  festuca: { parts: [{ part: 'blades', id: 'festuca-blades', cells: [4, 1], at: [0, 0] }], size: [1024, 512] },
  leymus: { parts: [{ part: 'blades', id: 'leymus-blades', cells: [6, 1], at: [0, 0] }, { part: 'spikes', id: 'leymus-spikes', cells: [4, 1], at: [1024, 0] }], size: [2048, 1536] },
  phragmites: { parts: [{ part: 'leaves', id: 'phragmites-leaves', cells: [6, 1], at: [0, 0] }, { part: 'panicles', id: 'phragmites-panicles', cells: [2, 2], at: [1024, 0], scaleTo: [1024, 1024] }, { part: 'stems', id: 'phragmites-stems', cells: [4, 1], at: [1024, 1024], scaleTo: [512, 768] }], size: [2048, 1792] },
};
const loadPart = async (id, kind, channels, scaleTo) => {
  let image = sharp(kind === 'albedo' ? path.join(SRC, `${id}-albedo.png`) : source(id, kind));
  image = channels === 4 ? image.ensureAlpha() : image.removeAlpha();
  if (scaleTo) image = image.resize(scaleTo[0], scaleTo[1], { kernel: 'lanczos3' });
  return image.raw().toBuffer({ resolveWithObject: true });
};
async function buildSpecies(name, { parts, size }) {
  const [width, height] = size;
  const albedo = Buffer.alloc(width * height * 4, 0);
  const normal = Buffer.alloc(width * height * 3); for (let i = 0; i < width * height; i++) { normal[i * 3] = 128; normal[i * 3 + 1] = 128; normal[i * 3 + 2] = 255; }
  const surface = Buffer.alloc(width * height * 3); for (let i = 0; i < width * height; i++) { surface[i * 3] = 255; surface[i * 3 + 1] = 255; surface[i * 3 + 2] = 0; }
  const layout = {};
  for (const part of parts) {
    const a = await loadPart(part.id, 'albedo', 4, part.scaleTo);
    const n = await loadPart(part.id, 'normal', 3, part.scaleTo);
    const rough = await loadPart(part.id, 'roughness', 1, part.scaleTo);
    const ao = await loadPart(part.id, 'ambient-occlusion', 1, part.scaleTo);
    const trans = await loadPart(part.id, 'translucency', 1, part.scaleTo);
    const pw = a.info.width, ph = a.info.height;
    for (const m of [n, rough, ao, trans]) if (m.info.width !== pw || m.info.height !== ph) throw new Error(`${part.id}: map size differs from albedo`);
    const [ox, oy] = part.at;
    if (ox + pw > width || oy + ph > height) throw new Error(`${name}: ${part.id} does not fit the atlas`);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const src = y * pw + x, dst = (oy + y) * width + ox + x;
      albedo.set(a.data.subarray(src * 4, src * 4 + 4), dst * 4);
      normal.set(n.data.subarray(src * 3, src * 3 + 3), dst * 3);
      surface[dst * 3] = ao.data[src]; surface[dst * 3 + 1] = rough.data[src]; surface[dst * 3 + 2] = trans.data[src];
    }
    const [cols, rows] = part.cells, cw = pw / cols, ch = ph / rows, rects = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) rects.push([ox + c * cw, oy + r * ch, cw, ch]);
    layout[part.part] = rects;
  }
  bleedAlpha(albedo, width, height);
  await write(`${name}-albedo`, albedo, width, height, 4);
  await write(`${name}-normal`, normal, width, height, 3, { lossless: true, colour: false });
  await write(`${name}-surface`, surface, width, height, 3, { lossless: true, colour: false });
  return { id: name, kind: 'species-atlas', width, height, parts: layout, surface: 'R AO, G roughness, B translucency' };
}

// Wraps the tile: near the borders the picture is replaced by the same picture
// shifted by half a tile (whose borders are the original centre and therefore
// continuous), blended in over a feathered band.
function makeSeamless(rgb, size, band = 0.14) {
  const out = Buffer.alloc(rgb.length);
  const half = size >> 1;
  const feather = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x, size - 1 - x, y, size - 1 - y) / (size * band);
    const m = feather(edge);
    const sx = (x + half) % size, sy = (y + half) % size;
    const i = (y * size + x) * 3, j = (sy * size + sx) * 3;
    for (let k = 0; k < 3; k++) out[i + k] = rgb[j + k] * (1 - m) + rgb[i + k] * m;
  }
  return out;
}
const luminance = (rgb, i) => 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
function blurWrap(gray, size, radius) {
  const tmp = new Float32Array(gray.length), out = new Float32Array(gray.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0; for (let d = -radius; d <= radius; d++) s += gray[y * size + ((x + d + size) % size)]; tmp[y * size + x] = s / n; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0; for (let d = -radius; d <= radius; d++) s += tmp[((y + d + size) % size) * size + x]; out[y * size + x] = s / n; }
  return out;
}
function stretch(gray) {
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
  return gray.map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))));
}
// Dry straw becomes leaf green; soil, dust and dark litter keep their colour.
function recolourFresh(rgb) {
  const out = Buffer.from(rgb);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i] / 255, g = rgb[i + 1] / 255, b = rgb[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 0.02) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 22 || h > 75 || s < 0.14 || l < 0.3) continue; // not straw
    const straw = Math.min(1, (l - 0.3) / 0.25) * Math.min(1, (s - 0.14) / 0.2);
    const nh = h + (96 - h) * straw, ns = Math.min(1, s * (1 + 0.35 * straw)), nl = l * (1 - 0.2 * straw);
    const c = (1 - Math.abs(2 * nl - 1)) * ns, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = nl - c / 2;
    const [rr, gg, bb] = nh < 60 ? [c, x, 0] : nh < 120 ? [x, c, 0] : nh < 180 ? [0, c, x] : nh < 240 ? [0, x, c] : nh < 300 ? [x, 0, c] : [c, 0, x];
    out[i] = (rr + m) * 255; out[i + 1] = (gg + m) * 255; out[i + 2] = (bb + m) * 255;
  }
  return out;
}
async function buildTile({ id, tileMetres, heightRangeMetres }, rgbOverride) {
  const size = TILE_SIZE;
  let rgb = rgbOverride;
  if (!rgb) {
    const { data } = await sharp(path.join(SRC, `${id}-albedo.png`)).removeAlpha().resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    rgb = makeSeamless(data, size);
  }
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) lum[i] = luminance(rgb, i) / 255;
  const height = stretch(blurWrap(lum, size, 1));
  const heightSoft = blurWrap(height, size, 6);
  const normal = Buffer.alloc(size * size * 3), surface = Buffer.alloc(size * size * 3);
  const strength = 3.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const hx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)];
    const hy = height[((y - 1 + size) % size) * size + x] - height[((y + 1) % size) * size + x]; // +Y up the image
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    normal[i * 3] = (nx * 0.5 + 0.5) * 255; normal[i * 3 + 1] = (ny * 0.5 + 0.5) * 255; normal[i * 3 + 2] = (nz * 0.5 + 0.5) * 255;
    surface[i * 3] = (0.78 + 0.15 * (1 - lum[i])) * 255;                      // roughness: dust and shadowed soil matte, straw a little less
    surface[i * 3 + 1] = (0.55 + 0.45 * (0.5 + 0.5 * (height[i] - heightSoft[i]) + 0.5 * heightSoft[i] - 0.25)) * 255; // AO: lower and shadowed between the blades
    surface[i * 3 + 2] = height[i] * 255;
  }
  await write(`${id}-albedo`, rgb, size, size, 3);
  // Ground maps at quality 92: a fifth of the lossless weight, no visible loss on turf.
  await write(`${id}-normal`, normal, size, size, 3, { colour: false });
  await write(`${id}-surface`, surface, size, size, 3, { colour: false });
  return { id, kind: 'tile', width: size, height: size, tileMetres, heightRangeMetres, surface: 'R roughness, G AO, B height', rgb };
}

const manifest = { generator: 'scripts/grass/build-textures.mjs', source: `${SRC} (Denis, imagegen; prompts.md beside them)`, format: 'WebP quality 92 (species normal and surface lossless); mobile/ at half size', encoding: { albedo: 'sRGB, straight alpha, colour bled into transparent pixels', normal: 'linear, tangent-space, OpenGL +Y up', surface: 'linear, packed per entry (species atlases: R AO, G roughness, B translucency; tiles: R roughness, G AO, B height)' }, entries: {} };
const atlases = {};
for (const [name, spec] of Object.entries(SPECIES)) { const entry = await buildSpecies(name, spec); manifest.entries[name] = entry; atlases[name] = { width: entry.width, height: entry.height, parts: entry.parts }; console.log('species atlas', name, `${entry.width}x${entry.height}`, Object.keys(entry.parts).join('+')); }
await fs.writeFile('src/plants/grassAtlas.js', `// Generated by scripts/grass/build-textures.mjs from Denis's source maps - do not edit.\n// Pixel rectangles [x, y, w, h] of every part cell, image origin top-left.\nexport const GRASS_ATLASES = Object.freeze(${JSON.stringify(atlases)});\n`);
let dryRgb = null;
for (const tile of TILES) { const entry = await buildTile(tile); if (tile.id === 'turf-dry') dryRgb = entry.rgb; delete entry.rgb; manifest.entries[entry.id] = entry; console.log('tile', entry.id, `${entry.width}x${entry.height}`); }
{ const entry = await buildTile({ id: 'turf-fresh', tileMetres: 2, heightRangeMetres: 0.06 }, recolourFresh(dryRgb)); delete entry.rgb; entry.derivedFrom = 'turf-dry, straw recoloured to leaf green'; manifest.entries[entry.id] = entry; console.log('tile turf-fresh derived from turf-dry'); }
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('grass textures:', Object.keys(manifest.entries).length, 'entries →', OUT);
