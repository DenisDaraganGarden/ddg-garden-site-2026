import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { cleanupPlaywrightProcesses } from './cleanup-playwright.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT ?? '4173');
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const useExistingServer = process.env.SMOKE_USE_EXISTING_SERVER === '1';
const smokeMaxRuntimeMs = Number(process.env.SMOKE_MAX_RUNTIME_MS ?? '900000');
const shouldAutoCleanupProcesses = process.env.SMOKE_SKIP_PROCESS_CLEANUP !== '1';
const smokeBrowserArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const windowsBrowserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

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
const homeEditorTabsPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'components',
  'HomeEditorTabs.jsx',
);

let activeServerProcess;
let activeBrowser;
let cleanupPromise = null;
let watchdogTimer = null;
let isShuttingDown = false;
let guardsInstalled = false;

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

async function launchSmokeBrowser() {
  const launchOptions = {
    headless: true,
    args: smokeBrowserArgs,
  };
  const configuredExecutable = process.env.SMOKE_BROWSER_EXECUTABLE;

  if (configuredExecutable) {
    return chromium.launch({ ...launchOptions, executablePath: configuredExecutable });
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const message = String(error?.message ?? '');
    const isMissingBundledBrowser = message.includes("Executable doesn't exist")
      || message.includes('browser is missing');
    if (process.platform !== 'win32' || !isMissingBundledBrowser) {
      throw error;
    }

    for (const executablePath of windowsBrowserCandidates) {
      try {
        await fs.access(executablePath);
        log(`Playwright browser is missing; using installed browser: ${executablePath}`);
        return await chromium.launch({ ...launchOptions, executablePath });
      } catch {
        // Try the next installed browser candidate.
      }
    }

    throw error;
  }
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
      detached: true,
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

function stopDevServer(serverProcess) {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  try {
    process.kill(-serverProcess.pid, 'SIGTERM');
  } catch {
    serverProcess.kill('SIGTERM');
  }
}

function clearSmokeWatchdog() {
  if (!watchdogTimer) {
    return;
  }

  clearTimeout(watchdogTimer);
  watchdogTimer = null;
}

function startSmokeWatchdog() {
  if (!Number.isFinite(smokeMaxRuntimeMs) || smokeMaxRuntimeMs <= 0) {
    return;
  }

  watchdogTimer = setTimeout(() => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    process.stderr.write(
      `[smoke] Max runtime exceeded (${Math.round(smokeMaxRuntimeMs / 1000)}s). Starting cleanup.\n`,
    );
    void performCleanup().finally(() => {
      process.exit(1);
    });
  }, smokeMaxRuntimeMs);
  watchdogTimer.unref?.();
}

async function performCleanup() {
  if (cleanupPromise) {
    await cleanupPromise;
    return;
  }

  cleanupPromise = (async () => {
    clearSmokeWatchdog();

    if (activeBrowser) {
      await activeBrowser.close().catch(() => {});
      activeBrowser = undefined;
    }

    if (activeServerProcess) {
      stopDevServer(activeServerProcess);
      activeServerProcess = undefined;
    }

    await delay(250);

    if (shouldAutoCleanupProcesses) {
      cleanupPlaywrightProcesses({
        includeSmokeScript: false,
        logger: (message) => log(message),
      });
    }
  })();

  await cleanupPromise;
  cleanupPromise = null;
}

function installProcessGuards() {
  if (guardsInstalled) {
    return;
  }

  guardsInstalled = true;

  const handleSignal = (signal, exitCode) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    process.stderr.write(`[smoke] Received ${signal}. Starting cleanup.\n`);
    void performCleanup().finally(() => {
      process.exit(exitCode);
    });
  };

  process.once('SIGINT', () => handleSignal('SIGINT', 130));
  process.once('SIGTERM', () => handleSignal('SIGTERM', 143));
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

async function waitForRuntimeMetrics(page, sceneId, timeoutMs = 20000) {
  await page.waitForFunction(
    (id) => Boolean(window.__DDG_RUNTIME_METRICS__?.[id]),
    sceneId,
    { timeout: timeoutMs },
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

async function readEditorControlKeys() {
  const source = await fs.readFile(homeEditorTabsPath, 'utf8');
  const regex = /handleSettingChange\(event,\s*'([^']+)'/g;
  const keys = new Set();
  let match = regex.exec(source);

  while (match) {
    const rawKey = String(match[1] ?? '').trim();
    if (rawKey) {
      keys.add(rawKey.split('.')[0]);
    }
    match = regex.exec(source);
  }

  return [...keys];
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

async function runAudioLifecycleChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    class MockAudio extends EventTarget {
      constructor() {
        super();
        this.loop = false;
        this.preload = 'auto';
        this.volume = 1;
        this.paused = true;
        this.playsInline = true;
      }

      play() {
        this.paused = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      }

      pause() {
        if (this.paused) {
          return;
        }
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
      }
    }

    window.Audio = MockAudio;
  });

  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('site-music-controller').first().waitFor({ state: 'attached', timeout: 10000 });

  await waitForCondition(async () => {
    const playing = await page.getByTestId('site-music-controller').getAttribute('data-playing');
    return playing === 'false';
  }, 'Music controller should start muted in local development');

  await page.getByTestId('site-music-controller').click();
  await waitForCondition(async () => {
    const playing = await page.getByTestId('site-music-controller').getAttribute('data-playing');
    return playing === 'true';
  }, 'Music controller should play after an explicit user click');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
  });

  await waitForCondition(async () => {
    const playing = await page.getByTestId('site-music-controller').getAttribute('data-playing');
    return playing === 'false';
  }, 'Music should pause when window blurs');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await waitForCondition(async () => {
    const playing = await page.getByTestId('site-music-controller').getAttribute('data-playing');
    return playing === 'true';
  }, 'Music should resume when window focuses');

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150);
  assert(
    await page.getByTestId('site-music-controller').count() === 0,
    'Music controller should be hidden on /home/edit',
  );

  log('OK audio lifecycle');
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

