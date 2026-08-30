import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = process.env.AUDIO_BASE_URL ?? 'http://127.0.0.1:7326';
const screenshotDir = process.env.AUDIO_SCREENSHOT_DIR
  ?? path.resolve(process.cwd(), 'output', 'audio-lab');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitForAudioState = async (page, predicate, message, timeout = 30000) => {
  await page.waitForFunction(predicate, undefined, { timeout }).catch(async (error) => {
    const state = await page.evaluate(() => window.__DDG_AUDIO_STATE__ ?? null).catch(() => null);
    throw new Error(`${message}. Last state: ${JSON.stringify(state)}. ${error.message}`);
  });
};

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('ddg_audio_check_initialized') !== 'true') {
      localStorage.removeItem('ddg_site_audio_preference_v1');
      sessionStorage.setItem('ddg_audio_check_initialized', 'true');
    }
  });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
      issues.push(`request: ${request.url()} ${request.failure()?.errorText}`);
    }
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-page').waitFor({ state: 'visible', timeout: 15000 });
  const soundButton = page.getByTestId('site-music-controller');
  await soundButton.waitFor({ state: 'visible', timeout: 15000 });
  assert(await soundButton.getAttribute('data-playing') === 'false', 'home must open with consent mute');
  await page.locator('.home-scene-loader').waitFor({ state: 'hidden', timeout: 30000 });

  await soundButton.click();
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.enabled === true
      && window.__DDG_AUDIO_STATE__?.contextState === 'running',
    'sound button did not unlock Web Audio',
  );
  await waitForAudioState(
    page,
    () => ['water', 'shore', 'boat', 'birds', 'wind', 'thunder']
      .every((id) => window.__DDG_AUDIO_STATE__?.activeTracks?.includes(id)),
    'soundscape tracks did not decode/start',
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="home-page"] canvas');
    return canvas?.dataset.ddgAudioBridge === 'camera-listener'
      && Boolean(canvas?.dataset.ddgAudioListener);
  }, undefined, { timeout: 15000 });
  const initialTracks = await page.evaluate(() => window.__DDG_AUDIO_STATE__.activeTracks.slice().sort());
  await page.screenshot({ path: path.join(screenshotDir, '01-home-sound-enabled.png'), fullPage: true });

  await page.getByTestId('nav-info').click({ force: true });
  await page.getByTestId('info-page').waitFor({ state: 'visible', timeout: 15000 });
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.routeActive === false
      && window.__DDG_AUDIO_STATE__?.homeGainTarget === 0,
    'home bus did not target silence on an inner route',
  );

  await page.getByTestId('brand-link').click({ force: true });
  await page.getByTestId('home-page').waitFor({ state: 'visible', timeout: 15000 });
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.routeActive === true
      && window.__DDG_AUDIO_STATE__?.homeGainTarget === 1,
    'home bus did not fade back in',
  );
  const returnTracks = await page.evaluate(() => window.__DDG_AUDIO_STATE__.activeTracks.slice().sort());
  assert(
    JSON.stringify(returnTracks) === JSON.stringify(initialTracks),
    'route return recreated or duplicated the soundscape transport',
  );

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-editor-page').waitFor({ state: 'visible', timeout: 15000 });
  assert(await page.getByTestId('site-music-controller').count() === 0, 'public sound button must hide in editor');
  await page.getByTestId('home-editor-group-audio').click();
  await page.getByTestId('home-editor-audio-transport').waitFor({ state: 'visible', timeout: 10000 });
  const editorPreviewButton = page.getByTestId('home-editor-audio-preview');
  await editorPreviewButton.waitFor({ state: 'visible', timeout: 10000 });
  await editorPreviewButton.click();
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.routeActive === true
      && window.__DDG_AUDIO_STATE__?.enabled === true,
    'editor preview did not activate its private route audition',
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="home-editor-scene"] canvas');
    return Boolean(canvas?.dataset.ddgRuntimeMetrics);
  }, undefined, { timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, '02-editor-mixer.png'), fullPage: true });

  await page.getByTestId('home-editor-tab-audioTracks').click({ force: true });
  await page.getByTestId('home-editor-audio-track-list').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, '03-editor-tracks.png'), fullPage: true });
  await page.locator('.home-editor-section').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: path.join(screenshotDir, '03b-editor-tracks-bottom.png'), fullPage: true });

  await page.getByTestId('home-editor-tab-audioSpatial').click({ force: true });
  await page.getByTestId('home-editor-audio-emitter-shore').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, '04-editor-spatial.png'), fullPage: true });
  await page.locator('.home-editor-section').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: path.join(screenshotDir, '04b-editor-spatial-bottom.png'), fullPage: true });

  // A remembered "on" choice must survive reload without racing the first
  // explicit sound-button press into an accidental toggle-off.
  await page.goto(`${baseUrl}/info`, { waitUntil: 'domcontentloaded' });
  const restoredButton = page.getByTestId('site-music-controller');
  await restoredButton.waitFor({ state: 'visible', timeout: 10000 });
  assert(
    await page.evaluate(() => JSON.parse(
      localStorage.getItem('ddg_site_audio_preference_v1') ?? '{}',
    ).enabled === true),
    'remembered sound preference was overwritten before the resume gesture',
  );
  await restoredButton.click();
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.enabled === true
      && window.__DDG_AUDIO_STATE__?.contextState === 'running',
    'explicit sound press raced the stored preference restore',
  );
  await restoredButton.click();
  await waitForAudioState(
    page,
    () => window.__DDG_AUDIO_STATE__?.enabled === false,
    'explicit mute did not override the stored preference',
  );
  await page.getByTestId('language-en').click({ force: true });
  await page.waitForTimeout(120);
  assert(
    await page.evaluate(() => window.__DDG_AUDIO_STATE__?.enabled === false),
    'a later gesture unexpectedly restored audio after explicit mute',
  );

  assert(issues.length === 0, `browser issues:\n${issues.join('\n')}`);
  process.stdout.write(`Audio browser lifecycle and editor: OK\nScreenshots: ${screenshotDir}\n`);
} finally {
  await browser.close();
}
