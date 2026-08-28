import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const sourcePath = process.argv[2] ?? 'public/textures/lily/lily-atlas-source.png';
const outputDirectory = process.argv[3] ?? path.dirname(sourcePath);
const outputSize = Number(process.env.LILY_TEXTURE_SIZE ?? 2048);

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

function boxBlur(values, width, height, radius) {
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let count = 0;

    for (let x = -radius; x <= radius; x += 1) {
      if (x >= 0 && x < width) {
        sum += values[y * width + x];
        count += 1;
      }
    }

    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / count;
      const removeX = x - radius;
      const addX = x + radius + 1;

      if (removeX >= 0) {
        sum -= values[y * width + removeX];
        count -= 1;
      }
      if (addX < width) {
        sum += values[y * width + addX];
        count += 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;

    for (let y = -radius; y <= radius; y += 1) {
      if (y >= 0 && y < height) {
        sum += horizontal[y * width + x];
        count += 1;
      }
    }

    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / count;
      const removeY = y - radius;
      const addY = y + radius + 1;

      if (removeY >= 0) {
        sum -= horizontal[removeY * width + x];
        count -= 1;
      }
      if (addY < height) {
        sum += horizontal[addY * width + x];
        count += 1;
      }
    }
  }

  return output;
}

function isolateLeaves(rgb, width, height) {
  const pixels = width * height;
  const botanicalPixel = new Uint8Array(pixels);
  const exterior = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let queueStart = 0;
  let queueEnd = 0;

  for (let index = 0; index < pixels; index += 1) {
    const sourceOffset = index * 3;
    const red = rgb[sourceOffset];
    const green = rgb[sourceOffset + 1];
    const blue = rgb[sourceOffset + 2];
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const greenDominance = green - (red + blue) * 0.5;

    botanicalPixel[index] = greenDominance > 0.9 && chroma > 3 ? 1 : 0;
  }

  const enqueueExterior = (index) => {
    if (botanicalPixel[index] || exterior[index]) {
      return;
    }
    exterior[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueExterior(x);
    enqueueExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueExterior(y * width);
    enqueueExterior(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueueExterior(index - 1);
    if (x + 1 < width) enqueueExterior(index + 1);
    if (y > 0) enqueueExterior(index - width);
    if (y + 1 < height) enqueueExterior(index + width);
  }

  const mask = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    mask[index] = exterior[index] ? 0 : 255;
  }

  // Pull the silhouette two source pixels inward. Image generators often bake
  // a pale matte into the antialiased boundary; eroding before color dilation
  // removes that fringe and guarantees opacity never escapes the leaf UV.
  const cleanMask = new Uint8Array(mask);
  const erosionRadius = 2;
  for (let y = erosionRadius; y < height - erosionRadius; y += 1) {
    for (let x = erosionRadius; x < width - erosionRadius; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;

      let touchesExterior = false;
      for (let offsetY = -erosionRadius; offsetY <= erosionRadius && !touchesExterior; offsetY += 1) {
        for (let offsetX = -erosionRadius; offsetX <= erosionRadius; offsetX += 1) {
          if (!mask[(y + offsetY) * width + x + offsetX]) {
            touchesExterior = true;
            break;
          }
        }
      }

      if (touchesExterior) cleanMask[index] = 0;
    }
  }

  return cleanMask;
}

function buildEdgeDistance(mask, width, height) {
  const distance = new Float32Array(mask.length);
  const diagonal = Math.SQRT2;

  for (let index = 0; index < mask.length; index += 1) {
    distance[index] = mask[index] ? 1e6 : 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (x > 0) distance[index] = Math.min(distance[index], distance[index - 1] + 1);
      if (y > 0) distance[index] = Math.min(distance[index], distance[index - width] + 1);
      if (x > 0 && y > 0) distance[index] = Math.min(distance[index], distance[index - width - 1] + diagonal);
      if (x + 1 < width && y > 0) distance[index] = Math.min(distance[index], distance[index - width + 1] + diagonal);
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (x + 1 < width) distance[index] = Math.min(distance[index], distance[index + 1] + 1);
      if (y + 1 < height) distance[index] = Math.min(distance[index], distance[index + width] + 1);
      if (x + 1 < width && y + 1 < height) distance[index] = Math.min(distance[index], distance[index + width + 1] + diagonal);
      if (x > 0 && y + 1 < height) distance[index] = Math.min(distance[index], distance[index + width - 1] + diagonal);
    }
  }

  return distance;
}

function padAlbedo(rgb, mask, width, height) {
  const output = new Uint8Array(rgb);
  const owner = new Int32Array(mask.length);
  owner.fill(-1);
  const queue = new Int32Array(mask.length);
  let queueStart = 0;
  let queueEnd = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    owner[index] = index;
    queue[queueEnd] = index;
    queueEnd += 1;
  }

  const claim = (index, sourceIndex) => {
    if (owner[index] !== -1) return;
    owner[index] = sourceIndex;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const sourceIndex = owner[index];

    if (x > 0) claim(index - 1, sourceIndex);
    if (x + 1 < width) claim(index + 1, sourceIndex);
    if (y > 0) claim(index - width, sourceIndex);
    if (y + 1 < height) claim(index + width, sourceIndex);
  }

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    const sourceIndex = owner[index];
    const outputOffset = index * 3;
    const sourceOffset = sourceIndex * 3;
    output[outputOffset] = rgb[sourceOffset];
    output[outputOffset + 1] = rgb[sourceOffset + 1];
    output[outputOffset + 2] = rgb[sourceOffset + 2];
  }

  return output;
}

