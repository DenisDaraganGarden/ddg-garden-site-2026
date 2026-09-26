import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from 'vite';
import { localGuardPlugin, trustedLocalRequest } from './localGuard.mjs';

// Одна проверка на все служебные маршруты (localGuard.mjs): сама функция на
// поддельных запросах, затем живой сервер Vite, где плагин стоит перед маршрутом
// /__echo, и порядок плагинов в настоящих конфигах сайта и редактора.
const local = {
  method: 'POST',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:41212', origin: 'http://127.0.0.1:41212', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
};
const variant = (patch, headers = {}) => ({ ...local, ...patch, headers: { ...local.headers, ...headers } });

assert.equal(trustedLocalRequest(local), true, 'the editor on this computer');
assert.equal(trustedLocalRequest(variant({ socket: { remoteAddress: '::1' } }, { host: 'localhost:41212', origin: 'http://localhost:41212' })), true, 'localhost over IPv6');
assert.equal(trustedLocalRequest(variant({}, { origin: undefined, 'sec-fetch-site': undefined })), true, 'a script on this computer sends no Origin');
assert.equal(trustedLocalRequest(variant({ method: 'GET' }, { 'content-type': undefined })), true);
assert.equal(trustedLocalRequest(variant({}, { 'content-type': 'image/webp' })), true, 'an upload with its own type');
assert.equal(trustedLocalRequest(variant({ method: 'DELETE' }, { 'content-type': undefined })), true);
assert.equal(trustedLocalRequest(variant({}, { origin: 'https://evil.example' })), false, 'another site');
assert.equal(trustedLocalRequest(variant({}, { origin: 'http://127.0.0.1:41215' })), false, 'another local port is another origin');
assert.equal(trustedLocalRequest(variant({}, { origin: 'null' })), false, 'an opaque origin');
assert.equal(trustedLocalRequest(variant({}, { host: 'evil.example:41212', origin: 'http://evil.example:41212' })), false, 'DNS rebinding');
assert.equal(trustedLocalRequest(variant({ socket: { remoteAddress: '192.168.1.25' } })), false, 'the local network');
assert.equal(trustedLocalRequest(variant({}, { 'sec-fetch-site': 'cross-site', origin: undefined })), false);
for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'Text/Plain;charset=UTF-8']) {
  assert.equal(trustedLocalRequest(variant({}, { origin: undefined, 'content-type': type })), false, `a plain form body: ${type}`);
}

// The real configs: the guard stands first, before every /__ route.
const { default: siteConfig } = await import('../vite.config.js');
const { default: editorConfig } = await import('../vite.editor.config.js');
for (const config of [siteConfig, editorConfig]) assert.equal(config.plugins[0].name, 'local-guard', 'the guard is the first plugin');

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: 'output/local-guard-cache',
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [localGuardPlugin(), {
    name: 'echo',
    configureServer(dev) {
      dev.middlewares.use('/__echo', (request, response) => { response.statusCode = 200; response.end('echo'); });
    },
  }],
});
await server.listen();
const { port } = server.httpServer.address();
const send = (path, { method = 'POST', headers = {}, body = '{}' } = {}) => new Promise((resolve, reject) => {
  const request = http.request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (response) => {
    let text = '';
    response.on('data', (chunk) => { text += chunk; });
    response.on('end', () => resolve({ status: response.statusCode, text }));
  });
  request.on('error', reject);
  request.end(method === 'GET' ? undefined : body);
});

try {
  const same = `http://127.0.0.1:${port}`;
  assert.equal((await send('/__echo', { headers: { origin: same, 'content-type': 'application/json' } })).status, 200, 'the editor passes');
  assert.equal((await send('/__echo', { method: 'GET' })).status, 200, 'a local read passes');
  const forged = await send('/__echo', { headers: { origin: 'https://evil.example', 'content-type': 'text/plain' } });
  assert.equal(forged.status, 403, 'a form from another site is refused');
  assert.match(forged.text, /только редактору на этом компьютере/);
  assert.equal((await send('/__echo', { headers: { 'content-type': 'text/plain' } })).status, 403, 'a plain form body is refused');
  assert.equal((await send('/__echo', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } })).status, 403);
  const other = await send('/not-a-service-route', { headers: { origin: 'https://evil.example', 'content-type': 'text/plain' } });
  assert.doesNotMatch(other.text, /только редактору на этом компьютере/, 'pages and assets are not the guard’s business');
  console.log('local guard: one check before every /__ route — loopback, same origin, no plain form bodies');
} finally {
  await server.close();
}
