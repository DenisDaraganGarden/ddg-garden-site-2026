import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRegistry } from './src/data/projectRegistry.js';
import { normalizePortfolioPreviewSettings } from './src/features/portfolio-preview/lib/portfolioPreviewSettings.js';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { publishedHomeSceneKeys } from './src/features/home-scene/data/publishedHomeSceneKeys.js';
import { isValidId, presets, projects } from './scripts/projectStore.mjs';
import { listPlants, plantCardFile, plantPhotoFile, plantSeasonFile, removePlantPhoto, writePlantPhoto } from './scripts/plantLibrary.mjs';
import { generatePlantSeasons, removePlantSeason } from './scripts/plantSeasons.mjs';
import { listLuminaires, luminairePhotoFile, luminairePhotometryFile, removeLuminairePhoto, writeLuminairePhoto } from './scripts/luminaireLibrary.mjs';
import { mapNodes, modelOrigin, prepareSketchupGlb, readGlb, readGlbJson } from './scripts/sketchupGlb.mjs';
import { deployPublishedHomeScene } from './scripts/deployScene.mjs';
import { surroundingsPlugin } from './scripts/surroundings.mjs';
import { materialsPlugin, trusted } from './scripts/materials.mjs';
import { photoRendersPlugin } from './scripts/photoRenders.mjs';
import { referenceLibraryPlugin } from './scripts/referenceLibrary.mjs';
import { localGuardPlugin } from './scripts/localGuard.mjs';
import { exportProjectArchive, importProjectArchive } from './scripts/projectArchive.mjs';
import { poseTuningModule } from './src/components/surfboard/poseTuning.js';

const projectRoot = process.cwd();
const publishedHomeSceneSettingsPath = path.join(
  projectRoot,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
);
const PUBLISHED_HOME_SCENE_SETTINGS_FILE = 'src/features/home-scene/data/publishedHomeSceneSettings.js';
// Which project the home page scene came from (or null for the site's own
// editor), so the project list can say what is on the home page right now.
const PUBLISHED_HOME_SCENE_SOURCE_FILE = 'src/features/home-scene/data/publishedHomeSceneSource.json';
const publishedHomeSceneSourcePath = path.join(projectRoot, PUBLISHED_HOME_SCENE_SOURCE_FILE);
const DEPLOY_FILES = [PUBLISHED_HOME_SCENE_SETTINGS_FILE, PUBLISHED_HOME_SCENE_SOURCE_FILE];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function normalizeHomeSceneSettingsPayload(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Home scene settings payload is missing.');
  }

  const missingKeys = publishedHomeSceneKeys.filter((key) => settings[key] === undefined);

  if (missingKeys.length > 0) {
    throw new Error(`Home scene settings payload is missing keys: ${missingKeys.join(', ')}`);
  }

  return publishedHomeSceneKeys.reduce((normalized, key) => {
    normalized[key] = settings[key];
    return normalized;
  }, {});
}

function normalizeHomeSceneSourcePayload(source) {
  if (!source || typeof source !== 'object') return { projectId: null, projectName: null };
  const projectId = typeof source.projectId === 'string' && isValidId(source.projectId) ? source.projectId : null;
  return { projectId, projectName: projectId && typeof source.projectName === 'string' ? source.projectName.slice(0, 120) : null };
}

function buildPublishedHomeSceneSettingsModule(settings) {
  return `export const publishedHomeSceneSettings = ${JSON.stringify(settings, null, 2)};\n`;
}

// A model upload is the file itself, not JSON. Bounded, so a wrong drop cannot
// fill the memory: a photogrammetry scan is a few hundred megabytes at most.
const MODEL_UPLOAD_LIMIT = 512 * 2 ** 20;
const PHOTO_UPLOAD_LIMIT = 40 * 1024 * 1024;

