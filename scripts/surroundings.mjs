import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidId, projects } from './projectStore.mjs';
import {
  bboxAround, buildSurroundings, buildTerrainGrid, mergeAuthored, overpassQuery, pixelOf, stringifySurroundings,
  summarizeSurroundings, SURROUNDINGS_LIMITS, SURROUNDINGS_MARGIN, withGeometry, areaKind,
} from '../src/surroundings/osm.js';

// Окружение участка — серверная сторона: адрес → точка (Nominatim), точка →
// дома, дороги, вода, деревья (OpenStreetMap) и рельеф (Terrarium, AWS Open
// Data), всё в метрах сцены. Результат — файл проекта
// ~/Ouroboros/projects/<id>/surroundings.json: в git он не попадает, на сайт
// не уезжает, агент читает и правит его как текст.
//
// Сеть здесь ненадёжна (из России Overpass то отвечает, то рвёт TLS), поэтому
// у каждого шага запасной путь: зеркала Overpass, затем API самого OSM;
// рельеф не пришёл — земля ровная, и отчёт об этом говорит.
//
//   node scripts/surroundings.mjs <проект> [--radius 400] [--at 47.2225,39.7188]
//     загрузить окружение заново (правки edited/custom/hidden сохраняются)
//   node scripts/surroundings.mjs <проект> --touch
//     после ручной правки файла: новая метка, открытый редактор перечитает его

const USER_AGENT = 'Ouroboros-engine/1.4 (landscape design; https://denisdaragan.com)';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const LICENSE = 'Данные © участники OpenStreetMap, ODbL (openstreetmap.org/copyright). Рельеф: Terrarium / Mapzen, AWS Open Data (SRTM и др.).';

