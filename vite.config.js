import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();
const publishedHomeSceneSettingsPath = path.join(
  projectRoot,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
);
const publishedHomeSceneKeys = [
  'waterExtent',
  'simulationResolution',
  'waterMeshDensity',
  'waveAmplitude',
  'waveLength',
  'waveChoppiness',
  'rippleDamping',
  'rippleRadius',
  'rippleImpulse',
  'normalStrength',
  'normalBlur',
  'hdrPreset',
  'hdrRotation',
  'hdrExposure',
  'envReflectionIntensity',
  'envTint',
  'moonIntensity',
  'moonColor',
  'moonAzimuth',
  'moonElevation',
  'moonSpecularStrength',
  'moonSpecularPower',
  'waterDepthMeters',
  'seabedReliefStrength',
  'seabedReliefScale',
  'causticsIntensity',
  'causticsScale',
  'causticsSharpness',
  'cameraFov',
  'debugView',
];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function normalizeHomeSceneSettingsPayload(settings) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('Home scene settings payload is missing.');
  }

  return publishedHomeSceneKeys.reduce((normalized, key) => {
    if (settings[key] !== undefined) {
      normalized[key] = settings[key];
    }

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

        sendJson(response, 200, {
          ok: true,
          file: 'src/features/home-scene/data/publishedHomeSceneSettings.js',
        });
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

export default defineConfig({
  plugins: [react(), homeScenePublishPlugin()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
