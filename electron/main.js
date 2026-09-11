import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, shell } from 'electron';
import { createServer } from 'vite';

// Оболочка движка. Окно показывает тот же редактор, что и в браузере, — второй
// реализации интерфейса не заводится. Сервер поднимается внутри приложения, а не
// отдельной командой: редактору нужен тот же локальный адрес, по которому уже
// работают проекты (/__projects) и публикация сайта.
//
// Порт свой (41219) и только на петле: у каждого origin своё хранилище, и
// приложение не должно делить черновик с вкладками Дениса на 41211-41213.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.DDG_APP_PORT) || 41219;
const START = process.env.DDG_APP_START || '/engine';
const SMOKE = process.env.DDG_APP_SMOKE;

let viteServer = null;

async function startEngineServer() {
  const { default: config } = await import(path.join(ROOT, 'vite.editor.config.js'));
  viteServer = await createServer({
    ...config,
    configFile: false,
    root: ROOT,
    server: { ...config.server, host: '127.0.0.1', port: PORT, strictPort: true },
  });
  await viteServer.listen();
  return `http://127.0.0.1:${PORT}`;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Проект',
      submenu: [
        {
          label: 'К списку проектов',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => BrowserWindow.getFocusedWindow()?.loadURL(`http://127.0.0.1:${PORT}${START}`),
        },
        {
          label: 'Папка проектов',
          click: () => shell.openPath(path.join(ROOT, 'projects')),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить без кеша' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

async function createWindow(url) {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#17191a',
    title: 'OUROBOROS ENGINE',
    // Сцена рисует сама, ей не нужен ни Node в странице, ни доступ к файлам:
    // проекты ходят через тот же HTTP, что и в браузере.
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  // Вкладки редактор не открывает, а ссылка наружу — это ссылка наружу.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  window.once('ready-to-show', () => window.show());
  await window.loadURL(`${url}${START}`);
  return window;
}

// Проверка без глаз: окно поднимается, страница грузится, кадр ложится в файл.
async function runSmoke(window) {
  await new Promise((resolve) => { setTimeout(resolve, Number(process.env.DDG_APP_SMOKE_WAIT) || 4000); });
  const title = await window.webContents.executeJavaScript(
    'document.querySelector(".engine-body h1")?.textContent ?? document.querySelector(".focus-project-label")?.textContent ?? "нет заголовка"',
  );
  const image = await window.webContents.capturePage();
  await fs.writeFile(SMOKE, image.toPNG());
  console.log(`app: окно открылось, заголовок «${title}», кадр в ${SMOKE}`);
  // Сервер держит процесс открытыми сокетами, и app.exit его не ждёт: сначала
  // закрыть, потом выходить, иначе проверка висит до таймаута.
  await viteServer?.close();
  viteServer = null;
  app.exit(0);
  process.exit(0);
}

app.whenReady().then(async () => {
  try {
    const url = await startEngineServer();
    buildMenu();
    const window = await createWindow(url);
    if (SMOKE) await runSmoke(window);
  } catch (error) {
    console.error('Движок не запустился:', error);
    app.exit(1);
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { void viteServer?.close(); });
