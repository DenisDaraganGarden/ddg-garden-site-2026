import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT ?? '4173');
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const useExistingServer = process.env.SMOKE_USE_EXISTING_SERVER === '1';
const publishedSettingsPath = path.join(rootDir, 'src', 'data', 'publishedSnakeSettings.js');

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
  const child = spawn(process.execPath, [viteBin, '--host', host, '--port', String(port)], {
    cwd: rootDir,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

async function settlePage(page, timeout = 400) {
  await page.waitForTimeout(timeout);
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

function getSnakeSlider(page, label) {
  return page
    .locator('.cia-control-group', { hasText: label })
    .locator('input[type="range"]')
    .first();
}

async function seedLegacySnakeDraft(page, overrides = {}) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((settings) => {
    localStorage.removeItem('ddg_snake_settings_v4');
    localStorage.setItem('ddg_snake_settings_v3', JSON.stringify(settings));
  }, {
    planeTrailLength: 18,
    planeRadius: 350,
    planeHeight: 200,
    cameraFov: 40,
    ...overrides,
  });
}

async function readPublishedSettings() {
  const source = await fs.readFile(publishedSettingsPath, 'utf8');
  const match = source.match(/export const publishedSnakeSettings = ([\s\S]+);\s*$/);
  if (!match) {
    throw new Error('Could not parse published snake settings file.');
  }

  return JSON.parse(match[1]);
}

function assertStableMetricSeries(samples, selector, label, tolerance = 1) {
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
  await expectVisible(page, page.getByTestId('brand-link'), 'brand link');
  await expectVisible(page, page.getByTestId('home-scene'), 'home scene');
  await waitForRuntimeMetrics(page, 'home');
  log('OK route /');

  await page.getByTestId('nav-info').click();
  await page.waitForURL(`${baseUrl}/info`);
  await expectVisible(page, page.getByTestId('info-title'), 'info title');
  log('OK route /info');

  await page.getByTestId('nav-portfolio').click();
  await page.waitForURL(`${baseUrl}/portfolio`);
  await expectVisible(page, page.getByTestId('portfolio-page'), 'portfolio page');
  log('OK route /portfolio');

  await page.goto(`${baseUrl}/portfolio/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('portfolio-edit-page'), 'portfolio editor');
  log('OK route /portfolio/edit');

  await page.goto(`${baseUrl}/info/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('info-editor-page'), 'info editor');
  await expectVisible(page, page.getByTestId('info-editor-surface'), 'info editor surface');
  log('OK route /info/edit');

  await page.goto(`${baseUrl}/snake/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('snake-editor-page'), 'snake editor page');
  await expectVisible(page, page.getByTestId('snake-tab-plane'), 'snake plane tab');
  await waitForRuntimeMetrics(page, 'snake-editor');
  log('OK route /snake/edit');

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(`${baseUrl}/snake/edit`);
  await expectVisible(page, page.getByTestId('snake-editor-page'), 'home/edit redirect target');
  log('OK route /home/edit redirect');

  await page.goto(`${baseUrl}/does-not-exist`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('not-found-title'), '404 title');
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
  await expectVisible(page, page.getByTestId('home-scene-fallback'), 'home fallback');
  log('OK WebGL fallback /');

  await page.goto(`${baseUrl}/snake/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('snake-editor-fallback'), 'snake editor fallback');
  log('OK WebGL fallback /snake/edit');

  await context.close();
  return issues;
}

async function runPublishAndDraftChecks(browser) {
  const originalPublishedSource = await fs.readFile(publishedSettingsPath, 'utf8');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  try {
    await seedLegacySnakeDraft(page);
    await page.goto(`${baseUrl}/snake/edit`, { waitUntil: 'domcontentloaded' });
    await expectVisible(page, page.getByTestId('snake-editor-page'), 'snake editor after legacy seed');

    const trailSpanSlider = getSnakeSlider(page, 'Длина хвоста');
    const trailPersistenceSlider = getSnakeSlider(page, 'Время затухания');
    assert((await trailSpanSlider.inputValue()) === '36', 'Legacy planeTrailLength did not migrate to planeTrailSpan');
    assert((await trailPersistenceSlider.inputValue()) === '18', 'Legacy planeTrailLength did not migrate to planeTrailPersistence');

    const legacyState = await page.evaluate(() => ({
      legacy: localStorage.getItem('ddg_snake_settings_v3'),
      draft: localStorage.getItem('ddg_snake_settings_v4'),
    }));
    assert(legacyState.legacy === null, 'Legacy v3 storage should be removed after draft migration');
    assert(Boolean(legacyState.draft), 'Draft v4 storage should exist after migration');
    log('OK legacy snake migration');

    const meshDensitySlider = getSnakeSlider(page, 'Плотность сетки');
    await setRangeValue(meshDensitySlider, 104);
    await page.getByTestId('snake-tab-camera').click();
    const cameraFovSlider = getSnakeSlider(page, 'Угол обзора (FOV)');
    await setRangeValue(cameraFovSlider, 52);
    await settlePage(page, 300);

    await page.getByTestId('snake-publish').click();
    await settlePage(page, 1200);

    const publishedSettings = await readPublishedSettings();
    assert(publishedSettings.planeMeshDensity === 104, 'Published preset did not store planeMeshDensity');
    assert(publishedSettings.cameraFov === 52, 'Published preset did not store cameraFov');
    assert(!('freeCamera' in publishedSettings), 'Published preset should not contain freeCamera');
    assert(!('devStats' in publishedSettings), 'Published preset should not contain dev flags');

    await page.getByTestId('snake-tab-plane').click();
    await setRangeValue(meshDensitySlider, 160);
    await page.getByTestId('snake-tab-camera').click();
    await setRangeValue(cameraFovSlider, 61);
    await settlePage(page, 1200);

    const livePublishedSettings = await readPublishedSettings();
    assert(livePublishedSettings.planeMeshDensity === 160, 'Auto-publish did not update planeMeshDensity');
    assert(livePublishedSettings.cameraFov === 61, 'Auto-publish did not update cameraFov');

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const homeMetrics = await waitForRuntimeMetrics(page, 'home');
    assert(homeMetrics.settings.planeMeshDensity === 160, 'Public home should reflect live planeMeshDensity updates');
    assert(homeMetrics.settings.cameraFov === 61, 'Public home should reflect live cameraFov updates');
    log('OK published preset flow');
  } finally {
    await fs.writeFile(publishedSettingsPath, originalPublishedSource, 'utf8');
    await delay(300);
    await context.close();
  }

  return issues;
}

async function runResourceAudit(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);
  const homeSamples = [];
  const editorSamples = [];

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    homeSamples.push(await waitForRuntimeMetrics(page, 'home'));

    await page.goto(`${baseUrl}/info`, { waitUntil: 'domcontentloaded' });
    await expectVisible(page, page.getByTestId('info-title'), `info title cycle ${cycle + 1}`);

    await page.goto(`${baseUrl}/portfolio`, { waitUntil: 'domcontentloaded' });
    const firstProject = page.getByTestId('portfolio-project-focus-point');
    await expectVisible(page, firstProject, `portfolio card cycle ${cycle + 1}`);
    await firstProject.click();
    await expectVisible(page, page.getByTestId('portfolio-project-close'), `portfolio project close cycle ${cycle + 1}`);
    await page.getByTestId('portfolio-plate-focus-point-1').click();
    await expectVisible(page, page.getByTestId('portfolio-lightbox-close'), `portfolio lightbox close cycle ${cycle + 1}`);
    await page.getByTestId('portfolio-lightbox-close').click({ force: true });
    await page.getByTestId('portfolio-project-close').click();
    await settlePage(page, 200);
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    assert(bodyOverflow === '' || bodyOverflow === 'visible', 'Portfolio close should restore body overflow');

    await page.goto(`${baseUrl}/snake/edit`, { waitUntil: 'domcontentloaded' });
    await settlePage(page, 500);
    editorSamples.push(await waitForRuntimeMetrics(page, 'snake-editor'));
  }

  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.geometries, 'Home geometries', 1);
  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.textures, 'Home textures', 1);
  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.programs, 'Home programs', 1);
  assertStableMetricSeries(editorSamples, (sample) => sample.renderer.geometries, 'Editor geometries', 2);
  assertStableMetricSeries(editorSamples, (sample) => sample.renderer.textures, 'Editor textures', 2);
  assertStableMetricSeries(editorSamples, (sample) => sample.renderer.programs, 'Editor programs', 1);
  log('OK resource audit');

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
  const navMetrics = await page.evaluate(() => {
    const links = document.querySelector('.nav-links');
    return {
      scrollable: links ? links.scrollWidth > links.clientWidth : false,
    };
  });
  assert(navMetrics.scrollable, 'Mobile navigation should remain horizontally scrollable');

  await page.goto(`${baseUrl}/portfolio`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('portfolio-page'), 'mobile portfolio page');
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
      ...(await runPublishAndDraftChecks(browser)),
      ...(await runResourceAudit(browser)),
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
