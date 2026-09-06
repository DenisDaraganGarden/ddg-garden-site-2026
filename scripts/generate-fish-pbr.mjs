import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(rootDir, 'assets-source', 'fish', 'textures');
const runtimeDir = path.join(rootDir, 'public', 'models', 'fish', 'textures');
const WIDTH = 1024;
const HEIGHT = 512;

const SPECIES = [
  {
    id: 'pike',
    seed: 19,
    dorsal: [43, 59, 35],
    flank: [104, 113, 64],
    belly: [194, 188, 145],
    iris: [191, 164, 76],
    scaleColumns: 34,
    scaleRows: 19,
    scaleStrength: 0.62,
    roughness: 0.36,
    reflectance: 0.64,
  },
  {
    id: 'perch',
    seed: 47,
    dorsal: [31, 58, 43],
    flank: [124, 137, 69],
    belly: [213, 193, 118],
    iris: [221, 168, 62],
    scaleColumns: 31,
    scaleRows: 18,
    scaleStrength: 0.72,
    roughness: 0.34,
    reflectance: 0.72,
  },
  {
    id: 'roach',
    seed: 83,
    dorsal: [48, 62, 61],
    flank: [168, 183, 171],
    belly: [224, 220, 198],
    iris: [207, 87, 48],
    scaleColumns: 39,
    scaleRows: 22,
    scaleStrength: 0.82,
    roughness: 0.27,
    reflectance: 0.9,
  },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const fract = (value) => value - Math.floor(value);

function hash2(x, y, seed) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);
}

function mixColor(a, b, amount) {
  return a.map((channel, index) => mix(channel, b[index], amount));
}

function speciesColor(species, u, v, scaleNoise) {
  const sideToBack = smoothstep(0.53, 0.94, v);
  const sideToBelly = 1 - smoothstep(0.06, 0.48, v);
  let color = mixColor(species.flank, species.dorsal, sideToBack);
  color = mixColor(color, species.belly, sideToBelly);

  if (species.id === 'pike') {
    const spotGridX = Math.floor(u * 15);
    const spotGridY = Math.floor(v * 10);
    const spotNoise = hash2(spotGridX, spotGridY, species.seed);
    const localX = fract(u * 15) - (0.3 + hash2(spotGridX, spotGridY, 2) * 0.4);
    const localY = fract(v * 10) - (0.3 + hash2(spotGridX, spotGridY, 3) * 0.4);
    const spot = 1 - smoothstep(0.11, 0.28, Math.hypot(localX, localY));
    const pale = [171, 174, 101];
    color = mixColor(color, pale, spot * (0.36 + spotNoise * 0.28) * smoothstep(0.04, 0.23, u));
  }

  if (species.id === 'perch') {
    const bands = [0.22, 0.31, 0.41, 0.52, 0.63, 0.73];
    let band = 0;
    for (const center of bands) {
      const width = center < 0.3 ? 0.026 : 0.032;
      band = Math.max(band, 1 - smoothstep(width, width * 2.4, Math.abs(u - center)));
    }
    band *= smoothstep(0.26, 0.65, v);
    color = mixColor(color, [26, 46, 34], band * 0.72);
  }

  if (species.id === 'roach') {
    const silver = 0.13 * Math.sin((u * 4.2 + v * 1.7) * Math.PI) + scaleNoise * 0.12;
    color = color.map((channel) => channel * (1 + silver));
    color = mixColor(color, [194, 190, 126], smoothstep(0.46, 0.7, v) * 0.08);
  }

  const headDarkening = smoothstep(0.77, 1, u) * smoothstep(0.52, 0.92, v);
  color = mixColor(color, species.dorsal, headDarkening * 0.26);
  return color;
}

