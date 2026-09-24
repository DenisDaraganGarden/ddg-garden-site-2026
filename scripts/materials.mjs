import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME, isValidId, slugify } from './projectStore.mjs';
import { keyHint, readApiKey, removeApiKey, saveApiKey } from './openaiKey.mjs';
import {
  aoFrom, blendSeams, compositeBand, heightFrom, luminance, normalFrom, rollHalf, roughnessFrom, seamMask, seamRatio, toBytes,
} from './materialMaps.mjs';

// Материалы по ИИ и их библиотека. Модель OpenAI рисует только цветовую карту
// (альбедо) — по описанию, аналогам, кадру сцены или текущей текстуре из
// SketchUp; шов плитки она же перерисовывает крестом посередине; рельеф,
// нормали, AO и шероховатость считаются из цвета здесь (materialMaps.mjs) —
// поэтому все карты совпадают пиксель в пиксель.
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

// Текст задания модели. Бесшовность, ровный свет и масштаб — всегда, их
// Денис не пишет; его описание — как есть, на любом языке.
export function texturePrompt({ mode = 'create', description = '', tile = 1, references = 0, context = false }) {
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
    'Orthographic, perfectly flat, straight-on view of the surface filling the whole square edge to edge: no perspective, no horizon, no objects, no border, no text, no watermark.',
    'Albedo only: soft, even, shadowless light; no baked highlights, reflections, strong shadows or vignette. Natural variation of the material is welcome.',
    `The square covers ${Number(tile).toFixed(2).replace(/\.?0+$/, '')} × ${Number(tile).toFixed(2).replace(/\.?0+$/, '')} m of the real surface: keep every detail at its true physical size for that scale.`,
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

export async function generateImages({ model, prompt, n = 1, size = 1024, quality = 'high', images = [], mask = null }) {
  const key = await apiKey();
  const side = requestSize(model, size);
  const fields = { model, prompt, n: String(n), size: `${side}x${side}`, quality: requestQuality(model, quality), output_format: 'png' };
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
  const tile = Math.min(50, Math.max(0.05, Number(body.tile) || 1));
  const n = Math.min(4, Math.max(1, Math.round(Number(body.n) || 1)));
  const base = mode === 'improve' ? await pngFromDataUrl(body.base) : null;
  if (mode === 'improve' && !base) throw Object.assign(new Error('У материала нет текстуры — «Сгенерировать с нуля».'), { status: 400 });
  const references = (await Promise.all((Array.isArray(body.references) ? body.references : []).slice(0, 12).map((value) => pngFromDataUrl(value, 1536)))).filter(Boolean);
  const context = body.context ? await pngFromDataUrl(body.context, 1536) : null;
  const prompt = texturePrompt({ mode, description: body.description, tile, references: references.length, context: Boolean(context) });
  const images = [base, ...references, context].filter(Boolean);
  const size = requestSize(model, body.size);
  const variants = await generateImages({ model, prompt, n, size, quality: body.quality, images });
  if (!variants.length) throw Object.assign(new Error('OpenAI не вернул картинок.'), { status: 502 });
  void cleanDrafts();
  const draft = newId();
  const dir = path.join(DRAFTS_DIR, draft);
  await fs.mkdir(dir, { recursive: true });
  const sharp = await sharpModule();
  await Promise.all(variants.map(async (png, index) => {
    await fs.writeFile(path.join(dir, `${index}.png`), png);
    await sharp(png).resize(512, 512, { fit: 'cover' }).webp({ quality: 82 }).toFile(path.join(dir, `${index}.webp`));
  }));
  const meta = { mode, model, quality: requestQuality(model, body.quality), size, tile, description: String(body.description ?? '').slice(0, 2000), created: new Date().toISOString(), variants: variants.length };
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { draft, ...meta, previews: variants.map((_, index) => `/__materials/drafts/${draft}/${index}.webp`) };
}

async function writeImage(file, pixels, width, height, channels, format) {
  const sharp = await sharpModule();
  const image = sharp(Buffer.from(pixels), { raw: { width, height, channels } });
  if (format === 'png') await image.png({ compressionLevel: 9 }).toFile(file);
  else await image.webp({ quality: 92 }).toFile(file);
}

// Из цветовой — все карты и запись библиотеки.
async function writeMaterial({ rgb, width, height, name, tile, meta }) {
  const lum = luminance(rgb, width, height, 3);
  const heightField = heightFrom(lum, width, height);
  const id = `${slugify(name).slice(0, 40)}-${Date.now().toString(36)}`;
  const dir = path.join(MATERIALS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    writeImage(path.join(dir, 'albedo.webp'), rgb, width, height, 3, 'webp'),
    writeImage(path.join(dir, 'normal.png'), normalFrom(heightField, width, height, 2), width, height, 3, 'png'),
    writeImage(path.join(dir, 'roughness.webp'), toBytes(roughnessFrom(lum, heightField)), width, height, 1, 'webp'),
    writeImage(path.join(dir, 'ao.webp'), toBytes(aoFrom(heightField, width, height)), width, height, 1, 'webp'),
    writeImage(path.join(dir, 'height.png'), toBytes(heightField), width, height, 1, 'png'),
  ]);
  // Превью — 2×2 плитки: шов, если он есть, виден сразу.
  const sharp = await sharpModule();
  const quarter = await sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } }).resize(256, 256, { fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: '#000' } })
    .composite([[0, 0], [256, 0], [0, 256], [256, 256]].map(([left, top]) => ({ input: quarter, left, top }))).webp({ quality: 84 }).toFile(path.join(dir, 'preview.webp'));
  const entry = {
    id, name: String(name).trim().slice(0, 80) || id, created: new Date().toISOString(), tile, size: [width, height],
    seamRatio: Math.round(seamRatio(rgb, width, height, 3) * 100) / 100, ...meta,
  };
  await fs.writeFile(path.join(dir, 'material.json'), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

// Выбранный вариант → бесшовный (шов перерисовывает модель, не вышло — сшивается
// на месте) → карты → библиотека.
export async function finishDraft(body) {
  if (!DRAFT_ID.test(String(body.draft)) || !(Number(body.variant) >= 0)) throw Object.assign(new Error('Нет такого варианта.'), { status: 400 });
  const dir = path.join(DRAFTS_DIR, body.draft);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const sharp = await sharpModule();
  const { data, info } = await sharp(await fs.readFile(path.join(dir, `${Number(body.variant)}.png`))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const side = Math.min(info.width, info.height) & ~1;
  let rgb = info.width === side && info.height === side ? data
    : await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(side, side, { fit: 'cover' }).raw().toBuffer();
  const notes = [];
  let seam = body.seam === 'blend' || body.seam === 'none' ? body.seam : 'ai';
  const band = Math.max(8, Math.round(side / 12));
  if (seam === 'ai') {
    try {
      const rolled = rollHalf(rgb, side, side, 3);
      const png = (pixels, channels) => sharp(Buffer.from(pixels), { raw: { width: side, height: side, channels } }).png().toBuffer();
      const [patch] = await generateImages({
        model: meta.model, prompt: seamPrompt(meta.description), n: 1, size: side, quality: meta.quality,
        images: [await png(rolled, 3)], mask: await png(seamMask(side, side, band), 4),
      });
      const patchRgb = await sharp(patch).removeAlpha().resize(side, side, { fit: 'fill' }).raw().toBuffer();
      rgb = rollHalf(compositeBand(rolled, patchRgb, side, side, 3, band), side, side, 3);
    } catch (error) {
      seam = 'blend';
      notes.push(`шов сшит без ИИ: ${error.message}`);
    }
  }
  if (seam === 'blend') rgb = blendSeams(rgb, side, side, 3, band);
  return writeMaterial({
    rgb, width: side, height: side, name: body.name || meta.description || 'Материал', tile: meta.tile,
    meta: { mode: meta.mode, model: meta.model, quality: meta.quality, description: meta.description, seam, ...(notes.length ? { notes } : {}) },
  });
}

// Только карты, без ИИ: к текущей текстуре SketchUp — рельеф, нормали, AO и
// шероховатость. Размер и раскладка прежние (tile: null — как в SketchUp).
export async function mapsFromTexture(body) {
  const png = await pngFromDataUrl(body.image, 4096);
  if (!png) throw Object.assign(new Error('У материала нет текстуры.'), { status: 400 });
  const sharp = await sharpModule();
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return writeMaterial({ rgb: data, width: info.width, height: info.height, name: body.name || 'Материал', tile: null, meta: { mode: 'maps', seam: 'none' } });
}

export async function listMaterials() {
  const names = await fs.readdir(MATERIALS_DIR).catch(() => []);
  const entries = await Promise.all(names.filter((name) => isValidId(name)).map(async (name) => {
    try {
      const entry = JSON.parse(await fs.readFile(path.join(MATERIALS_DIR, name, 'material.json'), 'utf8'));
      const stat = await fs.stat(path.join(MATERIALS_DIR, name, 'albedo.webp'));
      return entry.id === name ? { ...entry, version: Math.round(stat.mtimeMs) } : null;
    } catch {
      return null;
    }
  }));
  return entries.filter(Boolean).sort((a, b) => String(b.created).localeCompare(String(a.created)));
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
function trusted(request) {
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
// POST /__materials/finish        — выбранный вариант → бесшовный → карты → библиотека
// POST /__materials/maps          — карты к текущей текстуре, без ИИ
// GET  /__materials/drafts/<черновик>/<n>.webp
// GET  /__library/materials[/<id>/<файл>], PATCH/DELETE /__library/materials/<id>
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
      if (request.method === 'POST' && part === 'finish') { send(response, 200, { ok: true, material: await finishDraft(await readJson(request, 10000)) }); return true; }
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
        const name = String((await readJson(request, 10000)).name ?? '').trim().slice(0, 80);
        if (name) { entry.name = name; await fs.writeFile(path.join(dir, 'material.json'), `${JSON.stringify(entry, null, 2)}\n`); }
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
