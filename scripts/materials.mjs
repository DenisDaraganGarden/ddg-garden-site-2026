import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME, isValidId, slugify } from './projectStore.mjs';
import { keyHint, readApiKey, removeApiKey, saveApiKey } from './openaiKey.mjs';
import { MATERIAL_RANGES } from '../src/materials/settings.js';
import { categoryOf, materialSize, normalizeRecipe } from '../src/materials/recipe.js';
import {
  blendSeams, compositeBand, luminance, mapsFromRecipe, rollHalf, seamMask, seamRatio, toBytes,
} from './materialMaps.mjs';

// Material workbench: references → colour variants → explicit seam treatment
// → a saved recipe/map set → review → Apply. AI height is optional and must
// be inspected for alignment; normal/AO are derived from the same height.
//
//   ~/Ouroboros/library/materials/<id>/material.json — имя, размер плитки, откуда
//   ~/Ouroboros/library/materials/<id>/{albedo.webp, normal.png, roughness.webp, ao.webp, height.png, preview.webp}
//   ~/Ouroboros/library/materials/.drafts/<черновик>/ — варианты до выбора (сутки)
//
// Аналоги (Pinterest и прочее) уходят только в OpenAI и нигде не хранятся.
export const MATERIALS_DIR = path.join(HOME, 'library', 'materials');
const DRAFTS_DIR = path.join(MATERIALS_DIR, '.drafts');
const OPENAI = process.env.DDG_OPENAI_BASE_URL || 'https://api.openai.com/v1';
const FILES = new Set(['albedo.webp', 'normal.png', 'roughness.webp', 'ao.webp', 'height.png', 'preview.webp']);
export const MATERIAL_SIZES = Object.freeze([1024, 1536, 2048]);
export const MATERIAL_QUALITIES = Object.freeze(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
const DRAFT_ID = /^[a-z0-9]{6,32}$/;

// Модели 2.x рисуют любой размер, кратный 16; прежние — квадрат только 1024.
const freeSize = (model) => /^gpt-image-2/.test(model);
const extraQuality = (model) => /^gpt-image-2\.5/.test(model);
export function requestSize(model, size) {
  const side = MATERIAL_SIZES.includes(Number(size)) ? Number(size) : 1024;
  return freeSize(model) ? side : 1024;
}
export function requestQuality(model, quality) {
  if (!MATERIAL_QUALITIES.includes(quality)) return 'high';
  return ['xhigh', 'max'].includes(quality) && !extraQuality(model) ? 'high' : quality;
}

export function requestDimensions(model, size, sides = [1, 1]) {
  const side = requestSize(model, size);
  const ratio = Math.max(1 / 3, Math.min(3, sides[0] / sides[1]));
  if (!freeSize(model)) return ratio > 1.2 ? '1536x1024' : ratio < 0.83 ? '1024x1536' : '1024x1024';
  const round = (value) => Math.ceil(value / 16) * 16;
  return `${round(side * Math.sqrt(ratio))}x${round(side / Math.sqrt(ratio))}`;
}

// Текст задания модели. Бесшовность, ровный свет и масштаб — всегда, их
// Денис не пишет; его описание — как есть, на любом языке.
export function texturePrompt({ mode = 'create', description = '', tile = 1, tileY = tile, references = 0, context = false }) {
  const what = String(description ?? '').trim();
  const lines = [];
  let image = 1;
  if (mode === 'improve') {
    lines.push(`Image ${image} is the current texture of this material. Recreate it as a better, photorealistic albedo texture of the same material: keep its kind, colours, pattern direction and scale, make the detail crisp and natural.`);
    if (what) lines.push(`What to change: ${what}.`);
    image += 1;
  } else {
    lines.push(`Create a photorealistic albedo (base colour) texture of: ${what || 'the material in the reference images'}.`);
  }
  lines.push(
    'It must be a seamless, tileable texture: the left edge continues into the right edge and the top into the bottom, with no visible seam when repeated.',
    'Orthographic, perfectly flat, straight-on view of the surface filling the whole image edge to edge: no perspective, no horizon, no objects, no border, no text, no watermark.',
    'Albedo only: soft, even, shadowless light; no baked highlights, reflections, strong shadows or vignette. Natural variation of the material is welcome.',
    `The image covers ${Number(tile).toFixed(2).replace(/\.?0+$/, '')} × ${Number(tileY).toFixed(2).replace(/\.?0+$/, '')} m of the real surface (horizontal × vertical). Match the physical proportions of boards, tiles and joints. This is the size of the WHOLE sample, not necessarily one tile or board. Do not turn rectangular pieces into squares.`,
  );
  if (references) {
    const last = image + references - 1;
    lines.push(`${references > 1 ? `Images ${image}–${last} are` : `Image ${image} is`} references for the look — material, colour, finish: match the material, not their composition, perspective or lighting.`);
    image = last + 1;
  }
  if (context) lines.push(`Image ${image} shows where this material is used in the 3D scene — for context only, do not copy it.`);
  return lines.join('\n');
}

export const seamPrompt = (description = '') => [
  'This is a seamless texture shifted by half its size, so its former edges meet in the transparent cross in the middle.',
  'Repaint only the transparent cross so the texture continues naturally and invisibly across it: the same material, pattern, scale, colour and light as around it.',
  'Do not change anything outside the cross. Keep the view flat and straight-on.',
  String(description ?? '').trim() ? `The material: ${String(description).trim()}.` : '',
].filter(Boolean).join('\n');

async function openai(route, { key, json, form, timeout = 300000 }) {
  const response = await fetch(`${OPENAI}${route}`, {
    method: json || form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : form,
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? `OpenAI ответил ${response.status}`;
    throw Object.assign(new Error(response.status === 401 ? `Ключ не подошёл: ${message}` : message), { status: response.status === 401 ? 401 : 502 });
  }
  return payload;
}

async function apiKey() {
  const found = await readApiKey();
  if (!found) throw Object.assign(new Error('Нет ключа OpenAI: «Настройки движка → API», вставить ключ.'), { status: 400 });
  return found.key;
}

// Модели для картинок, что видит этот ключ, — новые первыми.
export async function imageModels(key) {
  const { data = [] } = await openai('/models', { key: key ?? await apiKey(), timeout: 20000 });
  return data.map((model) => model.id).filter((id) => /^(gpt-image|chatgpt-image|dall-e)/.test(id))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
}

const decode = (data) => (data ?? []).map((item) => Buffer.from(item.b64_json, 'base64'));

// size — сторона квадрата или готовое «ШxВ» (растения: по пропорциям
// карточки); background: 'transparent' — картинка с альфой.
export async function generateImages({ model, prompt, n = 1, size = 1024, quality = 'high', images = [], mask = null, background = null }) {
  const key = await apiKey();
  const side = requestSize(model, size);
  const dims = /^\d+x\d+$/.test(String(size)) ? String(size) : `${side}x${side}`;
  const fields = { model, prompt, n: String(n), size: dims, quality: requestQuality(model, quality), output_format: 'png', ...(background ? { background } : {}) };
  if (!images.length) return decode((await openai('/images/generations', { key, json: { ...fields, n } })).data);
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  images.forEach((bytes, index) => form.append(images.length > 1 ? 'image[]' : 'image', new Blob([bytes], { type: 'image/png' }), `image-${index + 1}.png`));
  if (mask) form.append('mask', new Blob([mask], { type: 'image/png' }), 'mask.png');
  return decode((await openai('/images/edits', { key, form })).data);
}

const sharpModule = () => import('sharp').then((module) => module.default);

// Картинка из data URL (аналог, кадр сцены, текущая текстура) → PNG до 2048 px.
async function pngFromDataUrl(value, limit = 2048) {
  const match = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(value ?? ''));
  if (!match) return null;
  const sharp = await sharpModule();
  return sharp(Buffer.from(match[1], 'base64')).rotate().resize(limit, limit, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function cleanDrafts() {
  const names = await fs.readdir(DRAFTS_DIR).catch(() => []);
  const old = Date.now() - 24 * 3600 * 1000;
  await Promise.all(names.map(async (name) => {
    const stat = await fs.stat(path.join(DRAFTS_DIR, name)).catch(() => null);
    if (stat && stat.mtimeMs < old) await fs.rm(path.join(DRAFTS_DIR, name), { recursive: true, force: true });
  }));
}

// Варианты по заданию: create — с нуля (по описанию и аналогам), improve — по
// текущей текстуре. Ответ — адреса вариантов; выбранный доводит finish.
export async function generateDraft(body) {
  const mode = body.mode === 'improve' ? 'improve' : 'create';
  const model = String(body.model || 'gpt-image-2.5-sunburst');
  const [tile, tileY] = materialSize(body);
  const n = Math.min(4, Math.max(1, Math.round(Number(body.n) || 1)));
  const base = mode === 'improve' ? await pngFromDataUrl(body.base) : null;
  if (mode === 'improve' && !base) throw Object.assign(new Error('У материала нет текстуры — «Сгенерировать с нуля».'), { status: 400 });
  const references = (await Promise.all((Array.isArray(body.references) ? body.references : []).slice(0, 12).map((value) => pngFromDataUrl(value, 1536)))).filter(Boolean);
  const context = body.context ? await pngFromDataUrl(body.context, 1536) : null;
  const prompt = texturePrompt({ mode, description: body.description, tile, tileY, references: references.length, context: Boolean(context) });
  const images = [base, ...references, context].filter(Boolean);
  const size = requestSize(model, body.size);
  const dimensions = requestDimensions(model, size, [tile, tileY]);
  const variants = await generateImages({ model, prompt, n, size: dimensions, quality: body.quality, images });
  if (!variants.length) throw Object.assign(new Error('OpenAI не вернул картинок.'), { status: 502 });
  void cleanDrafts();
  const draft = newId();
  const dir = path.join(DRAFTS_DIR, draft);
  await fs.mkdir(dir, { recursive: true });
  const sharp = await sharpModule();
  await Promise.all(variants.map(async (png, index) => {
    await fs.writeFile(path.join(dir, `${index}.png`), png);
    await sharp(png).resize(512, 512, { fit: 'inside' }).webp({ quality: 90 }).toFile(path.join(dir, `${index}.webp`));
  }));
  const meta = { mode, model, quality: requestQuality(model, body.quality), size, dimensions, tile, tileY, category: categoryOf(body), description: String(body.description ?? '').slice(0, 2000), created: new Date().toISOString(), variants: variants.length };
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { draft, ...meta, previews: variants.map((_, index) => `/__materials/drafts/${draft}/${index}.webp`) };
}

async function writeImage(file, pixels, width, height, channels, format) {
  const sharp = await sharpModule();
  const image = sharp(Buffer.from(pixels), { raw: { width, height, channels } });
  if (format === 'png') await image.png({ compressionLevel: 9 }).toFile(file);
  else await image.webp({ lossless: true }).toFile(file);
}

// Imported maps must have the same framing; never silently crop a PBR map.
async function suppliedPixels(dataUrl, width, height, label) {
  const png = await pngFromDataUrl(dataUrl, 4096);
  if (!png) throw Object.assign(new Error(`Нет карты «${label}». Загрузите PNG, WebP или JPEG.`), { status: 400 });
  const sharp = await sharpModule();
  const info = await sharp(png).metadata();
  if (Math.abs(info.width / info.height / (width / height) - 1) > 0.02) {
    throw Object.assign(new Error(`Пропорции карты «${label}» отличаются от цвета (${width} × ${height}). Карты должны совпадать по рисунку и кадрированию.`), { status: 400 });
  }
  return sharp(png).removeAlpha().toColourspace('srgb').resize(width, height, { fit: 'fill' }).raw().toBuffer();
}

export const heightPrompt = (description = '') => [
  'Convert the provided albedo texture to a single grayscale orthographic HEIGHT MAP of this exact surface.',
  'Preserve every joint, edge and feature at the exact same pixel coordinates. No crop, no perspective, no new pattern, no colour, no light, no normal-map colours, no collage or labels.',
  'Black = deepest crevices, white = highest points. Flat tile faces stay at one height even when their colour varies. Colour stains and shadows are not holes. Infer actual surface structure, not brightness.',
  'Keep opposite edges tileable. Output only the registered grayscale height map at the same framing and aspect ratio.',
  String(description).slice(0, 2000),
].join('\n');

// All bakes create a NEW library entry. Rebuilding cannot change a material
// already used in another project; albedo is lossless and never inferred again.
async function writeMaterial({ rgb, width, height, name, tile, tileY, meta = {}, options = {} }) {
  const category = categoryOf({ ...meta, ...options, name });
  const recipe = normalizeRecipe(options.recipe, category);
  const maps = options.maps ?? {};
  let suppliedHeight = null;
  if (maps.height) suppliedHeight = luminance(await suppliedPixels(maps.height, width, height, 'Высота'), width, height, 3);
  else if (recipe.heightMode === 'file') throw Object.assign(new Error('Загрузите карту высоты или выберите другой способ расчёта.'), { status: 400 });
  else if (recipe.heightMode === 'ai') {
    const sharp = await sharpModule();
    const input = await sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } }).png().toBuffer();
    const model = String(options.model || meta.model || 'gpt-image-2.5-sunburst');
    if (width / height > 3 || height / width > 3) throw Object.assign(new Error('Для карты высоты ИИ пропорции образца должны быть от 1:3 до 3:1. Для более длинного образца загрузите готовую карту.'), { status: 400 });
    const [heightPng] = await generateImages({ model, prompt: heightPrompt(meta.description), images: [input], n: 1,
      size: requestDimensions(model, options.size ?? meta.size ?? 1024, [width, height]), quality: options.quality ?? meta.quality ?? 'high' });
    if (!heightPng) throw Object.assign(new Error('ИИ не вернул карту высоты.'), { status: 502 });
    suppliedHeight = luminance(await suppliedPixels(`data:image/png;base64,${heightPng.toString('base64')}`, width, height, 'Высота ИИ'), width, height, 3);
  }
  const built = mapsFromRecipe(rgb, width, height, recipe, materialSize({ tile, tileY }, options.sourceSize ?? [1, 1]), suppliedHeight);
  const supplied = {};
  for (const key of ['normal', 'roughness', 'ao']) {
    if (!maps[key]) continue;
    const data = await suppliedPixels(maps[key], width, height, key);
    supplied[key] = key === 'normal' ? data : toBytes(luminance(data, width, height, 3));
  }
  const id = `${slugify(name).slice(0, 36)}-${newId()}`;
  const dir = path.join(MATERIALS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    writeImage(path.join(dir, 'albedo.webp'), rgb, width, height, 3, 'webp'),
    writeImage(path.join(dir, 'normal.png'), supplied.normal ?? built.normal, width, height, 3, 'png'),
    writeImage(path.join(dir, 'roughness.webp'), supplied.roughness ?? toBytes(built.roughness), width, height, 1, 'webp'),
    writeImage(path.join(dir, 'ao.webp'), supplied.ao ?? toBytes(built.ao), width, height, 1, 'webp'),
    writeImage(path.join(dir, 'height.png'), toBytes(built.height), width, height, 1, 'png'),
  ]);
  if (suppliedHeight) await writeImage(path.join(dir, 'height-source.png'), toBytes(suppliedHeight), width, height, 1, 'png');
  const sharp = await sharpModule();
  await sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } }).resize(512, 512, { fit: 'inside' }).webp({ quality: 90 }).toFile(path.join(dir, 'preview.webp'));
  const entry = {
    ...meta, id, name: String(name).trim().slice(0, 80) || id, created: new Date().toISOString(), tile, tileY: tile === null ? null : tileY ?? tile, size: [width, height],
    category, recipe, normal: 1, roughness: 1, metalness: recipe.metalness, ao: 1,
    mapSources: { height: options.heightOrigin ?? (maps.height ? 'file' : recipe.heightMode), normal: maps.normal ? 'file' : 'height', roughness: maps.roughness ? 'file' : 'recipe', ao: maps.ao ? 'file' : 'height' },
    seamRatio: Math.round(seamRatio(rgb, width, height, 3) * 100) / 100,
  };
  await fs.writeFile(path.join(dir, 'material.json'), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

// Selected variant → optional seam edit → maps → new library entry.
// No silent fallback or square crop. The caller reviews this result before Apply.
export async function finishDraft(body) {
  if (!DRAFT_ID.test(String(body.draft)) || !Number.isInteger(body.variant) || body.variant < 0) throw Object.assign(new Error('Нет такого варианта.'), { status: 400 });
  const dir = path.join(DRAFTS_DIR, body.draft);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const sharp = await sharpModule();
  if (body.variant >= meta.variants) throw Object.assign(new Error('Нет такого варианта.'), { status: 400 });
  const { data, info } = await sharp(await fs.readFile(path.join(dir, `${body.variant}.png`))).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let rgb = data;
  const seam = ['ai', 'blend'].includes(body.seam) ? body.seam : 'none';
  const band = Math.max(8, Math.round(Math.min(width, height) / 12));
  if (seam === 'ai') {
      const rolled = rollHalf(rgb, width, height, 3);
      const png = (pixels, channels) => sharp(Buffer.from(pixels), { raw: { width, height, channels } }).png().toBuffer();
      const [patch] = await generateImages({
        model: meta.model, prompt: seamPrompt(meta.description), n: 1, size: meta.dimensions ?? `${width}x${height}`, quality: meta.quality,
        images: [await png(rolled, 3)], mask: await png(seamMask(width, height, band), 4),
      });
      if (!patch) throw Object.assign(new Error('ИИ не вернул обработанный шов. Исходный вариант сохранён.'), { status: 502 });
      const patchRgb = await sharp(patch).removeAlpha().toColourspace('srgb').resize(width, height, { fit: 'fill' }).raw().toBuffer();
      rgb = rollHalf(compositeBand(rolled, patchRgb, width, height, 3, band), width, height, 3, true);
  }
  if (seam === 'blend') rgb = blendSeams(rgb, width, height, 3, band);
  return writeMaterial({
    rgb, width, height, name: body.name || meta.description || 'Материал', tile: meta.tile, tileY: meta.tileY,
    meta: { mode: meta.mode, model: meta.model, quality: meta.quality, category: meta.category, description: meta.description, seam }, options: body,
  });
}

// Maps from an image or an existing entry. Colour stays intact; AI height,
// local estimates and registered external maps are explicit recipe choices.
export async function mapsFromTexture(body) {
  const sourceId = body.material;
  if (sourceId && !isValidId(sourceId)) throw Object.assign(new Error('Нет такого материала.'), { status: 400 });
  const png = sourceId ? await fs.readFile(path.join(MATERIALS_DIR, sourceId, 'albedo.webp')) : await pngFromDataUrl(body.image, 4096);
  if (!png) throw Object.assign(new Error('У материала нет текстуры.'), { status: 400 });
  const sharp = await sharpModule();
  const { data, info } = await sharp(png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const [tile, tileY] = materialSize(body);
  const options = { ...body, maps: { ...(body.maps ?? {}) } };
  if (sourceId && body.reuseMaps) {
    const sourceDir = path.join(MATERIALS_DIR, sourceId);
    const parent = JSON.parse(await fs.readFile(path.join(sourceDir, 'material.json'), 'utf8'));
    for (const [key, file] of [['height', 'height-source.png'], ['normal', 'normal.png'], ['roughness', 'roughness.webp'], ['ao', 'ao.webp']]) {
      if (options.maps[key]) continue;
      const height = key === 'height';
      if (height ? !['ai', 'file'].includes(body.recipe?.heightMode) || body.recipe.heightMode !== parent.recipe?.heightMode
        : parent.mapSources?.[key] !== 'file') continue;
      const bytes = await fs.readFile(path.join(sourceDir, file)).catch(() => null);
      if (!bytes) continue;
      options.maps[key] = `data:image/${file.endsWith('.png') ? 'png' : 'webp'};base64,${bytes.toString('base64')}`;
      if (height) options.heightOrigin = parent.mapSources?.height;
    }
  }
  return writeMaterial({ rgb: data, width: info.width, height: info.height, name: body.name || 'Материал', tile: body.tile == null ? null : tile, tileY,
    meta: { mode: 'maps', seam: 'none', description: String(body.description ?? '').slice(0, 2000), ...(sourceId ? { parent: sourceId } : {}) }, options });
}

export async function listMaterials() {
  const names = await fs.readdir(MATERIALS_DIR).catch(() => []);
  const entries = await Promise.all(names.filter((name) => isValidId(name)).map(async (name) => {
    try {
      const entry = JSON.parse(await fs.readFile(path.join(MATERIALS_DIR, name, 'material.json'), 'utf8'));
      const stat = await fs.stat(path.join(MATERIALS_DIR, name, 'albedo.webp'));
      return entry.id === name ? { ...entry, category: categoryOf(entry), version: Math.round(stat.mtimeMs) } : null;
    } catch {
      return null;
    }
  }));
  return entries.filter(Boolean).sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

// Имя и умолчания материала из лаборатории «Материалы»: плитка, рельеф и
// матовость, с которыми «Применить» кладёт его на модель. У «только карт»
// плитки нет: они лежат, как лежала текстура в SketchUp.
export function libraryPatch(entry, body) {
  const patch = {};
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (name) patch.name = name;
  const number = (value, [min, max]) => (value === null || value === '' || !Number.isFinite(Number(value)) ? undefined
    : Math.round(Math.min(max, Math.max(min, Number(value))) * 1000) / 1000);
  const tile = number(body.tile, MATERIAL_RANGES.tile);
  if (tile !== undefined && entry.tile !== null) patch.tile = tile;
  for (const key of ['normal', 'roughness', 'tileY', 'rotation', 'ao', 'metalness']) {
    const value = number(body[key], MATERIAL_RANGES[key]);
    if (value !== undefined) patch[key] = value;
  }
  if (typeof body.category === 'string') patch.category = categoryOf({ category: body.category });
  if (typeof body.favorite === 'boolean') patch.favorite = body.favorite;
  return patch;
}

const send = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

async function readJson(request, limit = 64 * 2 ** 20) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Слишком большой запрос: меньше аналогов или меньше их размер.'), { status: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

// Эти маршруты тратят деньги с ключа Дениса: чужая страница в браузере не
// должна их дёрнуть. Только свой адрес (localhost) и только JSON — запрос
// с другого сайта браузер не пропустит без предварительной проверки CORS.
export function trusted(request) {
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) return false;
    } catch {
      return false;
    }
  }
  return request.method === 'GET' || request.method === 'DELETE' || String(request.headers['content-type'] ?? '').startsWith('application/json');
}

