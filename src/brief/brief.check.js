// Run: node src/brief/brief.check.js (npm run check:brief)
// ТЗ проекта: нормализация, операции и путь статуса, файл рядом с проектом,
// маркеры → файлы секций, агентский CLI — во временном доме данных, не в ~/Ouroboros.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { applyBriefOp, briefCounts, normalizeBrief, today } from './brief.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

// 1. Нормализация: форма всегда полная, чужое отбрасывается, задания не теряются.
const empty = {
    client: { name: '', contacts: '', notes: '' },
    contract: { signed: false, number: '', date: '' },
    deadline: { start: '', due: '' },
    scrolls: [],
    updated: null,
};
assert.deepEqual(normalizeBrief(), empty);
assert.deepEqual(normalizeBrief('мусор'), empty);
assert.deepEqual(normalizeBrief([1, 2]), empty);

const messy = normalizeBrief({
    secret: 'уйдёт',
    client: { name: 'Иван', phone: '+7' },
    contract: { signed: 'да', number: 12, date: '2026-02-31' },
    deadline: { due: '2026-10-15' },
    scrolls: [
        { date: '2026-09-20', tasks: [{ id: 3, text: 'а', priority: 'срочно', status: 'wip', markers: [' greenery/topiary ', 'greenery/topiary', '', {}], reviewAt: '2026-09-21T10:00:00Z', extra: true }] },
        { date: '2026-09-25', title: 'Встреча', tasks: [{ id: '3', text: 'б' }, { text: 'в' }, 'не задание'] },
        { date: '2026-09-20', title: 'Звонок', tasks: [{ id: '1', text: 'г', status: 'review', note: 'сделано', doneAt: '2026-09-22T10:00:00Z' }] },
        { date: 'вчера', tasks: [{ id: '9', text: 'д' }] },
        null,
    ],
});
assert.equal(messy.secret, undefined, 'чужое поле не хранится');
assert.deepEqual(messy.client, { name: 'Иван', contacts: '', notes: '' });
assert.deepEqual(messy.contract, { signed: false, number: '12', date: '' }, '«да» — не true, 31 февраля — не дата');
assert.equal(messy.deadline.due, '2026-10-15');
assert.deepEqual(messy.scrolls.map((scroll) => scroll.date), ['2026-09-25', '2026-09-20', ''], 'новые сверху, без даты — в конце');
const twentieth = messy.scrolls[1];
assert.deepEqual(twentieth.tasks.map((task) => task.text), ['а', 'г'], 'свитки одной даты слились');
assert.equal(twentieth.title, 'Звонок');
const [a, g] = twentieth.tasks;
assert.equal(a.priority, 'normal');
assert.equal(a.status, 'open');
assert.equal(a.reviewAt, undefined, 'у открытого нет «отдано на проверку»');
assert.deepEqual(a.markers, ['greenery/topiary'], 'маркеры без пробелов, повторов и пустых');
assert.equal(a.extra, undefined);
assert.equal(g.note, 'сделано');
assert.equal(g.doneAt, undefined, 'у review нет «принято»');
const ids = messy.scrolls.flatMap((scroll) => scroll.tasks.map((task) => task.id));
assert.equal(new Set(ids).size, ids.length, 'номера заданий разные');
assert.ok(ids.every((id) => /^\d+$/.test(id)));
assert.equal(messy.scrolls[0].tasks[0].id, '3', 'первый со своим номером его и держит');
assert.equal(messy.scrolls[2].tasks[0].text, 'д', 'свиток с кривой датой не пропал');
assert.deepEqual(normalizeBrief(messy), messy, 'нормализация устойчива');

