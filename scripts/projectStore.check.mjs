import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Хранилище пишет настоящие файлы, поэтому проверка уводит его во временную
// папку: боевые проекты Дениса она не трогает.
process.env.DDG_PROJECTS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-store-'));

const { isValidId, presets, projects, slugify } = await import('./projectStore.mjs');

assert.equal(slugify('Азовский берег'), 'azovskiy-bereg');
assert.equal(slugify('Дюны 2 / вечер'), 'dyuny-2-vecher');
assert.equal(slugify('—'), 'zapis', 'имя без букв всё равно даёт имя файла');

// Идентификатор становится путём, поэтому уход из папки не должен проходить.
assert.equal(isValidId('azovskiy-bereg'), true);
assert.equal(isValidId('../../etc/passwd'), false);
assert.equal(isValidId('Азов'), false);
assert.equal(isValidId(''), false);

assert.deepEqual(await projects.list(), [], 'пустая папка — пустой список');
assert.equal(await projects.read('nikogo'), null);

const dunes = await projects.create({ name: 'Дюны', settings: { terrainSeed: 7 }, engine: '1.4.0' });
assert.equal(dunes.id, 'dyuny');
assert.equal(dunes.settings.terrainSeed, 7);

// Второй проект с тем же именем не затирает первый.
const second = await projects.create({ name: 'Дюны', settings: { terrainSeed: 8 } });
assert.equal(second.id, 'dyuny-2');
assert.equal((await projects.read('dyuny')).settings.terrainSeed, 7);

// Список для меню не тащит сцену: там сотни ключей, а меню их не показывает.
const list = await projects.list();
assert.equal(list.length, 2);
assert.ok(list.every((project) => project.settings === undefined));
assert.ok(list.every((project) => project.name === 'Дюны'));

// Переименование без сцены не должно стирать сцену.
const renamed = await projects.save('dyuny', { name: 'Дюны на рассвете' });
assert.equal(renamed.name, 'Дюны на рассвете');
assert.equal(renamed.settings.terrainSeed, 7);
assert.notEqual(renamed.updated, renamed.created, 'время правки сдвигается');

// И наоборот: сохранение сцены не должно терять имя.
const saved = await projects.save('dyuny', { settings: { terrainSeed: 42 } });
assert.equal(saved.name, 'Дюны на рассвете');
assert.equal(saved.settings.terrainSeed, 42);

// Правка не должна подменять личность записи.
const forced = await projects.save('dyuny', { id: 'chuzhoy', created: 'вчера' });
assert.equal(forced.id, 'dyuny');
assert.equal(forced.created, dunes.created);

assert.equal(await projects.save('nikogo', { name: 'x' }), null);
await assert.rejects(() => projects.create({ name: 'Без сцены' }), /не передано поле/);

// Детали — второе хранилище той же механики и в своей папке: деталь с тем же
// именем, что у проекта, не должна ни затирать его, ни попадать в его список.
const grass = await presets.create({ name: 'Дюны', node: 'greenery/grass', values: { grassHeight: 0.4 } });
assert.equal(grass.id, 'dyuny');
assert.equal(grass.node, 'greenery/grass');
assert.equal((await projects.read('dyuny')).settings.terrainSeed, 42);
assert.equal((await presets.list()).length, 1);
assert.equal((await projects.list()).length, 2);
await assert.rejects(() => presets.create({ name: 'Пустая', node: 'greenery/grass' }), /не передано поле/);

// Миниатюра — отдельный файл рядом с записью, в список попадает только флаг.
const pixel = `data:image/webp;base64,${Buffer.from('RIFF....WEBP').toString('base64')}`;
assert.equal(await projects.writeThumbnail('dyuny', pixel), true);
assert.equal(await projects.writeThumbnail('nikogo', pixel), false);
await assert.rejects(() => projects.writeThumbnail('dyuny', 'data:image/png;base64,AAAA'), /webp/);
assert.ok((await projects.readThumbnail('dyuny')).length > 0);
assert.equal((await projects.list()).find((entry) => entry.id === 'dyuny').thumbnail, true);
assert.equal((await projects.list()).find((entry) => entry.id === 'dyuny-2').thumbnail, false);
assert.ok(!('thumbnail' in (await projects.read('dyuny'))), 'в самой записи миниатюры нет');

assert.equal(await projects.remove('dyuny'), true);
assert.equal(await projects.readThumbnail('dyuny'), null, 'миниатюра уходит вместе с записью');
assert.equal(await projects.remove('dyuny'), false);
assert.equal((await projects.list()).length, 1);
assert.equal((await presets.list()).length, 1, 'удаление проекта не трогает детали');

await fs.rm(process.env.DDG_PROJECTS_DIR, { recursive: true, force: true });
console.log('store: проекты и детали движка как файлы — ок');
