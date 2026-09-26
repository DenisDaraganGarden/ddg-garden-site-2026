import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { createServer } from 'vite';
import { projects } from '../scripts/projectStore.mjs';
import { loadEnginePage } from './navigation.js';

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
// Режим сбора: приложение открывает страницу, выполняет в ней выражение и
// кладёт ответ в файл. Так снимается справочник параметров — прямо из редактора,
// а не из пересказа исходников.
const PROBE = process.env.DDG_APP_PROBE;
const PROBE_OUT = process.env.DDG_APP_PROBE_OUT;

let viteServer = null;
let mainWindow = null;

// Имя в меню меняется, профиль с черновиками остаётся прежним.
const userData = app.getPath('userData');
app.setName('OUROBOROS');
app.setPath('userData', userData);
app.setPath('sessionData', userData);

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (process.platform === 'darwin') app.show();
  mainWindow.show();
  mainWindow.focus();
}

// Корень сервера приложения — меню проектов, а не редактор сайта: кнопка в
// списке запуска открывает вкладку на этом порту, и она должна показывать то
// же, что и окно. Плагин стоит первым, чтобы перехватить «/» раньше редакторского.
function engineAtRootPlugin() {
  const redirect = (middlewares) => {
    middlewares.use((request, response, next) => {
      if (request.url === '/' || request.url === '') {
        response.statusCode = 302;
        response.setHeader('Location', START);
        response.end();
        return;
      }
      next();
    });
  };
  return { name: 'engine-at-root', configureServer(server) { redirect(server.middlewares); } };
}

// Окно без полосы заголовка (macOS): верхние строки редактора и меню проектов
// становятся полосой окна — отступ под кнопки окна слева, протяжка за
// пустое место двигает окно, кнопки и поля остаются кнопками и полями.
const SHELL_CSS = `
.focus-topbar, .engine-topbar { -webkit-app-region: drag; padding-left: 84px !important; }
#engine-boot { -webkit-app-region: drag; }
:is(.focus-topbar, .engine-topbar) :is(button, a, input, select, textarea, label, [role=button], [tabindex]), .focus-compass { -webkit-app-region: no-drag; }
`;

async function startEngineServer() {
  const { default: config } = await import(path.join(ROOT, 'vite.editor.config.js'));
  viteServer = await createServer({
    ...config,
    plugins: [engineAtRootPlugin(), ...config.plugins],
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
          click: () => {
            const window = BrowserWindow.getFocusedWindow();
            if (window) void loadEnginePage(window, `http://127.0.0.1:${PORT}${START}`)
              .catch((error) => console.error('Не удалось открыть меню проектов:', error));
          },
        },
        {
          label: 'Папка проектов',
          click: () => shell.openPath(projects.dir),
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
    // Своей полосы заголовка у окна нет: кнопки окна стоят в верхней строке
    // движка, и за неё окно таскается (SHELL_CSS).
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 15 } } : {}),
    // Сцена рисует сама, ей не нужен ни Node в странице, ни доступ к файлам:
    // проекты ходят через тот же HTTP, что и в браузере.
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  mainWindow = window;
  window.once('closed', () => { mainWindow = null; });
  // Имя окна — движка, а не заголовок страницы сайта.
  window.on('page-title-updated', (event) => event.preventDefault());
  if (process.platform === 'darwin') window.webContents.on('dom-ready', () => { void window.webContents.insertCSS(SHELL_CSS); });

  // Вкладки редактор не открывает, а ссылка наружу — это ссылка наружу.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  window.once('ready-to-show', () => window.show());
  await loadEnginePage(window, `${url}${START}`);
  return window;
}

// Проверка без глаз: окно поднимается, страница грузится, кадр ложится в файл.
async function runSmoke(window) {
  await new Promise((resolve) => { setTimeout(resolve, Number(process.env.DDG_APP_SMOKE_WAIT) || 4000); });

  // Сбор и кадр совместимы: скрипт может, например, открыть окно настроек,
  // а кадр снимет уже его.
  if (PROBE) {
    const value = await window.webContents.executeJavaScript(await fs.readFile(PROBE, 'utf8'), true);
    if (PROBE_OUT) await fs.writeFile(PROBE_OUT, JSON.stringify(value, null, 2));
    console.log(`app: собрано${PROBE_OUT ? ` в ${PROBE_OUT}` : ''}`);
    if (!SMOKE) {
      await viteServer?.close();
      viteServer = null;
      app.exit(0);
      process.exit(0);
      return;
    }
  }

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

// Проверки с отдельным портом могут работать независимо от основного окна.
if (SMOKE || PROBE || app.requestSingleInstanceLock()) {
  app.on('second-instance', focusWindow);
  app.on('activate', focusWindow);
  app.whenReady().then(async () => {
    try {
      const url = await startEngineServer();
      buildMenu();
      const window = await createWindow(url);
      if (SMOKE || PROBE) await runSmoke(window);
    } catch (error) {
      console.error('Движок не запустился:', error);
      if (app.isPackaged) dialog.showErrorBox('OUROBOROS не запустился', error.message);
      await viteServer?.close();
      viteServer = null;
      app.exit(1);
      process.exit(1);
    }
  });
} else {
  app.quit();
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { void viteServer?.close(); });
