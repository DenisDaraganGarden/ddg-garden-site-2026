import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Справочник движка для агента: что он умеет и в каких пределах. Собирается
// из живого редактора — там уже зарегистрирован каждый параметр с подписью,
// пределами и единицей, поэтому справочник не может разойтись с движком.
// Заводские значения добавляются из тех же модулей настроек, из которых
// собирается список публикуемых ключей.
//
// Запуск: npm run build:reference. Окно на минуту появится на экране —
// честного headless у Electron нет.
const require = createRequire(import.meta.url);
const electron = require('electron');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_MD = path.join(ROOT, 'docs', 'engine-parameters.md');
const OUT_JSON = path.join(ROOT, 'docs', 'engine-parameters.json');

const collected = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-reference-')), 'catalog.json');

const child = spawn(electron, ['electron/main.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    DDG_APP_START: '/home/edit',
    DDG_APP_PORT: process.env.DDG_APP_PORT ?? '41229',
    DDG_APP_SMOKE_WAIT: '1000',
    DDG_APP_PROBE: path.join(ROOT, 'scripts', 'engine-reference-probe.js'),
    DDG_APP_PROBE_OUT: collected,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const code = await new Promise((resolve) => {
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('таймаут'); }, 180000);
  child.on('exit', (value) => { clearTimeout(timer); resolve(value); });
});

const raw = await fs.readFile(collected, 'utf8').catch(() => null);
await fs.rm(path.dirname(collected), { recursive: true, force: true });

if (code !== 0 || !raw) {
  console.error(output.trim().split('\n').filter((line) => !line.includes('GL_INVALID')).join('\n'));
  throw new Error(`Справочник не собран (выход ${code})`);
}

const catalog = JSON.parse(raw);
if (catalog.rows.length < 200) {
  throw new Error(`Каталог редактора отдал только ${catalog.rows.length} параметров — страница не успела собраться.`);
}

const defaults = catalog.defaults ?? {};

const groups = new Map();
for (const row of catalog.rows) {
  const key = `${row.group}/${row.node}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const cell = (row) => {
  if (row.kind === 'число') {
    const span = row.min === undefined ? '' : `${row.min} … ${row.max}`;
    return [span, row.step === undefined ? '' : `шаг ${row.step}`, row.unit ?? ''].filter(Boolean).join(', ');
  }
  if (row.kind === 'список') return (row.options ?? []).join(' · ');
  if (row.kind === 'выключатель') return 'да / нет';
  return '#rrggbb';
};

const show = (value) => {
  if (value === undefined) return '';
  if (typeof value === 'object') return Array.isArray(value) ? `[${value.length}]` : '{…}';
  return String(value);
};

const lines = [
  '# Параметры движка',
  '',
  'Сцена этого движка — числа, а не модели: берег, вода, растения и небо считаются',
  'из перечисленных здесь параметров, а файлы в `public/` дают им материал. Поэтому',
  'новый проект — это новый набор этих чисел на тех же ассетах.',
  '',
  'Файл собран из живого редактора (`npm run build:reference`): подписи, пределы и',
  'единицы взяты из его каталога контролов, поэтому параметр не может появиться в',
  'редакторе и не появиться здесь. Руками не править.',
  '',
  `Снято: ${catalog.collected.slice(0, 10)} · параметров: ${catalog.rows.length} · разделов: ${groups.size}`,
  '',
  'Как этим пользоваться агенту: читать и писать `projects/<id>.json`, поле',
  '`settings` — плоский объект с этими ключами. Пределы ниже — это пределы',
  'редактора; движок нормализует значение при загрузке, выходить за них не нужно.',
  '',
];

for (const [key, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`## ${key}`, '');
  lines.push('| Ключ | Что это | Вид | Пределы | Заводское |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows.sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`| \`${row.key}\` | ${row.label} | ${row.kind} | ${cell(row)} | ${show(defaults[row.key])} |`);
  }
  lines.push('');
}

await fs.mkdir(path.dirname(OUT_MD), { recursive: true });
await fs.writeFile(OUT_MD, `${lines.join('\n')}`, 'utf8');
await fs.writeFile(OUT_JSON, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

console.log(`справочник: ${catalog.rows.length} параметров в ${groups.size} разделах → docs/engine-parameters.md`);