function applyHeadDetails(color, species, u, v) {
  const eyeU = species.id === 'pike' ? 0.884 : 0.872;
  const eyeV = species.id === 'pike' ? 0.625 : 0.65;
  const eyeAspect = species.id === 'pike' ? 1.25 : 1;
  const eyeDistance = Math.hypot((u - eyeU) * 10.5 * eyeAspect, (v - eyeV) * 8.6);

  if (eyeDistance < 0.36) {
    color = mixColor(color, [12, 13, 10], smoothstep(0.36, 0.28, eyeDistance));
  }
  if (eyeDistance < 0.24) {
    color = mixColor(color, species.iris, smoothstep(0.24, 0.13, eyeDistance));
  }
  if (eyeDistance < 0.095) {
    color = [7, 8, 7];
  }
  if (Math.hypot((u - eyeU + 0.007) * 13, (v - eyeV - 0.016) * 11) < 0.035) {
    color = [232, 238, 220];
  }

  const gillCenterU = species.id === 'pike' ? 0.785 : 0.79;
  const gillCurve = 0.52 + 0.12 * Math.sin((u - gillCenterU) * 14);
  const gill = (1 - smoothstep(0.004, 0.012, Math.abs(v - gillCurve)))
    * (1 - smoothstep(0.09, 0.14, Math.abs(u - gillCenterU)));
  color = mixColor(color, [48, 35, 27], gill * 0.55);

  const mouthV = species.id === 'pike' ? 0.43 : 0.455;
  const mouth = (1 - smoothstep(0.004, 0.011, Math.abs(v - mouthV)))
    * smoothstep(0.91, 0.945, u);
  color = mixColor(color, [27, 20, 16], mouth * 0.84);

  return color;
}

