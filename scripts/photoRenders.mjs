import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { HOME, isValidId } from './projectStore.mjs';
import { generateImages, requestQuality } from './materials.mjs';
import { photoDimensions, photoPrompt, PHOTO_MODEL, isVegetationPhotoMaterial } from '../src/photo-render/prompt.js';

export const PHOTO_DIR = path.join(HOME, 'library', 'renders');
const JOB_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FILES = new Set(['source.png', 'result.png', 'mask.png', 'foliage-reference.png', 'preview.webp']);
const active = new Map();
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const metaPath = (id) => path.join(PHOTO_DIR, id, 'render.json');
const saveMeta = async (entry) => {
  const file = metaPath(entry.id), temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(entry, null, 2)}\n`);
  await fs.rename(temp, file);
};
const publicEntry = (entry) => ({ ...entry, source: `/__photo-renders/${entry.id}/source.png`, ...(entry.foliageReference ? { foliageReference: `/__photo-renders/${entry.id}/foliage-reference.png` } : {}), ...(entry.status === 'done' ? { result: `/__photo-renders/${entry.id}/result.png`, preview: `/__photo-renders/${entry.id}/preview.webp` } : {}) });

async function dataImage(value) {
  const match = /^data:image\/(?:png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(value ?? ''));
  if (!match || match[1].length > 24 * 2 ** 20) throw error('Нужен кадр PNG, WebP или JPEG до 18 МБ.');
  try {
    const image = sharp(Buffer.from(match[1], 'base64'), { limitInputPixels: 16 * 2 ** 20 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || Math.max(meta.width, meta.height) > 4096) throw error('Максимальная сторона исходника — 4096 px.');
    return { bytes: await image.ensureAlpha().png().toBuffer(), width: meta.width, height: meta.height };
  } catch (issue) { throw error(issue.status ? issue.message : 'Не удалось прочитать изображение.'); }
}

// Alpha 0 edits, alpha 255 protects. The API mask is guidance; this final
// composite makes untouched pixels exactly equal to the source, even if the
// model has reinterpreted the entire picture. No automatic second API call.
export async function compositePhotoMask(source, generated, mask) {
  const { data: base, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const candidate = await sharp(generated).resize(info.width, info.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const alpha = await sharp(mask).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  if (alpha.length !== info.width * info.height) throw error('Размер маски не совпадает с кадром.');
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    const keep = alpha[pixel] / 255;
    if (keep === 1) continue;
    for (let channel = 0; channel < 4; channel++) {
      const at = pixel * 4 + channel;
      base[at] = Math.round(base[at] * keep + candidate[at] * (1 - keep));
    }
  }
  return sharp(base, { raw: info }).png().toBuffer();
}

export async function readPhotoRender(id) {
  if (!JOB_ID.test(id)) throw error('Нет такого рендера.', 404);
  let entry;
  try { entry = JSON.parse(await fs.readFile(metaPath(id), 'utf8')); } catch { throw error('Нет такого рендера.', 404); }
  // A server restart must not strand the UI forever or repeat a paid request.
  if (entry.status === 'running' && !active.has(id)) entry = { ...entry, status: 'interrupted', message: 'Сервер перезапущен. Запрос не повторялся; проверьте его расход в OpenAI перед новым запуском.' };
  return publicEntry(entry);
}

export async function listPhotoRenders(project = 'site') {
  const names = await fs.readdir(PHOTO_DIR).catch((issue) => { if (issue.code === 'ENOENT') return []; throw issue; });
  const entries = await Promise.all(names.filter((name) => JOB_ID.test(name)).map((id) => readPhotoRender(id).catch(() => null)));
  return entries.filter((entry) => entry?.project === project).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 60);
}

export async function startPhotoRender(body, { generate = generateImages } = {}) {
  const id = String(body.requestId ?? '');
  if (!JOB_ID.test(id)) throw error('Нет идентификатора запроса.');
  const existing = await readPhotoRender(id).catch(() => null);
  if (existing) return existing; // Idempotency: a lost HTTP response never doubles the charge.
  if (active.size) throw error('Предыдущий рендер ещё выполняется.', 409);
  const project = body.project || 'site';
  if (!isValidId(project)) throw error('Неизвестный проект.');
  const model = String(body.model || PHOTO_MODEL);
  if (!/^gpt-image-2(?:[.\w-]*)$/.test(model)) throw error('Для этого инструмента нужна модель GPT Image 2 или 2.5.');
  const mode = body.mode === 'edit' ? 'edit' : 'photo';
  const description = String(body.description ?? '').trim().slice(0, 4000);
  if (mode === 'edit' && !description) throw error('Опишите, что изменить в выделенной области.');
  // Reserve before decoding: two tabs may submit simultaneously.
  active.set(id, true);
  let reserved = false;
  try {
    const source = await dataImage(body.image);
    const [width, height] = photoDimensions(source.width, source.height, body.edge);
    const mask = mode === 'edit' ? await dataImage(body.mask) : null;
    if (mask && (mask.width !== source.width || mask.height !== source.height)) throw error('Маска и исходник должны быть одного размера.');
    if (mask) {
      const { data } = await sharp(mask.bytes).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
      if (!data.some((alpha) => alpha < 255)) throw error('Закрасьте кистью область изменения.');
    }
    const references = [];
    for (const item of (Array.isArray(body.references) ? body.references : []).filter((ref) => !isVegetationPhotoMaterial(ref)).slice(0, 6)) {
        references.push({ name: String(item.name ?? '').slice(0, 160), ...(await dataImage(item.image)) });
    }
    const foliageReference = body.foliageReference ? await dataImage(body.foliageReference) : null;
    const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
    if (JSON.stringify(context).length > 40000) throw error('Слишком большое описание кадра.');
    const prompt = photoPrompt({ mode, description, preset: body.preset, context, references, foliageReference: Boolean(foliageReference) });
    const entry = { id, project, mode, description, preset: body.preset || 'scene', model, quality: requestQuality(model, body.quality), size: `${width}x${height}`, sourceSize: [source.width, source.height], camera: String(context.camera?.name ?? '').slice(0, 160), context, prompt, references: references.map(({ name }) => ({ name })), foliageReference: Boolean(foliageReference), created: new Date().toISOString(), status: 'running' };
    await fs.mkdir(PHOTO_DIR, { recursive: true });
    const dir = path.join(PHOTO_DIR, id);
    try { await fs.mkdir(dir); reserved = true; } catch (issue) { if (issue.code === 'EEXIST') throw error('Запрос с таким идентификатором уже принят. Обновите историю.', 409); throw issue; }
    await fs.writeFile(path.join(dir, 'source.png'), source.bytes);
    if (mask) await fs.writeFile(path.join(dir, 'mask.png'), mask.bytes);
    if (foliageReference) await fs.writeFile(path.join(dir, 'foliage-reference.png'), foliageReference.bytes);
    await saveMeta(entry);
    const run = async () => {
      try {
        const [image] = await generate({ model, quality: entry.quality, n: 1, size: entry.size, prompt, images: [source.bytes, ...references.map((ref) => ref.bytes), ...(foliageReference ? [foliageReference.bytes] : [])], mask: mask?.bytes });
        if (!image?.length) throw error('OpenAI не вернул изображение.', 502);
        const result = mask ? await compositePhotoMask(source.bytes, image, mask.bytes) : await sharp(image).png().toBuffer();
        const meta = await sharp(result).metadata();
        await fs.writeFile(path.join(dir, 'result.png'), result);
        await sharp(result).resize(480, 320, { fit: 'inside' }).webp({ quality: 85 }).toFile(path.join(dir, 'preview.webp'));
        await saveMeta({ ...entry, status: 'done', resultSize: [meta.width, meta.height], completed: new Date().toISOString() });
      } catch (issue) {
        await saveMeta({ ...entry, status: 'failed', message: issue.name === 'TimeoutError' ? 'Время ожидания API истекло. Запрос не повторялся автоматически.' : String(issue.message || 'Ошибка рендера').replace(/sk-[A-Za-z0-9_-]+/g, '[key]').slice(0, 1500) });
      } finally { active.delete(id); }
    };
    // Read/poll survives panel close. Never silently retry a chargeable request.
    void run().catch(() => active.delete(id));
    return publicEntry(entry);
  } catch (issue) {
    active.delete(id);
    if (reserved) await saveMeta({ id, project, created: new Date().toISOString(), status: 'failed', message: issue.message }).catch(() => {});
    throw issue;
  }
}

const send = (response, code, payload) => {
  response.statusCode = code; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(payload));
};
// Same-origin loopback only: this endpoint spends the already configured key.
export function trustedPhotoRequest(request) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  try {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname)) return false;
    if (request.headers.origin && new URL(request.headers.origin).host !== host) return false;
  } catch { return false; }
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  return request.method === 'GET' || (request.method === 'POST' && String(request.headers['content-type'] ?? '').split(';')[0] === 'application/json');
}

export function photoRendersPlugin() {
  const attach = (middlewares) => middlewares.use('/__photo-renders', async (request, response) => {
    try {
      if (!trustedPhotoRequest(request)) throw error('Рендер доступен только из редактора на этом компьютере.', 403);
      const url = new URL(request.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (request.method === 'POST' && !parts.length) {
        let length = 0; const chunks = [];
        for await (const chunk of request) { length += chunk.length; if (length > 48 * 2 ** 20) throw error('Слишком большой кадр.', 413); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw error('Некорректный запрос.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw error('Некорректный запрос.');
        send(response, 202, { ok: true, render: await startPhotoRender(body) }); return;
      }
      if (request.method !== 'GET') throw error('Метод не поддерживается.', 405);
      if (!parts.length) { send(response, 200, { ok: true, renders: await listPhotoRenders(url.searchParams.get('project') || 'site') }); return; }
      const [id, file] = parts;
      if (!JOB_ID.test(id) || parts.length > 2) throw error('Нет такого рендера.', 404);
      if (!file) { send(response, 200, { ok: true, render: await readPhotoRender(id) }); return; }
      if (!FILES.has(file)) throw error('Нет такого файла.', 404);
      const target = path.join(PHOTO_DIR, id, file);
      const stat = await fs.stat(target).catch(() => null);
      if (!stat) throw error('Изображение ещё не готово.', 404);
      response.setHeader('Content-Type', file.endsWith('webp') ? 'image/webp' : 'image/png');
      response.setHeader('Content-Length', stat.size);
      response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      if (url.searchParams.has('download')) response.setHeader('Content-Disposition', `attachment; filename="ouroboros-${id.slice(0, 8)}-${file}"`);
      createReadStream(target).pipe(response);
    } catch (issue) { send(response, issue.status || 500, { ok: false, message: issue.message }); }
  });
  return { name: 'photo-renders', configureServer(server) { attach(server.middlewares); }, configurePreviewServer(server) { attach(server.middlewares); } };
}
