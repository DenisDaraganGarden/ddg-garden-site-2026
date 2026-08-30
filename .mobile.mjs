import { chromium, devices } from 'playwright';

const profiles = [
  ['iPhone 13', devices['iPhone 13']],
  ['Pixel 5', devices['Pixel 5']],
  ['iPad (gen 7)', devices['iPad (gen 7)']],
];
const browser = await chromium.launch({ headless: false });
for (const [name, device] of profiles) {
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:4199/', { waitUntil: 'commit' });
  let reveal = -1;
  try {
    await page.waitForSelector('.home-scene-loader', { timeout: 30000 });
    await page.waitForSelector('.home-scene-loader', { state: 'detached', timeout: 120000 });
    reveal = Date.now() - t0;
  } catch { /* left as -1 */ }
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ds = {};
    if (c) for (const [k, v] of Object.entries(c.dataset)) if (k.startsWith('ddg') && k !== 'ddgFishDiagnostics') ds[k] = v;
    const bytes = performance.getEntriesByType('resource').reduce((s, r) => s + r.decodedBodySize, 0);
    return {
      dpr: devicePixelRatio,
      buffer: c ? [c.width, c.height] : null,
      css: c ? [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] : null,
      bytesMB: +(bytes / 1048576).toFixed(2),
      requests: performance.getEntriesByType('resource').length,
      ds,
    };
  });
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0; const t = performance.now();
    const tick = () => { n += 1; if (performance.now() - t < 3000) requestAnimationFrame(tick); else r(+(n / ((performance.now() - t) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${process.env.OUT}/${name.replace(/\W+/g, '-')}.png` });
  console.log(`\n=== ${name} ===`);
  console.log(`reveal ${reveal} ms | fps ${fps} | ${info.bytesMB} MB / ${info.requests} req | dpr ${info.dpr} | buffer ${info.buffer?.join('x')} css ${info.css?.join('x')}`);
  console.log('  tier', info.ds.ddgQualityTier, '| mobile', info.ds.ddgMobileProfile, '| sky', info.ds.ddgSkyLut, '| sim', info.ds.ddgSimulationEffective, '| post', info.ds.ddgPostSamples + 'x @' + info.ds.ddgPostRenderScale, '| optics', info.ds.ddgOpticsTarget, '| fish', info.ds.ddgFishCount, '| gulls', info.ds.ddgSeagulls);
  console.log('  targets', info.ds.ddgRenderTargets, '| water', info.ds.ddgWaterMeshDensity, '| seabed', info.ds.ddgSeabedMeshDensity, '| refraction', info.ds.ddgRefractionMode);
  console.log('  errors:', errors.length ? errors.slice(0, 3) : 'none');
  await context.close();
}
await browser.close();
