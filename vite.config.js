import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();
const portfolioImportRoot = path.join(projectRoot, 'public', 'portfolio', 'imported');

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

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
    id.includes('/three/') ||
    id.includes('/@react-three/') ||
    id.includes('/three-custom-shader-material/')
  ) {
    return 'three-vendor';
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
  plugins: [react(), portfolioImportPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
