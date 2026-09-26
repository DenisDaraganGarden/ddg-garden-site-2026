import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { cleanupPlaywrightProcesses } from './cleanup-playwright.mjs';
import { HOME_SCENE_CAMERA_FOV_MAX, HOME_SCENE_CAMERA_FOV_MIN } from '../src/features/home-scene/lib/layout.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT ?? '4173');
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const useExistingServer = process.env.SMOKE_USE_EXISTING_SERVER === '1';
const smokePhase = process.env.SMOKE_PHASE ?? 'all';
const smokeMaxRuntimeMs = Number(process.env.SMOKE_MAX_RUNTIME_MS ?? '900000');
const shouldAutoCleanupProcesses = process.env.SMOKE_SKIP_PROCESS_CLEANUP !== '1';
const smokeBrowserArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const windowsBrowserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const HOME_SCENE_SETTINGS_STORAGE_KEY = 'ddg_home_scene_settings_v1';
const LEGACY_HOME_SCENE_KEYS = ['ddg_snake_settings_v4', 'ddg_snake_settings_v3'];
// Editor-only aids. They are deliberately not published: they belong to whoever is
// authoring the scene, not to the scene itself.
const DEV_LOCAL_EDITOR_KEYS = new Set([
  'animationPaused',
  'showPerformanceHud',
  'showPointerDebug',
  'freeCamera',
  'debugWireframe',
  'editorPostProcessing',
  'editorHeadingColor',
  'editorCursor',
  'editorPieFill',
  'editorPieOutline',
  'fireEditPoint',
]);
const FILM_CONTROL_IDS = [
  'home-editor-film-enabled',
  'home-editor-film-stock',
  'home-editor-film-grain-amount',
  'home-editor-film-grain-size',
  'home-editor-film-dust-amount',
  'home-editor-film-scratch-amount',
  'home-editor-film-flicker-amount',
  'home-editor-film-flicker-rate',
  'home-editor-film-gate-weave-amount',
  'home-editor-film-gate-weave-rate',
];

const publishedSettingsPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
);
// «В проект» also records which project the home scene came from.
const publishedSourcePath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSource.json',
);
const publishedKeysPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneKeys.js',
);
// The editor controls are split by scene group, so coverage walks the directory
// rather than a single file.
const homeEditorSectionsDir = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'components',
  'editor',
);

let activeServerProcess;
let activeBrowser;
let cleanupPromise = null;
let watchdogTimer = null;
let isShuttingDown = false;
let guardsInstalled = false;
const pageIssueLogs = new WeakMap();