const serveFile = async (response, file, type) => {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) { send(response, 404, { ok: false, message: 'Файла нет.' }); return; }
  response.statusCode = 200;
  response.setHeader('Content-Type', type);
  response.setHeader('Content-Length', String(stat.size));
  response.setHeader('Cache-Control', 'no-cache');
  createReadStream(file).pipe(response);
};
const typeOf = (file) => (file.endsWith('.png') ? 'image/png' : 'image/webp');

// GET/PUT/DELETE /__openai/key — есть ли ключ («sk-…abcd»), сохранить, убрать
// GET /__openai/models            — модели картинок этого ключа
// POST /__materials/generate      — варианты по заданию
// POST /__materials/finish        — вариант → явная обработка шва → карты → библиотека
// POST /__materials/maps          — фиксированный цвет → карты по выбранному рецепту
// GET  /__materials/drafts/<черновик>/<n>.webp
// GET  /__library/materials[/<id>/<файл>], PATCH (имя, умолчания)/DELETE /__library/materials/<id>
export function materialsPlugin() {
  const route = (middlewares, prefix, handler) => middlewares.use(prefix, async (request, response, next) => {
    try {
      if (!trusted(request)) { send(response, 403, { ok: false, message: 'Только из редактора на этом компьютере.' }); return; }
      const parts = decodeURIComponent(request.url.replace(/^\/+|\?.*$/g, '')).split('/').filter(Boolean);
      if ((await handler(request, response, parts)) === false) next();
    } catch (error) {
      send(response, error.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Ошибка материалов' });
    }
  });
  const attach = (middlewares) => {
    route(middlewares, '/__openai', async (request, response, [part]) => {
      if (part === 'key') {
        if (request.method === 'PUT') { const saved = await saveApiKey((await readJson(request, 10000)).key); send(response, 200, { ok: true, hint: keyHint(saved.key), where: saved.where }); return true; }
        if (request.method === 'DELETE') { await removeApiKey(); send(response, 200, { ok: true }); return true; }
        const found = await readApiKey();
        send(response, 200, { ok: true, hasKey: Boolean(found), hint: keyHint(found?.key), where: found?.where ?? null });
        return true;
      }
      if (part === 'models' && request.method === 'GET') { send(response, 200, { ok: true, models: await imageModels() }); return true; }
      return false;
    });
    route(middlewares, '/__materials', async (request, response, [part, draft, file]) => {
      if (request.method === 'POST' && part === 'generate') { send(response, 200, { ok: true, ...(await generateDraft(await readJson(request))) }); return true; }
      if (request.method === 'POST' && part === 'finish') { send(response, 200, { ok: true, material: await finishDraft(await readJson(request)) }); return true; }
      if (request.method === 'POST' && part === 'maps') { send(response, 200, { ok: true, material: await mapsFromTexture(await readJson(request)) }); return true; }
      if (request.method === 'GET' && part === 'drafts' && DRAFT_ID.test(draft ?? '') && /^\d+\.webp$/.test(file ?? '')) { await serveFile(response, path.join(DRAFTS_DIR, draft, file), 'image/webp'); return true; }
      return false;
    });
    route(middlewares, '/__library/materials', async (request, response, [id, file]) => {
      if (!id) {
        if (request.method !== 'GET') return false;
        send(response, 200, { ok: true, materials: await listMaterials() });
        return true;
      }
      if (!isValidId(id)) return false;
      const dir = path.join(MATERIALS_DIR, id);
      if (request.method === 'GET' && FILES.has(file)) { await serveFile(response, path.join(dir, file), typeOf(file)); return true; }
      if (request.method === 'DELETE' && !file) { await fs.rm(dir, { recursive: true, force: true }); send(response, 200, { ok: true }); return true; }
      if (request.method === 'PATCH' && !file) {
        const entry = JSON.parse(await fs.readFile(path.join(dir, 'material.json'), 'utf8'));
        Object.assign(entry, libraryPatch(entry, await readJson(request, 10000)));
        await fs.writeFile(path.join(dir, 'material.json'), `${JSON.stringify(entry, null, 2)}\n`);
        send(response, 200, { ok: true, material: entry });
        return true;
      }
      return false;
    });
  };
  return {
    name: 'materials-api',
    configureServer(server) { attach(server.middlewares); },
    configurePreviewServer(server) { attach(server.middlewares); },
  };
}
