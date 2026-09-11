import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Оболочку нельзя проверить сборкой: она либо открывает окно с редактором, либо
// нет. Приложение запускается в режиме проверки — оно само снимает кадр
// открывшегося окна и выходит, а здесь проверяется, что кадр не пустой.
//
// Окно на секунду появится на экране: у Electron нет честного headless.
const require = createRequire(import.meta.url);
const electron = require('electron');
const frame = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-app-')), 'engine.png');

const child = spawn(electron, ['electron/main.js'], {
  env: { ...process.env, DDG_APP_SMOKE: frame, DDG_APP_PORT: process.env.DDG_APP_PORT ?? '41229' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const code = await new Promise((resolve) => {
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('таймаут'); }, 90000);
  child.on('exit', (value) => { clearTimeout(timer); resolve(value); });
});

const image = await fs.stat(frame).catch(() => null);
await fs.rm(path.dirname(frame), { recursive: true, force: true });

if (code !== 0 || !image || image.size < 4096) {
  console.error(output.trim());
  throw new Error(`app: окно не открылось (выход ${code}, кадр ${image?.size ?? 0} байт)`);
}

if (!/заголовок «Проекты»/.test(output)) {
  console.error(output.trim());
  throw new Error('app: окно открылось, но в нём не меню проектов');
}

console.log(`app: окно движка открывается на меню проектов, кадр ${Math.round(image.size / 1024)} КБ — ок`);