async function request(url, { timeout = 60000, headers, signal, ...options } = {}) {
  const limit = AbortSignal.timeout(timeout);
  const response = await fetch(url, { ...options, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: signal ? AbortSignal.any([signal, limit]) : limit });
  if (!response.ok) {
    const error = new Error(`ответ ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
}
const reason = (error) => (error?.name === 'TimeoutError' ? 'не ответил вовремя'
  : error?.status ? `ответ ${error.status}` : error?.cause?.code ?? error?.message ?? 'ошибка сети');
const host = (url) => new URL(url).host;

// Серверы опрашиваются лесенкой: первый молчит STAGGER — подключается
// следующий, отказал — следующий сразу; первый ответ побеждает, остальные
// отменяются. Так живой сервер отвечает за секунды, даже когда соседние висят.
const STAGGER = 8000;
function firstAnswer(attempts) {
  return new Promise((resolve) => {
    const controllers = [];
    let next = 0, failed = 0, done = false, timer = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const controller of controllers) controller.abort();
      resolve(value);
    };
    const launch = () => {
      clearTimeout(timer);
      if (done || next >= attempts.length) return;
      const controller = new AbortController();
      controllers.push(controller);
      attempts[next++](controller.signal).then(finish, () => {
        failed += 1;
        if (failed === attempts.length) finish(null);
        else launch();
      });
      timer = setTimeout(launch, STAGGER);
    };
    launch();
  });
}

function overpass(url, bbox, radius, notes) {
  return async (signal) => {
    try {
      const body = new URLSearchParams({ data: overpassQuery(bbox) });
      const json = await (await request(url, { method: 'POST', body, signal, timeout: 40000 + radius * 40 })).json();
      if (/runtime error|timed out|out of memory/i.test(json.remark ?? '')) throw new Error(json.remark);
      return { elements: json.elements ?? [], source: host(url) };
    } catch (error) {
      if (!signal.aborted) notes.push(`${host(url)}: ${reason(error)}`);
      throw error;
    }
  };
}

// Запасной путь — API самого OpenStreetMap: всё подряд в прямоугольнике, до
// 50 000 точек за запрос, поэтому площадь режется на клетки (и клетка — ещё
// на четыре, если точек в ней больше). Отношения-площади (река, парк), от
// которых в клетки попал только кусок, догружаются целиком.
const osmApi = (bbox, notes) => async (signal) => {
  const elements = new Map();
  const put = (list) => { for (const element of list) elements.set(`${element.type}${element.id}`, element); };
  const cell = async ({ s, w, n, e }, depth = 0) => {
    try {
      put((await (await request(`${OSM_API}/map.json?bbox=${[w, s, e, n].map((v) => v.toFixed(6)).join(',')}`, { signal, timeout: 90000 })).json()).elements ?? []);
    } catch (error) {
      if (error.status !== 400 || depth >= 2) throw error;
      const midLat = (s + n) / 2, midLon = (w + e) / 2;
      for (const part of [{ s, w, n: midLat, e: midLon }, { s, w: midLon, n: midLat, e }, { s: midLat, w, n, e: midLon }, { s: midLat, w: midLon, n, e }]) await cell(part, depth + 1);
    }
  };
  try {
    const side = Math.ceil(((bbox.n - bbox.s) * 111320) / 700);
    for (let i = 0; i < side; i += 1) {
      for (let j = 0; j < side; j += 1) {
        await cell({
          s: bbox.s + ((bbox.n - bbox.s) * i) / side, n: bbox.s + ((bbox.n - bbox.s) * (i + 1)) / side,
          w: bbox.w + ((bbox.e - bbox.w) * j) / side, e: bbox.w + ((bbox.e - bbox.w) * (j + 1)) / side,
        });
      }
    }
    const partial = [...elements.values()].filter((element) => element.type === 'relation' && element.tags?.type === 'multipolygon'
      && (element.tags.building || areaKind(element.tags))
      && element.members.some((member) => member.type === 'way' && !elements.has(`way${member.ref}`)));
    const whole = async (relation) => {
      try {
        put((await (await request(`${OSM_API}/relation/${relation.id}/full.json`, { signal, timeout: 90000 })).json()).elements ?? []);
      } catch (error) {
        if (signal.aborted) throw error;
        notes.push(`отношение ${relation.id}: ${reason(error)}`);
      }
    };
    // Дома в центре города часто — мультиполигоны из общих стен: догружаются по восемь сразу.
    const some = partial.slice(0, 96);
    for (let i = 0; i < some.length; i += 8) await Promise.all(some.slice(i, i + 8).map(whole));
    return { elements: withGeometry([...elements.values()]), source: host(OSM_API) };
  } catch (error) {
    if (!signal.aborted) notes.push(`${host(OSM_API)}: ${reason(error)}`);
    throw error;
  }
};

async function retry(job, times = 2) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await job();
    } catch (error) {
      if (attempt >= times) throw error;
    }
  }
}

// Рельеф из тайлов Terrarium: высота = R·256 + G + B/256 − 32768 м. Источник
// в России — SRTM, 30 м: склоны к реке видны, бордюры — нет.
async function terrain({ lat, lon, radius }) {
  const zoom = radius > 700 ? 13 : 14;
  const { s, w, n, e } = bboxAround(lat, lon, radius * SURROUNDINGS_MARGIN);
  const [left, top] = pixelOf(n, w, zoom), [right, bottom] = pixelOf(s, e, zoom);
  const jobs = [];
  for (let tx = Math.floor((left - 2) / 256); tx <= Math.floor((right + 2) / 256); tx += 1) {
    for (let ty = Math.floor((top - 2) / 256); ty <= Math.floor((bottom + 2) / 256); ty += 1) jobs.push([tx, ty]);
  }
  const { default: sharp } = await import('sharp');
  const tiles = new Map();
  await Promise.all(jobs.map(async ([tx, ty]) => {
    const bytes = await retry(async () => (await request(`${TERRARIUM}/${zoom}/${tx}/${ty}.png`, { timeout: 20000 })).arrayBuffer());
    const { data, info } = await sharp(Buffer.from(bytes)).raw().toBuffer({ resolveWithObject: true });
    const heights = new Float32Array(info.width * info.height);
    for (let i = 0; i < heights.length; i += 1) {
      const o = i * info.channels;
      heights[i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
    }
    tiles.set(`${tx}/${ty}`, heights);
  }));
  const at = (px, py) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const tile = tiles.get(`${tx}/${ty}`);
    return tile ? tile[(py - ty * 256) * 256 + (px - tx * 256)] : NaN;
  };
  const elevationAt = (la, lo) => {
    const [px, py] = pixelOf(la, lo, zoom);
    const fx = px - 0.5, fy = py - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  return buildTerrainGrid({ lat, lon, radius, elevationAt });
}

export async function loadSurroundings({ lat, lon, radius }, previous = null) {
  const notes = [];
  const bbox = bboxAround(lat, lon, radius * SURROUNDINGS_MARGIN);
  // API самого OSM — четвёртым: он тяжелее (всё подряд), зато отвечает, когда Overpass лежит.
  const [first, second, third, last] = OVERPASS;
  const [osm, relief] = await Promise.all([
    firstAnswer([overpass(first, bbox, radius, notes), overpass(second, bbox, radius, notes), overpass(third, bbox, radius, notes), osmApi(bbox, notes), overpass(last, bbox, radius, notes)]),
    terrain({ lat, lon, radius }).catch((error) => { notes.push(`рельеф: ${reason(error)} — земля ровная`); return null; }),
  ]);
  if (!osm) throw new Error(`OpenStreetMap не ответил (${notes.join('; ')}). Проверьте сеть и повторите.`);
  const data = mergeAuthored(buildSurroundings(osm.elements, { lat, lon, radius }), previous);
  return {
    ...data,
    stamp: new Date().toISOString(),
    license: LICENSE,
    source: { osm: osm.source, terrain: relief ? 'terrarium' : null },
    elevation: relief?.elevation ?? null,
    ...(notes.length ? { notes } : {}),
    terrain: relief?.grid ?? null,
  };
}

export const surroundingsPath = (id) => path.join(projects.dir, id, 'surroundings.json');

export async function readSurroundings(id) {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(surroundingsPath(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeSurroundings(id, data) {
  const file = surroundingsPath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, stringifySurroundings(data), 'utf8');
  await fs.rename(`${file}.tmp`, file);
}

// Адрес → точки. Nominatim — геокодер самого OSM; не ответил — Photon (тот
// же OSM, другой сервер).
export async function searchPlaces(query) {
  const q = String(query ?? '').trim().slice(0, 200);
  if (!q) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '6', 'accept-language': 'ru,en' })}`;
    const list = await (await request(url, { timeout: 15000 })).json();
    return list.map((place) => ({ label: place.display_name, lat: Number(place.lat), lon: Number(place.lon), kind: place.type }));
  } catch {
    const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '6' })}`;
    const json = await (await request(url, { timeout: 15000 })).json();
    return (json.features ?? []).map(({ geometry, properties: p }) => ({
      label: [p.name, [p.street, p.housenumber].filter(Boolean).join(' '), p.city, p.state, p.country].filter(Boolean).join(', '),
      lat: geometry.coordinates[1], lon: geometry.coordinates[0], kind: p.osm_value,
    }));
  }
}

const send = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

async function readJson(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 10000) throw new Error('Слишком большой запрос.');
  }
  return text ? JSON.parse(text) : {};
}

// Новая загрузка: точка, радиус. Одна на проект за раз.
const loading = new Set();
async function reload(id, body) {
  const lat = Number(body.lat), lon = Number(body.lon);
  const [min, max] = SURROUNDINGS_LIMITS.radius;
  const radius = Math.round(Math.min(max, Math.max(min, Number(body.radius) || 300)));
  if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) throw Object.assign(new Error('Нет точки участка: найдите адрес или щёлкните по карте.'), { status: 400 });
  if (!(await projects.read(id))) throw Object.assign(new Error(`Проект «${id}» не найден.`), { status: 404 });
  if (loading.has(id)) throw Object.assign(new Error('Окружение уже загружается.'), { status: 409 });
  loading.add(id);
  try {
    const previous = await readSurroundings(id).catch(() => null);
    const data = await loadSurroundings({ lat, lon, radius }, previous);
    await writeSurroundings(id, data);
    return data;
  } finally {
    loading.delete(id);
  }
}

// GET /__geo/search?q=…          — места по адресу
// GET /__surroundings/<проект>   — файл окружения
// POST /__surroundings/<проект>  — {lat, lon, radius}: загрузить заново
export function surroundingsPlugin() {
  const attach = (middlewares) => {
    middlewares.use('/__geo/search', async (request, response) => {
      try {
        const q = new URL(request.url, 'http://local').searchParams.get('q');
        send(response, 200, { ok: true, places: await searchPlaces(q) });
      } catch (error) {
        send(response, 502, { ok: false, message: `Поиск адреса не ответил (${reason(error)}). Можно вставить координаты «47.2225, 39.7188» или щёлкнуть по карте.` });
      }
    });
    middlewares.use('/__surroundings', async (request, response, next) => {
      const id = decodeURIComponent(request.url.replace(/^\/+|\?.*$/g, ''));
      if (!isValidId(id)) { next(); return; }
      try {
        if (request.method === 'GET') {
          const text = await fs.readFile(surroundingsPath(id), 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
          if (text === null) { send(response, 404, { ok: false, message: 'Окружение ещё не загружено.' }); return; }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(text);
          return;
        }
        if (request.method === 'POST') {
          const data = await reload(id, await readJson(request));
          send(response, 200, { ok: true, stamp: data.stamp, summary: summarizeSurroundings(data), source: data.source, elevation: data.elevation, notes: data.notes ?? [] });
          return;
        }
        next();
      } catch (error) {
        send(response, error.status ?? 500, { ok: false, message: error.message });
      }
    });
  };
  return {
    name: 'surroundings-api',
    configureServer(server) { attach(server.middlewares); },
    configurePreviewServer(server) { attach(server.middlewares); },
  };
}

// Метка в проекте: редактор, открытый на этом проекте, перечитывает файл,
// когда окно снова в фокусе. Поверх чужой записи не пишется (base).
async function stampProject(id, patch) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const project = await projects.read(id);
    const saved = await projects.save(id, { settings: { ...project.settings, ...patch }, base: project.updated });
    if (!saved?.conflict) return saved;
  }
  throw new Error('Проект меняют прямо сейчас — повторите.');
}

export function formatSummary(summary) {
  return `домов ${summary.buildings} (высота из OSM ${summary.measured}, по этажам ${summary.levels}, оценка ${summary.guessed}) · `
    + `дорог ${summary.roadsKm} км · площадей ${summary.areas} · деревьев ${summary.trees} · заборов ${summary.fences}`;
}

async function cli(args) {
  const [id, ...rest] = args;
  const option = (name) => { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; };
  const project = isValidId(id) ? await projects.read(id) : null;
  if (!project) throw new Error(`Проект «${id ?? ''}» не найден в ${projects.dir}. Использование: node scripts/surroundings.mjs <проект> [--radius 400] [--at 47.2225,39.7188] | --touch`);
  if (rest.includes('--touch')) {
    const data = await readSurroundings(id);
    if (!data) throw new Error('Файла окружения ещё нет — сначала загрузите его.');
    data.stamp = new Date().toISOString();
    await writeSurroundings(id, data);
    await stampProject(id, { surroundingsStamp: data.stamp });
    console.log(`Метка обновлена: ${data.stamp}. ${formatSummary(summarizeSurroundings(data))}`);
    return;
  }
  const at = option('at')?.split(',').map(Number);
  const lat = at?.[0] ?? project.settings.geoLatitude, lon = at?.[1] ?? project.settings.geoLongitude;
  const radius = Number(option('radius')) || project.settings.surroundingsRadius || 300;
  const data = await reload(id, { lat, lon, radius });
  await stampProject(id, { geoLatitude: data.center.lat, geoLongitude: data.center.lon, surroundingsRadius: data.radius, surroundingsStamp: data.stamp });
  console.log(`${surroundingsPath(id)}\n${formatSummary(summarizeSurroundings(data))}\nисточник: ${data.source.osm}, рельеф: ${data.source.terrain ?? 'нет'}${data.elevation !== null ? `, высота точки ${data.elevation} м` : ''}${data.notes ? `\n${data.notes.join('\n')}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
