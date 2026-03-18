import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT ?? '4173');
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const useExistingServer = process.env.SMOKE_USE_EXISTING_SERVER === '1';

const HOME_SCENE_SETTINGS_STORAGE_KEY = 'ddg_home_scene_settings_v1';
const LEGACY_HOME_SCENE_KEYS = ['ddg_snake_settings_v4', 'ddg_snake_settings_v3'];

const publishedSettingsPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
);
const publishedKeysPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneKeys.js',
);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectPageIssues(page, issues) {
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console error: ${message.text()}`);
    }
  });

  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    if (errorText !== 'net::ERR_ABORTED') {
      issues.push(`request failed: ${request.method()} ${request.url()} (${errorText})`);
    }
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startDevServer() {
  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: rootDir,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[vite] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[vite] ${chunk}`);
  });

  return child;
}

async function expectVisible(page, locator, description) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    throw new Error(`${description} not visible: ${error.message}`);
  }
}

async function settlePage(page, timeout = 300) {
  await page.waitForTimeout(timeout);
}

async function waitForCondition(check, message, timeoutMs = 12000, intervalMs = 250) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) {
      return;
    }

    await delay(intervalMs);
  }

  throw new Error(message);
}

async function waitForRuntimeMetrics(page, sceneId) {
  await page.waitForFunction(
    (id) => Boolean(window.__DDG_RUNTIME_METRICS__?.[id]),
    sceneId,
    { timeout: 10000 },
  );
  return page.evaluate((id) => window.__DDG_RUNTIME_METRICS__[id], sceneId);
}

async function setRangeValue(locator, value) {
  await locator.evaluate((input, nextValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function importFresh(modulePath) {
  const fileUrl = new URL(pathToFileURL(modulePath).href);
  fileUrl.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(fileUrl.href);
}

async function readPublishedSettings() {
  const module = await importFresh(publishedSettingsPath);
  return module.publishedHomeSceneSettings;
}

async function readPublishedKeys() {
  const module = await importFresh(publishedKeysPath);
  return module.publishedHomeSceneKeys;
}

function assertStableMetricSeries(samples, selector, label, tolerance = 2) {
  if (samples.length < 2) {
    return;
  }

  const values = samples.map(selector);
  const baseline = values[0];
  const peak = Math.max(...values);
  assert(
    peak <= baseline + tolerance,
    `${label} grew from ${baseline} to ${peak}`,
  );
}

async function runRouteChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('site-nav'), 'site nav');
  await expectVisible(page, page.getByTestId('brand-link'), 'brand link');
  await expectVisible(page, page.getByTestId('home-page'), 'home page');
  await page.getByTestId('site-music-controller').first().waitFor({ state: 'attached', timeout: 10000 });
  await waitForRuntimeMetrics(page, 'water-scene');
  log('OK route /');

  await page.goto(`${baseUrl}/info`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('info-page'), 'info page');
  await expectVisible(page, page.getByTestId('info-title'), 'info title');
  log('OK route /info');

  await page.goto(`${baseUrl}/portfolio`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.portfolio-page'), 'portfolio page');
  await expectVisible(page, page.locator('[data-testid^="project-row-"]'), 'portfolio rows');
  log('OK route /portfolio');

  await page.locator('[data-testid^="project-row-"] a').first().click();
  await expectVisible(page, page.getByTestId('project-detail'), 'project detail page');
  log('OK route /portfolio/:projectId');

  await page.goto(`${baseUrl}/map`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('map-page'), 'map page');
  log('OK route /map');

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('home-editor-page'), 'home editor page');
  await expectVisible(page, page.getByTestId('home-editor-tab-water'), 'home editor water tab');
  await expectVisible(page, page.getByTestId('home-editor-scene'), 'home editor scene');
  await waitForRuntimeMetrics(page, 'home-scene-editor');
  log('OK route /home/edit');

  await page.goto(`${baseUrl}/does-not-exist`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('not-found-title'), 'not found title');
  log('OK route 404');

  await context.close();
  return issues;
}

async function runWebglFallbackChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
      const normalizedType = String(type ?? '').toLowerCase();
      if (normalizedType === 'webgl' || normalizedType === 'webgl2' || normalizedType === 'experimental-webgl') {
        return null;
      }

      return originalGetContext.call(this, type, ...args);
    };
  });

  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('water-scene-fallback'), 'home WebGL fallback');
  log('OK WebGL fallback /');

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('home-editor-fallback'), 'home editor WebGL fallback');
  log('OK WebGL fallback /home/edit');

  await context.close();
  return issues;
}

