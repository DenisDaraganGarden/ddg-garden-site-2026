import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Хранилище пишет настоящие файлы, поэтому проверка уводит его во временную
// папку: боевые проекты Дениса она не трогает.
process.env.DDG_PROJECTS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-projects-'));

const {
  createProject, deleteProject, isValidId, listProjects, readProject, saveProject, slugify,
} = await import('./projectStore.mjs');

assert.equal(slugify('Азовский берег'), 'azovskiy-bereg');
assert.equal(slugify('Дюны 2 / вечер'), 'dyuny-2-vecher');
assert.equal(slugify('—'), 'proekt', 'имя без букв всё равно даёт имя файла');

// Идентификатор становится путём, поэтому уход из папки не должен проходить.
assert.equal(isValidId('azovskiy-bereg'), true);
assert.equal(isValidId('../../etc/passwd'), false);
assert.equal(isValidId('Азов'), false);
assert.equal(isValidId(''), false);

assert.deepEqual(await listProjects(), [], 'пустая папка — пустой список');
assert.equal(await readProject('nikogo'), null);

const dunes = await createProject({ name: 'Дюны', settings: { terrainSeed: 7 }, engine: '1.4.0' });
assert.equal(dunes.id, 'dyuny');
assert.equal(dunes.settings.terrainSeed, 7);

// Второй проект с тем же именем не затирает первый.
const second = await createProject({ name: 'Дюны', settings: { terrainSeed: 8 } });
assert.equal(second.id, 'dyuny-2');
assert.equal((await readProject('dyuny')).settings.terrainSeed, 7);

// Список для меню не тащит настройки: там сотни ключей, а меню их не показывает.
const list = await listProjects();
assert.equal(list.length, 2);
assert.ok(list.every((project) => project.settings === undefined));
assert.ok(list.every((project) => project.name === 'Дюны'));

// Переименование без сцены не должно стирать сцену.
const renamed = await saveProject('dyuny', { name: 'Дюны на рассвете' });
assert.equal(renamed.name, 'Дюны на рассвете');
assert.equal(renamed.settings.terrainSeed, 7);
assert.notEqual(renamed.updated, renamed.created, 'время правки сдвигается');

// И наоборот: сохранение сцены не должно терять имя.
const saved = await saveProject('dyuny', { settings: { terrainSeed: 42 } });
assert.equal(saved.name, 'Дюны на рассвете');
assert.equal(saved.settings.terrainSeed, 42);

assert.equal(await saveProject('nikogo', { name: 'x' }), null);
await assert.rejects(() => createProject({ name: 'Без сцены' }), /не передана сцена/);

assert.equal(await deleteProject('dyuny'), true);
assert.equal(await deleteProject('dyuny'), false);
assert.equal((await listProjects()).length, 1);

await fs.rm(process.env.DDG_PROJECTS_DIR, { recursive: true, force: true });
console.log('projectStore: проекты движка как файлы — ок');
