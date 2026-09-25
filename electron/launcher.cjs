// Локальное приложение запускает живой чекаут: обновления движка не требуют
// копировать модели и проекты в .app. Этот файл устанавливается вместе с JSON.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, dialog } = require('electron');
const { sourceRoot } = require('./launcher.json');

function failed(error) {
  dialog.showErrorBox('OUROBOROS не запустился',
    `Не удалось открыть движок из папки:\n${sourceRoot}\n\n${error.message}`);
  app.exit(1);
}

try {
  // Сохраняем origin и профиль прежнего запуска через npm run app:
  // там находятся настройки интерфейса и журнал восстановления проектов.
  const profile = path.join(app.getPath('appData'), 'Electron');
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  process.chdir(sourceRoot);
  import(pathToFileURL(path.join(sourceRoot, 'electron/main.js')).href).catch(failed);
} catch (error) {
  failed(error);
}
