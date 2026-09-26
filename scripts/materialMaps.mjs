// Карты материала из общего поля высоты: цветовая оценка, плоский профиль
// или высота из файла/ИИ. Нормали, AO и вариация матовости считаются из
// одного поля, без независимой генерации каждой карты. Совмещение высоты
// с альбедо зависит от её источника; для ИИ его проверяют в редакторе.
//
// Всё здесь — на сырых пикселях (Uint8Array RGB/RGBA или Float32Array одного
// канала), без sharp и сети: читает и пишет файлы scripts/materials.mjs,
// проверка — materialMaps.check.mjs. Соседи по краю берутся с другой стороны
// плитки (wrap): бесшовная картинка даёт бесшовные карты.

const wrap = (value, size) => ((value % size) + size) % size;

// Сдвиг на полплитки: шов уходит в середину крестом, край становится серединой.
export function rollHalf(pixels, width, height, channels, inverse = false) {
  const out = pixels instanceof Float32Array ? new Float32Array(pixels.length) : new Uint8Array(pixels.length);
  const dx = inverse ? Math.ceil(width / 2) : width >> 1, dy = inverse ? Math.ceil(height / 2) : height >> 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * channels, to = (wrap(y + dy, height) * width + wrap(x + dx, width)) * channels;
      for (let c = 0; c < channels; c += 1) out[to + c] = pixels[from + c];
    }
  }
  return out;
}

// Вес полосы шва после сдвига: 1 на кресте посередине, 0 дальше band, мягкий
// спад на последней трети — туда и только туда ложится перерисованное.
export function seamWeight(width, height, band) {
  const weight = new Float32Array(width * height);
  const cx = width / 2, cy = height / 2, soft = Math.max(1, band / 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.min(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy));
      weight[y * width + x] = distance <= band - soft ? 1 : distance >= band ? 0 : (band - distance) / soft;
    }
  }
  return weight;
}

// Маска для правки по API: прозрачное (альфа 0) — где рисовать, то есть крест.
export function seamMask(width, height, band) {
  const weight = seamWeight(width, height, band);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < weight.length; i += 1) rgba[i * 4 + 3] = weight[i] > 0 ? 0 : 255;
  return rgba;
}

// Перерисованное ложится только в полосу: всё вне креста остаётся пиксель в
// пиксель своим, даже если модель тронула остальное (маска у неё — подсказка).
export function compositeBand(base, patch, width, height, channels, band) {
  const weight = seamWeight(width, height, band);
  const out = new Uint8Array(base.length);
  for (let i = 0; i < weight.length; i += 1) {
    const w = weight[i];
    for (let c = 0; c < channels; c += 1) out[i * channels + c] = Math.round(base[i * channels + c] * (1 - w) + patch[i * channels + c] * w);
  }
  return out;
}

// Без ИИ: край плитки берётся из её же середины, сдвинутой на полплитки, с
// плавным переходом. Стык исчезает; у досок и кирпича в переходе бывает
// двоение — этот способ включается только явно, по умолчанию рисунок сохранён.
export function blendSeams(pixels, width, height, channels, band) {
  const shifted = rollHalf(pixels, width, height, channels);
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x + 0.5, width - x - 0.5, y + 0.5, height - y - 0.5);
      const t = Math.min(1, Math.max(0, edge / band));
      const w = 1 - t * t * (3 - 2 * t);
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c += 1) out[i + c] = Math.round(pixels[i + c] * (1 - w) + shifted[i + c] * w);
    }
  }
  return out;
}

// Яркость 0…1 (sRGB без перевода: для рельефа важен порядок, не физика).
export function luminance(pixels, width, height, channels) {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i += 1) {
    const o = i * channels;
    out[i] = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255;
  }
  return out;
}

// Размытие коробкой по кругу плитки, дважды — почти гаусс, за O(n) на радиус.
export function blurWrap(field, width, height, radius) {
  if (radius < 1) return Float32Array.from(field);
  let current = Float32Array.from(field);
  const pass = (source, horizontal) => {
    const out = new Float32Array(source.length);
    const span = 2 * radius + 1;
    const lines = horizontal ? height : width, length = horizontal ? width : height;
    const at = (line, i) => (horizontal ? line * width + wrap(i, width) : wrap(i, height) * width + line);
    for (let line = 0; line < lines; line += 1) {
      let sum = 0;
      for (let i = -radius; i <= radius; i += 1) sum += source[at(line, i)];
      for (let i = 0; i < length; i += 1) {
        out[at(line, i)] = sum / span;
        sum += source[at(line, i + radius + 1)] - source[at(line, i - radius)];
      }
    }
    return out;
  };
  for (let k = 0; k < 2; k += 1) current = pass(pass(current, true), false);
  return current;
}

