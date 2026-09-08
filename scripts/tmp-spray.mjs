import { chromium } from 'playwright';
import sharp from 'sharp';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = 'output/playwright/spray/';
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 600)); });
  await page.goto('http://127.0.0.1:41219/asset-lab.html?collection=foam');
  await page.waitForSelector('canvas');
  await wait(15000);
  const box = await page.locator('canvas').boundingBox();
  await page.getByRole('button', { name: 'Волнение', exact: true }).click();
  await wait(3000);
  await page.getByRole('tab', { name: 'Волна', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Стоп-кадр', exact: true }).check();
  const phase = page.getByRole('slider', { name: 'Фаза обрушения', exact: true });
  const names = [];
  for (const [view, value] of [['Прибой', 0.58], ['Прибой', 0.66], ['Всплеск', 0.58], ['Всплеск', 0.66]]) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await phase.fill(String(value));
    await wait(2500);
    const n = `${view}-${Math.round(value * 100)}`;
    await page.screenshot({ path: `${dir}${n}.png`, clip: box });
    names.push(n);
  }
  console.log(JSON.stringify({ stats: (await page.locator('footer').innerText()).replace(/\n/g, ' | '), errors: [...new Set(errors)].slice(0, 3) }));
  const m = await sharp(`${dir}${names[0]}.png`).metadata();
  const w = 500, h = Math.round(w * m.height / m.width);
  const tiles = await Promise.all(names.map(async (f, i) => ({ input: await sharp(`${dir}${f}.png`).resize(w, h).toBuffer(), left: (i % 2) * w, top: Math.floor(i / 2) * h })));
  await sharp({ create: { width: 2 * w, height: 2 * h, channels: 3, background: '#222' } }).composite(tiles).png().toFile(dir + 'sheet.png');
} finally { await browser.close(); }
