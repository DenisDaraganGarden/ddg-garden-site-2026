// The beach house's maps (src/components/house), grown from noise — no source
// images and no network: weathered wood (fibres, growth rings, knots, checks),
// asphalt shingle granules, galvanised iron (spangle and white rust). Written
// like the bark and rock maps: albedo (sRGB, its mean luminance 0.5 linear —
// the house tints it with the finish's colour, twice the texel), normal
// (linear, tangent space, OpenGL +Y up) and surface (linear: R ambient
// occlusion, G roughness, B height), at full size and, in mobile/, half.
// Every map tiles: the noise lattices wrap. Run: npm run house:textures
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'public/textures/house';

// An integer hash → [0, 1).
const hash = (i, j, seed) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const mod = (a, n) => ((a % n) + n) % n;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (d) => d - Math.round(d); // a tile fraction to the nearest image of it

// Gradient noise on a lattice that wraps every `px` cells across and `py` down.
function noise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const grad = (i, j, dx, dy) => {
    const a = hash(mod(i, px), mod(j, py), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fade(fx), v = fade(fy);
  const top = grad(x0, y0, fx, fy), bottom = grad(x0, y0 + 1, fx, fy - 1);
  const a = top + u * (grad(x0 + 1, y0, fx - 1, fy) - top);
  const b = bottom + u * (grad(x0 + 1, y0 + 1, fx - 1, fy - 1) - bottom);
  return (a + v * (b - a)) * 1.41;
}
// Octaves of it over a whole tile: (tx, ty) are tile fractions, (px, py) the
// base periods, so every octave wraps too. About [-1, 1].
function fbm(tx, ty, px, py, seed, octaves = 4) {
  let sum = 0, amplitude = 1, norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    const k = 2 ** o;
    sum += amplitude * noise(tx * px * k, ty * py * k, px * k, py * k, seed + o * 101);
    norm += amplitude;
    amplitude *= 0.5;
  }
  return sum / norm;
}
// Cells on a wrapping grid, one jittered point in each: the nearest two
// distances (in cells) and the nearest cell's id.
function cells(tx, ty, cx, cy, seed) {
  const x = tx * cx, y = ty * cy, ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j += 1) {
    for (let i = -1; i <= 1; i += 1) {
      const gx = mod(ix + i, cx), gy = mod(iy + j, cy);
      const px = ix + i + hash(gx, gy, seed), py = iy + j + hash(gx, gy, seed + 1);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) [d2, d1, id] = [d1, d, gy * cx + gx];
      else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}

// Weathered board, the grain along x: `tile` metres [along, across].
function wood(width, height, tile, seed) {
  const n = width * height, luminance = new Float32Array(n), warmth = new Float32Array(n), relief = new Float32Array(n), roughness = new Float32Array(n);
  const knots = Array.from({ length: 5 }, (_, k) => ({ x: hash(k, 1, seed), y: hash(k, 2, seed), r: 0.006 + 0.012 * hash(k, 3, seed) }));
  const checks = Array.from({ length: 9 }, (_, k) => ({ x: hash(k, 11, seed), y: hash(k, 12, seed), length: 0.1 + 0.5 * hash(k, 13, seed), width: 0.0005 + 0.0011 * hash(k, 14, seed), phase: 7 * hash(k, 15, seed) }));
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const tx = col / width, ty = row / height, i = row * width + col;
      // Growth rings run along the board, wavy, bulging round the knots.
      // Ring spacing wanders across the board; the lines wave along it.
      let phase = ty * tile[1] * 70 + 2.2 * fbm(tx, ty, 3, 10, seed + 10, 3) + 9 * fbm(tx, ty, 1, 2, seed + 60, 2), knot = 0;
      for (const k of knots) {
        const d = Math.hypot(wrap(tx - k.x) * tile[0] * 0.5, wrap(ty - k.y) * tile[1]) / k.r;
        phase += 2.4 * Math.exp(-((d / 2.6) ** 2));
        knot = Math.max(knot, 1 - smoothstep(0.7, 1, d));
      }
      const late = smoothstep(0.55, 0.92, 0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      const fibre = fbm(tx, ty, 6, 260, seed + 20, 2), blotch = fbm(tx, ty, 2, 2, seed + 30, 3), band = fbm(tx, ty, 1, 7, seed + 70, 3);
      // Checks: thin cracks along the grain, tapering at both ends.
      let crack = 0;
      for (const c of checks) {
        const along = wrap(tx - c.x) * tile[0];
        if (Math.abs(along) > c.length / 2) continue;
        const w = c.width * (1 - (2 * along / c.length) ** 2), off = wrap(ty - c.y) * tile[1] - 0.0012 * Math.sin(along * 37 + c.phase);
        crack = Math.max(crack, 1 - smoothstep(w * 0.4, w, Math.abs(off)));
      }
      luminance[i] = (0.5 + 0.06 * fibre + 0.035 * blotch + 0.07 * band - 0.14 * late) * (1 - 0.55 * knot) * (1 - 0.7 * crack);
      warmth[i] = 0.025 * knot + 0.012 * late;
      relief[i] = 0.5 + 0.16 * late + 0.06 * fibre + 0.08 * knot - 0.4 * crack;
      roughness[i] = 0.82 - 0.07 * late + 0.1 * crack + 0.03 * fibre;
    }
  }
  return { luminance, warmth, relief, roughness, reliefMetres: 0.003 };
}

