import fs from 'node:fs/promises';
import path from 'node:path';
import { isValidId } from './projectStore.mjs';
import { PLANTS_DIR, SEASON_PHASES } from './plantLibrary.mjs';
import { generateImages, requestQuality } from './materials.mjs';

// Сезоны 2D-растения по ИИ: модель OpenAI перерисовывает карточку из
// библиотеки (снимок SketchUp — растение летом или в цвету) таким, какое оно
// весной, летом без цветков, осенью и зимой: голые ветки с цветом коры,
// осенний лист, солома, сухие головки. Картинка — тот же холст, что у
// карточки: основание растения на месте карточки, и сцена (PlantingLayer)
// меняет картинки по месяцу, не двигая растение.
//
//   library/plants/<id>/season-<фаза>.webp — фазы season.js (leaf, spring, autumn, winter)
//   library/plants/<id>/seasons.json       — чем и когда нарисована каждая
//
// Деньги тратятся с ключа Дениса: рисует кнопка «Сезоны · ИИ» в карточке
// растения, никогда сама.
const KIND = {
  tree: 'tree', conifer: 'conifer', shrub: 'shrub', topiary: 'clipped topiary shrub', grass: 'ornamental grass',
  perennial: 'herbaceous perennial', groundcover: 'groundcover plant', climber: 'climbing plant',
};

// Цвет записи словами: модель понимает «глубокий красный» лучше, чем #c2382b.
export function colourWords(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!match) return '';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const s = max ? d / max : 0;
  if (s < 0.15) return max > 0.7 ? 'pale grey' : max > 0.35 ? 'grey' : 'dark grey';
  const h = (d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const name = [[15, 'red'], [40, 'orange'], [68, 'golden yellow'], [165, 'green'], [255, 'blue'], [295, 'purple'], [340, 'magenta'], [361, 'red']].find(([edge]) => h < edge)[1];
  if (name === 'orange' && max < 0.6) return 'russet brown';
  return `${max < 0.5 ? 'deep ' : max > 0.85 && s < 0.5 ? 'pale ' : ''}${name}`;
}
const coloured = (hex) => `${colourWords(hex)} (${hex})`;

// Что показать в фазе — по типу листвы записи.
function phaseText(plant, phase) {
  const foliage = plant.foliage ?? 'evergreen';
  const grass = foliage === 'grass' || plant.category === 'grass';
  const woody = foliage === 'deciduous' || ['tree', 'shrub', 'conifer', 'topiary'].includes(plant.category);
  if (phase === 'leaf') {
    return grass
      ? 'in early summer before it flowers: its leaf blades only, without any flower plumes, spikes or seed heads'
      : `in summer when it is not in flower: its foliage only${plant.fruit ? ', with small unripe fruits' : ''}, without any flowers or flower buds`;
  }
  if (phase === 'spring') {
    if (woody) return 'in early spring at leaf-out: the bare branch structure just breaking into small, fresh, bright light-green young leaves, the branches and twigs clearly visible through the sparse new foliage';
    return grass
      ? 'in spring after it was cut back: a low tuft of short, fresh, bright green new blades rising from the base over the cut straw stubble, about a third of its full height'
      : 'in spring as it comes up: a low clump of fresh young leaves and shoots, about a quarter of its full height, no flowers';
  }
  if (phase === 'autumn') {
    if (woody) {
      const colour = plant.autumnColor ? coloured(plant.autumnColor) : 'yellow and orange';
      return `in mid-autumn: its foliage turned ${colour}${plant.autumnColor2 ? ` with touches of ${coloured(plant.autumnColor2)}` : ''}, with natural variation from leaf to leaf and some leaves already fallen so that the branches begin to show${plant.fruit ? ', ripe fruits on the branches' : ''}`;
    }
    return grass
      ? 'in autumn: the blades turning golden, bronze and straw-coloured, the flower plumes dry, fluffy and pale'
      : 'in autumn after flowering: dry brown seed heads on the stems, the foliage yellowing and browning, a little leaning';
  }
  if (woody) {
    return `in winter: completely leafless, only its natural branching structure, trunk and twigs${plant.twigColor ? ` in their ${coloured(plant.twigColor)} bark` : ''}${plant.fruit ? ', a few persistent fruits' : ''}`;
  }
  return grass
    ? 'in winter: completely dry and pale straw-beige, still standing upright with its dry plumes'
    : 'in winter: dead, dry, dark brown stems and seed heads still standing, no green leaves';
}