// Рельеф: светлое — выше, тёмные щели — ниже. Крупные пятна света (их
// нарисованное освещение) вычитаются, остаётся рисунок материала; края — по
// перцентилям, чтобы одна яркая искра не сжала всё остальное.
export function heightFrom(lum, width, height) {
  const large = blurWrap(lum, width, height, Math.max(2, Math.round(Math.min(width, height) / 24)));
  const detail = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i += 1) detail[i] = lum[i] - large[i];
  const smooth = blurWrap(detail, width, height, 1);
  const sorted = Float32Array.from(smooth).sort();
  const low = sorted[Math.floor(sorted.length * 0.02)], high = sorted[Math.floor(sorted.length * 0.98)];
  const range = Math.max(1e-6, high - low);
  for (let i = 0; i < smooth.length; i += 1) smooth[i] = Math.min(1, Math.max(0, (smooth[i] - low) / range));
  return smooth;
}

// Нормали по рельефу, в осях OpenGL (как у three.js): X — вправо по картинке,
// Y — вверх по картинке, Z — из поверхности. strength — крутизна рельефа.
export function normalFrom(heightField, width, height, strength = 2) {
  const out = new Uint8Array(width * height * 3);
  const [kx, ky] = Array.isArray(strength) ? strength : [strength * (width / 256), strength * (height / 256)];
  const h = (x, y) => heightField[wrap(y, height) * width + wrap(x, width)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Собель: вправо — +x, вниз по строкам — +y картинки.
      const gx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) / 8;
      const gy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) / 8;
      // Вверх по картинке — навстречу строкам: наклон по Y берётся с другим знаком.
      let nx = -gx * kx, ny = gy * ky, nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length; ny /= length; nz /= length;
      const o = (y * width + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

// Затенение щелей: насколько точка ниже своей округи на трёх масштабах.
export function aoFrom(heightField, width, height, strength = 1) {
  const out = new Float32Array(heightField.length);
  const scale = Math.min(width, height);
  const radii = [scale / 256, scale / 96, scale / 40].map((r) => Math.max(1, Math.round(r)));
  const around = radii.map((radius) => blurWrap(heightField, width, height, radius));
  const weights = [1.4, 1, 0.6];
  for (let i = 0; i < out.length; i += 1) {
    let cavity = 0;
    for (let k = 0; k < around.length; k += 1) cavity += Math.max(0, around[k][i] - heightField[i]) * weights[k];
    out[i] = Math.min(1, Math.max(0, 1 - cavity * 1.6 * strength));
  }
  return out;
}

// Шероховатость: матовая основа, тёмные щели матовее, светлые гладкие места
// чуть глаже. В сцене значение ещё умножается ползунком «Матовость».
export function roughnessFrom(lum, heightField, base = 0.78) {
  const out = new Float32Array(lum.length);
  let mean = 0;
  for (let i = 0; i < lum.length; i += 1) mean += lum[i];
  mean /= Math.max(1, lum.length);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(1, Math.max(0.2, base + (mean - lum[i]) * 0.35 + (0.5 - heightField[i]) * 0.12));
  return out;
}

export const toBytes = (field) => Uint8Array.from(field, (value) => Math.round(Math.min(1, Math.max(0, value)) * 255));

// Predictable recipe: no percentile stretch of tiny colour/noise variations.
// Flat surfaces remain flat; an imported/AI height field stays registered to RGB.
export function mapsFromRecipe(rgb, width, height, recipe, metres = [1, 1], suppliedHeight = null) {
  const lum = luminance(rgb, width, height, 3);
  let field;
  if (suppliedHeight) field = Float32Array.from(suppliedHeight);
  else if (recipe.heightMode === 'flat') field = new Float32Array(width * height).fill(0.5);
  else if (recipe.heightMode === 'luminance') field = Float32Array.from(lum);
  else {
    const large = blurWrap(lum, width, height, Math.max(2, Math.round(Math.min(width, height) / 32)));
    field = Float32Array.from(lum, (value, i) => Math.max(0, Math.min(1, 0.5 + (value - large[i]) * 2)));
  }
  if (recipe.invert) field = Float32Array.from(field, (value) => 1 - value);
  const radius = Math.round(recipe.smoothing * Math.min(width, height) / 512);
  if (radius) field = blurWrap(field, width, height, radius);
  const depth = recipe.depth / 1000;
  const normal = normalFrom(field, width, height, [depth * width / metres[0], depth * height / metres[1]]);
  const roughness = Float32Array.from(field, (value) => Math.max(0.02, Math.min(1, recipe.roughness + (0.5 - value) * recipe.variation)));
  return { height: field, normal, roughness, ao: aoFrom(field, width, height, recipe.ao) };
}

// Шов плитки: насколько отличаются соседи через край против соседей в
// середине — ≈1 шва не видно, ≫1 видно. Для проверки и отчёта.
export function seamRatio(pixels, width, height, channels) {
  const diff = (a, b) => { let sum = 0; for (let c = 0; c < channels; c += 1) sum += Math.abs(pixels[a + c] - pixels[b + c]); return sum; };
  let across = 0, inside = 0;
  for (let y = 0; y < height; y += 1) {
    across += diff((y * width + width - 1) * channels, (y * width) * channels);
    inside += diff((y * width + (width >> 1) - 1) * channels, (y * width + (width >> 1)) * channels);
  }
  for (let x = 0; x < width; x += 1) {
    across += diff(((height - 1) * width + x) * channels, x * channels);
    inside += diff((((height >> 1) - 1) * width + x) * channels, ((height >> 1) * width + x) * channels);
  }
  return across / Math.max(1, inside);
}
