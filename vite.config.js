import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();
const portfolioImportRoot = path.join(projectRoot, 'public', 'portfolio', 'imported');
const publishedSnakeSettingsPath = path.join(projectRoot, 'src', 'data', 'publishedSnakeSettings.js');
const publishedSnakeKeys = [
  'planeAlbedo',
  'planeRoughness',
  'planeMetalness',
  'planeHeight',
  'planeRadius',
  'planeTrailSpan',
  'planeTrailPersistence',
  'planeSharpness',
  'planeHeadTaper',
  'planeTailTaper',
  'planeMeshDensity',
  'hdrExposure',
  'lightIntensity',
  'lightColor',
  'lightAngle',
  'lightDistance',
  'lightHeight',
  'cameraFov',
  'planePos',
];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function sanitizeSegment(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'project';
}

function sanitizeFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const name = path.basename(filename, ext);
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'image';

  return `${safeName}${ext || '.jpg'}`;
}

function normalizeSnakeSettingsPayload(settings) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('Snake settings payload is missing.');
  }

  return publishedSnakeKeys.reduce((normalized, key) => {
    if (settings[key] !== undefined) {
      normalized[key] = settings[key];
    }

    return normalized;
  }, {});
}

function buildPublishedSnakeSettingsModule(settings) {
  return `export const publishedSnakeSettings = ${JSON.stringify(settings, null, 2)};\n`;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function buildPortfolioProjectsModule(projects) {
  return `import { createLocalizedSheetLabel, createLocalizedText } from '../i18n/localizedContent';\n\nexport const portfolioEditorialProjects = ${JSON.stringify(projects, null, 2)};\n`
    .replace(/"label":\s*{\s*"type":\s*"localized",\s*"ru":\s*"(Лист\s+\d+)",\s*"en":\s*"(Sheet\s+\d+)"\s*}/g, (match, ru, en) => {
      const index = parseInt(ru.match(/\d+/)[0], 10) - 1;
      return `"label": createLocalizedSheetLabel(${index})`;
    })
    .replace(/"(title|subtitle|location|statement|description|coverAlt|alt)":\s*{\s*"type":\s*"localized",\s*"ru":\s*"(.*?)",\s*"en":\s*"(.*?)"\s*}/g, (match, key, ru, en) => {
      return `"${key}": createLocalizedText(${JSON.stringify(ru)}, ${JSON.stringify(en)})`;
    });
}

function portfolioPublishPlugin() {
  const portfolioProjectsPath = path.join(projectRoot, 'src', 'data', 'portfolioEditorialProjects.js');

  return {
    name: 'portfolio-publish-api',
    configureServer(server) {
      server.middlewares.use('/__portfolio/publish', async (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        try {
          const body = await readJsonBody(request);
          const { projects } = body;

          if (!Array.isArray(projects)) {
            throw new Error('Projects data is missing or invalid.');
          }

          // 1. Write the file
          await fs.writeFile(
            portfolioProjectsPath,
            buildPortfolioProjectsModule(projects),
            'utf8',
          );

          // 2. Git operations (Simple: add, commit, push)
          const { execSync } = await import('node:child_process');

          try {
            execSync('git add src/data/portfolioEditorialProjects.js', { cwd: projectRoot });
            execSync('git commit -m "chore: update portfolio projects via editor"', { cwd: projectRoot });
            execSync('git push', { cwd: projectRoot });
          } catch (gitError) {
            console.warn('Git push failed, but file was saved:', gitError.message);
            // We still return success for the file save, but mention the git issue if needed
            // For now, let's treat git failure as a partial success if the file is at least on disk
          }

          sendJson(response, 200, {
            ok: true,
            file: 'src/data/portfolioEditorialProjects.js',
          });
        } catch (error) {
          sendJson(response, 500, {
            ok: false,
            message: error instanceof Error ? error.message : 'Portfolio publish failed',
          });
        }
      });
    },
  };
}

function portfolioImportPlugin() {
  return {
    name: 'portfolio-import-api',
    configureServer(server) {
      server.middlewares.use('/__portfolio/status', async (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }

        sendJson(response, 200, {
          available: true,
          targetDir: 'public/portfolio/imported',
          message: 'Images copied here are available to the local Vite app immediately.',
        });
      });

      server.middlewares.use('/__portfolio/import', async (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        try {
          const body = await readJsonBody(request);
          const projectId = sanitizeSegment(body.projectId);
          const files = Array.isArray(body.files) ? body.files : [];

          await fs.mkdir(path.join(portfolioImportRoot, projectId), { recursive: true });

          const importedFiles = [];

          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const match = String(file.dataUrl ?? '').match(/^data:(.+);base64,(.+)$/);

            if (!match) {
              continue;
            }

            const ext = path.extname(file.name || '').toLowerCase();
            const safeFilename = sanitizeFilename(file.name || `image-${index + 1}${ext || '.jpg'}`);
            const finalFilename = `${Date.now()}-${index + 1}-${safeFilename}`;
            const targetPath = path.join(portfolioImportRoot, projectId, finalFilename);
            const fileBuffer = Buffer.from(match[2], 'base64');

            await fs.writeFile(targetPath, fileBuffer);

            importedFiles.push({
              name: finalFilename,
              url: `/portfolio/imported/${projectId}/${finalFilename}`,
              mimeType: match[1],
            });
          }

          sendJson(response, 200, {
            ok: true,
            files: importedFiles,
          });
        } catch (error) {
          sendJson(response, 500, {
            ok: false,
            message: error instanceof Error ? error.message : 'Import failed',
          });
        }
      });
    },
  };
}

function snakePublishPlugin() {
  const attachSnakePublishMiddleware = (middlewares) => {
    middlewares.use('/__snake/publish', async (request, response, next) => {
      if (request.method !== 'POST') {
        next();
        return;
      }

      try {
        const body = await readJsonBody(request);
        const normalizedSettings = normalizeSnakeSettingsPayload(body.settings);

        await fs.writeFile(
          publishedSnakeSettingsPath,
          buildPublishedSnakeSettingsModule(normalizedSettings),
          'utf8',
        );

        sendJson(response, 200, {
          ok: true,
          file: 'src/data/publishedSnakeSettings.js',
        });
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Snake publish failed',
        });
      }
    });
  };

  return {
    name: 'snake-publish-api',
    configureServer(server) {
      attachSnakePublishMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachSnakePublishMiddleware(server.middlewares);
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

  if (
    id.includes('/@react-three/fiber/') ||
    (id.includes('/three/') && !id.includes('/three/examples/')) ||
    id.includes('/three-custom-shader-material/')
  ) {
    return 'three-core';
  }

  if (
    id.includes('/@react-three/drei/core/Environment') ||
    id.includes('/@react-three/drei/core/useEnvironment') ||
    id.includes('/@react-three/drei/core/softShadows')
  ) {
    return 'three-scene';
  }

  if (
    id.includes('/@react-three/drei/core/OrbitControls') ||
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), portfolioImportPlugin(), portfolioPublishPlugin(), snakePublishPlugin()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