async function readRawBody(request, limit) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error(`Файл больше ${Math.round(limit / 2 ** 20)} МБ.`);
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// Части адреса после маршрута. Кривая %-последовательность — не исключение
// посреди сервера (оно уронило бы процесс), а ответ 400.
function urlParts(request) {
  try {
    return decodeURIComponent(request.url.replace(/^\/+|\?.*$/g, '')).split('/');
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  return JSON.parse((await readRawBody(request, 32 * 2 ** 20)).toString('utf8'));
}

function homeScenePublishPlugin() {
  const attachHomeScenePublishMiddleware = (middlewares) => {
    middlewares.use('/__home-scene/publish', async (request, response, next) => {
      if (request.method !== 'POST') {
        next();
        return;
      }

      try {
        const body = await readJsonBody(request);
        const normalizedSettings = normalizeHomeSceneSettingsPayload(body.settings);

        await fs.writeFile(
          publishedHomeSceneSettingsPath,
          buildPublishedHomeSceneSettingsModule(normalizedSettings),
          'utf8',
        );
        await fs.writeFile(
          publishedHomeSceneSourcePath,
          `${JSON.stringify({ ...normalizeHomeSceneSourcePayload(body.source), publishedAt: new Date().toISOString() }, null, 2)}\n`,
          'utf8',
        );

        const result = {
          ok: true,
          file: PUBLISHED_HOME_SCENE_SETTINGS_FILE,
        };

        if (body.deploy === true) {
          try {
            result.deploy = await deployPublishedHomeScene({ cwd: projectRoot, files: DEPLOY_FILES });
          } catch (error) {
            // The file is published either way; only the trip to the site failed.
            result.deploy = {
              ok: false,
              message: error instanceof Error ? error.message : 'Deploy failed',
            };
          }
        }

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Home scene publish failed',
        });
      }
    });
  };

  return {
    name: 'home-scene-publish-api',
    configureServer(server) {
      attachHomeScenePublishMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachHomeScenePublishMiddleware(server.middlewares);
    },
  };
}

// Позы райдера (лёжа, гребок, плавание): лаборатория доски («Править позу»)
// присылает поправки Дениса, файл пишется здесь и читается игрой (riderPose.js).
const RIDER_POSE_FILE = 'src/components/surfboard/riderPoseTuning.js';
function riderPosePlugin() {
  const attach = (middlewares) => {
    middlewares.use('/__rider-pose', async (request, response, next) => {
      if (request.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody(request);
        await fs.writeFile(path.join(projectRoot, RIDER_POSE_FILE), poseTuningModule(body), 'utf8');
        sendJson(response, 200, { ok: true, file: RIDER_POSE_FILE });
      } catch (error) {
        sendJson(response, 500, { ok: false, message: error instanceof Error ? error.message : 'Rider pose save failed' });
      }
    });
  };
  return {
    name: 'rider-pose-api',
    configureServer(server) { attach(server.middlewares); },
  };
}

// Проекты и детали движка. Тот же локальный сервер, что публикует сцену, —
// второго канала не заводится. Содержимое присылает редактор: и заводские
// значения, и значения детали живут в браузерном графе импортов, а в конфиге
// эти модули не резолвятся.
// Запись сохранена более новой версией движка (STORE_SCHEMA, projectStore.mjs):
// эта копия поверх не пишет, правки остаются в журнале восстановления редактора.
function sendNewer(response, id) {
  sendJson(response, 426, {
    ok: false,
    newer: true,
    message: `«${id}» сохранён более новой версией движка. Обновите эту копию (npm run engine:update) — правки пока держит журнал восстановления.`,
  });
}

