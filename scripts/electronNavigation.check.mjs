import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { loadEnginePage } from '../electron/navigation.js';

// Exercise actual Electron navigation without user profiles or project data.
await fs.mkdir('output', { recursive: true });
const temporary = await fs.mkdtemp(path.resolve('output/electron-navigation-'));
app.setPath('userData', temporary);
app.setPath('sessionData', temporary);
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // Let finally finish before exiting.
const server = http.createServer((request, response) => {
  if (request.url === '/pending.png') return; // Hold the menu's load open.
  response.setHeader('Content-Type', 'text/html');
  response.end(request.url === '/menu'
    ? '<img src="/pending.png"><button>Open project</button>'
    : '<title>Project opened</title><p>Project opened</p>');
});
let window;
let code = 0;
app.whenReady().then(async () => {
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    window = new BrowserWindow({ show: false, webPreferences: { partition: 'navigation-check' } });
    const url = `http://127.0.0.1:${server.address().port}`;
    const switchDuringLoad = async (load) => {
      const menuReady = new Promise((resolve) => window.webContents.once('dom-ready', resolve));
      const pending = load(`${url}/menu`);
      await menuReady;
      const projectReady = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      await loadEnginePage(window, `${url}/project`);
      await pending;
      await projectReady;
    };
    // The old startup path rejects; the new path lets the project finish.
    await switchDuringLoad((target) => assert.rejects(window.loadURL(target), (error) => error.errno === -3));
    await switchDuringLoad((target) => loadEnginePage(window, target));
    assert.equal(window.webContents.getTitle(), 'Project opened');
    await assert.rejects(loadEnginePage(window, 'http://127.0.0.1:1/'), (error) => error.errno !== -3);
    console.log('Electron navigation: interrupted menu opens project; genuine failures still reject — ok');
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    window?.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
    app.exit(code);
  }
});