function buildTextureSet(species) {
  const color = Buffer.alloc(WIDTH * HEIGHT * 4);
  const orm = Buffer.alloc(WIDTH * HEIGHT * 4);
  const specular = Buffer.alloc(WIDTH * HEIGHT * 4);
  const height = new Float32Array(WIDTH * HEIGHT);
  const heightPng = Buffer.alloc(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = 1 - (y + 0.5) / HEIGHT;
    const row = Math.floor(v * species.scaleRows);
    const stagger = (row & 1) * 0.5;

    for (let x = 0; x < WIDTH; x += 1) {
      const u = (x + 0.5) / WIDTH;
      const column = Math.floor(u * species.scaleColumns + stagger);
      const localX = (fract(u * species.scaleColumns + stagger) - 0.5) * 2;
      const localY = (fract(v * species.scaleRows) - 0.5) * 2;
      const ellipticalRadius = Math.hypot(localX, localY * 1.22);
      const ridge = Math.exp(-(((ellipticalRadius - 0.78) / 0.115) ** 2));
      const cellNoise = hash2(column, row, species.seed);
      const scaleRegion = smoothstep(0.07, 0.18, u) * (1 - smoothstep(0.72, 0.9, u));
      const dorsalFade = 1 - smoothstep(0.91, 1, v);
      const scaleMask = scaleRegion * dorsalFade;
      const fineNoise = hash2(x >> 2, y >> 2, species.seed + 11) - 0.5;
      const scaleHeight = ridge * species.scaleStrength * scaleMask;
      const microHeight = fineNoise * 0.035 * scaleMask;
      const index = y * WIDTH + x;
      height[index] = clamp(0.42 + scaleHeight * 0.42 + microHeight);
      heightPng[index] = Math.round(height[index] * 255);

      let baseColor = speciesColor(species, u, v, cellNoise - 0.5);
      baseColor = baseColor.map((channel) => channel * (0.94 + ridge * 0.08 * scaleMask));
      baseColor = applyHeadDetails(baseColor, species, u, v);

      const colorIndex = index * 4;
      color[colorIndex] = Math.round(clamp(baseColor[0], 0, 255));
      color[colorIndex + 1] = Math.round(clamp(baseColor[1], 0, 255));
      color[colorIndex + 2] = Math.round(clamp(baseColor[2], 0, 255));
      color[colorIndex + 3] = 255;

      const bellyGloss = (1 - smoothstep(0.09, 0.47, v)) * 0.15;
      const roughness = clamp(
        species.roughness + (1 - ridge) * 0.12 - ridge * 0.14 - bellyGloss + fineNoise * 0.035,
        0.12,
        0.62,
      );
      orm[colorIndex] = 255;
      orm[colorIndex + 1] = Math.round(roughness * 255);
      orm[colorIndex + 2] = 0;
      orm[colorIndex + 3] = 255;

      const crystalVariation = 0.55 + cellNoise * 0.45;
      const specularValue = clamp(
        species.reflectance * (0.52 + ridge * 0.48) * crystalVariation
          + bellyGloss * 0.8 + smoothstep(0.73, 0.88, u) * 0.08,
      );
      specular[colorIndex] = 255;
      specular[colorIndex + 1] = 255;
      specular[colorIndex + 2] = 255;
      specular[colorIndex + 3] = Math.round(specularValue * 255);
    }
  }

  const normal = Buffer.alloc(WIDTH * HEIGHT * 4);
  const normalStrength = species.id === 'roach' ? 8.5 : 7.2;
  for (let y = 0; y < HEIGHT; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(HEIGHT - 1, y + 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(WIDTH - 1, x + 1);
      const dx = (height[y * WIDTH + x1] - height[y * WIDTH + x0]) * normalStrength;
      const dy = (height[y1 * WIDTH + x] - height[y0 * WIDTH + x]) * normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * inverseLength;
      const ny = dy * inverseLength;
      const nz = inverseLength;
      const index = (y * WIDTH + x) * 4;
      normal[index] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[index + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[index + 3] = 255;
    }
  }

  return { color, normal, orm, specular, heightPng };
}

async function writeMap(buffer, channels, sourcePath, runtimePath, { dataMap = false } = {}) {
  const image = sharp(buffer, { raw: { width: WIDTH, height: HEIGHT, channels } });
  await image.clone().png({ compressionLevel: 9 }).toFile(sourcePath);
  await image.clone().webp(
    dataMap
      ? { lossless: true, effort: 6 }
      : { quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 },
  ).toFile(runtimePath);
}

await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(runtimeDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  size: [WIDTH, HEIGHT],
  mapping: 'One lateral atlas is shared by overlapping left/right UV islands.',
  channels: {
    orm: { r: 'ambient occlusion', g: 'roughness', b: 'metalness' },
    specular: { rgb: 'white', a: 'per-scale specular intensity' },
  },
  species: {},
};

for (const species of SPECIES) {
  const maps = buildTextureSet(species);
  const sourceSpeciesDir = path.join(sourceDir, species.id);
  const runtimeSpeciesDir = path.join(runtimeDir, species.id);
  await fs.mkdir(sourceSpeciesDir, { recursive: true });
  await fs.mkdir(runtimeSpeciesDir, { recursive: true });

  await Promise.all([
    writeMap(
      maps.color,
      4,
      path.join(sourceSpeciesDir, `${species.id}_albedo.png`),
      path.join(runtimeSpeciesDir, `${species.id}_albedo.webp`),
    ),
    writeMap(
      maps.normal,
      4,
      path.join(sourceSpeciesDir, `${species.id}_normal.png`),
      path.join(runtimeSpeciesDir, `${species.id}_normal.webp`),
      { dataMap: true },
    ),
    writeMap(
      maps.orm,
      4,
      path.join(sourceSpeciesDir, `${species.id}_orm.png`),
      path.join(runtimeSpeciesDir, `${species.id}_orm.webp`),
      { dataMap: true },
    ),
    writeMap(
      maps.specular,
      4,
      path.join(sourceSpeciesDir, `${species.id}_specular.png`),
      path.join(runtimeSpeciesDir, `${species.id}_specular.webp`),
      { dataMap: true },
    ),
    sharp(maps.heightPng, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(sourceSpeciesDir, `${species.id}_height.png`)),
  ]);

  manifest.species[species.id] = {
    albedo: `/models/fish/textures/${species.id}/${species.id}_albedo.webp`,
    normal: `/models/fish/textures/${species.id}/${species.id}_normal.webp`,
    orm: `/models/fish/textures/${species.id}/${species.id}_orm.webp`,
    specular: `/models/fish/textures/${species.id}/${species.id}_specular.webp`,
  };
  console.log(`${species.id}: albedo + normal + ORM + specular`);
}

await fs.writeFile(
  path.join(runtimeDir, 'textures-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`Fish PBR maps written to ${path.relative(rootDir, runtimeDir)}`);