export function seasonPrompt(plant, phase) {
  const name = `${plant.latin}${plant.en ? ` (${plant.en})` : ''}`;
  return [
    `The image is a cut-out photograph of a ${KIND[plant.category] ?? 'plant'}: ${name}.`,
    `Redraw exactly this plant — the same individual, the same size in the frame, the same position, camera and viewing angle, the same overall shape and branching — as it looks ${phaseText(plant, phase)}.`,
    'Keep it a realistic photograph true to the species, in the same soft daylight and colour temperature as the original, with crisp natural detail.',
    'Only the plant on a fully transparent background: no ground, no pot, no shadow, no other plants, no text.',
  ].join('\n');
}

// Размер запроса по пропорциям карточки: модели 2.x — любые стороны, кратные
// 16 (длинная — 1024), прежние — три готовых размера.
export function seasonSize(model, width, height) {
  if (/^gpt-image-2/.test(model)) {
    const k = 1024 / Math.max(width, height);
    const side = (value) => Math.max(256, Math.round((value * k) / 16) * 16);
    return [side(width), side(height)];
  }
  return width > height * 1.2 ? [1536, 1024] : height > width * 1.2 ? [1024, 1536] : [1024, 1024];
}

// Где растение на картинке: рамка непрозрачного и основание — середина
// нижнего ряда (у дерева — ствол, у куста — середина куста).
export function footprint(rgba, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (rgba[(y * width + x) * 4 + 3] < 96) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const band = Math.max(2, Math.round((maxY - minY) * 0.04));
  let sum = 0, count = 0;
  for (let y = maxY - band; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    if (rgba[(y * width + x) * 4 + 3] >= 96) { sum += x; count += 1; }
  }
  return { minX, minY, maxX, maxY, baseX: count ? sum / count : (minX + maxX) / 2, baseY: maxY + 1 };
}

// Нарисованное → холст карточки. Основание — на основание карточки; фазы в
// полный рост (всё, кроме весенней поросли) — той же высоты, что карточка,
// но не дальше ±25 % от масштаба холста (canvas — пикселей карточки на
// пиксель запроса): модель иногда отодвигает растение.
export function placement(card, drawn, canvas, fullHeight) {
  let scale = canvas;
  if (fullHeight) {
    const fit = (card.baseY - card.minY) / (drawn.baseY - drawn.minY);
    scale = Math.min(canvas * 1.25, Math.max(canvas * 0.8, fit));
  }
  return { scale, left: Math.round(card.baseX - drawn.baseX * scale), top: Math.round(card.baseY - drawn.baseY * scale) };
}

const sharpModule = () => import('sharp').then((module) => module.default);

