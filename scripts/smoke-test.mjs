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
const uploadPngPath = path.join(rootDir, 'public', 'xray-butterfly.png');

const navChecks = [
  { label: 'News', path: '/news', heading: 'News' },
  { label: 'Info', path: '/info', heading: 'Info' },
  { label: 'Monographs', path: '/monographs', heading: 'Monographs' },
  { label: 'Press', path: '/press', heading: 'Press' },
  { label: 'Map', path: '/map', heading: 'Map' },
  { label: 'Archive', path: '/archive', heading: 'Archive' },
];

const editorSeedDocument = {
  version: 2,
  contentHtml: `
    <div>
      TOP SECRET<br><br>
      MEMORANDUM FOR: The Director<br>
      SUBJECT: Project Assessment<br><br>
      As discussed previously, this document serves as a template for the new interface.
      <br><br>
      Please review the classified details and approve.
      <br><br>
      Approved by: D.D.
    </div>
  `.trim(),
  paperSettings: {
    brightness: 92,
    grain: 5,
    vignette: 15,
    creases: 15,
    dirt: 10,
    textScale: 1,
    tone: 0,
  },
  overlays: [],
  updatedAt: new Date().toISOString(),
};

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
    const url = request.url();
    const errorText = request.failure()?.errorText ?? 'unknown';
    const isAbortedRequest = errorText === 'net::ERR_ABORTED';

    if (!isAbortedRequest) {
      issues.push(`request failed: ${request.method()} ${url} (${errorText})`);
    }
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      issues.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
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

async function waitForAutosave(page) {
  await page.waitForTimeout(1400);
}

async function seedLegacySnakeSettings(page, overrides = {}) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((settings) => {
    localStorage.setItem('ddg_snake_settings_v3', JSON.stringify(settings));
  }, {
    planeTrailLength: 18,
    planeRadius: 350,
    planeHeight: 200,
    cameraFov: 40,
    ...overrides,
  });
}

async function seedInfoEditorDocument(page) {
  await page.goto(`${baseUrl}/info/edit`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (documentState) => {
    localStorage.removeItem('cia_editor_content');
    localStorage.removeItem('cia_editor_settings');
    localStorage.removeItem('cia_editor_document_v2');

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('ddg-info-editor', 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('documents')) {
          database.createObjectStore('documents');
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put(documentState, 'default');
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Failed to seed document'));
      };

      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });
  }, editorSeedDocument);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.info-editor-surface'), 'seeded editor surface');
}

async function selectText(page, targetText) {
  const found = await page.evaluate((text) => {
    const root = document.querySelector('.info-editor-surface');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const index = node.nodeValue.indexOf(text);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
    }

    return false;
  }, targetText);

  assert(found, `Unable to select text: ${targetText}`);
}

