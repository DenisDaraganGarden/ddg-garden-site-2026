import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HOME } from './projectStore.mjs';
import { withStoreLock, writeJsonAtomic } from './storeFiles.mjs';
import { trusted } from './materials.mjs';

// Same gallery-dl adapter as album-vol-1/src/server/library, with lazy local
// image caching. This store belongs to OUROBOROS; album projects are never opened
// for writing. Refresh is additive: an offline/partial response cannot erase refs.
export const REFERENCES_DIR = path.join(HOME, 'library', 'references');
const exec = promisify(execFile), jobs = new Map(), images = new Map();
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 24);
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
export function referenceProfile(value) {
  let text = String(value ?? '').trim().replace(/^@/, '');
  if (/^https?:\/\//.test(text)) {
    const url = new URL(text);
    if (!/(^|\.)pinterest\.(com|ru|co\.uk|de|fr|it|es|ca|com\.au)$/.test(url.hostname)) throw problem('Нужен профиль Pinterest.');
    text = url.pathname.split('/').filter(Boolean)[0] ?? '';
  }
  if (!/^[a-zA-Z0-9_]{2,50}$/.test(text)) throw problem('Укажите имя аккаунта или ссылку на профиль Pinterest.');
  return text.toLowerCase();
}
const mediaUrl = (value) => {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'i.pinimg.com' ? u.href : null; } catch { return null; }
};
export function parsePinterest(text) {
  return JSON.parse(text, (_, value, context) => typeof value === 'number' && /^\d{15,}$/.test(context?.source ?? '') ? context.source : value);
}
export function pinterestBoards(raw) {
  return (Array.isArray(raw) ? raw : []).filter((r) => r[0] === 6 && r[2]?.name && /^https:\/\/www\.pinterest\.com\//.test(r[1])).map(([, url, meta]) => ({
    id: hash(url), name: String(meta.name).slice(0, 160), url, count: Number(meta.pin_count) || 0,
    cover: mediaUrl(meta.image_cover_hd_url || meta.image_cover_url || meta.cover_images?.['236x']?.url), updated: '',
  }));
}
export function pinterestPins(raw, board) {
  return (Array.isArray(raw) ? raw : []).filter((r) => r[0] === 3 && mediaUrl(r[1]) && /^\d{5,30}$/.test(String(r[2]?.id))).map(([, url, meta]) => ({
    id: String(meta.id), board, title: String(meta.title || meta.description || '').slice(0, 300), url: mediaUrl(url),
  }));
}
async function gallery(url) {
  const binary = process.env.DDG_GALLERY_DL || (await fs.access('/opt/homebrew/bin/gallery-dl').then(() => '/opt/homebrew/bin/gallery-dl', () => 'gallery-dl'));
  try {
    const { stdout } = await exec(binary, ['--ignore-config', '--no-input', '--http-timeout', '20', '--retries', '1', '-j', url], { timeout: 120000, maxBuffer: 128 * 2 ** 20 });
    return parsePinterest(stdout);
  } catch (error) {
    throw problem(error.code === 'ENOENT' ? 'Не найден gallery-dl, который используется для Pinterest в album Vol1.' : 'Pinterest сейчас недоступен либо профиль закрыт. Сохранённые изображения доступны локально.', 502);
  }
}
const manifestPath = (profile) => path.join(REFERENCES_DIR, `${profile}.json`);
export async function readReferences(profile) {
  profile = referenceProfile(profile);
  return fs.readFile(manifestPath(profile), 'utf8').then(JSON.parse, () => ({ profile, updated: '', boards: [], pins: [] }));
}
async function saveReferences(data) {
  return withStoreLock(REFERENCES_DIR, async () => {
    const latest = await readReferences(data.profile);
    const boards = new Map(latest.boards.map((item) => [item.id, item]));
    const pins = new Map(latest.pins.map((item) => [`${item.board}:${item.id}`, item]));
    for (const board of data.boards) boards.set(board.id, { ...board, updated: [board.updated, boards.get(board.id)?.updated || ''].sort().at(-1) });
    for (const pin of data.pins) pins.set(`${pin.board}:${pin.id}`, pin);
    const merged = { ...data, boards: [...boards.values()], pins: [...pins.values()], updated: [data.updated, latest.updated].sort().at(-1) };
    await writeJsonAtomic(manifestPath(data.profile), merged);
    return merged;
  });
}
export async function syncReferences(profile, boardId, extract = gallery) {
  const data = await readReferences(profile), now = new Date().toISOString();
  if (!boardId) {
    const boards = pinterestBoards(await extract(`https://www.pinterest.com/${data.profile}/`));
    if (!boards.length) throw problem('Публичных досок не найдено. Сохранённая библиотека оставлена на месте.', 502);
    const kept = new Map(data.boards.map((b) => [b.id, b]));
    for (const board of boards) kept.set(board.id, { ...board, updated: kept.get(board.id)?.updated ?? '' });
    data.boards = [...kept.values()]; data.updated = now;
  } else {
    const board = data.boards.find((b) => b.id === boardId);
    if (!board) throw problem('Доска не найдена.', 404);
    const raw = await extract(board.url);
    const pins = pinterestPins(raw, board.id);
    // One level of Pinterest sections, matching album Vol1. A failed section
    // makes the refresh fail rather than silently declaring a complete board.
    for (const row of raw.filter((r) => r[0] === 6 && typeof r[1] === 'string')) {
      if (!row[1].startsWith(board.url) || row[1] === board.url) continue;
      pins.push(...pinterestPins(await extract(row[1]), board.id));
    }
    if (!pins.length && board.count) throw problem('Pinterest не вернул изображения доски. Локальные аналоги сохранены.', 502);
    const kept = new Map(data.pins.map((p) => [`${p.board}:${p.id}`, p]));
    for (const pin of pins) kept.set(`${pin.board}:${pin.id}`, pin);
    data.pins = [...kept.values()]; board.updated = now;
  }
  return saveReferences(data);
}
async function remoteImage(url) {
  let target = mediaUrl(url);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!target) throw problem('Недопустимый адрес изображения.');
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) { target = mediaUrl(new URL(response.headers.get('location'), target)); continue; }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw problem('Изображение Pinterest недоступно.', 502);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 20 * 2 ** 20) throw problem('Изображение больше 20 МБ.', 413); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw problem('Не удалось загрузить изображение.', 502);
}
export async function referenceImage(profile, id, kind = 'thumb', boardId) {
  const data = await readReferences(profile);
  const pin = data.pins.find((p) => p.id === id && (!boardId || p.board === boardId));
  const url = kind === 'cover' ? data.boards.find((b) => b.id === id)?.cover : pin?.url;
  if (!url) throw problem('Изображение не найдено.', 404);
  const full = kind === 'full', key = `${hash(url)}-${full ? 'full' : 'thumb'}`;
  const file = path.join(REFERENCES_DIR, 'images', `${key}.webp`);
  if (await fs.stat(file).catch(() => null)) return file;
  if (!images.has(key)) images.set(key, (async () => {
    const original = path.join(REFERENCES_DIR, 'images', `${hash(url)}-full.webp`);
    const bytes = !full ? await fs.readFile(original).catch(() => null) : null;
    const remote = full || kind === 'cover' ? url : url.replace(/\/originals\//, '/474x/');
    const buffer = bytes || await remoteImage(remote).catch((error) => { if (remote === url) throw error; return remoteImage(url); });
    const { default: sharp } = await import('sharp');
    const result = await sharp(buffer, { limitInputPixels: 80e6 }).rotate().resize({ width: full ? 2048 : 320, height: full ? 2048 : 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: full ? 94 : 80 }).toBuffer();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, result); await fs.rename(temporary, file);
    return file;
  })().finally(() => images.delete(key)));
  return images.get(key);
}
const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
export function referenceLibraryPlugin() {
  const attach = (server) => { server.middlewares.use('/__references', async (request, response, next) => {
    try {
      if (!trusted(request)) throw problem('Только из локального редактора.', 403);
      const url = new URL(request.url, 'http://localhost');
      const profile = referenceProfile(url.searchParams.get('profile') || 'daragangarden');
      if (request.method === 'GET' && url.pathname === '/image') {
        const file = await referenceImage(profile, url.searchParams.get('id'), url.searchParams.get('kind'), url.searchParams.get('board'));
        response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400' }); response.end(await fs.readFile(file)); return;
      }
      if (request.method === 'POST' && url.pathname === '/sync') {
        const board = url.searchParams.get('board') || null;
        if (!jobs.get(profile)?.running) {
          const state = { running: true, board, error: '' }; jobs.set(profile, state);
          void syncReferences(profile, board).catch((error) => { state.error = error.message; }).finally(() => { state.running = false; });
        }
        json(response, 202, { ok: true, job: jobs.get(profile) }); return;
      }
      if (request.method === 'GET' && url.pathname === '/') {
        const data = await readReferences(profile);
        json(response, 200, { ok: true, ...data, job: jobs.get(profile) ?? null }); return;
      }
      next();
    } catch (error) { json(response, error.status || 500, { ok: false, message: error.message }); }
  }); };
  return { name: 'local-reference-library', configureServer: attach, configurePreviewServer: attach };
}