async function runEditorPublishCoverageChecks() {
  const [publishedKeys, editorKeys] = await Promise.all([
    readPublishedKeys(),
    readEditorControlKeys(),
  ]);
  const publishedKeySet = new Set(publishedKeys);
  const missingKeys = editorKeys.filter((key) => !publishedKeySet.has(key));

  assert(
    missingKeys.length === 0,
    `Editor controls are missing publish keys: ${missingKeys.join(', ')}`,
  );

  log('OK editor publish coverage');
  return [];
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
    const publishButton = page.getByTestId('home-editor-publish');
    assert(
      await publishButton.isDisabled(),
      'Publish button should be disabled when there are no unsaved changes',
    );

    await page.getByTestId('home-editor-tab-water').click();
    const ranges = page.locator('.home-editor-controls input[type="range"]');
    await expectVisible(page, ranges.nth(1), 'water tab sliders');

    await setRangeValue(ranges.nth(0), 31.5); // waterExtent
    await setRangeValue(ranges.nth(1), 0.08); // waveAmplitude
    await settlePage(page, 200);

    await page.getByTestId('home-editor-tab-boat').click();
    const boatRanges = page.locator('.home-editor-controls input[type="range"]');
    await expectVisible(page, boatRanges.nth(2), 'boat tab sliders');
    await setRangeValue(boatRanges.nth(0), 3.45); // boatPosition.x
    await setRangeValue(boatRanges.nth(1), -2.2); // boatPosition.z
    await setRangeValue(boatRanges.nth(2), 0.41); // boatRoughness
    await settlePage(page, 220);

    const draftSettings = await page.evaluate((key) => {
      const draft = localStorage.getItem(key);
      return draft ? JSON.parse(draft) : null;
    }, HOME_SCENE_SETTINGS_STORAGE_KEY);
    assert(Boolean(draftSettings), 'Expected draft settings in localStorage');
    assert(draftSettings.layouts?.desktop?.boatPosition?.x === 3.45, 'Desktop boatPosition.x was not saved to draft settings');
    assert(draftSettings.layouts?.desktop?.boatPosition?.z === -2.2, 'Desktop boatPosition.z was not saved to draft settings');
    assert(draftSettings.boatRoughness === 0.41, 'boatRoughness was not saved to draft settings');

    await waitForCondition(async () => !(await publishButton.isDisabled()), 'Publish button did not enable');

    await publishButton.click();

    await waitForCondition(async () => {
      const settings = await readPublishedSettings();
      return (
        settings.waterExtent === 31.5
        && settings.waveAmplitude === 0.08
        && settings.layouts?.desktop?.boatPosition?.x === 3.45
        && settings.layouts?.desktop?.boatPosition?.z === -2.2
        && settings.boatRoughness === 0.41
      );
    }, 'Publish did not update water settings');
    await waitForCondition(async () => publishButton.isDisabled(), 'Publish button should disable after save');

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

async function runLongSessionMemoryChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  const runSeries = async (urlPath, sceneId, label, tolerance) => {
    const samples = [];
    await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await settlePage(page, 800);
    samples.push(await waitForRuntimeMetrics(page, sceneId, 30000));

    for (let index = 0; index < 5; index += 1) {
      await settlePage(page, 2500);
      samples.push(await waitForRuntimeMetrics(page, sceneId, 30000));
    }

    assertStableMetricSeries(
      samples,
      (sample) => sample.renderer.geometries,
      `${label} geometries`,
      tolerance,
    );
    assertStableMetricSeries(
      samples,
      (sample) => sample.renderer.textures,
      `${label} textures`,
      tolerance,
    );
  };

  await runSeries('/', 'water-scene', 'Long home session', 6);
  await runSeries('/home/edit', 'home-scene-editor', 'Long editor session', 8);
  log('OK long session memory');

  await context.close();
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
    await settlePage(page, 350);
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
  try {
    installProcessGuards();
    startSmokeWatchdog();

    if (shouldAutoCleanupProcesses) {
      cleanupPlaywrightProcesses({
        includeSmokeScript: false,
        logger: (message) => log(message),
      });
    }

    if (!useExistingServer) {
      activeServerProcess = startDevServer();
      await waitForServer(baseUrl);
    } else {
      await waitForServer(baseUrl);
    }

    activeBrowser = await launchSmokeBrowser();
    const browser = activeBrowser;

    const issues = [
      ...(await runRouteChecks(browser)),
      ...(await runAudioLifecycleChecks(browser)),
      ...(await runWebglFallbackChecks(browser)),
      ...(await runEditorPublishCoverageChecks()),
      ...(await runDraftMigrationChecks(browser)),
      ...(await runPublishChecks(browser)),
      ...(await runRuntimeStabilityChecks(browser)),
      ...(await runLongSessionMemoryChecks(browser)),
      ...(await runMobileChecks(browser)),
    ];

    await browser.close();
    activeBrowser = undefined;

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
    await performCleanup();
  }
}

await main();