// Asphalt shingle surface: mineral granules of a few shades, bedded in bitumen.
function granules(size, tileMetres, seed) {
  const n = size * size, luminance = new Float32Array(n), warmth = new Float32Array(n), relief = new Float32Array(n), roughness = new Float32Array(n);
  const count = Math.round(tileMetres / 0.002);
  const shades = [[0.6, 0.1], [0.25, 0.14], [0.1, 0.22], [0.05, 0.36]]; // share, luminance
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const tx = col / size, ty = row / size, i = row * size + col;
      const { d1, d2, id } = cells(tx, ty, count, count, seed);
      let pick = hash(id, 7, seed), shade = shades[0][1];
      for (const [share, value] of shades) {
        if (pick < share) { shade = value; break; }
        pick -= share;
      }
      const edge = smoothstep(0, 0.14, d2 - d1), dome = Math.max(0, 1 - (d1 / 0.62) ** 2);
      luminance[i] = shade * (0.72 + 0.28 * edge) * (1 + 0.05 * fbm(tx, ty, 3, 3, seed + 40, 3));
      warmth[i] = 0.02 * hash(id, 9, seed);
      relief[i] = 0.3 + 0.55 * dome * edge;
      roughness[i] = 0.88 + 0.08 * hash(id, 8, seed);
    }
  }
  return { luminance, warmth, relief, roughness, reliefMetres: 0.0008 };
}

// Galvanised iron: spangle crystals a few centimetres across, each catching the
// light its own way, and chalky white rust in patches.
function spangle(size, tileMetres, seed) {
  const n = size * size, luminance = new Float32Array(n), warmth = new Float32Array(n), relief = new Float32Array(n), roughness = new Float32Array(n);
  const count = Math.round(tileMetres / 0.028);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const tx = col / size, ty = row / size, i = row * size + col;
      const { d1, d2, id } = cells(tx, ty, count, count, seed);
      const crystal = 0.92 + 0.16 * hash(id, 3, seed), boundary = smoothstep(0, 0.05, d2 - d1);
      const oxide = smoothstep(0.3, 0.75, fbm(tx, ty, 3, 3, seed + 50, 4));
      luminance[i] = 0.5 * crystal * (0.94 + 0.06 * boundary) + 0.12 * oxide;
      warmth[i] = 0;
      relief[i] = 0.5;
      roughness[i] = (0.28 + 0.22 * hash(id, 4, seed)) * (1 - oxide) + 0.78 * oxide;
    }
  }
  return { luminance, warmth, relief, roughness, reliefMetres: 0 };
}

const toSrgb = (linear) => {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};
const byte = (value) => Math.round(255 * Math.min(1, Math.max(0, value)));

