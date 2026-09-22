// Measures what freezes the main thread while the site opens: long tasks, frame
// gaps and a CPU profile attributed to functions. Run against an unminified
// build so the profile names real functions:
//   vite build --minify false --outDir /tmp/dist-measure
//   MEASURE_DIST=/tmp/dist-measure node scripts/measure-load.mjs
// Or point at any running server: MEASURE_URL=http://localhost:41214/ ...
// MEASURE_MOBILE=1 emulates a phone with a 4x slower CPU. MEASURE_SECONDS=20.
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const seconds = Number(process.env.MEASURE_SECONDS ?? '20');
const mobile = process.env.MEASURE_MOBILE === '1';
const port = Number(process.env.MEASURE_PORT ?? '41230');
let url = process.env.MEASURE_URL;
let server = null;

if (!url) {
  const dist = process.env.MEASURE_DIST;
  if (!dist) { console.error('Set MEASURE_URL or MEASURE_DIST'); process.exit(1); }
  server = spawn(process.execPath, [path.join(rootDir, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dist, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
  url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const context = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const perf = { long: [], frames: [], firstFrame: null, revealed: null };
  // When the page lifts its loader off the scene.
  const reveal = setInterval(() => { if (document.querySelector('.home-water-container--visible')) { perf.revealed = Math.round(performance.now()); clearInterval(reveal); } }, 100);
  window.__perf = perf;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) perf.long.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  // Shader compile stalls: the driver compiles asynchronously, and the first
  // status query blocks until it is done. Time every such query per program.
  perf.shaders = []; perf.links = 0;
  const P = WebGL2RenderingContext.prototype;
  const srcLen = new WeakMap(); const attached = new WeakMap();
  const oSource = P.shaderSource; P.shaderSource = function (sh, code) { srcLen.set(sh, code.length); return oSource.call(this, sh, code); };
  const oAttach = P.attachShader; P.attachShader = function (pr, sh) { attached.set(pr, [...(attached.get(pr) ?? []), srcLen.get(sh) ?? 0]); return oAttach.call(this, pr, sh); };
  const timed = (name, pick) => { const orig = P[name]; P[name] = function (...args) { const t = performance.now(); const r = orig.apply(this, args); const dt = performance.now() - t; const pr = pick(this, args); if (pr) { if (name === 'linkProgram') perf.links++; if (dt >= 1) perf.shaders.push([name, Math.round(dt), Math.round(t), ...(attached.get(pr) ?? [])]); } return r; }; };
  timed('linkProgram', (gl, [pr]) => pr);
  timed('getProgramParameter', (gl, [pr, pname]) => (pname === gl.LINK_STATUS ? pr : null));
  timed('getShaderParameter', (gl, [sh, pname]) => (pname === gl.COMPILE_STATUS ? { sh } : null));
  let last = null;
  const tick = (t) => {
    if (perf.firstFrame === null) perf.firstFrame = Math.round(t);
    if (last !== null) perf.frames.push([Math.round(t), Math.round(t - last)]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const cdp = await context.newCDPSession(page);
if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(seconds * 1000);
const { profile } = await cdp.send('Profiler.stop');
const perf = await page.evaluate(() => window.__perf);
const hud = await page.evaluate(() => { const m = window.__DDG_RUNTIME_METRICS__; return m ? JSON.stringify(m) : (document.querySelector('[data-testid$="performance-hud"]')?.innerText ?? null); });
const gpu = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const ext = gl ? Boolean(gl.getExtension('KHR_parallel_shader_compile')) : null;
  return `${info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'n/a'}  parallel shader compile: ${ext}`;
});
if (process.env.MEASURE_SHOT) await page.screenshot({ path: process.env.MEASURE_SHOT });
await browser.close();
server?.kill();

// --- report ---
const ms = (n) => `${Math.round(n)} ms`;
console.log(`URL ${url}  ${mobile ? 'mobile (4x cpu throttle)' : 'desktop'}  ${seconds}s  wall ${Date.now() - t0} ms`);
console.log(`GPU: ${gpu}`);
console.log(`First rAF: ${ms(perf.firstFrame ?? -1)}; scene revealed: ${perf.revealed === null ? 'never' : ms(perf.revealed)}`);
if (hud) console.log(`Runtime metrics: ${hud.replace(/\n+/g, ' | ')}`);
const long = perf.long.filter(([, d]) => d >= 50);
console.log(`\nLong tasks (>=50 ms): ${long.length}, total ${ms(long.reduce((s, [, d]) => s + d, 0))}, longest ${ms(Math.max(0, ...long.map(([, d]) => d)))}`);
for (const [s, d] of long.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  at ${String(s).padStart(6)} ms  ${ms(d)}`);
const gaps = perf.frames.filter(([, d]) => d > 50);
const settled = perf.frames.filter(([t]) => t > perf.frames.at(-1)[0] - 5000);
const avg = settled.reduce((s, [, d]) => s + d, 0) / Math.max(1, settled.length);
console.log(`\nFrame gaps >50 ms: ${gaps.length}, >100 ms: ${gaps.filter(([, d]) => d > 100).length}, >500 ms: ${gaps.filter(([, d]) => d > 500).length}`);
console.log(`Last 5 s: avg ${avg.toFixed(1)} ms/frame (${(1000 / avg).toFixed(0)} fps), gaps >33 ms: ${settled.filter(([, d]) => d > 33).length}`);

const stalls = perf.shaders.filter(([, d]) => d >= 1);
const sumBy = (name) => stalls.filter(([n]) => n === name).reduce((s, [, d]) => s + d, 0);
console.log(`\nShader programs linked: ${perf.links}; blocking: linkProgram ${ms(sumBy('linkProgram'))}, LINK_STATUS ${ms(sumBy('getProgramParameter'))}, COMPILE_STATUS ${ms(sumBy('getShaderParameter'))}`);
for (const [n, d, t, ...sizes] of stalls.sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${ms(d).padStart(9)}  at ${String(t).padStart(6)} ms  ${n}  shaders ${sizes.map((x) => `${Math.round(x / 1000)}k`).join('+')}`);

const self = new Map();
const byFile = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const node = byId.get(profile.samples[i]);
  const dt = (profile.timeDeltas[i] ?? 0) / 1000;
  total += dt;
  const { functionName, url: u, lineNumber } = node.callFrame;
  const file = u ? path.basename(u.split('?')[0]) : '';
  const key = `${functionName || '(anonymous)'}  ${file}${u ? `:${lineNumber + 1}` : ''}`;
  self.set(key, (self.get(key) ?? 0) + dt);
  byFile.set(file || functionName, (byFile.get(file || functionName) ?? 0) + dt);
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(`\nCPU self time, top functions (of ${ms(total)} sampled):`);
for (const [k, v] of top(self, 28)) console.log(`  ${ms(v).padStart(9)}  ${k}`);
console.log(`\nBy file:`);
for (const [k, v] of top(byFile, 14)) console.log(`  ${ms(v).padStart(9)}  ${k}`);
if (errors.length) { console.log(`\nConsole errors (${errors.length}):`); for (const e of errors.slice(0, 8)) console.log(`  ${e.slice(0, Number(process.env.MEASURE_ERROR_CHARS ?? '200'))}`); }
