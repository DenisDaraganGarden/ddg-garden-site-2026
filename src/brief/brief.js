// ТЗ проекта: заказчик, договор, сроки и свитки заданий по датам. Живёт
// файлом <дом данных>/projects/<id>/brief.json рядом с проектом
// (scripts/projectStore.mjs), а не в его settings: данные заказчика не
// публикуются, в снимки камер и в git не попадают.
//
// Правки — только операциями отсюда: сервер (vite.config.js), агент
// (scripts/brief.mjs) и редактор (sections/brief.jsx) присылают { op, … }, и
// каждая применяется к тому, что лежит на диске сейчас. Поэтому галочка Дениса
// в редакторе и отметка агента из терминала друг друга не затирают.
//
// Статус задания: open — новое, не сделано; review — агент сделал, в note —
// что и каким коммитом, Денис видит «ждёт проверки»; done — Денис принял.
// Денис может закрыть open сам; снятая галочка у review возвращает в open.
// done агент не ставит никогда.
//
// Свиток — это дата: один на число. Номер задания — строка с числом, один на
// всё ТЗ, чтобы агент писал «review 7», не называя свиток.

export const PRIORITIES = ['high', 'normal', 'low'];
export const STATUSES = ['open', 'review', 'done'];
const LIMITS = { line: 500, text: 10000, marker: 80, markers: 16 };

const text = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '');
// «ГГГГ-ММ-ДД», и такое число есть в календаре (Date.parse пропускает 31 февраля).
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const day = (value) => (isDay(value) ? value : '');
const stamp = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null);
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

// Сегодня по местным часам: в полночь по Москве «Сегодня» — уже новое число, а UTC ещё вчерашний.
export const today = (date = new Date()) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const normalizeMarkers = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => text(item, LIMITS.marker).trim()).filter(Boolean))].slice(0, LIMITS.markers);

function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const status = STATUSES.includes(raw.status) ? raw.status : 'open';
    const task = {
        id: /^\d{1,9}$/.test(String(raw.id ?? '')) ? String(raw.id) : '',
        // Текст задания — одна строка (заголовок); подробности — в описании.
        text: text(raw.text, LIMITS.line).replace(/\s*\n\s*/g, ' '),
        description: text(raw.description, LIMITS.text),
        priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'normal',
        markers: normalizeMarkers(raw.markers),
        status,
        created: stamp(raw.created),
        updated: stamp(raw.updated),
    };
    const note = text(raw.note, LIMITS.text);
    if (note) task.note = note;
    // Когда отдано на проверку — у review и у принятого после проверки; когда принято — у done.
    if (status !== 'open' && stamp(raw.reviewAt)) task.reviewAt = raw.reviewAt;
    if (status === 'done' && stamp(raw.doneAt)) task.doneAt = raw.doneAt;
    return task;
}

export function normalizeBrief(raw) {
    const source = object(raw);
    const client = object(source.client), contract = object(source.contract), deadline = object(source.deadline);

    // Два свитка одной даты (правка руками) сливаются; свиток без даты — один, в конце.
    // Задания не теряются никогда: у них текст Дениса.
    const byDate = new Map();
    for (const item of Array.isArray(source.scrolls) ? source.scrolls : []) {
        if (!item || typeof item !== 'object') continue;
        const date = day(item.date), tasks = (Array.isArray(item.tasks) ? item.tasks : []).map(normalizeTask).filter(Boolean);
        const same = byDate.get(date);
        if (same) {
            same.tasks.push(...tasks);
            same.title ||= text(item.title, LIMITS.line);
        } else byDate.set(date, { date, title: text(item.title, LIMITS.line), tasks });
    }
    const scrolls = [...byDate.values()].sort((a, b) => (b.date || '0').localeCompare(a.date || '0'));

    // Пустой или повторившийся номер получает следующий свободный.
    const tasks = scrolls.flatMap((scroll) => scroll.tasks), seen = new Set();
    let top = Math.max(0, ...tasks.map((task) => Number(task.id) || 0));
    for (const task of tasks) {
        if (!task.id || seen.has(task.id)) task.id = String((top += 1));
        seen.add(task.id);
    }

    return {
        client: { name: text(client.name, LIMITS.line), contacts: text(client.contacts, LIMITS.text), notes: text(client.notes, LIMITS.text) },
        contract: { signed: contract.signed === true, number: text(contract.number, LIMITS.line), date: day(contract.date) },
        deadline: { start: day(deadline.start), due: day(deadline.due) },
        scrolls,
        updated: stamp(source.updated),
    };
}

export function briefCounts(brief) {
    const counts = { open: 0, review: 0, done: 0 };
    for (const scroll of brief?.scrolls ?? []) for (const task of scroll.tasks) counts[task.status] += 1;
    return counts;
}

function findScroll(brief, date) {
    const scroll = brief.scrolls.find((item) => item.date === String(date ?? ''));
    if (!scroll) throw new Error(`Свитка ${date || 'без даты'} в ТЗ нет.`);
    return scroll;
}

function findTask(brief, id) {
    const key = String(id ?? '').replace(/^#/, '');
    for (const scroll of brief.scrolls) {
        const task = scroll.tasks.find((item) => item.id === key);
        if (task) return { scroll, task };
    }
    throw new Error(`Задания №${key} в ТЗ нет.`);
}

// Каждая операция правит свежую нормализованную копию; что лишнее или кривое
// в аргументах — отбросит нормализация после неё.
const OPS = {
    addScroll(brief, { date, title }) {
        if (!isDay(date)) throw new Error('Свиток: дата в виде ГГГГ-ММ-ДД.');
        if (!brief.scrolls.some((scroll) => scroll.date === date)) brief.scrolls.push({ date, title, tasks: [] });
    },
    updateScroll(brief, { date, title }) {
        findScroll(brief, date).title = title;
    },
    removeScroll(brief, { date }) {
        brief.scrolls.splice(brief.scrolls.indexOf(findScroll(brief, date)), 1);
    },
    addTask(brief, { date, text: words, description, priority, markers }, now) {
        findScroll(brief, date).tasks.push({ text: words, description, priority, markers, status: 'open', created: now, updated: now });
    },
    updateTask(brief, { task: id, ...fields }, now) {
        const { task } = findTask(brief, id);
        for (const key of ['text', 'description', 'priority', 'markers']) if (fields[key] !== undefined) task[key] = fields[key];
        task.updated = now;
    },
    removeTask(brief, { task: id }) {
        const { scroll, task } = findTask(brief, id);
        scroll.tasks.splice(scroll.tasks.indexOf(task), 1);
    },
    setStatus(brief, { task: id, status, note }, now) {
        if (!STATUSES.includes(status)) throw new Error(`Статус задания — ${STATUSES.join(' / ')}.`);
        const { task } = findTask(brief, id);
        task.status = status;
        task.updated = now;
        if (status === 'review') task.reviewAt = now;
        if (status === 'done') task.doneAt = now;
        if (note !== undefined) task.note = note;
    },
    updateInfo(brief, { client, contract, deadline }) {
        for (const [key, patch] of Object.entries({ client, contract, deadline })) if (patch && typeof patch === 'object') Object.assign(brief[key], patch);
    },
};

export function applyBriefOp(current, { op, ...args } = {}, now = new Date().toISOString()) {
    if (!Object.hasOwn(OPS, op)) throw new Error(`ТЗ: нет операции «${op}».`);
    const next = normalizeBrief(current);
    OPS[op](next, args, now);
    return normalizeBrief({ ...next, updated: now });
}