// Albedo with its mean luminance set to 0.5; normal from the relief (metres
// over the pixel's metres, wrapping at the edges); the packed surface map.
function encode(maps, width, height, pixelMetres) {
  const { luminance, warmth, relief, roughness, reliefMetres } = maps;
  const n = width * height;
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += luminance[i];
  const gain = 0.5 / (mean / n);
  const albedo = Buffer.alloc(n * 3), normal = Buffer.alloc(n * 3), surface = Buffer.alloc(n * 3);
  let low = 1, high = 0;
  for (let i = 0; i < n; i += 1) { low = Math.min(low, relief[i]); high = Math.max(high, relief[i]); }
  const at = (col, row) => relief[mod(row, height) * width + mod(col, width)];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = row * width + col, l = luminance[i] * gain, w = warmth[i];
      albedo[i * 3] = toSrgb(l * (1.03 + 3 * w));
      albedo[i * 3 + 1] = toSrgb(l * (1 + w));
      albedo[i * 3 + 2] = toSrgb(l * (0.94 - 2 * w));
      // Texture v runs up the image (flipY), so a row further down is lower v.
      const du = ((at(col + 1, row) - at(col - 1, row)) * reliefMetres) / (2 * pixelMetres);
      const dv = ((at(col, row - 1) - at(col, row + 1)) * reliefMetres) / (2 * pixelMetres);
      const length = Math.hypot(du, dv, 1);
      normal[i * 3] = byte((-du / length) * 0.5 + 0.5);
      normal[i * 3 + 1] = byte((-dv / length) * 0.5 + 0.5);
      normal[i * 3 + 2] = byte((1 / length) * 0.5 + 0.5);
      const depth = high > low ? (relief[i] - low) / (high - low) : 0.5;
      surface[i * 3] = byte(0.45 + 0.55 * Math.min(1, depth * 1.6));
      surface[i * 3 + 1] = byte(roughness[i]);
      surface[i * 3 + 2] = byte(depth);
    }
  }
  return { albedo, normal, surface, meanLinear: 0.5, gain: Number(gain.toFixed(3)) };
}

// How much opposite edges differ against neighbouring columns (rows): near 1
// for a seamless tile, several times more for a seam.
function seam(rgb, width, height) {
  const diff = (a, b) => Math.abs(rgb[a] - rgb[b]) + Math.abs(rgb[a + 1] - rgb[b + 1]) + Math.abs(rgb[a + 2] - rgb[b + 2]);
  let edge = 0, inner = 0;
  for (let row = 0; row < height; row += 1) {
    edge += diff((row * width) * 3, (row * width + width - 1) * 3);
    inner += diff((row * width + 100) * 3, (row * width + 101) * 3);
  }
  for (let col = 0; col < width; col += 1) {
    edge += diff(col * 3, ((height - 1) * width + col) * 3);
    inner += diff((100 * width + col) * 3, (101 * width + col) * 3);
  }
  return Number((edge / Math.max(1, inner)).toFixed(2));
}

const SETS = [
  { name: 'wood', width: 1024, height: 512, tileMetres: [2, 1], build: () => wood(1024, 512, [2, 1], 11) },
  { name: 'shingle', width: 512, height: 512, tileMetres: [0.5, 0.5], build: () => granules(512, 0.5, 23) },
  { name: 'metal', width: 512, height: 512, tileMetres: [1, 1], build: () => spangle(512, 1, 37) },
];

await fs.mkdir(path.join(OUT, 'mobile'), { recursive: true });
const manifest = {
  generator: 'scripts/house/build-house-textures.mjs',
  source: 'procedural: wrapping gradient noise and cells, no images',
  format: 'WebP quality 92; mobile/ at half size',
  encoding: { albedo: 'sRGB, mean luminance 0.5 linear (a tint for the finish colour)', normal: 'linear, tangent space, OpenGL +Y up', surface: 'linear, R ambient occlusion, G roughness, B height' },
  entries: {},
};
for (const set of SETS) {
  const started = Date.now();
  const maps = set.build();
  const { albedo, normal, surface, gain } = encode(maps, set.width, set.height, set.tileMetres[0] / set.width);
  const seams = { albedo: seam(albedo, set.width, set.height), normal: seam(normal, set.width, set.height), surface: seam(surface, set.width, set.height) };
  for (const [map, value] of Object.entries(seams)) if (value > 2) throw new Error(`${set.name}-${map} has a seam (${value})`);
  for (const [map, data] of [['albedo', albedo], ['normal', normal], ['surface', surface]]) {
    const image = sharp(data, { raw: { width: set.width, height: set.height, channels: 3 } });
    await image.clone().webp({ quality: 92 }).toFile(path.join(OUT, `${set.name}-${map}.webp`));
    await image.clone().resize(set.width / 2, set.height / 2, { kernel: map === 'albedo' ? 'lanczos3' : 'mitchell' }).webp({ quality: 92 }).toFile(path.join(OUT, 'mobile', `${set.name}-${map}.webp`));
  }
  manifest.entries[set.name] = { size: [set.width, set.height], tileMetres: set.tileMetres, reliefMetres: maps.reliefMetres, albedoGain: gain, seam: seams };
  console.log(set.name, JSON.stringify(manifest.entries[set.name]), `${Date.now() - started} ms`);
}
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('house textures →', OUT);