// 2. Операции.
const now = '2026-09-25T10:00:00.000Z', later = '2026-09-26T09:00:00.000Z';
let brief = applyBriefOp(undefined, { op: 'addScroll', date: '2026-09-25' }, now);
assert.equal(brief.scrolls.length, 1);
assert.equal(brief.updated, now);
brief = applyBriefOp(brief, { op: 'addScroll', date: '2026-09-25', title: 'снова' }, now);
assert.equal(brief.scrolls.length, 1, 'свиток на число один');
assert.equal(brief.scrolls[0].title, '', 'повторный свиток не правит старый');
assert.throws(() => applyBriefOp(brief, { op: 'addScroll', date: '25.09.2026' }), /ГГГГ-ММ-ДД/);
assert.throws(() => applyBriefOp(brief, { op: 'addScroll', date: '2026-02-30' }), /ГГГГ-ММ-ДД/);
brief = applyBriefOp(brief, { op: 'updateScroll', date: '2026-09-25', title: 'Встреча на участке' }, now);
assert.equal(brief.scrolls[0].title, 'Встреча на участке');

brief = applyBriefOp(brief, { op: 'addTask', date: '2026-09-25', text: 'Изгородь вдоль дорожки' }, now);
brief = applyBriefOp(brief, { op: 'addTask', date: '2026-09-25', text: 'Свет у крыльца', priority: 'high', markers: ['lighting'] }, now);
let [first, second] = brief.scrolls[0].tasks;
assert.deepEqual([first.id, second.id], ['1', '2']);
assert.equal(first.status, 'open');
assert.equal(first.created, now);
assert.equal(second.priority, 'high');
assert.throws(() => applyBriefOp(brief, { op: 'addTask', date: '2026-01-01', text: 'x' }), /Свитка 2026-01-01/);

const frozen = JSON.stringify(brief);
brief = applyBriefOp(brief, { op: 'updateTask', task: '1', description: 'Граб, 1,2 м', markers: ['greenery/topiary', 'Ограждение'] }, later);
assert.equal(JSON.parse(frozen).scrolls[0].tasks[0].description, '', 'операция не трогает прежний объект');
[first] = brief.scrolls[0].tasks;
assert.equal(first.text, 'Изгородь вдоль дорожки', 'правка одного поля не стирает другие');
assert.equal(first.description, 'Граб, 1,2 м');
assert.equal(first.updated, later);
assert.equal(first.created, now);

// Путь статуса: open → review (агент, с заметкой) → done (Денис) → open.
brief = applyBriefOp(brief, { op: 'setStatus', task: '#1', status: 'review', note: 'Изгородь по контуру, коммит abc123' }, now);
[first] = brief.scrolls[0].tasks;
assert.equal(first.status, 'review');
assert.equal(first.reviewAt, now);
assert.equal(first.note, 'Изгородь по контуру, коммит abc123');
assert.deepEqual(briefCounts(brief), { open: 1, review: 1, done: 0 });
brief = applyBriefOp(brief, { op: 'setStatus', task: '1', status: 'done' }, later);
[first] = brief.scrolls[0].tasks;
assert.equal(first.doneAt, later);
assert.equal(first.reviewAt, now, 'принятое помнит, когда отдано на проверку');
brief = applyBriefOp(brief, { op: 'setStatus', task: '1', status: 'open' }, later);
[first] = brief.scrolls[0].tasks;
assert.equal(first.reviewAt, undefined);
assert.equal(first.doneAt, undefined);
assert.equal(first.note, 'Изгородь по контуру, коммит abc123', 'заметка агента остаётся после «Вернуть»');
assert.throws(() => applyBriefOp(brief, { op: 'setStatus', task: '1', status: 'готово' }), /Статус/);
assert.throws(() => applyBriefOp(brief, { op: 'setStatus', task: '42', status: 'review' }), /№42/);

brief = applyBriefOp(brief, { op: 'removeTask', task: '2' }, now);
brief = applyBriefOp(brief, { op: 'addTask', date: '2026-09-25', text: 'третье,\n  вставленное\nс переносами' }, now);
assert.deepEqual(brief.scrolls[0].tasks.map((task) => task.id), ['1', '2'], 'новый номер — следующий за наибольшим');
assert.equal(brief.scrolls[0].tasks[1].text, 'третье, вставленное с переносами', 'текст задания — одна строка');

