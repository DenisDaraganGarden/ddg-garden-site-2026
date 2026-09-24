import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, slugify } from './projectStore.mjs';

// Переносит проекты и детали из папок чекаутов (главный и все воркдеревья) в
// дом движка (~/Ouroboros, projectStore.mjs). Источники не трогаются, повтор
// безопасен: перенесённое пропускается, у модели докопируются недостающие
// файлы, а другая запись с тем же id ложится рядом под именем копии, ничего
// не затирая. Запускать при остановленных серверах: каждый читает дом при старте.
// Run: node scripts/migrate-projects-home.mjs
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkouts = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));

const exists = (file) => fs.access(file).then(() => true, () => false);
const same = async (a, b) => {
  try { return (await fs.readFile(a)).equals(await fs.readFile(b)); } catch { return false; }
};

const rows = [];
for (const folder of ['projects', 'presets']) {
  const target = path.join(HOME, folder);
  await fs.mkdir(target, { recursive: true });
  for (const checkout of checkouts) {
    const source = path.join(checkout, folder);
    if (path.resolve(source) === path.resolve(target)) continue;
    let names = [];
    try { names = await fs.readdir(source); } catch { continue; }
    for (const name of names.filter((file) => file.endsWith('.json'))) {
      const id = name.slice(0, -'.json'.length);
      const from = (suffix) => path.join(source, `${id}${suffix}`);
      const where = checkout === checkouts[0] ? 'главный чекаут' : path.basename(checkout);
      let into = id;
      if (await exists(path.join(target, `${id}.json`))) {
        if (await same(from('.json'), path.join(target, `${id}.json`))) {
          await fs.cp(from(''), path.join(target, id), { recursive: true, force: false, errorOnExist: false }).catch(() => {});
          rows.push([folder, id, where, 'уже в доме']);
          continue;
        }
        into = `${id}-${slugify(path.basename(checkout)).slice(0, 24)}`.slice(0, 64);
        if (await exists(path.join(target, `${into}.json`))) {
          rows.push([folder, id, where, `перенесён раньше как ${into}`]);
          continue;
        }
      }
      const entry = JSON.parse(await fs.readFile(from('.json'), 'utf8'));
      if (into !== id) Object.assign(entry, { id: into, name: `${entry.name} · из ${path.basename(checkout)}` });
      await fs.writeFile(path.join(target, `${into}.json`), `${JSON.stringify(entry, null, 2)}\n`);
      if (await exists(from('.webp'))) await fs.copyFile(from('.webp'), path.join(target, `${into}.webp`));
      if (await exists(from(''))) await fs.cp(from(''), path.join(target, into), { recursive: true, force: false, errorOnExist: false });
      rows.push([folder, id, where, into === id ? 'перенесён' : `другой с тем же id — перенесён как ${into}`]);
    }
  }
}
console.log(`Дом движка: ${HOME}`);
console.table(rows.map(([folder, id, where, what]) => ({ папка: folder, запись: id, откуда: where, что: what })));