function log(message) {
  process.stdout.write(`${message}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectPageIssues(page, issues) {
  pageIssueLogs.set(page, issues);
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.stack ?? error.message}`);
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
  // The same dev server as `vite`, with its own dependency cache (AGENTS.md §4,
  // rule 6): re-optimizing a shared node_modules/.vite breaks every other dev
  // server of that node_modules, and a worktree often links it from another.
  const serverModule = `
    import { createServer } from 'vite';
    const server = await createServer({
      cacheDir: 'output/smoke-vite-cache',
      server: { host: ${JSON.stringify(host)}, port: ${port}, strictPort: true },
    });
    await server.listen();
    server.printUrls();
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', serverModule],
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
    const geometry = await Promise.race([locator.first().evaluate((node) => {
      const chain = [];
      let current = node;

      while (current && chain.length < 6) {
        const rect = current.getBoundingClientRect();
        const style = getComputedStyle(current);
        chain.push({
          tag: current.tagName.toLowerCase(),
          className: current.className,
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
        });
        current = current.parentElement;
      }

      return {
        chain,
        panelHeight: getComputedStyle(document.documentElement)
          .getPropertyValue('--home-editor-panel-height'),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }).catch(() => null), delay(2500).then(() => null)]);
    const details = geometry ? `\nGeometry: ${JSON.stringify(geometry)}` : '';
    // A failed scene can unmount this locator in favour of a fallback. Capture
    // the page too, instead of waiting on the vanished node and losing the
    // actual shader/runtime error behind a generic visibility timeout.
    const snapshot = await readFailureSnapshot(page);
    throw new Error(`${description} not visible: ${error.message}${details}\nPage: ${JSON.stringify(snapshot)}`);
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

async function readFailureSnapshot(page) {
  const snapshot = await Promise.race([
    page.evaluate(() => ({
      visibility: document.visibilityState,
      readyState: document.readyState,
      fallback: document.querySelector('.scene-fallback')?.textContent?.slice(0, 400) ?? null,
      canvases: [...document.querySelectorAll('canvas')].map(canvas => ({
        width: canvas.width, height: canvas.height,
        water: canvas.dataset.ddgWaterEngine, post: canvas.dataset.ddgPostStatus,
        warmup: canvas.dataset.ddgPlantWarmup,
      })),
      metricScenes: Object.keys(window.__DDG_RUNTIME_METRICS__ ?? {}),
    })).catch(() => ({ unavailable: 'page closed or disconnected' })),
    delay(2500).then(() => ({ unavailable: 'page main thread did not respond' })),
  ]);
  return { ...snapshot, issues: (pageIssueLogs.get(page) ?? []).slice(-12).map(issue => issue.slice(0, 4000)) };
}

async function waitForRuntimeMetrics(page, sceneId, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      (id) => Boolean(window.__DDG_RUNTIME_METRICS__?.[id]),
      sceneId,
      { timeout: timeoutMs },
    );
  } catch (error) {
    // Keep the same acceptance deadline, but distinguish a WebGL fallback,
    // hidden tab and blocked startup when a remote software renderer times out.
    const snapshot = await readFailureSnapshot(page);
    log(`Runtime metrics timeout (${sceneId}): ${JSON.stringify(snapshot)}`);
    throw error;
  }
  return page.evaluate((id) => window.__DDG_RUNTIME_METRICS__[id], sceneId);
}

// Lazy GLB decoding can finish a few seconds after RuntimeDiagnostics starts.
// A memory baseline taken before that work completes mistakes the real boat and
// sculpture for a leak. Wait for several fresh diagnostic writes with unchanged
// GPU resource counts; a genuine continuous leak never reaches this plateau.
// In software WebGL (CI) the home scene reaches it after 35–40 s at 1–2 fps,
// so the budget is a minute; the leak tolerances are unchanged.
const SETTLE_MS = 60000;
async function waitForSettledRuntimeMetrics(page, sceneId, timeoutMs = SETTLE_MS) {
  const startedAt = Date.now();
  const stableWindowMs = 3500;
  let previous = null;
  let stableForMs = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const sample = await waitForRuntimeMetrics(page, sceneId, timeoutMs);
    const timestamp = Number(sample.timestamp);
    const geometries = Number(sample.renderer?.geometries);
    const textures = Number(sample.renderer?.textures);
    if (process.env.SMOKE_SETTLE_DEBUG) console.log(`[settle ${sceneId}] wall=${((Date.now() - startedAt) / 1000).toFixed(1)}s ts=${Math.round(timestamp)} g=${geometries} t=${textures} fps=${Number(sample.performance?.fps).toFixed(1)} stable=${stableForMs}`);

    if (
      previous
      && Number.isFinite(timestamp)
      && timestamp > previous.timestamp
    ) {
      const resourcesUnchanged = geometries === previous.geometries
        && textures === previous.textures;
      stableForMs = resourcesUnchanged
        ? stableForMs + (timestamp - previous.timestamp)
        : 0;

      if (stableForMs >= stableWindowMs) {
        return sample;
      }
    }

    if (!previous || (Number.isFinite(timestamp) && timestamp > previous.timestamp)) {
      previous = { timestamp, geometries, textures };
    }

    await settlePage(page, 250);
  }

  const resourceSummary = previous
    ? `${previous.geometries} geometries / ${previous.textures} textures`
    : 'no metrics';
  throw new Error(`${sceneId} resources did not settle (${resourceSummary})`);
}

async function setRangeValue(locator, value) {
  await locator.evaluate((input, nextValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

// The editor keeps its boot screen (#engine-boot, index.html) over the whole UI
// until the scene reports it is built, or BOOT_SAFETY_MS (25 s, HomeEdit.jsx)
// of running page has passed; nothing under it takes a click. In software
// WebGL the full default scene takes one to two minutes to build.
async function waitForEditorReady(page) {
  try {
    await page.waitForFunction(() => !document.getElementById('engine-boot'), null, { timeout: 180000, polling: 250 });
  } catch (error) {
    const snapshot = await readFailureSnapshot(page);
    throw new Error(`Editor boot screen did not clear: ${error.message}\nPage: ${JSON.stringify(snapshot)}`);
  }
}

// The focus editor: workspaces on the rail (focus-domain-<domain>, FOCUS_DOMAINS
// in focusNavigation.js), one navigator row per node (home-editor-tab-<node>),
// rendered only while the list is open, and choosing a node closes the list.
async function openEditorSection(page, domain, node) {
  const rail = page.getByTestId(`focus-domain-${domain}`);
  if (await rail.getAttribute('aria-pressed') !== 'true') {
    await rail.click();
    await page.locator(`[data-testid="focus-domain-${domain}"][aria-pressed="true"]`).waitFor();
  }
  // Another workspace opens its list by itself when it has several nodes; the
  // list button toggles, so it is pressed only while the list is closed.
  const list = page.getByTestId('focus-tool-list');
  if (await list.getAttribute('aria-pressed') !== 'true') await list.click();
  const row = page.getByTestId(`home-editor-tab-${node}`);
  await row.click();
  await row.waitFor({ state: 'detached' });
}

// An inspector control by node path and key, as FocusControlComponents.jsx
// writes it: data-focus-control-id="landscape/water:waterExtent".
function editorControl(page, id, input = 'input[type="range"]') {
  return page.locator(`[data-focus-control-id="${id}"] ${input}`);
}

async function importFresh(modulePath) {
  const fileUrl = new URL(pathToFileURL(modulePath).href);
  fileUrl.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(fileUrl.href);
}

async function readEditorSources(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const sources = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await readEditorSources(entryPath)));
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      sources.push(await fs.readFile(entryPath, 'utf8'));
    }
  }

  return sources;
}

async function readEditorControlKeys() {
  const sources = await readEditorSources(homeEditorSectionsDir);
  const keys = new Set();

  for (const source of sources) {
    const regex = /handleSettingChange\(event,\s*'([^']+)'/g;
    let match = regex.exec(source);

    while (match) {
      const rawKey = String(match[1] ?? '').trim();
      if (rawKey) {
        keys.add(rawKey.split('.')[0]);
      }
      match = regex.exec(source);
    }
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

// The CI runner renders in software: leaving the editor's scene and loading the
// next page there took over Playwright's default 30 s (route 404 after
// /home/edit). Every context gets a minute and a half per navigation.
const NAVIGATION_MS = 90000;
async function newSmokeContext(browser, options) {
  const context = await browser.newContext(options);
  context.setDefaultNavigationTimeout(NAVIGATION_MS);
  return context;
}

async function runRouteChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('site-nav'), 'site nav');
  await expectVisible(page, page.getByTestId('brand-link'), 'brand link');
  await expectVisible(page, page.getByTestId('home-page'), 'home page');
  await page.getByTestId('site-music-controller').first().waitFor({ state: 'attached', timeout: 10000 });
  await waitForRuntimeMetrics(page, 'water-scene');
  assert(
    await page.locator('.home-film-grain').count() === 0,
    'Home must not mount the legacy DOM film-grain overlay',
  );
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
  // The editor opens on the water: its controls in the inspector, its row in the list.
  await expectVisible(page, editorControl(page, 'landscape/water:waterExtent'), 'home editor water controls');
  await waitForEditorReady(page);
  await page.getByTestId('focus-tool-list').click();
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
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
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
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.removeItem('ddg_site_audio_preference_v1');
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
    const audioState = await page.evaluate(() => window.__DDG_AUDIO_STATE__ ?? null);
    return playing === 'true'
      && audioState?.enabled === true
      && audioState?.contextState === 'running';
  }, 'Soundscape should unlock after an explicit user click');

  await waitForCondition(async () => page.evaluate(() => (
    ['water', 'shore', 'boat', 'birds', 'wind', 'thunder']
      .every((id) => window.__DDG_AUDIO_STATE__?.activeTracks?.includes(id))
  )), 'Soundscape tracks should decode and start exactly once');

  const initialTracks = await page.evaluate(() => (
    window.__DDG_AUDIO_STATE__.activeTracks.slice().sort()
  ));

  // Trigger the router link directly: the home scene can be inside its visual
  // slideshow fade while this lifecycle check runs, but that overlay is not
  // part of the audio routing contract under test.
  await page.getByTestId('nav-info').evaluate((element) => element.click());
  await expectVisible(page, page.getByTestId('info-page'), 'audio lifecycle info route');
  await waitForCondition(async () => page.evaluate(() => (
    window.__DDG_AUDIO_STATE__?.routeActive === false
      && window.__DDG_AUDIO_STATE__?.homeGainTarget === 0
  )), 'Home soundscape bus should fade toward silence on inner routes');

  await page.getByTestId('brand-link').evaluate((element) => element.click());
  await expectVisible(page, page.getByTestId('home-page'), 'audio lifecycle home return');
  await waitForCondition(async () => page.evaluate(() => (
    window.__DDG_AUDIO_STATE__?.routeActive === true
      && window.__DDG_AUDIO_STATE__?.homeGainTarget === 1
  )), 'Home soundscape bus should fade back in after returning home');

  const returnTracks = await page.evaluate(() => (
    window.__DDG_AUDIO_STATE__.activeTracks.slice().sort()
  ));
  assert(
    JSON.stringify(returnTracks) === JSON.stringify(initialTracks),
    'Home route return should preserve one continuous transport per track',
  );

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-editor-page').waitFor({ state: 'visible', timeout: 10000 });
  assert(
    await page.getByTestId('site-music-controller').count() === 0,
    'Public sound controller should be hidden on /home/edit',
  );

  log('OK spatial audio lifecycle');
  await context.close();
  return issues;
}

async function runDraftMigrationChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
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
        filmGrainEnabled: true,
        filmGrainIntensity: 0.125,
        filmGrainSize: 1.8,
        filmGrainSpeed: 2,
        sceneCameras: [{
          id: 'legacy-film-camera',
          name: 'Legacy film camera',
          enabled: true,
          holdSeconds: 8,
          scene: {
            filmGrainEnabled: false,
            filmGrainIntensity: 0.05,
            filmGrainSize: 2.6,
            filmGrainSpeed: 1.2,
          },
        }],
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
  assert(draftState.parsed.sceneCameras?.length === 1, 'Legacy draft should migrate into one scene camera');
  assert(
    draftState.parsed.sceneCameras[0].scene.cameraFov === 49,
    'Migrated camera should contain the full legacy scene snapshot',
  );
  assert(draftState.parsed.filmEnabled === true, 'Root legacy grain toggle should migrate to filmEnabled');
  assert(draftState.parsed.filmStock === '16mm', 'Root legacy grain should receive the default film stock');
  assert(draftState.parsed.filmGrainAmount === 0.5, 'Root legacy grain intensity should migrate to film amount');
  assert(draftState.parsed.filmGrainSize === 1.8, 'Root legacy grain size should migrate');
  assert(!('filmGrainEnabled' in draftState.parsed), 'Root legacy film fields should not survive migration');
  const migratedCameraFilm = draftState.parsed.sceneCameras[0].scene;
  assert(migratedCameraFilm.filmEnabled === false, 'Camera legacy grain toggle should migrate independently');
  assert(migratedCameraFilm.filmStock === '16mm', 'Camera legacy grain should receive the default film stock');
  assert(migratedCameraFilm.filmGrainAmount === 0.2, 'Camera legacy grain intensity should migrate independently');
  assert(migratedCameraFilm.filmGrainSize === 2.6, 'Camera legacy grain size should migrate independently');
  assert(!('filmGrainEnabled' in migratedCameraFilm), 'Camera legacy film fields should not survive migration');
  log('OK legacy draft migration');

  await context.close();
  return issues;
}

// Ключи проекта — окружение участка и освещение сада: данные заказчика и
// библиотека этого компьютера, на сайт не уходят никогда (тот же список, что
// в check-editor-keys.mjs).
async function readProjectLocalKeys() {
  const [{ DEFAULT_SURROUNDINGS_SETTINGS }, { DEFAULT_LIGHTING_SETTINGS }] = await Promise.all([
    import(pathToFileURL(path.join(rootDir, 'src', 'surroundings', 'settings.js')).href),
    import(pathToFileURL(path.join(rootDir, 'src', 'lighting', 'settings.js')).href),
  ]);
  return new Set([...Object.keys(DEFAULT_SURROUNDINGS_SETTINGS), ...Object.keys(DEFAULT_LIGHTING_SETTINGS)]);
}

async function runEditorPublishCoverageChecks() {
  const [publishedKeys, editorKeys, projectLocalKeys] = await Promise.all([
    readPublishedKeys(),
    readEditorControlKeys(),
    readProjectLocalKeys(),
  ]);
  const publishedKeySet = new Set(publishedKeys);
  const missingKeys = editorKeys.filter(
    (key) => !publishedKeySet.has(key) && !DEV_LOCAL_EDITOR_KEYS.has(key) && !projectLocalKeys.has(key),
  );
  const leakedProjectKeys = [...projectLocalKeys].filter((key) => publishedKeySet.has(key));
  assert(leakedProjectKeys.length === 0, `Project data must not publish to the site: ${leakedProjectKeys.join(', ')}`);
  const leakedLocalKeys = [...DEV_LOCAL_EDITOR_KEYS].filter(key => publishedKeySet.has(key));

  assert(leakedLocalKeys.length === 0, `Editor preferences must remain local: ${leakedLocalKeys.join(', ')}`);

  assert(
    missingKeys.length === 0,
    `Editor controls are missing publish keys: ${missingKeys.join(', ')}`,
  );

  log('OK editor publish coverage');
  return [];
}

async function runCameraSystemChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  // Keep the editor workflow deterministic when the published site already
  // contains several authored cameras.
  await page.addInitScript((draftKey) => {
    localStorage.setItem(draftKey, JSON.stringify({ cameraFov: 36 }));
  }, HOME_SCENE_SETTINGS_STORAGE_KEY);

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByTestId('home-editor-page'), 'camera editor');
  await waitForEditorReady(page);
  await openEditorSection(page, 'render', 'post');
  for (const testId of FILM_CONTROL_IDS) {
    await expectVisible(page, page.getByTestId(testId), `film control ${testId}`);
  }
  await openEditorSection(page, 'cameras', 'camera');
  await expectVisible(page, page.getByTestId('home-editor-camera-list'), 'camera list');
  assert(await page.getByTestId('home-editor-free-camera-badge').count() === 0, 'Free-camera badge should stay removed');
  const sceneCameraRows = page.locator('[data-testid^="home-editor-camera-select-"]');
  assert(await sceneCameraRows.count() === 1, 'Legacy scene should migrate to one camera');

  await page.getByTestId('home-editor-camera-add').click();
  await waitForCondition(
    async () => (await sceneCameraRows.count()) === 2,
    'Adding a camera should create a second row',
  );

  await openEditorSection(page, 'render', 'post');
  await page.getByTestId('home-editor-film-enabled').check();
  await waitForCondition(
    async () => (await page.locator('canvas[data-ddg-film="on"]').count()) === 1,
    'Enabling film should activate the canvas film pass',
  );
  await page.getByTestId('home-editor-film-stock').selectOption('8mm');
  await setRangeValue(page.getByTestId('home-editor-film-grain-amount'), 0.42);
  await setRangeValue(page.getByTestId('home-editor-film-grain-size'), 2.1);
  await setRangeValue(page.getByTestId('home-editor-film-dust-amount'), 0.31);
  await setRangeValue(page.getByTestId('home-editor-film-scratch-amount'), 0.22);
  await setRangeValue(page.getByTestId('home-editor-film-flicker-amount'), 0.09);
  await setRangeValue(page.getByTestId('home-editor-film-flicker-rate'), 13);
  await setRangeValue(page.getByTestId('home-editor-film-gate-weave-amount'), 1.25);
  await setRangeValue(page.getByTestId('home-editor-film-gate-weave-rate'), 7.5);

  await openEditorSection(page, 'cameras', 'camera');
  await page.getByTestId('home-editor-camera-select-camera-1').click();
  await openEditorSection(page, 'render', 'post');
  assert(!(await page.getByTestId('home-editor-film-enabled').isChecked()), 'Camera 1 film toggle should remain independent');
  await waitForCondition(
    async () => (await page.locator('canvas[data-ddg-film="off"]').count()) === 1,
    'Selecting a camera with film disabled should deactivate the canvas film pass',
  );
  assert(await page.getByTestId('home-editor-film-stock').inputValue() === '16mm', 'Camera 1 film stock should remain independent');
  assert(Number(await page.getByTestId('home-editor-film-grain-amount').inputValue()) === 0.28, 'Camera 1 grain should remain independent');

  await openEditorSection(page, 'cameras', 'camera');
  await page.getByTestId('home-editor-camera-select-camera-2').click();
  await openEditorSection(page, 'render', 'post');
  assert(await page.getByTestId('home-editor-film-enabled').isChecked(), 'Camera 2 film toggle should persist');
  await waitForCondition(
    async () => (await page.locator('canvas[data-ddg-film="on"]').count()) === 1,
    'Returning to the film camera should reactivate the canvas film pass',
  );
  assert(await page.getByTestId('home-editor-film-stock').inputValue() === '8mm', 'Camera 2 film stock should persist');
  assert(Number(await page.getByTestId('home-editor-film-grain-amount').inputValue()) === 0.42, 'Camera 2 grain should persist');
  assert(Number(await page.getByTestId('home-editor-film-dust-amount').inputValue()) === 0.31, 'Camera 2 dust should persist');
  assert(Number(await page.getByTestId('home-editor-film-scratch-amount').inputValue()) === 0.22, 'Camera 2 scratches should persist');
  assert(Number(await page.getByTestId('home-editor-film-flicker-amount').inputValue()) === 0.09, 'Camera 2 flicker should persist');
  assert(Number(await page.getByTestId('home-editor-film-flicker-rate').inputValue()) === 13, 'Camera 2 flicker rate should persist');
  assert(Number(await page.getByTestId('home-editor-film-gate-weave-amount').inputValue()) === 1.25, 'Camera 2 weave should persist');
  assert(Number(await page.getByTestId('home-editor-film-gate-weave-rate').inputValue()) === 7.5, 'Camera 2 weave rate should persist');

  await openEditorSection(page, 'cameras', 'camera');

  // The Focus inspector's FOV runs 15–100° (as in its design sketch), while a
  // saved camera keeps 1–100° (layout.js): every lens the slider reaches must
  // survive, and the slider's own minimum is the extreme exercised here.
  const fov = page.getByTestId('focus-camera-fov');
  const fovMin = Number(await fov.getAttribute('min'));
  assert(
    fovMin >= HOME_SCENE_CAMERA_FOV_MIN && Number(await fov.getAttribute('max')) === HOME_SCENE_CAMERA_FOV_MAX,
    'Camera FOV slider should reach only lenses a saved camera keeps',
  );
  await setRangeValue(fov, fovMin);
  await page.getByTestId('home-editor-camera-variant-portrait').click();
  await setRangeValue(fov, 46);
  await page.getByTestId('home-editor-camera-variant-desktop').click();
  assert(Number(await fov.inputValue()) === fovMin, 'Desktop camera FOV should retain the slider minimum');

  await openEditorSection(page, 'render', 'visibility');
  const boatVisibility = page.getByTestId('home-editor-visible-boatVisible');
  await boatVisibility.uncheck();
  assert(
    !(await boatVisibility.isChecked()),
    'Camera 2 should hide the boat',
  );

  await openEditorSection(page, 'cameras', 'camera');
  await page.getByTestId('home-editor-camera-select-camera-1').click();
  await openEditorSection(page, 'render', 'visibility');
  assert(
    await page.getByTestId('home-editor-visible-boatVisible').isChecked(),
    'Camera 1 should retain its independent boat visibility',
  );

  await openEditorSection(page, 'cameras', 'camera');
  await page.getByTestId('home-editor-camera-select-camera-2').click();
  await openEditorSection(page, 'render', 'visibility');
  assert(
    !(await page.getByTestId('home-editor-visible-boatVisible').isChecked()),
    'Camera 2 should restore its hidden boat',
  );

  await openEditorSection(page, 'cameras', 'camera');
  // Name, duration and order live in the camera's settings dialog (•••);
  // moving the camera closes it.
  await page.getByTestId('home-editor-camera-settings-camera-2').click();
  await page.getByTestId('home-editor-camera-name-camera-2').fill('Second shot');
  await page.getByTestId('home-editor-camera-duration-camera-2').fill('1');
  await page.getByTestId('home-editor-camera-up-camera-2').click();
  // The slideshow sits in the folded «Frame and playback» block under the cameras.
  const tuning = page.getByTestId('home-editor-camera-tuning');
  if (!(await tuning.evaluate((details) => details.open))) await tuning.locator('summary').click();
  await editorControl(page, 'cameras/camera:slideshowEnabled', 'input[type="checkbox"]').check();
  await editorControl(page, 'cameras/camera:slideshowFade', 'input[type="number"]').fill('0.2');
  await settlePage(page, 250);

  const draft = await page.evaluate((key) => {
    const source = localStorage.getItem(key);
    return source ? JSON.parse(source) : null;
  }, HOME_SCENE_SETTINGS_STORAGE_KEY);
  assert(draft?.sceneCameras?.length === 2, 'Draft should persist two cameras');
  assert(draft?.audio?.version === 1, 'Draft should persist one root audio configuration');
  assert(
    draft.sceneCameras.every((camera) => !Object.prototype.hasOwnProperty.call(camera.scene, 'audio')),
    'Camera snapshots should not duplicate or reset the root audio configuration',
  );
  assert(draft.sceneCameras[0].id === 'camera-2', 'Camera reorder should persist array order');
  assert(draft.sceneCameras[0].name === 'Second shot', 'Camera rename should persist');
  assert(draft.sceneCameras[0].holdSeconds === 1, 'Per-camera duration should persist');
  assert(draft.sceneCameras[0].scene.layouts.desktop.cameraFov === fovMin, 'Desktop minimum FOV should persist in Camera 2');
  assert(draft.sceneCameras[0].scene.layouts.portrait.cameraFov === 46, 'Portrait FOV should persist in Camera 2');
  assert(draft.sceneCameras[0].scene.boatVisible === false, 'Full scene visibility should persist in Camera 2');
  assert(draft.sceneCameras[1].scene.boatVisible === true, 'Camera 1 visibility should remain independent');
  assert(draft.sceneCameras[0].scene.filmEnabled === true, 'Camera 2 film toggle should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmStock === '8mm', 'Camera 2 film stock should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmGrainAmount === 0.42, 'Camera 2 grain should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmGrainSize === 2.1, 'Camera 2 grain size should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmDustAmount === 0.31, 'Camera 2 dust should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmScratchAmount === 0.22, 'Camera 2 scratches should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmFlickerAmount === 0.09, 'Camera 2 flicker should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmFlickerRate === 13, 'Camera 2 flicker rate should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmGateWeaveAmount === 1.25, 'Camera 2 weave should persist in the snapshot');
  assert(draft.sceneCameras[0].scene.filmGateWeaveRate === 7.5, 'Camera 2 weave rate should persist in the snapshot');
  assert(draft.sceneCameras[1].scene.filmEnabled === false, 'Camera 1 film toggle should remain independent in the snapshot');
  assert(draft.slideshow.enabled === true, 'Slideshow enabled state should persist');
  assert(draft.slideshow.fadeSeconds === 0.2, 'Slideshow fade should persist');

  log('OK multi-camera editor');
  await context.close();
  return issues;
}

async function runPublishChecks(browser) {
  if (!baseUrl.startsWith(`http://${host}`) && !baseUrl.startsWith('http://localhost')) {
    log('Skipping publish checks for non-local base URL.');
    return [];
  }

  const originalPublishedSource = await fs.readFile(publishedSettingsPath, 'utf8');
  const originalPublishedSourceInfo = await fs.readFile(publishedSourcePath, 'utf8');
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  try {
    await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
    await expectVisible(page, page.getByTestId('home-editor-page'), 'home editor page for publish');
    await waitForEditorReady(page);
    await expectVisible(page, page.getByTestId('home-editor-publish'), 'home editor publish button');
    const publishButton = page.getByTestId('home-editor-publish');
    assert(
      await publishButton.isDisabled(),
      'Publish button should be disabled when there are no unsaved changes',
    );

    // A fresh editor starts on its local work camera («Рабочая 1»), whose
    // snapshot never publishes: edit the first scene camera, the publish root.
    await openEditorSection(page, 'cameras', 'camera');
    await page.locator('[data-testid^="home-editor-camera-select-"]').first().click();

    await openEditorSection(page, 'scene', 'water');
    const waveAmplitude = editorControl(page, 'landscape/water:waveAmplitude');
    await expectVisible(page, waveAmplitude, 'water tab sliders');

    await setRangeValue(editorControl(page, 'landscape/water:waterExtent'), 31.5);
    await setRangeValue(waveAmplitude, 0.08);
    await settlePage(page, 200);

    await openEditorSection(page, 'scene', 'boat');
    const boatRoughness = editorControl(page, 'objects/boat:boatRoughness');
    await expectVisible(page, boatRoughness, 'boat tab sliders');
    await setRangeValue(editorControl(page, 'objects/boat:boatPositionX'), 3.45);
    await setRangeValue(editorControl(page, 'objects/boat:boatPositionZ'), -2.2);
    await setRangeValue(boatRoughness, 0.41);
    await settlePage(page, 220);

    await openEditorSection(page, 'render', 'post');
    await page.getByTestId('home-editor-film-enabled').check();
    await page.getByTestId('home-editor-film-stock').selectOption('sepia');
    await setRangeValue(page.getByTestId('home-editor-film-grain-amount'), 0.37);
    await setRangeValue(page.getByTestId('home-editor-film-grain-size'), 1.65);
    await setRangeValue(page.getByTestId('home-editor-film-dust-amount'), 0.19);
    await setRangeValue(page.getByTestId('home-editor-film-scratch-amount'), 0.14);
    await setRangeValue(page.getByTestId('home-editor-film-flicker-amount'), 0.055);
    await setRangeValue(page.getByTestId('home-editor-film-flicker-rate'), 11);
    await setRangeValue(page.getByTestId('home-editor-film-gate-weave-amount'), 0.85);
    await setRangeValue(page.getByTestId('home-editor-film-gate-weave-rate'), 4.5);
    await settlePage(page, 220);

    const draftSettings = await page.evaluate((key) => {
      const draft = localStorage.getItem(key);
      return draft ? JSON.parse(draft) : null;
    }, HOME_SCENE_SETTINGS_STORAGE_KEY);
    assert(Boolean(draftSettings), 'Expected draft settings in localStorage');
    assert(draftSettings.layouts?.desktop?.boatPosition?.x === 3.45, 'Desktop boatPosition.x was not saved to draft settings');
    assert(draftSettings.layouts?.desktop?.boatPosition?.z === -2.2, 'Desktop boatPosition.z was not saved to draft settings');
    assert(draftSettings.boatRoughness === 0.41, 'boatRoughness was not saved to draft settings');
    assert(draftSettings.filmEnabled === true, 'filmEnabled was not saved to draft settings');
    assert(draftSettings.filmStock === 'sepia', 'filmStock was not saved to draft settings');
    assert(draftSettings.filmGrainAmount === 0.37, 'filmGrainAmount was not saved to draft settings');
    assert(draftSettings.filmGrainSize === 1.65, 'filmGrainSize was not saved to draft settings');
    assert(draftSettings.filmDustAmount === 0.19, 'filmDustAmount was not saved to draft settings');
    assert(draftSettings.filmScratchAmount === 0.14, 'filmScratchAmount was not saved to draft settings');
    assert(draftSettings.filmFlickerAmount === 0.055, 'filmFlickerAmount was not saved to draft settings');
    assert(draftSettings.filmFlickerRate === 11, 'filmFlickerRate was not saved to draft settings');
    assert(draftSettings.filmGateWeaveAmount === 0.85, 'filmGateWeaveAmount was not saved to draft settings');
    assert(draftSettings.filmGateWeaveRate === 4.5, 'filmGateWeaveRate was not saved to draft settings');
    await waitForCondition(async () => !(await publishButton.isDisabled()), 'Publish button did not enable');

    // «В проект» asks first, in a dialog that names the scenes it saves.
    await publishButton.click();
    await page.getByTestId('home-editor-dialog-confirm').click();

    await waitForCondition(async () => {
      const settings = await readPublishedSettings();
      return (
        settings?.waterExtent === 31.5
        && settings.waveAmplitude === 0.08
        && settings.layouts?.desktop?.boatPosition?.x === 3.45
        && settings.layouts?.desktop?.boatPosition?.z === -2.2
        && settings.boatRoughness === 0.41
        && settings.sceneCameras?.[0]?.scene?.waterExtent === 31.5
        && settings.sceneCameras?.[0]?.scene?.boatRoughness === 0.41
        && settings.filmEnabled === true
        && settings.filmStock === 'sepia'
        && settings.filmGrainAmount === 0.37
        && settings.filmGrainSize === 1.65
        && settings.filmDustAmount === 0.19
        && settings.filmScratchAmount === 0.14
        && settings.filmFlickerAmount === 0.055
        && settings.filmFlickerRate === 11
        && settings.filmGateWeaveAmount === 0.85
        && settings.filmGateWeaveRate === 4.5
        && settings.sceneCameras?.[0]?.scene?.filmStock === 'sepia'
        && settings.sceneCameras?.[0]?.scene?.filmGateWeaveRate === 4.5
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
    assert(settings.sceneCameras.length >= 1, 'Published camera catalogue should not be empty');
    assert(settings.slideshow && typeof settings.slideshow.enabled === 'boolean', 'Published slideshow settings should exist');

    log('OK publish flow');
  } finally {
    await fs.writeFile(publishedSettingsPath, originalPublishedSource, 'utf8');
    await fs.writeFile(publishedSourcePath, originalPublishedSourceInfo, 'utf8');
    await delay(300);
    await context.close();
  }

  return issues;
}

async function runLongSessionMemoryChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  const runSeries = async (urlPath, sceneId, label, tolerance) => {
    const samples = [];
    // The CI runner renders in software; a route change there can take longer
    // than the default 30 s, as the stability checks already allow for.
    await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    samples.push(await waitForSettledRuntimeMetrics(page, sceneId, SETTLE_MS));

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
  const navigationTimeout = 60000;
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);
  const homeSamples = [];
  const editorSamples = [];

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    homeSamples.push(await waitForSettledRuntimeMetrics(page, 'water-scene', SETTLE_MS));

    await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    editorSamples.push(await waitForSettledRuntimeMetrics(page, 'home-scene-editor', SETTLE_MS));
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
  const context = await newSmokeContext(browser, { viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expectVisible(page, page.getByTestId('site-nav'), 'mobile nav');
  await expectVisible(page, page.getByTestId('language-ru'), 'mobile language RU');
  await expectVisible(page, page.getByTestId('language-en'), 'mobile language EN');
  await expectVisible(page, page.getByTestId('home-page'), 'mobile home page');

  await page.goto(`${baseUrl}/portfolio`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expectVisible(page, page.locator('.portfolio-page'), 'mobile portfolio page');
  await expectVisible(page, page.locator('[data-testid^="project-row-"]'), 'mobile portfolio rows');
  log('OK mobile checks');

  await context.close();
  return issues;
}

async function main() {
  try {
    // This contract is pure filesystem work: fail before launching a browser.
    if (smokePhase === 'all' || smokePhase === 'scene') await runEditorPublishCoverageChecks();
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

    assert(
      ['all', 'scene', 'stability'].includes(smokePhase),
      `Unknown SMOKE_PHASE: ${smokePhase}`,
    );

    const issues = [];
    const runInFreshBrowser = async (check) => {
      activeBrowser = await launchSmokeBrowser();
      const browser = activeBrowser;

      try {
        issues.push(...(await check(browser)));
      } finally {
        await browser.close();
        activeBrowser = undefined;
      }
    };

    if (smokePhase === 'all' || smokePhase === 'scene') {
      activeBrowser = await launchSmokeBrowser();
      const sceneBrowser = activeBrowser;
      issues.push(
        ...(await runRouteChecks(sceneBrowser)),
        ...(await runAudioLifecycleChecks(sceneBrowser)),
        ...(await runWebglFallbackChecks(sceneBrowser)),
        ...(await runDraftMigrationChecks(sceneBrowser)),
        ...(await runCameraSystemChecks(sceneBrowser)),
      );
      await sceneBrowser.close();
      activeBrowser = undefined;
    }

    // These suites intentionally create many software WebGL contexts. Keep
    // each high-context phase in a fresh Chromium process so the result
    // reflects application stability, not accumulated SwiftShader exhaustion.
    if (smokePhase === 'all' || smokePhase === 'stability') {
      await runInFreshBrowser(runPublishChecks);
      await runInFreshBrowser(runRuntimeStabilityChecks);
      await runInFreshBrowser(runLongSessionMemoryChecks);
      await runInFreshBrowser(runMobileChecks);
    }

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

// A quick local check that starts no server/browser and runs no process cleanup.
if (smokePhase === 'coverage') await runEditorPublishCoverageChecks();
else await main();