function rgbaFrom(rgb, alpha) {
  const output = new Uint8Array(alpha.length * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    output[index * 4] = rgb[index * 3];
    output[index * 4 + 1] = rgb[index * 3 + 1];
    output[index * 4 + 2] = rgb[index * 3 + 2];
    output[index * 4 + 3] = alpha[index];
  }
  return output;
}

function grayscaleRgba(values, alpha) {
  const output = new Uint8Array(alpha.length * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = values[index];
    output[index * 4] = value;
    output[index * 4 + 1] = value;
    output[index * 4 + 2] = value;
    output[index * 4 + 3] = alpha[index];
  }
  return output;
}

async function writeTexture(fileName, data, width, height, channels) {
  await sharp(data, { raw: { width, height, channels } })
    .resize(outputSize, outputSize, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDirectory, fileName));
}

const { data, info } = await sharp(sourcePath)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;

if (width !== height) {
  throw new Error(`Expected a square source atlas, received ${width}x${height}`);
}

await fs.mkdir(outputDirectory, { recursive: true });

const mask = isolateLeaves(data, width, height);
const paddedAlbedo = padAlbedo(data, mask, width, height);
const edgeDistance = buildEdgeDistance(mask, width, height);
const luminance = new Float32Array(mask.length);

for (let index = 0; index < mask.length; index += 1) {
  const offset = index * 3;
  luminance[index] = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

const broadLuminance = boxBlur(luminance, width, height, 9);
const heightMap = new Uint8Array(mask.length);
const roughnessMap = new Uint8Array(mask.length);
const specularMap = new Uint8Array(mask.length);
const translucencyMap = new Uint8Array(mask.length);
const aoMap = new Uint8Array(mask.length);
const ormMap = new Uint8Array(mask.length * 4);
const materialMap = new Uint8Array(mask.length * 4);

for (let index = 0; index < mask.length; index += 1) {
  if (!mask[index]) {
    continue;
  }

  const offset = index * 3;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const detail = luminance[index] - broadLuminance[index];
  const edge = 1 - Math.min(edgeDistance[index] / 42, 1);
  const vein = Math.max(detail, 0);

  heightMap[index] = clampByte(116 + Math.min(edgeDistance[index], 34) * 0.48 + detail * 1.75);
  roughnessMap[index] = clampByte(196 - chroma * 0.32 - detail * 0.48 + edge * 14);
  specularMap[index] = clampByte(48 + (255 - roughnessMap[index]) * 0.55 + Math.max(-detail, 0) * 0.24);
  translucencyMap[index] = clampByte(74 + edge * 142 + Math.max(luminance[index] - 68, 0) * 0.16 - vein * 0.7);
  aoMap[index] = clampByte(239 + Math.min(detail, 0) * 0.72 - edge * 9);

  ormMap[index * 4] = aoMap[index];
  ormMap[index * 4 + 1] = roughnessMap[index];
  ormMap[index * 4 + 2] = 0;
  ormMap[index * 4 + 3] = mask[index];

  materialMap[index * 4] = roughnessMap[index];
  materialMap[index * 4 + 1] = specularMap[index];
  materialMap[index * 4 + 2] = translucencyMap[index];
  materialMap[index * 4 + 3] = mask[index];
}

const normalMap = new Uint8Array(mask.length * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    const outputOffset = index * 4;
    if (!mask[index]) {
      normalMap[outputOffset] = 128;
      normalMap[outputOffset + 1] = 128;
      normalMap[outputOffset + 2] = 255;
      normalMap[outputOffset + 3] = 0;
      continue;
    }

    const left = heightMap[y * width + Math.max(0, x - 1)] / 255;
    const right = heightMap[y * width + Math.min(width - 1, x + 1)] / 255;
    const up = heightMap[Math.max(0, y - 1) * width + x] / 255;
    const down = heightMap[Math.min(height - 1, y + 1) * width + x] / 255;
    let normalX = (left - right) * 5.2;
    let normalY = (down - up) * 5.2;
    let normalZ = 1;
    const inverseLength = 1 / Math.hypot(normalX, normalY, normalZ);
    normalX *= inverseLength;
    normalY *= inverseLength;
    normalZ *= inverseLength;

    normalMap[outputOffset] = clampByte((normalX * 0.5 + 0.5) * 255);
    normalMap[outputOffset + 1] = clampByte((normalY * 0.5 + 0.5) * 255);
    normalMap[outputOffset + 2] = clampByte((normalZ * 0.5 + 0.5) * 255);
    normalMap[outputOffset + 3] = mask[index];
  }
}

await Promise.all([
  writeTexture('lily_atlas_albedo.png', rgbaFrom(paddedAlbedo, mask), width, height, 4),
  writeTexture('lily_atlas_opacity.png', grayscaleRgba(mask, mask), width, height, 4),
  writeTexture('lily_atlas_normal.png', normalMap, width, height, 4),
  writeTexture('lily_atlas_height.png', grayscaleRgba(heightMap, mask), width, height, 4),
  writeTexture('lily_atlas_roughness.png', grayscaleRgba(roughnessMap, mask), width, height, 4),
  writeTexture('lily_atlas_specular.png', grayscaleRgba(specularMap, mask), width, height, 4),
  writeTexture('lily_atlas_translucency.png', grayscaleRgba(translucencyMap, mask), width, height, 4),
  writeTexture('lily_atlas_ao.png', grayscaleRgba(aoMap, mask), width, height, 4),
  writeTexture('lily_atlas_orm.png', ormMap, width, height, 4),
  writeTexture('lily_atlas_material.png', materialMap, width, height, 4),
]);

console.log(`Generated ${outputSize}px lily PBR atlas maps in ${outputDirectory}`);