export async function placeOnCard(png, card, canvas, fullHeight) {
  const sharp = await sharpModule();
  const drawn = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const where = footprint(drawn.data, drawn.info.width, drawn.info.height);
  if (!where) throw Object.assign(new Error('ИИ вернул пустую картинку.'), { status: 502 });
  const { scale, left, top } = placement(card.where, where, canvas, fullHeight);
  const width = Math.max(1, Math.round(drawn.info.width * scale)), height = Math.max(1, Math.round(drawn.info.height * scale));
  const resized = await sharp(drawn.data, { raw: drawn.info }).resize(width, height, { fit: 'fill' }).raw().toBuffer();
  const out = Buffer.alloc(card.width * card.height * 4);
  for (let y = Math.max(0, top); y < Math.min(card.height, top + height); y += 1) {
    const x0 = Math.max(0, left), x1 = Math.min(card.width, left + width);
    if (x1 <= x0) continue;
    resized.copy(out, (y * card.width + x0) * 4, ((y - top) * width + (x0 - left)) * 4, ((y - top) * width + (x1 - left)) * 4);
  }
  return sharp(out, { raw: { width: card.width, height: card.height, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
}

async function readCard(dir, id) {
  const sharp = await sharpModule();
  const file = path.join(dir, id, 'card.webp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const where = footprint(data, info.width, info.height);
  if (!where) throw Object.assign(new Error('У растения пустая карточка.'), { status: 400 });
  return { data, width: info.width, height: info.height, where };
}

async function readSeasonsMeta(dir, id) {
  try { return JSON.parse(await fs.readFile(path.join(dir, id, 'seasons.json'), 'utf8')); } catch { return {}; }
}

// Нарисовать фазы растения. Каждая — отдельный запрос (правка карточки на
// белом, ответ с прозрачным фоном); неудавшиеся не мешают остальным.
export async function generatePlantSeasons(id, body, dir = PLANTS_DIR) {
  if (!isValidId(id)) throw Object.assign(new Error('Нет такого растения.'), { status: 404 });
  const plant = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8').catch(() => 'null'));
  if (!plant) throw Object.assign(new Error(`Растения «${id}» нет в библиотеке.`), { status: 404 });
  const phases = [...new Set((Array.isArray(body.phases) ? body.phases : []).filter((phase) => SEASON_PHASES.includes(phase)))];
  if (!phases.length) throw Object.assign(new Error('Не сказано, какие сезоны рисовать.'), { status: 400 });
  const model = String(body.model || 'gpt-image-2.5-sunburst');
  const quality = requestQuality(model, body.quality ?? 'high');
  const card = await readCard(dir, id);
  const [width, height] = seasonSize(model, card.width, card.height);
  const sharp = await sharpModule();
  // Карточка на белом, дополненная снизу по центру до пропорций запроса, —
  // масштаб один по обеим осям: пикселей карточки на пиксель запроса — canvas.
  const canvas = Math.max(card.width / width, card.height / height);
  const padW = Math.max(card.width, Math.round(width * canvas)), padH = Math.max(card.height, Math.round(height * canvas));
  const left = Math.floor((padW - card.width) / 2);
  const input = await sharp(card.data, { raw: { width: card.width, height: card.height, channels: 4 } })
    .extend({ top: padH - card.height, bottom: 0, left, right: padW - card.width - left, background: '#ffffffff' })
    .flatten({ background: '#ffffff' }).resize(width, height, { fit: 'fill' }).png().toBuffer();
  const meta = await readSeasonsMeta(dir, id);
  const results = await Promise.all(phases.map(async (phase) => {
    try {
      const [png] = await generateImages({ model, prompt: seasonPrompt(plant, phase), n: 1, size: `${width}x${height}`, quality, images: [input], background: 'transparent' });
      if (!png) throw Object.assign(new Error('OpenAI не вернул картинку.'), { status: 502 });
      const webp = await placeOnCard(png, card, canvas, phase !== 'spring' || plant.foliage === 'deciduous');
      await fs.writeFile(path.join(dir, id, `season-${phase}.webp`), webp);
      meta[phase] = { model, quality, created: new Date().toISOString() };
      return [phase, { ok: true }];
    } catch (error) {
      return [phase, { ok: false, message: error instanceof Error ? error.message : String(error) }];
    }
  }));
  await fs.writeFile(path.join(dir, id, 'seasons.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return Object.fromEntries(results);
}

export async function removePlantSeason(id, phase, dir = PLANTS_DIR) {
  if (!isValidId(id) || !SEASON_PHASES.includes(phase)) return false;
  await fs.rm(path.join(dir, id, `season-${phase}.webp`), { force: true });
  const meta = await readSeasonsMeta(dir, id);
  delete meta[phase];
  await fs.writeFile(path.join(dir, id, 'seasons.json'), `${JSON.stringify(meta, null, 2)}\n`).catch(() => {});
  return true;
}
