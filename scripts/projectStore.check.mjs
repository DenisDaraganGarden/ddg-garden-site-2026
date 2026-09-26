import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Хранилище пишет настоящие файлы, поэтому проверка уводит его во временную
// папку: боевые проекты Дениса она не трогает.
process.env.DDG_PROJECTS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-store-'));

const { HOME, isValidId, presets, projects, slugify, STORE_SCHEMA } = await import('./projectStore.mjs');

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
// Чужое тело, пришедшее не по адресу, в корень записи не вливается.
const stray = await projects.save('dyuny', { x0: 1, cols: 3, kind: 'x'.repeat(4000), image: 'data:' });
assert.equal(stray.x0, undefined);
assert.equal(stray.cols, undefined);
assert.equal(stray.image, undefined);
assert.notEqual(String(stray.kind ?? '').length, 4000, 'длинный kind не пишется');
assert.equal(forced.id, 'dyuny');
assert.equal(forced.created, dunes.created);

// Запись поверх чужой правки: редактор пишет с «обновлён», который видел, а
// файл тем временем изменил Claude — сервер отдаёт нынешнюю запись, не пишет.
const race = await projects.create({ name: 'Гонка', settings: { terrainSeed: 3 } });
await new Promise((resolve) => { setTimeout(resolve, 5); });
const byClaude = await projects.save(race.id, { settings: { terrainSeed: 99 } });
const stale = await projects.save(race.id, { settings: { terrainSeed: 1 }, base: race.updated });
assert.equal(stale.conflict?.settings.terrainSeed, 99, 'a stale write gets the current entry back');
assert.equal((await projects.read(race.id)).settings.terrainSeed, 99, 'and writes nothing');
const fresh = await projects.save(race.id, { settings: { terrainSeed: 2 }, base: byClaude.updated });
assert.equal(fresh.settings.terrainSeed, 2, 'a write on the current entry goes through');
assert.equal(fresh.base, undefined, 'base is not stored');
await projects.remove(race.id);

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

// Генплан: кадр и где стояла камера — в папке проекта, без камеры не пишется.
const planView = { position: { x: 1, y: 140, z: 2.01 }, target: { x: 1, y: 0, z: 2 }, fov: 12, bearing: 0, north: 0 };
assert.equal(await projects.readPlan('dyuny'), null);
assert.equal((await projects.writePlan('dyuny', pixel, planView)).fov, 12);
assert.equal(await projects.writePlan('nikogo', pixel, planView), false);
await assert.rejects(() => projects.writePlan('dyuny', pixel, { fov: 12 }), /положения камеры/);
assert.equal((await projects.readPlan('dyuny')).position.y, 140);
assert.ok((await projects.planImage('dyuny')).length > 0);

// Модели проекта: только .glb, свои у проекта, копия уносит их, удаление стирает.
const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(16)]);
await assert.rejects(() => projects.writeModel('dyuny', 'скала.obj', Buffer.from('not a glb at all')), /не .glb/);
assert.equal(await projects.writeModel('nikogo', 'скала.glb', glb), null, 'в чужой несуществующий проект не кладётся');
const rock = await projects.writeModel('dyuny', 'Скала у мыса.glb', glb);
assert.match(rock.model, /^skala-u-mysa-[a-z0-9]+$/, 'имя файла модели — читаемое и уникальное');
assert.equal((await projects.modelFile('dyuny', rock.model)).size, glb.length);
assert.equal(await projects.modelFile('dyuny', '../dyuny-2'), null, 'из папки модели не выйти');
assert.equal(await projects.modelFile('dyuny-2', rock.model), null, 'у другого проекта этой модели нет');
const copy = await projects.create({ name: 'Дюны копия', settings: { terrainSeed: 42 }, from: 'dyuny' });
assert.equal((await projects.modelFile(copy.id, rock.model)).size, glb.length, 'копия проекта уносит модели');
assert.ok(!('from' in (await projects.read(copy.id))), 'источник копии в запись не пишется');
assert.equal(await projects.remove(copy.id), true);

