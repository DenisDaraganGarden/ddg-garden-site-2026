import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

// Это локальный ярлык с собственным Electron, а не переносимый дистрибутив:
// движок и общие ассеты читаются из чекаута, проекты — из ~/Ouroboros.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(process.argv[2] || '/Applications/OUROBOROS.app');
if (process.platform !== 'darwin') throw new Error('Установщик предназначен для macOS.');
if (await fs.lstat(destination).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
})) throw new Error(`Приложение уже существует: ${destination}. Оно не будет перезаписано.`);

const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await fs.mkdir(path.join(root, 'output'), { recursive: true });
const staging = await fs.mkdtemp(path.join(root, 'output/mac-app-'));
const bundle = path.join(staging, 'OUROBOROS.app');
const resources = path.join(bundle, 'Contents/Resources');
const run = (file, args) => execFileSync(file, args, { stdio: 'inherit' });

try {
  run('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), bundle]);
  const appDir = path.join(resources, 'app');
  await fs.mkdir(appDir);
  await fs.copyFile(path.join(root, 'electron/launcher.cjs'), path.join(appDir, 'main.cjs'));
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'ouroboros', productName: 'OUROBOROS', version, main: 'main.cjs',
  }, null, 2));
  await fs.writeFile(path.join(appDir, 'launcher.json'), JSON.stringify({ sourceRoot: root }, null, 2));

  const iconset = path.join(staging, 'ouroboros.iconset');
  await fs.mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await sharp(path.join(root, 'public/icon-512.png'))
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
  await fs.rename(bundle, destination);
  console.log(`Установлено: ${destination}\nДвижок: ${root}`);
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
