import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ENGINE_DIR } from './engineCopy.mjs';

// Это локальный ярлык с собственным Electron, а не переносимый дистрибутив:
// движок и общие ассеты читаются из чекаута, проекты — из ~/Ouroboros. Чекаут —
// стабильная копия движка (scripts/engineCopy.mjs, npm run engine:update), а не
// рабочая папка агента; --here ставит ярлык на этот чекаут, для разработки.
// --replace заменяет прежний ярлык OUROBOROS, но только ярлык этого установщика.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const destination = path.resolve(args.find((arg) => !arg.startsWith('--')) || '/Applications/OUROBOROS.app');
const sourceRoot = args.includes('--here') ? root : ENGINE_DIR;
const replace = args.includes('--replace');
if (process.platform !== 'darwin') throw new Error('Установщик предназначен для macOS.');
const exists = async (file) => Boolean(await fs.lstat(file).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
}));
if (!await exists(path.join(sourceRoot, 'electron/main.js'))) {
  throw new Error(`Нет копии движка в ${sourceRoot}. Сначала: npm run engine:update`);
}
if (!await exists(path.join(sourceRoot, 'node_modules/electron/dist/Electron.app'))) {
  throw new Error(`В ${sourceRoot} не установлены зависимости. Сначала: npm run engine:update`);
}
const previous = await exists(destination);
if (previous && !replace) {
  throw new Error(`Приложение уже существует: ${destination}. Заменить ярлык: npm run app:install -- --replace`);
}
if (previous && !await exists(path.join(destination, 'Contents/Resources/app/launcher.json'))) {
  throw new Error(`${destination} — не ярлык OUROBOROS этого установщика; он не будет заменён.`);
}

const { version } = JSON.parse(await fs.readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
await fs.mkdir(path.join(root, 'output'), { recursive: true });
const staging = await fs.mkdtemp(path.join(root, 'output/mac-app-'));
const bundle = path.join(staging, 'OUROBOROS.app');
const resources = path.join(bundle, 'Contents/Resources');
const run = (file, args) => execFileSync(file, args, { stdio: 'inherit' });

try {
  run('/usr/bin/ditto', [path.join(sourceRoot, 'node_modules/electron/dist/Electron.app'), bundle]);
  const appDir = path.join(resources, 'app');
  await fs.mkdir(appDir);
  await fs.copyFile(path.join(sourceRoot, 'electron/launcher.cjs'), path.join(appDir, 'main.cjs'));
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'ouroboros', productName: 'OUROBOROS', version, main: 'main.cjs',
  }, null, 2));
  await fs.writeFile(path.join(appDir, 'launcher.json'), JSON.stringify({ sourceRoot }, null, 2));

  const iconset = path.join(staging, 'ouroboros.iconset');
  await fs.mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await sharp(path.join(sourceRoot, 'public/icon-512.png'))
        .resize(size * scale, size * scale)
        .png()
        .toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
    }
  }
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'ouroboros.icns')]);
  const plist = path.join(bundle, 'Contents/Info.plist');
  for (const [key, value] of Object.entries({
    CFBundleDisplayName: 'OUROBOROS',
    CFBundleName: 'OUROBOROS',
    CFBundleIdentifier: 'com.denisdaragan.ouroboros',
    CFBundleIconFile: 'ouroboros.icns',
    CFBundleShortVersionString: version,
    CFBundleVersion: version,
    LSApplicationCategoryType: 'public.app-category.graphics-design',
  })) run('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
  run('/usr/bin/plutil', ['-remove', 'ElectronAsarIntegrity', plist]);
  await fs.rm(path.join(resources, 'default_app.asar'));

  // Локальная ad-hoc подпись копии, включая фреймворки Electron из npm
  // с linker-only подписями. Системные настройки безопасности не меняются.
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  // Прежний ярлык уходит в сторону и удаляется только после того, как новый
  // встал на его место; при сбое он возвращается.
  const aside = `${destination}.previous-${Date.now()}`;
  if (previous) await fs.rename(destination, aside);
  try {
    await fs.rename(bundle, destination);
  } catch (error) {
    if (previous) await fs.rename(aside, destination);
    throw error;
  }
  if (previous) await fs.rm(aside, { recursive: true, force: true });
  console.log(`Установлено: ${destination}\nДвижок: ${sourceRoot}`);
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
