import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { projectRegistry } from './src/data/projectRegistry.js';
import { normalizePortfolioPreviewSettings } from './src/features/portfolio-preview/lib/portfolioPreviewSettings.js';
import { localGuardPlugin, trustedLocalRequest } from './scripts/localGuard.mjs';

// Сайт denisdaragan.com. Главная сцена и её рендер приходят из OUROBOROS
// (отдельный репозиторий, папка ../Ouroboros-Editor) кнопкой «На сайт»: файлы
// из .ouroboros-sync.json здесь не правятся. У сервера сайта одна служебная
// точка — публикация превью портфолио.
const projectRoot = process.cwd();

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

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
  return JSON.parse((await readRawBody(request, 32 * 2 ** 20)).toString('utf8'));
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

      if (!trustedLocalRequest(request)) { sendJson(response, 403, { ok: false, message: 'Только из локального редактора.' }); return; }
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
  plugins: [localGuardPlugin(), react(), portfolioPreviewPublishPlugin()],
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