function engineStorePlugin() {
  const attach = (middlewares, route, store) => {
    middlewares.use(route, async (request, response, next) => {
      const parts = urlParts(request);
      if (!parts) { sendJson(response, 400, { ok: false, message: 'Кривой адрес.' }); return; }
      const [id, part, file] = parts;

      try {
        if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
          // Local files must not be writable by a page on another origin.
          const origin = request.headers.origin;
          if (origin && origin !== `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`) {
            sendJson(response, 403, { ok: false, message: 'Запись разрешена только из этого движка.' });
            return;
          }
          const archiveUpload = route === '/__projects' && request.method === 'POST' && !id && /[?&]archive(?:[=&]|$)/.test(request.url)
            && /^application\/zip(?:\s*;|$)/i.test(request.headers['content-type'] ?? '');
          if (request.method !== 'DELETE' && part !== 'models' && !archiveUpload && !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
            sendJson(response, 415, { ok: false, message: 'Ожидается JSON.' });
            return;
          }
        }
        // Модели проекта: POST /__projects/<id>/models — тело сам .glb, имя в
        // заголовке X-Model-Name; GET /__projects/<id>/models/<модель>.glb.
        // X-Model-Source: sketchup — файл сначала готовится (sketchupGlb.mjs),
        // и ответ говорит, что с ним сделано. Ответ несёт и «низ середины»
        // файла (origin), который объект запоминает. X-Replaces: <модель> —
        // новая версия прежнего файла: ответ добавляет его origin и какие его
        // узлы нашлись в новом (replaced.nodeMap) — скрытые части переезжают.
        if (part === 'models' && isValidId(id) && store.writeModel) {
          if (request.method === 'POST' && !file) {
            let bytes = await readRawBody(request, MODEL_UPLOAD_LIMIT);
            if (!(await store.read(id))) { sendJson(response, 404, { ok: false, message: `Проект «${id}» не найден.` }); return; }
            let report;
            if (request.headers['x-model-source'] === 'sketchup') ({ bytes, report } = await prepareSketchupGlb(bytes));
            let json = null;
            try { json = readGlb(bytes).json; } catch { /* не glTF 2.0 — writeModel скажет сам */ }
            let replaced;
            const replaces = String(request.headers['x-replaces'] ?? '');
            const previous = json && isValidId(replaces) ? await store.modelFile(id, replaces) : null;
            if (previous) {
              const old = await readGlbJson(previous.file);
              replaced = { model: replaces, origin: modelOrigin(old), nodeMap: mapNodes(old, json) };
            }
            const saved = await store.writeModel(id, decodeURIComponent(String(request.headers['x-model-name'] ?? 'model')), bytes);
            sendJson(response, saved ? 200 : 404, saved
              ? { ok: true, ...saved, origin: json ? modelOrigin(json) : null, ...(report ? { report } : {}), ...(replaced ? { replaced } : {}) }
              : { ok: false, message: `Проект «${id}» не найден.` });
            return;
          }
          if (request.method === 'GET' && file) {
            const found = await store.modelFile(id, file.replace(/\.glb$/, ''));
            if (!found) { sendJson(response, 404, { ok: false, message: 'Модели нет.' }); return; }
            response.statusCode = 200;
            response.setHeader('Content-Type', 'model/gltf-binary');
            response.setHeader('Content-Length', String(found.size));
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            createReadStream(found.file).pipe(response);
            return;
          }
        }

        // Сетка участка для трасс освещения: PUT/GET /__projects/<id>/site-grid.
        if (part === 'site-grid' && isValidId(id) && store.writeSiteGrid) {
          if (request.method === 'PUT') {
            const saved = await store.writeSiteGrid(id, JSON.parse((await readRawBody(request, 16 * 2 ** 20)).toString('utf8')));
            sendJson(response, saved ? 200 : 404, saved ? { ok: true } : { ok: false, message: `Проект «${id}» не найден.` });
            return;
          }
          if (request.method === 'GET') {
            const found = await store.readSiteGrid(id);
            sendJson(response, found ? 200 : 404, found ? { ok: true, grid: found } : { ok: false, message: 'Сетки участка ещё нет.' });
            return;
          }
        }

        // ТЗ проекта (src/brief/brief.js): GET /__projects/<id>/brief — ТЗ
        // (пустое, если файла ещё нет); POST {op, …} — одна операция поверх
        // того, что на диске сейчас; в ответ — ТЗ после неё.
        if (part === 'brief' && isValidId(id) && store.updateBrief && (request.method === 'GET' || request.method === 'POST')) {
          const brief = request.method === 'GET' ? await store.readBrief(id) : await store.updateBrief(id, await readJsonBody(request));
          sendJson(response, brief ? 200 : 404, brief ? { ok: true, brief } : { ok: false, message: `Проект «${id}» не найден.` });
          return;
        }

        // Генплан: PUT /__projects/<id>/plan {image, view} — снимок камеры
        // «Генплан»; GET …/plan — где стояла камера; GET …/plan.webp — кадр.
        if ((part === 'plan' || part === 'plan.webp') && isValidId(id) && store.writePlan) {
          if (request.method === 'PUT' && part === 'plan') {
            const body = await readJsonBody(request);
            const meta = await store.writePlan(id, body.image, body.view);
            sendJson(response, meta ? 200 : 404, meta ? { ok: true, ...meta } : { ok: false, message: `Проект «${id}» не найден.` });
            return;
          }
          if (request.method === 'GET') {
            const found = part === 'plan' ? await store.readPlan(id) : await store.planImage(id);
            if (!found) { sendJson(response, 404, { ok: false, message: 'Генплана ещё нет.' }); return; }
            if (part === 'plan') { sendJson(response, 200, { ok: true, ...found }); return; }
            response.statusCode = 200;
            response.setHeader('Content-Type', 'image/webp');
            response.setHeader('Cache-Control', 'no-cache');
            response.end(found);
            return;
          }
        }

        // Миниатюра: /__projects/<id>/thumbnail — файл рядом с записью.
        if (part === 'thumbnail' && isValidId(id)) {
          if (request.method === 'GET') {
            const image = await store.readThumbnail(id);
            if (!image) { sendJson(response, 404, { ok: false, message: 'Миниатюры нет.' }); return; }
            response.statusCode = 200;
            response.setHeader('Content-Type', 'image/webp');
            response.setHeader('Cache-Control', 'no-cache');
            response.end(image);
            return;
          }
          if (request.method === 'PUT') {
            const body = await readJsonBody(request);
            sendJson(response, 200, { ok: await store.writeThumbnail(id, body.image) });
            return;
          }
        }

        // История записи (projectStore.mjs): GET /__projects/<id>/history —
        // снимки, новые сверху; POST …/history {reason} — снимок сейчас;
        // POST …/history/<снимок> {action: 'restore'} — вернуть эту версию,
        // нынешняя перед этим уходит в историю.
        if (part === 'history' && isValidId(id) && store.history) {
          if (request.method === 'GET' && !file) {
            const snapshots = await store.history(id);
            sendJson(response, snapshots ? 200 : 404, snapshots ? { ok: true, snapshots } : { ok: false, message: `Запись «${id}» не найдена.` });
            return;
          }
          if (request.method === 'POST') {
            const body = await readJsonBody(request);
            if (!file) {
              const snapshot = await store.snapshot(id, body?.reason);
              sendJson(response, snapshot ? 200 : 404, snapshot ? { ok: true, snapshot } : { ok: false, message: `Запись «${id}» не найдена.` });
              return;
            }
            if (body?.action === 'restore') {
              const entry = await store.restore(id, file);
              if (entry?.newer) { sendNewer(response, id); return; }
              sendJson(response, entry ? 200 : 404, entry ? { ok: true, entry } : { ok: false, message: 'Такого снимка нет.' });
              return;
            }
          }
        }

        // Архив проекта одним файлом (scripts/projectArchive.mjs): GET
        // /__projects/<id>/archive — скачать .zip, POST /__projects?archive —
        // загрузить его как новый проект.
        if (route === '/__projects' && part === 'archive' && request.method === 'GET' && isValidId(id)) {
          const archive = await exportProjectArchive(id);
          if (!archive) { sendJson(response, 404, { ok: false, message: `Запись «${id}» не найдена.` }); return; }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/zip');
          response.setHeader('Content-Disposition', `attachment; filename="${archive.name}"`);
          response.setHeader('Cache-Control', 'no-store');
          response.end(Buffer.from(archive.bytes));
          return;
        }
        if (route === '/__projects' && request.method === 'POST' && !id && /[?&]archive(?:[=&]|$)/.test(request.url)) {
          const result = await importProjectArchive(await readRawBody(request, 2 * 2 ** 30));
          sendJson(response, 200, { ok: true, ...result });
          return;
        }

        // Общие правки — только самой записи (/__projects/<id>): тело, пришедшее
        // на неизвестный подадрес, в запись не вливается и её не удаляет.
        if (part !== undefined) { next(); return; }

        if (request.method === 'GET') {
          if (!id) {
            // ?trash — корзина: удалённые записи, которые можно вернуть.
            const trash = /[?&]trash(?:[=&]|$)/.test(request.url);
            sendJson(response, 200, { ok: true, entries: trash ? await store.listTrash() : await store.list() });
            return;
          }
          const entry = await store.read(id);
          sendJson(response, entry ? 200 : 404, entry
            ? { ok: true, entry }
            : { ok: false, message: `Запись «${id}» не найдена.` });
          return;
        }

        if (request.method === 'POST' && !id) {
          const body = await readJsonBody(request);
          // {restoreTrash: <место в корзине>} — вернуть удалённую запись.
          if (body?.restoreTrash !== undefined) {
            const entry = await store.restoreFromTrash(body.restoreTrash);
            sendJson(response, entry ? 200 : 404, entry ? { ok: true, entry } : { ok: false, message: 'В корзине этого нет.' });
            return;
          }
          sendJson(response, 200, { ok: true, entry: await store.create(body) });
          return;
        }

        if (request.method === 'PUT' && isValidId(id)) {
          const entry = await store.save(id, await readJsonBody(request));
          if (entry?.newer) { sendNewer(response, id); return; }
          if (entry?.conflict) {
            sendJson(response, 409, { ok: false, conflict: true, message: `Запись «${id}» изменили снаружи.`, entry: entry.conflict });
            return;
          }
          sendJson(response, entry ? 200 : 404, entry
            ? { ok: true, entry }
            : { ok: false, message: `Запись «${id}» не найдена.` });
          return;
        }

        if (request.method === 'DELETE' && isValidId(id)) {
          sendJson(response, 200, { ok: await store.remove(id) });
          return;
        }

        next();
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Ошибка хранилища движка',
        });
      }
    });
  };

  // Библиотека растений (scripts/plantLibrary.mjs): записи — GET
  // /__library/plants, карточка сцены — GET …/<id>/card.webp; картинка Дениса
  // к растению — GET …/<id>/photo.webp, POST …/<id>/photo (тело — сама
  // картинка), DELETE …/<id>/photo. Сезоны по ИИ (scripts/plantSeasons.mjs) —
  // POST …/<id>/seasons {phases, model, quality}, GET и DELETE
  // …/<id>/season-<фаза>.webp; рисование тратит деньги — только со своего адреса.
  const attachLibrary = (middlewares) => {
    middlewares.use('/__library/plants', async (request, response, next) => {
      const parts = urlParts(request);
      if (!parts) { sendJson(response, 400, { ok: false, message: 'Кривой адрес.' }); return; }
      const [id, file] = parts;
      try {
        if (file === 'seasons' && request.method === 'POST') {
          if (!trusted(request)) { sendJson(response, 403, { ok: false, message: 'Только из редактора на этом компьютере.' }); return; }
          const results = await generatePlantSeasons(id, JSON.parse((await readRawBody(request, 64 * 1024)).toString('utf8') || '{}'));
          sendJson(response, 200, { ok: true, results });
          return;
        }
        if (/^season-/.test(file ?? '') && request.method === 'DELETE') {
          sendJson(response, 200, { ok: await removePlantSeason(id, file.replace(/^season-|\.webp$/g, '')) });
          return;
        }
        if (file === 'photo' && request.method === 'POST') {
          const saved = await writePlantPhoto(id, await readRawBody(request, PHOTO_UPLOAD_LIMIT));
          sendJson(response, saved ? 200 : 404, saved ? { ok: true, ...saved } : { ok: false, message: `Растения «${id}» нет в библиотеке.` });
          return;
        }
        if (file === 'photo' && request.method === 'DELETE') { sendJson(response, 200, { ok: await removePlantPhoto(id) }); return; }
        if (request.method !== 'GET') { next(); return; }
        if (!id) { sendJson(response, 200, { ok: true, plants: await listPlants() }); return; }
        const found = file === 'card.webp' ? await plantCardFile(id) : file === 'photo.webp' ? await plantPhotoFile(id) : await plantSeasonFile(id, file);
        if (!found) { sendJson(response, 404, { ok: false, message: 'Картинки нет.' }); return; }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'image/webp');
        response.setHeader('Content-Length', String(found.size));
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        createReadStream(found.file).pipe(response);
      } catch (error) {
        sendJson(response, error.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Ошибка библиотеки растений' });
      }
    });
    // Библиотека светильников (scripts/luminaireLibrary.mjs): записи — GET
    // /__library/luminaires, фотометрия паспорта — GET …/<id>/photometry.ies|ldt,
    // картинка изделия — GET …/<id>/photo.webp, POST …/<id>/photo (тело — сама
    // картинка), DELETE …/<id>/photo.
    middlewares.use('/__library/luminaires', async (request, response, next) => {
      const parts = urlParts(request);
      if (!parts) { sendJson(response, 400, { ok: false, message: 'Кривой адрес.' }); return; }
      const [id, file] = parts;
      try {
        if (file === 'photo' && request.method === 'POST') {
          const saved = await writeLuminairePhoto(id, await readRawBody(request, PHOTO_UPLOAD_LIMIT));
          sendJson(response, saved ? 200 : 404, saved ? { ok: true, ...saved } : { ok: false, message: `Светильника «${id}» нет в библиотеке.` });
          return;
        }
        if (file === 'photo' && request.method === 'DELETE') { sendJson(response, 200, { ok: await removeLuminairePhoto(id) }); return; }
        if (request.method !== 'GET') { next(); return; }
        if (!id) { sendJson(response, 200, { ok: true, luminaires: await listLuminaires() }); return; }
        const photo = file === 'photo.webp';
        const found = photo ? await luminairePhotoFile(id) : await luminairePhotometryFile(id, file);
        if (!found) { sendJson(response, 404, { ok: false, message: photo ? 'Картинки нет.' : 'Фотометрии нет.' }); return; }
        response.statusCode = 200;
        response.setHeader('Content-Type', photo ? 'image/webp' : 'text/plain; charset=utf-8');
        response.setHeader('Content-Length', String(found.size));
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        createReadStream(found.file).pipe(response);
      } catch (error) {
        sendJson(response, error.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Ошибка библиотеки светильников' });
      }
    });
  };

  const attachAll = (middlewares) => {
    attach(middlewares, '/__projects', projects);
    attach(middlewares, '/__presets', presets);
    attachLibrary(middlewares);
  };

  return {
    name: 'engine-store-api',
    configureServer(server) {
      attachAll(server.middlewares);
    },
    configurePreviewServer(server) {
      attachAll(server.middlewares);
    },
  };
}

