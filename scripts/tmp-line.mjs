import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await page.goto('http://127.0.0.1:41219/asset-lab.html?collection=water');
  await page.waitForSelector('canvas');
  await wait(24000);
  const box = await page.locator('canvas').boundingBox();
  for (const view of ['Коса', 'Прибой сверху']) {
    await page.getByRole('button', { name: view, exact: true }).click().catch(() => {});
    await wait(3200);
    await page.screenshot({ path: `output/playwright/line/${view.replace(/\s/g, '-')}.png`, clip: box });
  }
  console.log(JSON.stringify({ errors: [...new Set(errors)].slice(0, 3) }));
} finally { await browser.close(); }