async function runDraftMigrationChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ legacyKeys, draftKey }) => {
    localStorage.removeItem(draftKey);
    legacyKeys.forEach((key) => localStorage.removeItem(key));

    localStorage.setItem(
      'ddg_snake_settings_v3',
      JSON.stringify({
        cameraFov: 49,
        planeMeshDensity: 192,
        planeRadius: 560,
      }),
    );
  }, {
    legacyKeys: LEGACY_HOME_SCENE_KEYS,
    draftKey: HOME_SCENE_SETTINGS_STORAGE_KEY,
  });

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('home-editor-page'), 'home editor after legacy draft');
  await settlePage(page, 400);

  const draftState = await page.evaluate(({ legacyKeys, draftKey }) => {
    const draft = localStorage.getItem(draftKey);
    return {
      draft,
      parsed: draft ? JSON.parse(draft) : null,
      legacy: legacyKeys.map((key) => localStorage.getItem(key)),
    };
  }, {
    legacyKeys: LEGACY_HOME_SCENE_KEYS,
    draftKey: HOME_SCENE_SETTINGS_STORAGE_KEY,
  });

  assert(Boolean(draftState.draft), 'Draft storage should be created from legacy key');
  assert(draftState.legacy.every((value) => value === null), 'Legacy draft keys should be removed');
  assert(draftState.parsed.cameraFov === 49, 'Legacy cameraFov should migrate into draft');
  assert(draftState.parsed.waterMeshDensity === 192, 'Legacy planeMeshDensity should migrate into waterMeshDensity');
  log('OK legacy draft migration');

  await context.close();
  return issues;
}

async function runPublishChecks(browser) {
  if (!baseUrl.startsWith(`http://${host}`) && !baseUrl.startsWith('http://localhost')) {
    log('Skipping publish checks for non-local base URL.');
    return [];
  }

  const originalPublishedSource = await fs.readFile(publishedSettingsPath, 'utf8');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  try {
    await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
    await expectVisible(page, page.getByTestId('home-editor-page'), 'home editor page for publish');
    await expectVisible(page, page.getByTestId('home-editor-publish'), 'home editor publish button');

    await page.getByTestId('home-editor-tab-water').click();
    const ranges = page.locator('.home-editor-controls input[type="range"]');
    await expectVisible(page, ranges.nth(1), 'water tab sliders');

    await setRangeValue(ranges.nth(0), 31.5); // waterExtent
    await setRangeValue(ranges.nth(1), 336); // waterMeshDensity
    await settlePage(page, 200);

    await page.getByTestId('home-editor-publish').click();

    await waitForCondition(async () => {
      const settings = await readPublishedSettings();
      return settings.waterExtent === 31.5 && settings.waterMeshDensity === 336;
    }, 'Publish did not update water settings');

    const [settings, keys] = await Promise.all([
      readPublishedSettings(),
      readPublishedKeys(),
    ]);

    for (const key of keys) {
      assert(settings[key] !== undefined, `Published settings missing key: ${key}`);
    }

    log('OK publish flow');
  } finally {
    await fs.writeFile(publishedSettingsPath, originalPublishedSource, 'utf8');
    await delay(300);
    await context.close();
  }

  return issues;
}

async function runRuntimeStabilityChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);
  const homeSamples = [];
  const editorSamples = [];

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    homeSamples.push(await waitForRuntimeMetrics(page, 'water-scene'));

    await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
    await settlePage(page, 600);
    editorSamples.push(await waitForRuntimeMetrics(page, 'home-scene-editor'));
  }

  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.geometries, 'Home geometries', 4);
  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.textures, 'Home textures', 4);
  assertStableMetricSeries(editorSamples, (sample) => sample.renderer.geometries, 'Editor geometries', 6);
  assertStableMetricSeries(editorSamples, (sample) => sample.renderer.textures, 'Editor textures', 6);
  log('OK runtime stability');

  await context.close();
  return issues;
}

async function runMobileChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('site-nav'), 'mobile nav');
  await expectVisible(page, page.getByTestId('language-ru'), 'mobile language RU');
  await expectVisible(page, page.getByTestId('language-en'), 'mobile language EN');
  await expectVisible(page, page.getByTestId('home-page'), 'mobile home page');

  await page.goto(`${baseUrl}/portfolio`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.portfolio-page'), 'mobile portfolio page');
  await expectVisible(page, page.locator('[data-testid^="project-row-"]'), 'mobile portfolio rows');
  log('OK mobile checks');

  await context.close();
  return issues;
}

async function main() {
  let serverProcess;

  try {
    if (!useExistingServer) {
      serverProcess = startDevServer();
      await waitForServer(baseUrl);
    } else {
      await waitForServer(baseUrl);
    }

    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });

    const issues = [
      ...(await runRouteChecks(browser)),
      ...(await runWebglFallbackChecks(browser)),
      ...(await runDraftMigrationChecks(browser)),
      ...(await runPublishChecks(browser)),
      ...(await runRuntimeStabilityChecks(browser)),
      ...(await runMobileChecks(browser)),
    ];

    await browser.close();

    if (issues.length > 0) {
      log('');
      log('Smoke test found issues:');
      for (const issue of issues) {
        log(`- ${issue}`);
      }
      process.exitCode = 1;
      return;
    }

    log('');
    log('Smoke test passed.');
  } catch (error) {
    if (String(error.message).includes('Executable doesn\'t exist')) {
      process.stderr.write('Playwright browser is missing. Run: npx playwright install chromium\n');
    } else {
      process.stderr.write(`${error.stack ?? error}\n`);
    }
    process.exitCode = 1;
  } finally {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
  }
}

await main();