assert.equal(await projects.remove('dyuny'), true);
assert.equal(await projects.readThumbnail('dyuny'), null, 'миниатюра уходит вместе с записью');
assert.equal(await projects.readPlan('dyuny'), null, 'генплан уходит вместе с записью');
assert.equal(await projects.modelFile('dyuny', rock.model), null, 'модели уходят вместе с проектом');
assert.equal(await projects.remove('dyuny'), false);
assert.equal((await projects.list()).length, 1);
assert.equal((await presets.list()).length, 1, 'удаление проекта не трогает детали');

// История: снимок при открытии; одинаковые подряд не множатся; запись вскоре
// после снимка нового не делает, запись поверх чужой версии и возврат сначала
// кладут нынешнюю версию в историю; вернуть можно любую.
const garden = await projects.create({ name: 'Сад', settings: { step: 1 } });
assert.deepEqual(await projects.history(garden.id), [], 'у нового проекта истории нет');
assert.equal(await projects.history('nikogo'), null);
const opened = await projects.snapshot(garden.id, 'open');
assert.equal(opened.reason, 'open');
assert.equal((await projects.snapshot(garden.id, 'open')).id, opened.id, 'та же сцена — тот же снимок');
let step = await projects.save(garden.id, { settings: { step: 2 }, base: garden.revision });
assert.equal((await projects.history(garden.id)).length, 1, 'запись вскоре после снимка нового снимка не делает');
step = await projects.save(garden.id, { settings: { step: 3 }, base: step.revision, snapshot: 'overwrite' });
let snapshots = await projects.history(garden.id);
assert.equal(snapshots[0].reason, 'overwrite', 'перед записью поверх чужой версии та уходит в историю');
step = await projects.restore(garden.id, snapshots[0].id);
assert.equal(step.settings.step, 2, 'возвращена версия из снимка');
assert.equal(step.revision, 4, 'возврат — обычная запись с новой ревизией');
snapshots = await projects.history(garden.id);
assert.equal(snapshots[0].reason, 'restore', 'возврат сначала сохраняет нынешнюю версию');
assert.equal((await projects.restore(garden.id, snapshots[0].id)).settings.step, 3, 'и возврат можно отменить возвратом');
assert.equal(await projects.restore(garden.id, '20200101T000000000Z-open'), null, 'несуществующего снимка нет');
assert.equal(await projects.restore(garden.id, '../dyuny'), null, 'из истории не выйти');

// Первая запись после паузы кладёт прежнюю версию в историю сама.
const historyOf = (id) => path.join(projects.dir, id, 'history');
const idle = await projects.create({ name: 'Тихий', settings: { step: 1 } });
await fs.mkdir(historyOf(idle.id), { recursive: true });
await fs.writeFile(path.join(historyOf(idle.id), '20200101T120000000Z-open.json'), JSON.stringify({ ...idle, settings: { step: 0 } }));
await projects.save(idle.id, { settings: { step: 2 } });
assert.equal((await projects.history(idle.id))[0].reason, 'auto', 'через 10 минут без снимка запись делает его сама');

// Хранятся последние 50 и, старше них, по одному на день.
const crowded = await projects.create({ name: 'Людный', settings: { step: 'now' } });
const stamp = (day, index) => `202003${String(day).padStart(2, '0')}T12${String(Math.floor(index / 60)).padStart(2, '0')}${String(index % 60).padStart(2, '0')}000Z`;
await fs.mkdir(historyOf(crowded.id), { recursive: true });
for (let index = 0; index < 55; index += 1) await fs.writeFile(path.join(historyOf(crowded.id), `${stamp(10, index)}-auto.json`), JSON.stringify({ settings: { step: index } }));
for (const day of [1, 2, 3]) await fs.writeFile(path.join(historyOf(crowded.id), `${stamp(day, 0)}-auto.json`), JSON.stringify({ settings: { step: -day } }));
await projects.snapshot(crowded.id, 'manual');
snapshots = await projects.history(crowded.id);
assert.equal(snapshots.length, 53, '50 последних и по одному на каждый старший день');
assert.deepEqual(snapshots.slice(-3).map(({ id }) => id.slice(0, 8)), ['20200303', '20200302', '20200301']);

// Копия уносит папку проекта (сетку участка), но не его историю.
await projects.writeSiteGrid(garden.id, { x0: 0, z0: 0, cell: 0.5, cols: 1, rows: 1, kind: 'AA==', ground: 'AA==' });
const twin = await projects.create({ name: 'Сад копия', settings: { step: 3 }, from: garden.id });
assert.ok(await projects.readSiteGrid(twin.id), 'копия уносит сетку участка');
assert.deepEqual(await projects.history(twin.id), [], 'история остаётся у оригинала');

