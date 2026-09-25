import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// A real browser/profile, a private cache and disposable data. Never ~/Ouroboros.
await fs.mkdir('output', { recursive: true });
const temp = await fs.mkdtemp(path.resolve('output/project-recovery-'));
process.env.DDG_PROJECTS_DIR = path.join(temp, 'data');
const { default: config } = await import('../vite.config.js');
const { projects } = await import('./projectStore.mjs');
const server = await createServer({
  ...config, configFile: false, cacheDir: path.join(temp, 'cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 41213, strictPort: true, hmr: false },
});
let browser;
try {
  await server.listen();
  const base = 'http://127.0.0.1:41213';
  const source = await server.ssrLoadModule('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const scene = source.getPublishedHomeSceneSettings();
  const project = await projects.create({ name: 'Recovery probe', settings: scene });
  const api = `${base}/__projects/${project.id}`;
  for (const [headers, expected] of [
    [{ 'content-type': 'application/json', origin: 'https://foreign.invalid' }, 403],
    [{ 'content-type': 'text/plain' }, 415],
  ]) {
    const response = await fetch(`${base}/__projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'Blocked', settings: {} }) });
    assert.equal(response.status, expected);
  }
  const safe = await (await fetch(`${base}/__projects`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ name: 'Recovery probe', id: '../escape', settings: {} }),
  })).json();
  assert.equal(safe.entry.id, 'recovery-probe-2');

  const fixture = path.join(temp, 'probe.html');
  // Vite transforms bare imports and the real settings hook as in the editor.
  await fs.writeFile(fixture, `<!doctype html><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useHomeSceneDraftSettings } from '/src/features/home-scene/hooks/useHomeSceneSettings.js';
import { readProject } from '/src/features/engine/projectApi.js';
const project = await readProject('${project.id}');
function Probe() {
  const draft = useHomeSceneDraftSettings(project);
  window.probe = draft;
  return React.createElement('p', null, draft.saveStatus.phase);
}
createRoot(document.getElementById('root')).render(React.createElement(Probe));
</script>`);
  const url = `${base}/${path.relative(process.cwd(), fixture)}`;
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [], dialogs = [];
  const newPage = async () => {
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.goto(url);
    await page.waitForFunction(() => window.probe);
    return page;
  };
  let page = await newPage();
  await page.evaluate(() => window.probe.setSettings((value) => ({ ...value, planeHeight: 0.125 })));
  await page.waitForFunction(() => window.probe.settings.planeHeight === 0.125 && window.probe.saveStatus.phase === 'saved');
  assert.equal((await projects.read(project.id)).settings.planeHeight, 0.125);

  // Close immediately after a committed edit while every PUT is unavailable.
  await context.route(api, (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  await page.evaluate(() => window.probe.setSettings((value) => ({ ...value, planeHeight: 0.25 })));
  await page.waitForFunction(() => window.probe.saveStatus.phase === 'pending');
  const bytes = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ddg_project_recovery_v1:')).map((key) => localStorage.getItem(key).length).reduce((a, b) => a + b, 0));
  assert.ok(bytes > 65536, 'exercise a scene beyond the keepalive limit');
  await page.close();
  page = await newPage();
  await page.waitForFunction(() => window.probe.settings.planeHeight === 0.25 && window.probe.saveStatus.phase === 'error');
  assert.ok(dialogs.some((text) => text.includes('Восстановить')));
  assert.equal((await projects.read(project.id)).settings.planeHeight, 0.125, 'failed writes did not replace disk data');
  await context.unroute(api);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => window.probe.saveStatus.phase === 'saved');
  assert.equal((await projects.read(project.id)).settings.planeHeight, 0.25);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ddg_project_recovery_v1:')).length), 0);
  await page.close();

  // Inspect the status in the actual editor, using an empty landscape scene.
  const { newProjectObjectSettings, designProjectObjectSettings } = await server.ssrLoadModule('/src/features/home-scene/lib/sceneObjects.js');
  const empty = source.normalizeHomeSceneDraftSettings({
    ...source.getBaseHomeSceneSettings(), ...newProjectObjectSettings(), ...designProjectObjectSettings(),
  });
  const visual = await projects.create({ name: 'Stability QA', kind: 'design', settings: empty });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/home/edit?project=${visual.id}`);
  await page.getByTestId('project-save-status').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('engine-boot'), null, { timeout: 60000 });
  assert.equal(await page.getByTestId('project-save-status').textContent(), 'Сохранено');
  const visualApi = `${base}/__projects/${visual.id}`;
  await context.route(visualApi, (route) => route.request().method() === 'PUT' ? route.abort('connectionfailed') : route.continue());
  const fov = page.locator('input[type="number"]').first();
  await fov.fill('37');
  await fov.press('Tab');
  await page.getByTestId('project-save-status').filter({ hasText: 'Не сохранено' }).waitFor();
  await page.locator('.focus-project-label--link').click();
  assert.ok(page.url().includes('/home/edit'), 'failed save keeps the project open');
  if (process.env.RECOVERY_SCREENSHOT) await page.screenshot({ path: path.resolve(process.env.RECOVERY_SCREENSHOT) });
  await context.unroute(visualApi);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByTestId('project-save-status').filter({ hasText: 'Сохранено' }).waitFor();
  await page.locator('.focus-project-label--link').click();
  await page.waitForURL('**/engine');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`browser recovery: ${bytes} bytes, close/reopen offline, restore/retry/readback, HTTP guards and editor status — ok`);
} finally {
  await browser?.close();
  await server.close();
  await fs.rm(temp, { recursive: true, force: true });
}