brief = applyBriefOp(brief, { op: 'updateInfo', client: { name: 'Иван', contacts: '+7 900' }, deadline: { due: '2026-10-15' } }, now);
brief = applyBriefOp(brief, { op: 'updateInfo', client: { name: 'Иван Петров' }, contract: { signed: true, number: '12/09' } }, now);
assert.deepEqual(brief.client, { name: 'Иван Петров', contacts: '+7 900', notes: '' }, 'поле заказчика правится отдельно');
assert.deepEqual(brief.contract, { signed: true, number: '12/09', date: '' });
assert.equal(brief.deadline.due, '2026-10-15');

assert.throws(() => applyBriefOp(brief, { op: 'стереть' }), /нет операции/);
assert.throws(() => applyBriefOp(brief, { op: '__proto__' }), /нет операции/);
assert.throws(() => applyBriefOp(brief, {}), /нет операции/);
brief = applyBriefOp(brief, { op: 'removeScroll', date: '2026-09-25' }, now);
assert.equal(brief.scrolls.length, 0);

assert.equal(today(new Date(2026, 0, 5, 23, 59)), '2026-01-05', 'сегодня — по местным часам');

// 3. Файл рядом с проектом — во временном доме данных.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-brief-'));
process.env.DDG_PROJECTS_DIR = home;
const { projects } = await import('../../scripts/projectStore.mjs');
const { editorIndex, resolveMarker } = await import('../../scripts/brief.mjs');
try {
    const project = await projects.create({ name: 'Сад у реки', settings: { terrainSeed: 3 } });
    const file = path.join(home, 'projects', project.id, 'brief.json');
    assert.deepEqual(await projects.readBrief(project.id), empty, 'файла ещё нет — пустое ТЗ');
    assert.equal(await projects.readBrief('nikogo'), null);
    assert.equal(await projects.readBrief('../etc'), null);
    assert.equal(await projects.updateBrief('nikogo', { op: 'addScroll', date: '2026-09-25' }), null);

    await projects.updateBrief(project.id, { op: 'addScroll', date: '2026-09-25' });
    // Десять правок разом (редактор шлёт их быстро) — все на месте, номера разные.
    await Promise.all(Array.from({ length: 10 }, (_, index) => projects.updateBrief(project.id, { op: 'addTask', date: '2026-09-25', text: `задание ${index}` })));
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(stored.scrolls[0].tasks.length, 10);
    assert.deepEqual(stored.scrolls[0].tasks.map((task) => task.id).sort((x, y) => x - y), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    assert.deepEqual((await fs.readdir(path.dirname(file))).filter((name) => name.endsWith('.tmp')), [], 'временных файлов не осталось');
    assert.deepEqual((await projects.read(project.id)).settings, { terrainSeed: 3 }, 'ТЗ не в сцене проекта');

    await projects.updateBrief(project.id, { op: 'updateTask', task: '4', markers: ['greenery/topiary', 'lighting', 'Ограждение'], priority: 'high', description: 'Граб вдоль дорожки' });
    assert.equal((await projects.list())[0].review, undefined, 'нечего проверять — в списке нет счётчика');
    await projects.updateBrief(project.id, { op: 'setStatus', task: '5', status: 'review', note: 'готово' });
    assert.equal((await projects.list())[0].review, 1, 'меню видит «на проверке 1»');

    // Испорченный файл не подменяется пустым ТЗ: правка отказывает, меню живо.
    const good = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, '{ сломано');
    await assert.rejects(projects.updateBrief(project.id, { op: 'addScroll', date: '2026-09-26' }), /не читается/);
    assert.equal(await fs.readFile(file, 'utf8'), '{ сломано');
    assert.equal((await projects.list()).length, 1);
    await fs.writeFile(file, good);

    // 4. Маркеры — узлы дерева редактора → файлы их секций; второго списка нет.
    const index = editorIndex();
    assert.ok(index.nodes.size >= 40, `узлов в дереве ${index.nodes.size}`);
    for (const [marker, node] of index.nodes) {
        assert.ok(node.files.length, `${marker}: нет файла секции`);
        for (const sectionFile of node.files) assert.ok(existsSync(path.join(root, sectionFile)), `${marker}: ${sectionFile}`);
        assert.doesNotMatch(node.label, /undefined/);
    }
    assert.deepEqual(resolveMarker(index, 'greenery/topiary'), { marker: 'greenery/topiary', label: 'Озеленение / Стриженые формы', files: ['src/features/home-scene/components/editor/sections/topiary.jsx'] });
    assert.ok(resolveMarker(index, 'lighting').files.includes('src/features/home-scene/components/editor/sections/lighting.jsx'));
    assert.equal(resolveMarker(index, 'project/brief').files[0], 'src/features/home-scene/components/editor/sections/brief.jsx');
    assert.equal(resolveMarker(index, 'Ограждение').free, true);

    // 5. CLI агента — отдельным процессом, как его зовёт агент.
    const cli = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/brief.mjs'), ...args], { env: { ...process.env, DDG_PROJECTS_DIR: home }, encoding: 'utf8' });
    let run = cli();
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, new RegExp(`${project.id}\\s+Сад у реки · открыто 9 · на проверке 1`));

    run = cli(project.id);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /#4\s+высокий\s+открыто\s+задание 3/);
    assert.match(run.stdout, /Граб вдоль дорожки/);
    assert.match(run.stdout, /маркер: Озеленение \/ Стриженые формы → src\/features\/home-scene\/components\/editor\/sections\/topiary\.jsx/);
    assert.match(run.stdout, /маркер: Ограждение \(свой/);
    assert.match(run.stdout, /заметка: готово/);

    run = cli(project.id, '--json');
    const data = JSON.parse(run.stdout);
    assert.equal(data.file, file);
    assert.deepEqual(data.counts, { open: 9, review: 1, done: 0 });
    const four = data.scrolls[0].tasks.find((task) => task.id === '4');
    assert.deepEqual(four.markers.map((marker) => marker.files[0] ?? null), ['src/features/home-scene/components/editor/sections/topiary.jsx', 'src/features/home-scene/components/editor/sections/lighting.jsx', null]);

    run = cli(project.id, 'review', '4');
    assert.notEqual(run.status, 0, 'review без заметки не проходит');
    assert.match(run.stderr, /заметка/);
    run = cli(project.id, 'review', '#4', '--note', 'Изгородь из граба вдоль дорожки, коммит abc123');
    assert.equal(run.status, 0, run.stderr);
    let task = (await projects.readBrief(project.id)).scrolls[0].tasks.find((item) => item.id === '4');
    assert.equal(task.status, 'review');
    assert.equal(task.note, 'Изгородь из граба вдоль дорожки, коммит abc123');

    run = cli(project.id, 'done', '4');
    assert.notEqual(run.status, 0, '«принято» агент не ставит');
    assert.match(run.stderr, /только Денис/);
    run = cli(project.id, 'open', '4');
    assert.equal(run.status, 0, run.stderr);
    task = (await projects.readBrief(project.id)).scrolls[0].tasks.find((item) => item.id === '4');
    assert.equal(task.status, 'open');
    assert.equal(task.note, 'Изгородь из граба вдоль дорожки, коммит abc123');

    await projects.updateBrief(project.id, { op: 'setStatus', task: '1', status: 'done' });
    assert.doesNotMatch(cli(project.id).stdout, /задание 0/, 'принятое — только с --all');
    assert.match(cli(project.id, '--all').stdout, /#1\s+обычный\s+принято\s+задание 0/);

    for (const [args, message] of [[['nikogo'], /Проекта «nikogo» нет/], [[project.id, 'review', '99', '--note', 'x'], /№99/], [[project.id, 'стереть', '1'], /Нет команды/], [[project.id, 'review', '4', '--note'], /После --note/]]) {
        run = cli(...args);
        assert.notEqual(run.status, 0, args.join(' '));
        assert.match(run.stderr, message);
    }
} finally {
    await fs.rm(home, { recursive: true, force: true });
}

console.log('brief: нормализация, операции, путь статуса, файл проекта, маркеры → секции и CLI агента — в порядке.');
