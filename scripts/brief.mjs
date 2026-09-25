// ТЗ проектов для агента (src/brief/brief.js): что Денис поручил и что ждёт
// его проверки. Читает и пишет дом данных напрямую (projectStore.mjs) теми же
// операциями, что и редактор; открытый редактор подхватит отметку, когда окно
// вернётся в фокус.
//
//   node scripts/brief.mjs
//        все проекты: сколько заданий открыто и сколько ждут проверки;
//   node scripts/brief.mjs <проект> [--all] [--json]
//        открытые и ждущие проверки задания по свиткам: номер, приоритет,
//        текст, описание, маркеры — узел редактора и файл его секции, с
//        которого начинать; --all — и принятые;
//   node scripts/brief.mjs <проект> review <номер> --note "что сделано, коммит"
//        сделано — ждёт проверки Дениса;
//   node scripts/brief.mjs <проект> open <номер> [--note "…"]
//        назад в открытые.
//
// «Принято» (done) ставит только Денис, в редакторе.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projects } from './projectStore.mjs';
import { briefCounts } from '../src/brief/brief.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const STATUS = { open: 'открыто', review: 'на проверке', done: 'принято' };
const PRIORITY = { high: 'высокий', normal: 'обычный', low: 'низкий' };

// Маркер — путь узла редактора («greenery/topiary»), группа («greenery») или
// свой текст. Узлы, их секции и подписи читаются из тех же файлов, что у
// редактора (editorTree.js, translations.js), — второго списка нет.
export function editorIndex() {
    const editorDir = path.join(root, 'src/features/home-scene/components/editor');
    const tree = fs.readFileSync(path.join(editorDir, 'editorTree.js'), 'utf8');
    const i18n = fs.readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

    // import { A, B } from './sections/x' — компонент секции → её файл.
    const files = new Map();
    for (const [, names, from] of tree.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.\/sections\/[^']+)'/g)) {
        const base = path.join(editorDir, from);
        const file = ['.jsx', '.js'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate));
        for (const name of names.split(',').map((item) => item.trim()).filter(Boolean)) files.set(name, file ? path.relative(root, file) : null);
    }

    // Русские подписи — первый блок homeEditor в translations.js.
    const labels = (block) => {
        const start = i18n.indexOf(`${block}: {`, i18n.indexOf('homeEditor: {'));
        return Object.fromEntries([...i18n.slice(start, i18n.indexOf('}', start)).matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)].map(([, key, label]) => [key, label]));
    };
    const groupLabels = labels('groups'), nodeLabels = labels('nodes');

    const nodes = new Map(), groups = new Map();
    const body = tree.slice(tree.indexOf('EDITOR_TREE'));
    const starts = [...body.matchAll(/\{\s*id:\s*'(\w+)',\s*nodes:\s*\[/g)];
    starts.forEach((start, index) => {
        const group = start[1], groupFiles = new Set();
        const slice = body.slice(start.index, starts[index + 1]?.index ?? body.length);
        for (const [, node, aspects] of slice.matchAll(/\{\s*id:\s*'(\w+)'[^{}[\]]*aspects:\s*\[([^\]]*)\]/g)) {
            const sectionFiles = [...new Set([...aspects.matchAll(/Section:\s*(\w+)/g)].map(([, name]) => files.get(name)).filter(Boolean))];
            sectionFiles.forEach((file) => groupFiles.add(file));
            nodes.set(`${group}/${node}`, { label: `${groupLabels[group] ?? group} / ${nodeLabels[node] ?? node}`, files: sectionFiles });
        }
        groups.set(group, { label: groupLabels[group] ?? group, files: [...groupFiles] });
    });
    return { nodes, groups };
}

export function resolveMarker(index, marker) {
    const found = index.nodes.get(marker) ?? index.groups.get(marker);
    return found ? { marker, label: found.label, files: found.files } : { marker, label: marker, files: [], free: true };
}

// Ошибка для человека: текст в stderr и код 1 (process.exit на macOS может не
// дописать текст в трубу).
const fail = (message) => { throw Object.assign(new Error(message), { brief: true }); };

async function listAll(json) {
    const rows = await Promise.all((await projects.list()).map(async (project) => {
        const brief = await projects.readBrief(project.id).catch(() => null);
        return { id: project.id, name: project.name, ...briefCounts(brief), ...(brief ? {} : { broken: true }) };
    }));
    if (json) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (!rows.length) { console.log(`Проектов нет (${projects.dir}).`); return; }
    const width = Math.max(...rows.map((row) => row.id.length));
    for (const row of rows) {
        const state = row.broken ? 'ТЗ не читается — подробности: node scripts/brief.mjs ' + row.id
            : row.open || row.review ? `открыто ${row.open} · на проверке ${row.review}` : 'открытых заданий нет';
        console.log(`${row.id.padEnd(width)}  ${row.name} · ${state}`);
    }
}

function show(project, brief, { all, json }) {
    const index = editorIndex();
    const scrolls = brief.scrolls
        .map((scroll) => ({ ...scroll, tasks: scroll.tasks.filter((task) => all || task.status !== 'done').map((task) => ({ ...task, markers: task.markers.map((marker) => resolveMarker(index, marker)) })) }))
        .filter((scroll) => scroll.tasks.length);
    const counts = briefCounts(brief);
    if (json) {
        console.log(JSON.stringify({ project: { id: project.id, name: project.name }, file: path.join(projects.dir, project.id, 'brief.json'), counts, client: brief.client, contract: brief.contract, deadline: brief.deadline, scrolls }, null, 2));
        return;
    }
    const { client, contract, deadline } = brief;
    console.log(`${project.name} (${project.id}) · открыто ${counts.open} · на проверке ${counts.review} · принято ${counts.done}`);
    console.log([
        client.name && `заказчик ${client.name}`,
        contract.signed ? `договор есть${contract.number ? ` № ${contract.number}` : ''}${contract.date ? ` от ${contract.date}` : ''}` : 'договора нет',
        deadline.start && `начало ${deadline.start}`,
        deadline.due && `сдача ${deadline.due}`,
    ].filter(Boolean).join(' · '));
    const indent = (text) => text.split('\n').map((line) => `       ${line}`).join('\n');
    for (const scroll of scrolls) {
        console.log(`\n${scroll.date || 'без даты'}${scroll.title ? ` · ${scroll.title}` : ''}`);
        for (const task of scroll.tasks) {
            console.log(`  #${task.id.padEnd(4)} ${PRIORITY[task.priority].padEnd(8)} ${STATUS[task.status].padEnd(11)} ${task.text || '(без текста)'}`);
            if (task.description) console.log(indent(task.description));
            for (const marker of task.markers) console.log(`       маркер: ${marker.label}${marker.files.length ? ` → ${marker.files.join(', ')}` : ' (свой, узла в редакторе нет)'}`);
            if (task.note) console.log(`       заметка: ${task.note.replace(/\n/g, ' ')}`);
        }
    }
    if (!scrolls.length) console.log(all ? '\nЗаданий нет.' : '\nОткрытых заданий нет.');
}

async function main(argv) {
    const noteAt = argv.indexOf('--note');
    const note = noteAt >= 0 ? argv[noteAt + 1] : undefined;
    const args = argv.filter((arg, index) => !arg.startsWith('--') && (noteAt < 0 || index !== noteAt + 1));
    const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
    const [id, command, task] = args;

    if (!id) { await listAll(flags.has('--json')); return; }
    const project = await projects.read(id);
    if (!project) fail(`Проекта «${id}» нет. node scripts/brief.mjs — список.`);
    if (!command) { show(project, await projects.readBrief(id), { all: flags.has('--all'), json: flags.has('--json') }); return; }
    if (command === 'done') fail('«Принято» ставит только Денис — в редакторе, раздел «Проект». Сделанное — review с заметкой.');
    if (command !== 'review' && command !== 'open') fail(`Нет команды «${command}»: review или open.`);
    if (!task) fail(`node scripts/brief.mjs ${id} ${command} <номер задания>${command === 'review' ? ' --note "что сделано, коммит"' : ''}`);
    if (noteAt >= 0 && note === undefined) fail('После --note — текст заметки.');
    if (command === 'review' && !note?.trim()) fail('Нужна заметка для Дениса: --note "что сделано, коммит".');

    const brief = await projects.updateBrief(id, { op: 'setStatus', task, status: command, ...(note !== undefined ? { note } : {}) });
    const done = brief.scrolls.flatMap((scroll) => scroll.tasks).find((item) => item.id === String(task).replace(/^#/, ''));
    console.log(command === 'review'
        ? `#${done.id} «${done.text}» — ждёт проверки. Денис увидит заметку в разделе «Проект».`
        : `#${done.id} «${done.text}» — снова открыто.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.brief ? error.message : `ТЗ: ${error.message}`);
        process.exitCode = 1;
    });
}