// Корзина: удалённый проект уходит целиком и возвращается целиком; если его
// имя за это время заняли, он возвращается под свободным.
const historyBefore = (await projects.history(garden.id)).length;
assert.equal(await projects.remove(garden.id), true);
assert.equal(await projects.read(garden.id), null, 'удалённого проекта нет в списке');
let trash = await projects.listTrash();
assert.equal(trash[0].id, garden.id);
assert.equal(trash[0].name, 'Сад');
let back = await projects.restoreFromTrash(trash[0].trashId);
assert.equal(back.id, garden.id, 'вернулся под своим именем');
assert.equal((await projects.read(garden.id)).settings.step, 3);
assert.ok(await projects.readSiteGrid(garden.id), 'с папкой');
assert.equal((await projects.history(garden.id)).length, historyBefore, 'и с историей');
assert.ok(!(await projects.listTrash()).some((item) => item.id === garden.id), 'из корзины он ушёл');
assert.equal(await projects.restoreFromTrash('../../etc'), null);
await projects.remove(garden.id);
const namesake = await projects.create({ name: 'Сад', settings: { step: 'new' } });
assert.equal(namesake.id, garden.id, 'имя удалённого свободно');
trash = await projects.listTrash();
back = await projects.restoreFromTrash(trash[0].trashId);
assert.equal(back.id, `${garden.id}-2`, 'занятое имя — возвращается под свободным');
assert.equal((await projects.read(back.id)).id, back.id, 'id в записи совпадает с файлом');
assert.equal((await projects.read(garden.id)).settings.step, 'new', 'тёзка не тронут');

// Номер формата: запись несёт его, код ставит свой при каждой записи, а
// поверх записи от более новой версии движка не пишет и её снимок не ставит.
const modern = await projects.create({ name: 'Схема', settings: { a: 1 } });
assert.equal(modern.schema, STORE_SCHEMA, 'новая запись несёт номер формата');
const recordFile = path.join(HOME, 'projects', `${modern.id}.json`);
const legacy = { ...JSON.parse(await fs.readFile(recordFile, 'utf8')) };
delete legacy.schema;
await fs.writeFile(recordFile, JSON.stringify(legacy));
assert.equal((await projects.save(modern.id, { settings: { a: 2 } })).schema, STORE_SCHEMA, 'старая запись без номера получает его');
assert.equal((await projects.save(modern.id, { schema: 99, settings: { a: 3 } })).schema, STORE_SCHEMA, 'номер ставит хранилище, не клиент');
const future = { ...JSON.parse(await fs.readFile(recordFile, 'utf8')), schema: STORE_SCHEMA + 1, settings: { a: 'будущее' } };
await fs.writeFile(recordFile, JSON.stringify(future));
const refused = await projects.save(modern.id, { settings: { a: 'прошлое' } });
assert.ok(refused?.newer, 'поверх записи новее этого кода не пишется');
assert.equal(JSON.parse(await fs.readFile(recordFile, 'utf8')).settings.a, 'будущее', 'и файл цел');
const [oldest] = (await projects.history(modern.id)).slice(-1);
assert.ok((await projects.restore(modern.id, oldest.id))?.newer, 'и возврат версии поверх неё тоже');
await fs.writeFile(recordFile, JSON.stringify({ ...future, schema: STORE_SCHEMA }));
await projects.snapshot(modern.id, 'manual');
const [newest] = await projects.history(modern.id);
const newestFile = path.join(HOME, 'projects', modern.id, 'history', `${newest.id}.json`);
await fs.writeFile(newestFile, JSON.stringify({ ...JSON.parse(await fs.readFile(newestFile, 'utf8')), schema: STORE_SCHEMA + 1 }));
await projects.save(modern.id, { settings: { a: 'сейчас' } });
assert.ok((await projects.restore(modern.id, newest.id))?.newer, 'снимок от более новой версии этот код не ставит');

await fs.rm(process.env.DDG_PROJECTS_DIR, { recursive: true, force: true });
console.log('store: проекты и детали движка как файлы — ок');
