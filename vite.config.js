import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { publishedHomeSceneKeys } from './src/features/home-scene/data/publishedHomeSceneKeys.js';
import { isValidId, presets, projects } from './scripts/projectStore.mjs';

const projectRoot = process.cwd();
const publishedHomeSceneSettingsPath = path.join(
  projectRoot,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
);
const execFileAsync = promisify(execFile);
const PUBLISHED_HOME_SCENE_SETTINGS_FILE = 'src/features/home-scene/data/publishedHomeSceneSettings.js';
const DEPLOY_REMOTE = 'origin';
const DEPLOY_BRANCH = 'main';

async function git(args, timeout = 60000) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: projectRoot,
    timeout,
    maxBuffer: 1 << 20,
  });
  return `${stdout}${stderr}`.trim();
}

// Publishing writes a file into the checkout; the site only changes when that
// file reaches main on GitHub, where the Pages workflow builds it. This is the
// other half of the "to the site" button: commit the published file on its
// own and push HEAD to main. Fast-forward only - anything else is a merge for
// a person to look at, and the error says so.
async function deployPublishedHomeScene() {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  await git(['add', '--', PUBLISHED_HOME_SCENE_SETTINGS_FILE]);
  const staged = await git(['diff', '--cached', '--name-only', '--', PUBLISHED_HOME_SCENE_SETTINGS_FILE]);
  let commit = null;

  if (staged) {
    await git(['commit', '--only', '-m', 'chore(home): publish authored scene', '--', PUBLISHED_HOME_SCENE_SETTINGS_FILE]);
    commit = await git(['rev-parse', '--short', 'HEAD']);
  }

  const push = await git(['push', DEPLOY_REMOTE, `HEAD:${DEPLOY_BRANCH}`], 180000);

  return {
    ok: true,
    branch,
    commit,
    head: await git(['rev-parse', '--short', 'HEAD']),
    push,
  };
}

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

function buildPublishedHomeSceneSettingsModule(settings) {
  return `export const publishedHomeSceneSettings = ${JSON.stringify(settings, null, 2)};\n`;
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

        const result = {
          ok: true,
          file: PUBLISHED_HOME_SCENE_SETTINGS_FILE,
        };

        if (body.deploy === true) {
          try {
            result.deploy = await deployPublishedHomeScene();
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

// Проекты и детали движка. Тот же локальный сервер, что публикует сцену, —
// второго канала не заводится. Содержимое присылает редактор: и заводские
// значения, и значения детали живут в браузерном графе импортов, а в конфиге
// эти модули не резолвятся.
function engineStorePlugin() {
  const attach = (middlewares, route, store) => {
    middlewares.use(route, async (request, response, next) => {
      const [id, part] = decodeURIComponent(request.url.replace(/^\/+|\?.*$/g, '')).split('/');

      try {
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
  // language. Only the globe on /map reaches for it; on the home route it was
  // 610 kB of download and parse that nothing called.
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
  plugins: [react(), homeScenePublishPlugin(), engineStorePlugin()],
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
