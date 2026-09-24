import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { publishedHomeSceneKeys } from './src/features/home-scene/data/publishedHomeSceneKeys.js';
import { isValidId, presets, projects } from './scripts/projectStore.mjs';
import { prepareSketchupGlb } from './scripts/sketchupGlb.mjs';
import { deployPublishedHomeScene } from './scripts/deployScene.mjs';
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

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
function engineStorePlugin() {
  const attach = (middlewares, route, store) => {
    middlewares.use(route, async (request, response, next) => {
      const [id, part, file] = decodeURIComponent(request.url.replace(/^\/+|\?.*$/g, '')).split('/');

      try {
        // Модели проекта: POST /__projects/<id>/models — тело сам .glb, имя в
        // заголовке X-Model-Name; GET /__projects/<id>/models/<модель>.glb.
        // X-Model-Source: sketchup — файл сначала готовится (sketchupGlb.mjs),
        // и ответ говорит, что с ним сделано.
        if (part === 'models' && isValidId(id) && store.writeModel) {
          if (request.method === 'POST' && !file) {
            let bytes = await readRawBody(request, MODEL_UPLOAD_LIMIT);
            let report;
            if (request.headers['x-model-source'] === 'sketchup') {
              if (!(await store.read(id))) { sendJson(response, 404, { ok: false, message: `Проект «${id}» не найден.` }); return; }
              ({ bytes, report } = await prepareSketchupGlb(bytes));
            }
            const saved = await store.writeModel(id, decodeURIComponent(String(request.headers['x-model-name'] ?? 'model')), bytes);
            sendJson(response, saved ? 200 : 404, saved ? { ok: true, ...saved, ...(report ? { report } : {}) } : { ok: false, message: `Проект «${id}» не найден.` });
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

        if (request.method === 'GET') {
          if (!id) {
            sendJson(response, 200, { ok: true, entries: await store.list() });
            return;
          }
          const entry = await store.read(id);
          sendJson(response, entry ? 200 : 404, entry
            ? { ok: true, entry }
            : { ok: false, message: `Запись «${id}» не найдена.` });
          return;
        }

        if (request.method === 'POST' && !id) {
          sendJson(response, 200, { ok: true, entry: await store.create(await readJsonBody(request)) });
          return;
        }

        if (request.method === 'PUT' && isValidId(id)) {
          const entry = await store.save(id, await readJsonBody(request));
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

  const attachAll = (middlewares) => {
    attach(middlewares, '/__projects', projects);
    attach(middlewares, '/__presets', presets);
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
  plugins: [react(), homeScenePublishPlugin(), engineStorePlugin(), riderPosePlugin()],
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
