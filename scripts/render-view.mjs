// A frame of an engine project, for Claude to see what Denis sees: a
// temporary editor server of its own (own port and dependency cache, so the
// open editors are not touched), the project opened read-only (?preview=1: no
// save, no thumbnail) at a camera, the viewport saved as a PNG.
// Run: node scripts/render-view.mjs <project> [camera id or name] [out.png]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const [project, camera = '', out = path.join('output', `render-${project}${camera ? `-${camera.replace(/[^\p{L}\p{N}-]+/gu, '_')}` : ''}.png`)] = process.argv.slice(2);
if (!project) {
  console.error('node scripts/render-view.mjs <project> [camera] [out.png]');
  process.exit(1);
}
const { default: config } = await import('../vite.editor.config.js');
const server = await createServer({
  ...config, configFile: false, cacheDir: 'output/render-view-cache', logLevel: 'error',
  server: { ...config.server, host: '127.0.0.1', port: 41240, strictPort: false, hmr: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const query = new URLSearchParams({ project, preview: '1', ...(camera ? { camera } : {}) });
  await page.goto(`${server.resolvedUrls.local[0]}home/edit?${query}`, { timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('engine-boot'), null, { timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 180000 });
  await page.waitForTimeout(4000);
  await fs.mkdir(path.dirname(out), { recursive: true });
  // The frame alone: the editor's panels, tools and camera strip lie over it.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } .home-editor-viewport, .home-editor-viewport * { visibility: visible !important; }' });
  await page.locator('.home-editor-render-frame').first().screenshot({ path: out });
  console.log(out);
  if (errors.length) console.error(`page errors:\n${errors.join('\n')}`);
} finally {
  await browser.close();
  await server.close();
}