const publishedPortfolioPreviewSettingsPath = path.join(projectRoot, 'src/features/portfolio-preview/data/publishedPortfolioPreviewSettings.js');
function buildPublishedPortfolioPreviewSettingsModule(settings) {
  return `export const publishedPortfolioPreviewSettings = ${JSON.stringify(settings, null, 2)};\n`;
}

function portfolioPreviewPublishPlugin() {
  const attachPortfolioPreviewPublishMiddleware = (middlewares) => {
    middlewares.use('/__portfolio-preview/publish', async (request, response, next) => {
      if (request.method !== 'POST') {
        next();
        return;
      }

      if (!trusted(request)) { sendJson(response, 403, { ok: false, message: 'Только из локального редактора.' }); return; }
      try {
        const body = await readJsonBody(request);
        const normalizedSettings = normalizePortfolioPreviewSettings(projectRegistry, body.settings);

        await fs.writeFile(
          publishedPortfolioPreviewSettingsPath,
          buildPublishedPortfolioPreviewSettingsModule(normalizedSettings),
          'utf8',
        );

        sendJson(response, 200, {
          ok: true,
          file: 'src/features/portfolio-preview/data/publishedPortfolioPreviewSettings.js',
        });
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Portfolio preview publish failed',
        });
      }
    });
  };

  return {
    name: 'portfolio-preview-publish-api',
    configureServer(server) {
      attachPortfolioPreviewPublishMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachPortfolioPreviewPublishMiddleware(server.middlewares);
    },
  };
}

