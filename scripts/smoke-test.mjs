import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { cleanupPlaywrightProcesses } from './cleanup-playwright.mjs';
import { audioSettingsForScene } from '../src/features/home-scene/lib/sceneObjects.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT ?? '4173');
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const useExistingServer = process.env.SMOKE_USE_EXISTING_SERVER === '1';
const smokePhase = process.env.SMOKE_PHASE ?? 'all';
// A whole run takes about 21 minutes in software WebGL on a 4-core cloud
// machine (most of it scenes booting and editor clicks at 1–2 fps) and about
// twice that on the GitHub runner, where checks.yml runs the two phases as
// separate jobs. The watchdog only catches a hang; the job limit sits above it.
const smokeMaxRuntimeMs = Number(process.env.SMOKE_MAX_RUNTIME_MS ?? '2100000');
const shouldAutoCleanupProcesses = process.env.SMOKE_SKIP_PROCESS_CLEANUP !== '1';
const smokeBrowserArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const windowsBrowserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const publishedSettingsPath = path.join(
  rootDir,
  'src',
  'features',
  'home-scene',
  'data',
  'publishedHomeSceneSettings.js',
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

async function expectVisible(page, locator, description, timeout = 10000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
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

// The CI runner renders WebGL in software (SwiftShader), and there Chromium
// offers no KHR_parallel_shader_compile: a new scene links its ~60 shader
// programs on the page's main thread. On a 4-core cloud machine the home scene
// held that thread for 20 s in two long tasks (9 s and 7 s) and showed the
// site nav, which waits for the scene's ready signal, after 25 s; the GitHub
// runner is about twice as slow (the scene phase took 15 min there, 9 here).
// Nothing a check asks of the page gets an answer before such a boot ends, so
// every page with a scene is first waited for with this budget.
const SCENE_BOOT_MS = 240000;

// Lazy GLB decoding can finish a few seconds after RuntimeDiagnostics starts.
// A memory baseline taken before that work completes mistakes the real boat and
// sculpture for a leak. Wait for several fresh diagnostic writes with unchanged
// GPU resource counts; a genuine continuous leak never reaches this plateau.
// The shader program count is part of the plateau: a program appears when a
// new material first renders, and in software WebGL its link holds the page's
// main thread (see SCENE_BOOT_MS), so a scene still adding programs is still
// booting. In software WebGL (CI) the home scene reaches it after 35–40 s at
// 1–2 fps; the budget is the boot's. The leak tolerances are unchanged.
async function waitForSettledRuntimeMetrics(page, sceneId, timeoutMs = SCENE_BOOT_MS) {
  const startedAt = Date.now();
  const stableWindowMs = 3500;
  let previous = null;
  let stableForMs = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const sample = await waitForRuntimeMetrics(page, sceneId, timeoutMs);
    const timestamp = Number(sample.timestamp);
    const geometries = Number(sample.renderer?.geometries);
    const textures = Number(sample.renderer?.textures);
    const programs = Number(sample.renderer?.programs);
    if (process.env.SMOKE_SETTLE_DEBUG) console.log(`[settle ${sceneId}] wall=${((Date.now() - startedAt) / 1000).toFixed(1)}s ts=${Math.round(timestamp)} g=${geometries} t=${textures} p=${programs} fps=${Number(sample.performance?.fps).toFixed(1)} stable=${stableForMs}`);

    if (
      previous
      && Number.isFinite(timestamp)
      && timestamp > previous.timestamp
    ) {
      const resourcesUnchanged = geometries === previous.geometries
        && textures === previous.textures
        && programs === previous.programs;
      stableForMs = resourcesUnchanged
        ? stableForMs + (timestamp - previous.timestamp)
        : 0;

      if (stableForMs >= stableWindowMs) {
        return sample;
      }
    }

    if (!previous || (Number.isFinite(timestamp) && timestamp > previous.timestamp)) {
      previous = { timestamp, geometries, textures, programs };
    }

    await settlePage(page, 250);
  }

  const resourceSummary = previous
    ? `${previous.geometries} geometries / ${previous.textures} textures / ${previous.programs} programs`
    : 'no metrics';
  throw new Error(`${sceneId} resources did not settle (${resourceSummary})`);
}

// Home shows the site nav only once its scene reports ready (App.jsx), and
// hides it again while a returning Home boots a new scene.
async function waitForHomeReady(page, description) {
  await expectVisible(page, page.getByTestId('site-nav'), description, SCENE_BOOT_MS);
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

// The home soundscape. The engine keeps a track silent while its object is off
// in the scene (sceneObjects.js), so the published scene decides which start.
const HOME_SOUNDSCAPE_TRACKS = ['water', 'shore', 'boat', 'birds', 'wind', 'thunder'];
async function readExpectedHomeTracks() {
  const tracks = audioSettingsForScene(await readPublishedSettings())?.tracks ?? {};
  return HOME_SOUNDSCAPE_TRACKS.filter((id) => tracks[id]?.enabled !== false);
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

// The CI runner renders in software. Leaving a page waits for the link its
// scene is running (route 404 after /home/edit took 65 s), so a navigation
// gets the boot budget. A settings change can relink programs too: choosing a
// site camera with other render settings held the editor for 28 s in one long
// task, and a click there takes 7–18 s at 1–2 fps, so actions get 90 s.
const NAVIGATION_MS = SCENE_BOOT_MS;
const ACTION_MS = 90000;
async function newSmokeContext(browser, options) {
  const context = await browser.newContext(options);
  context.setDefaultNavigationTimeout(NAVIGATION_MS);
  context.setDefaultTimeout(ACTION_MS);
  return context;
}

async function runRouteChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForHomeReady(page, 'site nav');
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
  await waitForHomeReady(page, 'audio lifecycle home');
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

  const expectedTracks = await readExpectedHomeTracks();
  assert(expectedTracks.length > 0, 'The published scene should keep some soundscape tracks');
  await waitForCondition(async () => page.evaluate((ids) => (
    ids.every((id) => window.__DDG_AUDIO_STATE__?.activeTracks?.includes(id))
  ), expectedTracks), `Soundscape tracks should decode and start exactly once: ${expectedTracks.join(', ')}`);

  const initialTracks = await page.evaluate(() => (
    window.__DDG_AUDIO_STATE__.activeTracks.slice().sort()
  ));
  const silentTracks = HOME_SOUNDSCAPE_TRACKS.filter((id) => !expectedTracks.includes(id));
  assert(
    silentTracks.every((id) => !initialTracks.includes(id)),
    `Tracks of objects switched off in the scene should stay silent: ${silentTracks.join(', ')}`,
  );

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
  // Home mounts a new scene: the page answers again once it has booted.
  await expectVisible(page, page.getByTestId('home-page'), 'audio lifecycle home return', SCENE_BOOT_MS);
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

  log('OK spatial audio lifecycle');
  await context.close();
  return issues;
}

async function runLongSessionMemoryChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  const runSeries = async (urlPath, sceneId, label, tolerance) => {
    const samples = [];
    await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'domcontentloaded' });
    samples.push(await waitForSettledRuntimeMetrics(page, sceneId));

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
  log('OK long session memory');

  await context.close();
  return issues;
}

async function runRuntimeStabilityChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);
  const homeSamples = [];

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    homeSamples.push(await waitForSettledRuntimeMetrics(page, 'water-scene'));

  }

  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.geometries, 'Home geometries', 4);
  assertStableMetricSeries(homeSamples, (sample) => sample.renderer.textures, 'Home textures', 4);
  log('OK runtime stability');

  await context.close();
  return issues;
}

async function runMobileChecks(browser) {
  const context = await newSmokeContext(browser, { viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForHomeReady(page, 'mobile nav');
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
    // This contract is pure filesystem work: fail before launching a browser.
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
      );
      await sceneBrowser.close();
      activeBrowser = undefined;
    }

    // These suites intentionally create many software WebGL contexts. Keep
    // each high-context phase in a fresh Chromium process so the result
    // reflects application stability, not accumulated SwiftShader exhaustion.
    if (smokePhase === 'all' || smokePhase === 'stability') {
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

await main();
