import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// Все быстрые проверки движка одной командой (npm run check:fast; на GitHub —
// задача checks в checks.yml). Берёт каждый check:* из package.json, кроме
// тех, кому нужны браузер, окно приложения или запущенный сервер лаборатории,
// так что новая проверка попадает сюда сама. check:bundle читает dist/ —
// запускать после npm run build.
const NEEDS_MORE = new Set(['check:fast', 'check:audio:browser', 'check:plants-parity', 'check:app', 'check:app-navigation']);
const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const names = Object.keys(scripts).filter((name) => name.startsWith('check:') && !NEEDS_MORE.has(name));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failed = [];

for (const name of names) {
  const started = Date.now();
  const run = spawnSync(npm, ['run', '-s', name], { encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status === 0) {
    console.log(`ok    ${name} (${seconds} s)`);
  } else {
    failed.push(name);
    const tail = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
    console.log(`FAIL  ${name} (${seconds} s)\n${tail}\n`);
  }
}

console.log(failed.length
  ? `${failed.length} of ${names.length} fast checks failed: ${failed.join(', ')}`
  : `all ${names.length} fast checks passed`);
process.exitCode = failed.length ? 1 : 0;