const manualChunks = (id) => {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/scheduler/') ||
    id.includes('/react-router-dom/') ||
    id.includes('/react-router/')
  ) {
    return 'react-vendor';
  }

  // three ships a second, complete renderer for WebGPU plus its shading
  // language. Only the globe on /map reached for it, for paths it never
  // enables; `resolve.alias` below hands it a stub, so this chunk is empty
  // unless something imports the real modules again.
  if (
    id.includes('/three/build/three.webgpu.js') ||
    id.includes('/three/build/three.tsl.js')
  ) {
    return 'three-webgpu';
  }

  if (
    id.includes('/@react-three/fiber/') ||
    (id.includes('/three/') && !id.includes('/three/examples/')) ||
    id.includes('/three-custom-shader-material/')
  ) {
    return 'three-core';
  }

  if (
    id.includes('/@react-three/drei/core/Environment') ||
    id.includes('/@react-three/drei/core/OrbitControls') ||
    id.includes('/@react-three/drei/core/useEnvironment') ||
    id.includes('/@react-three/drei/core/softShadows')
  ) {
    return 'three-scene';
  }

  if (
    id.includes('/@react-three/drei/core/TransformControls') ||
    id.includes('/@react-three/drei/core/Gizmo') ||
    id.includes('/@react-three/drei/core/Stats') ||
    id.includes('/stats-gl/') ||
    id.includes('/stats.js/') ||
    id.includes('/three/examples/jsm/controls/') ||
    id.includes('/three/examples/jsm/helpers/VertexNormalsHelper')
  ) {
    return 'three-editor';
  }

  if (
    id.includes('/react-spring/') ||
    id.includes('/@react-spring/') ||
    id.includes('/@use-gesture/')
  ) {
    return 'motion-vendor';
  }

  return undefined;
};

export default defineConfig({
  // The guard stands first: every /__ route below answers only this computer.
  plugins: [localGuardPlugin(), react(), homeScenePublishPlugin(), portfolioPreviewPublishPlugin(), engineStorePlugin(), riderPosePlugin(), surroundingsPlugin(), materialsPlugin(), photoRendersPlugin(), referenceLibraryPlugin()],
  resolve: {
    alias: [
      { find: /^three\/webgpu$/, replacement: fileURLToPath(new URL('./src/lib/threeWebgpuStub.js', import.meta.url)) },
      { find: /^three\/tsl$/, replacement: fileURLToPath(new URL('./src/lib/threeWebgpuStub.js', import.meta.url)) },
    ],
  },
  optimizeDeps: {
    include: [
      'react-spring',
      'react-globe.gl',
      '@react-three/drei/core/OrbitControls.js',
      '@react-three/drei/core/TransformControls.js',
    ],
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