async function selectMarkedText(page, mark) {
  const found = await page.evaluate((targetMark) => {
    const span = document.querySelector(`.info-editor-surface [data-mark="${targetMark}"]`);
    if (!span?.firstChild) {
      return false;
    }

    const range = document.createRange();
    range.setStart(span.firstChild, 0);
    range.setEnd(span.firstChild, span.firstChild.nodeValue.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, mark);

  assert(found, `Unable to select marked text: ${mark}`);
}

async function placeCaretInsideMark(page, mark) {
  const placed = await page.evaluate((targetMark) => {
    const span = document.querySelector(`.info-editor-surface [data-mark="${targetMark}"]`);
    if (!span?.firstChild) {
      return false;
    }

    const node = span.firstChild;
    const range = document.createRange();
    range.setStart(node, node.nodeValue.length);
    range.setEnd(node, node.nodeValue.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, mark);

  assert(placed, `Unable to place caret inside mark: ${mark}`);
}

async function getEditorHtml(page) {
  return page.locator('.info-editor-surface').evaluate((node) => node.innerHTML);
}

async function setRangeValue(page, locator, value) {
  await locator.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter.call(element, String(nextValue));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

function getSnakePanelSlider(page, label) {
  return page.locator('.cia-control-group', { hasText: label }).locator('input[type="range"]').first();
}

async function assertNoOverlap(page, topSelector, bottomSelector, label) {
  const result = await page.evaluate(([topSel, bottomSel]) => {
    const top = document.querySelector(topSel)?.getBoundingClientRect();
    const bottom = document.querySelector(bottomSel)?.getBoundingClientRect();
    if (!top || !bottom) {
      return null;
    }

    return {
      topBottom: top.bottom,
      bottomTop: bottom.top,
    };
  }, [topSelector, bottomSelector]);

  assert(result, `${label}: missing bounding boxes`);
  assert(result.bottomTop >= result.topBottom - 4, `${label}: overlap detected (${result.topBottom} > ${result.bottomTop})`);
}

async function drawSnakeTrail(page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  assert(box, 'Snake canvas bounding box not available');

  const startX = box.x + box.width * 0.62;
  const startY = box.y + box.height * 0.16;

  await page.mouse.move(startX, startY);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(startX - (i * 36), startY + (i * 26), { steps: 2 });
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(120);
}

async function runEditorChecks(page) {
  await seedInfoEditorDocument(page);
  await expectVisible(page, page.getByText('TOP SECRET', { exact: false }), 'editor content');

  await selectText(page, 'Project Assessment');
  await page.getByRole('button', { name: 'Handwriting' }).click();
  let html = await getEditorHtml(page);
  assert(html.includes('<span data-mark="handwriting">Project Assessment</span>'), 'Handwriting mark was not applied');
  log('OK editor handwriting apply');

  await selectText(page, 'Project Assessment');
  await page.getByRole('button', { name: 'Handwriting' }).click();
  html = await getEditorHtml(page);
  assert(!html.includes('<span data-mark="handwriting">Project Assessment</span>'), 'Handwriting mark was not removed');
  log('OK editor handwriting toggle');

  await selectText(page, 'classified details');
  await page.getByRole('button', { name: 'Black Marker' }).click();
  html = await getEditorHtml(page);
  assert(html.includes('<span data-mark="marker">classified details</span>'), 'Marker was not applied');
  log('OK editor marker apply');

  await selectMarkedText(page, 'marker');
  await page.getByRole('button', { name: 'Black Marker' }).click();
  html = await getEditorHtml(page);
  assert(!html.includes('<span data-mark="marker">classified details</span>'), 'Marker was not removed');
  log('OK editor marker toggle');

  await selectText(page, 'classified details');
  await page.getByRole('button', { name: 'Black Marker' }).click();
  await placeCaretInsideMark(page, 'marker');
  await page.keyboard.press('Backspace');
  await settlePage(page, 120);
  html = await getEditorHtml(page);
  assert(html.includes('<span data-mark="marker">classified detail</span>'), 'Backspace inside marker did not preserve DOM');
  log('OK editor marker backspace');

  await page.getByRole('button', { name: 'Undo' }).click();
  await settlePage(page, 120);
  html = await getEditorHtml(page);
  assert(html.includes('<span data-mark="marker">classified details</span>'), 'Undo did not restore marker content');
  log('OK editor undo');

  const brightness = page.getByRole('slider', { name: 'Brightness' });
  await setRangeValue(page, brightness, 88);
  await settlePage(page, 100);
  assert((await brightness.inputValue()) === '88', 'Brightness slider did not update');
  log('OK editor paper setting');

  await page.locator('input[type="file"]').setInputFiles(uploadPngPath);
  await expectVisible(page, page.locator('.png-overlay img'), 'uploaded overlay');
  const sizeSlider = page.getByRole('slider', { name: 'Size' });
  await setRangeValue(page, sizeSlider, 30);
  await settlePage(page, 100);
  assert((await sizeSlider.inputValue()) === '30', 'Overlay size slider did not update');
  log('OK editor upload');

  await waitForAutosave(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.png-overlay img'), 'persisted overlay after reload');
  assert((await page.getByRole('slider', { name: 'Brightness' }).inputValue()) === '88', 'Brightness did not persist after reload');
  log('OK editor persistence');

  await page.goto(`${baseUrl}/info`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.png-overlay img'), 'info page overlay');
  log('OK info overlay render');
}

async function runDesktopChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  collectPageIssues(page, issues);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByRole('link', { name: 'Denis Daragan Design' }), 'brand link');
  await expectVisible(page, page.locator('.snake-home-canvas canvas'), 'snake home canvas');
  await settlePage(page);

  for (const check of navChecks) {
    await page.getByRole('link', { name: check.label }).click();
    await page.waitForURL(`${baseUrl}${check.path}`);
    await expectVisible(page, page.getByRole('heading', { name: check.heading }), `${check.label} heading`);
    await settlePage(page);
    log(`OK desktop ${check.path}`);
  }

  await page.getByRole('link', { name: 'Denis Daragan Design' }).click();
  await page.waitForURL(baseUrl);
  await expectVisible(page, page.getByRole('link', { name: 'Archive' }), 'desktop home navigation');
  await settlePage(page);
  log('OK desktop /');

  await page.goto(`${baseUrl}/home/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByText('FLOW SPEED', { exact: false }), '/home/edit marker');
  log('OK desktop /home/edit');

  await seedLegacySnakeSettings(page);
  await page.goto(`${baseUrl}/snake/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.getByText('Змея - Геометрия', { exact: false }), '/snake/edit marker');
  const tailLengthSlider = getSnakePanelSlider(page, 'ДЛИНА ХВОСТА');
  const tailPersistenceSlider = getSnakePanelSlider(page, 'ВРЕМЯ ЗАТУХАНИЯ');
  assert((await tailLengthSlider.inputValue()) === '36', 'Legacy planeTrailLength did not migrate to planeTrailSpan');
  assert((await tailPersistenceSlider.inputValue()) === '18', 'Legacy planeTrailLength did not migrate to planeTrailPersistence');
  log('OK snake settings migration');

  await setRangeValue(page, tailLengthSlider, 44);
  await setRangeValue(page, tailPersistenceSlider, 12);
  await settlePage(page, 100);
  await waitForAutosave(page);

  await page.getByRole('button', { name: 'Камеры' }).click();
  const cameraFovSlider = page.locator('.cia-toolbar-section input[type="range"]').first();
  await setRangeValue(page, cameraFovSlider, 52);
  await settlePage(page, 100);
  await drawSnakeTrail(page);
  const snakeDebugState = await page.evaluate(() => window.__DDG_SNAKE_DEBUG__ ?? null);
  assert(snakeDebugState, 'Snake debug state was not exposed in dev');
  assert(snakeDebugState.trailPointCount > 1, 'Snake trail did not collect enough points');
  assert(snakeDebugState.trailStride === 4, 'Trail buffer stride should be 4');
  assert(snakeDebugState.currentPathLength > 0, 'Trail currentPathLength should increase after pointer movement');
  assert(snakeDebugState.planeTrailArrayLength === snakeDebugState.snakeTrailArrayLength, 'Plane and snake trail uniform array length should match');
  assert(snakeDebugState.planeTrailStride === snakeDebugState.snakeTrailStride, 'Plane and snake trail stride should match');
  log('OK snake shared trail buffer');

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert((await getSnakePanelSlider(page, 'ДЛИНА ХВОСТА').inputValue()) === '44', 'Snake tail length did not persist after reload');
  assert((await getSnakePanelSlider(page, 'ВРЕМЯ ЗАТУХАНИЯ').inputValue()) === '12', 'Snake tail persistence did not persist after reload');
  await page.getByRole('button', { name: 'Камеры' }).click();
  assert((await page.locator('.cia-toolbar-section input[type="range"]').first().inputValue()) === '52', 'Snake camera FOV did not persist after reload');
  const savedSnakeSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('ddg_snake_settings_v3') || '{}'));
  assert(!('planeTrailLength' in savedSnakeSettings), 'Legacy planeTrailLength key should be removed after migration');
  log('OK desktop /snake/edit');

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, page.locator('.snake-home-canvas canvas'), 'snake home canvas after editor save');
  const savedFov = await page.evaluate(() => JSON.parse(localStorage.getItem('ddg_snake_settings_v3') || '{}').cameraFov);
  assert(savedFov === 52, 'Home page did not retain persisted snake settings');
  log('OK desktop snake autosave');

  await runEditorChecks(page);

  await context.close();
  return issues;
}

async function runMobileChecks(browser) {
  const issues = [];
  const context390 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page390 = await context390.newPage();
  collectPageIssues(page390, issues);

  await page390.goto(`${baseUrl}/info/edit`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page390, page390.locator('.mobile-editor-sheet'), 'mobile editor sheet');
  await assertNoOverlap(page390, '.main-nav', '.paper-container', '390px nav to paper');
  await page390.getByRole('button', { name: 'Paper' }).click();
  await expectVisible(page390, page390.getByRole('slider', { name: 'Text Scale' }), 'mobile paper tab');
  await page390.getByRole('button', { name: 'Insert' }).click();
  await expectVisible(page390, page390.getByRole('button', { name: /Upload PNG|Replace PNG/ }), 'mobile insert tab');
  log('OK mobile 390 /info/edit');
  await context390.close();

  const context320 = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const page320 = await context320.newPage();
  collectPageIssues(page320, issues);

  await page320.goto(`${baseUrl}/info`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page320, page320.getByRole('heading', { name: 'Info' }), '320px info heading');
  await assertNoOverlap(page320, '.main-nav', '.info-title', '320px nav to info title');
  log('OK mobile 320 /info');

  await page320.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page320, page320.getByRole('link', { name: 'News' }), '320px home nav');
  const navMetrics = await page320.evaluate(() => {
    const links = document.querySelector('.nav-links');
    return {
      scrollable: links.scrollWidth > links.clientWidth,
    };
  });
  assert(navMetrics.scrollable, '320px navigation should be horizontally scrollable');
  log('OK mobile 320 /');

  await context320.close();
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
      ...(await runDesktopChecks(browser)),
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
