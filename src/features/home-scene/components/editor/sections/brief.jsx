import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { isEditorNodeHidden } from '../hiddenNodes.js';
import { briefCounts, PRIORITIES, today } from '../../../../../brief/brief.js';
import { runBrief, useBrief } from '../../../../../brief/useBrief.js';
import { activeProjectId } from '../../../../engine/projectApi.js';
import '../../../../../planting/ui/planting-ui.css';
import './brief.css';

// Рабочее место «Проект» (src/brief/brief.js): ТЗ — свитки заданий по датам,
// и заказчик — имя, контакты, договор, сроки. Это не сцена: ни одного
// параметра в каталоге, каждая правка — операция в projects/<id>/brief.json.
// Агент читает то же самое: node scripts/brief.mjs <проект>.
const TAB_KEY = 'ddg_brief_tab_v1';
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'tasks'; } catch { return 'tasks'; } };
const PRIORITY_LABELS = { high: ['Высокий', 'High'], normal: ['Обычный', 'Normal'], low: ['Низкий', 'Low'] };

const localDay = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = (date, ru) => (date
    ? localDay(date).toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', ...(date.startsWith(String(new Date().getFullYear())) ? {} : { year: 'numeric' }) })
    : (ru ? 'Без даты' : 'No date'));
const momentLabel = (stamp, ru) => new Date(stamp).toLocaleString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const daysUntil = (date) => Math.round((localDay(date) - localDay(today())) / 864e5);

// Поле ТЗ: уходит на сервер через полсекунды тишины или при уходе из поля.
// Пока в поле курсор, пришедшее с диска его не перебивает. submitOnEnter —
// Enter закрывает правку (текст задания переносится, но пишется одной строкой).
function Field({ value, onSave, multiline = false, submitOnEnter = !multiline, ...props }) {
    const [draft, setDraft] = useState(value);
    const focused = useRef(false), timer = useRef(0), latest = useRef(value), saved = useRef(value);
    const flush = useRef(null);
    flush.current = () => {
        clearTimeout(timer.current);
        timer.current = 0;
        if (latest.current !== saved.current) { saved.current = latest.current; onSave(latest.current); }
    };
    useEffect(() => {
        saved.current = value;
        if (!focused.current) { latest.current = value; setDraft(value); }
    }, [value]);
    // Поле ушло с экрана (свернули задание) — набранное не теряется.
    useEffect(() => () => { if (timer.current) flush.current(); }, []);
    const Tag = multiline ? 'textarea' : 'input';
    return <Tag {...props} value={draft}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; flush.current(); }}
        onChange={(event) => {
            latest.current = event.target.value;
            setDraft(event.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => flush.current(), 600);
        }}
        onKeyDown={(event) => { if (submitOnEnter && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}

// Маркер задания — узел редактора (путь «группа/узел»), группа целиком или своё
// слово. Выбор — поповер как у растений: поиск по подписям дерева, Enter —
// единственный найденный узел или своё слово.
function MarkerPicker({ anchor, groups, chosen, ru, onChoose, onClose }) {
    const [query, setQuery] = useState('');
    const ref = useRef(null);
    const [place, setPlace] = useState({ left: 0, top: 0 });
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const shown = groups
        .map((group) => ({ ...group, nodes: group.nodes.filter((node) => words.every((word) => `${group.label} ${node.label}`.toLocaleLowerCase().includes(word))) }))
        .filter((group) => group.nodes.length);
    const found = shown.flatMap((group) => group.nodes), own = query.trim();

    useLayoutEffect(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box || !anchor) return;
        const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.right - box.width));
        const below = anchor.bottom + 6, above = anchor.top - box.height - 6;
        setPlace({ left, top: below + box.height > window.innerHeight - 8 && above > 8 ? above : Math.max(8, Math.min(below, window.innerHeight - box.height - 8)) });
    }, [anchor, shown.length]);
    useEffect(() => {
        const away = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
        const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
    }, [onClose]);

    return createPortal(<div ref={ref} className="plant-picker brief-picker" style={place} role="dialog" aria-label={ru ? 'Маркер задания' : 'Task marker'}>
        <header>
            <span>{ru ? 'Маркер' : 'Marker'}</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? 'Узел или своё слово…' : 'Node or your own word…'} aria-label={ru ? 'Найти узел' : 'Find a node'}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (found.length === 1) onChoose(found[0].path); else if (own) onChoose(own); } }} data-testid="brief-marker-search" />
        </header>
        <div className="brief-picker__list">
            {shown.map((group) => <section key={group.id}>
                <button type="button" className={`brief-picker__group${chosen.includes(group.id) ? ' is-active' : ''}`} onClick={() => onChoose(group.id)} title={ru ? 'Вся группа' : 'The whole group'}>{group.label}</button>
                <div className="plant-chips">{group.nodes.map((node) => <button key={node.path} type="button" className={chosen.includes(node.path) ? 'is-active' : ''} onClick={() => onChoose(node.path)} data-testid={`brief-marker-${node.path}`}>{node.label}</button>)}</div>
            </section>)}
            {own ? <button type="button" className="planting-add" onClick={() => onChoose(own)} data-testid="brief-marker-own">+ {ru ? 'Свой маркер' : 'Own marker'} «{own}»</button> : null}
        </div>
    </div>, document.body);
}

function TaskRow({ task, id, groups, markerOf, ru }) {
    const [open, setOpen] = useState(false);
    const [picker, setPicker] = useState(null);
    const run = (op) => runBrief(id, { task: task.id, ...op });
    const status = (next) => run({ op: 'setStatus', status: next });
    const remove = () => { if ((!task.text && !task.description) || window.confirm(ru ? `Удалить задание «${task.text}»?` : `Delete the task “${task.text}”?`)) run({ op: 'removeTask' }); };
    const checkTip = { open: ru ? 'Сделано — закрыть' : 'Done — close it', review: ru ? 'Принять работу агента' : 'Accept the agent’s work', done: ru ? 'Снова открыть' : 'Open again' }[task.status];
    return <div className={`brief-task is-${task.status}`} data-testid="brief-task">
        <div className="brief-task__row">
            <button type="button" role="checkbox" aria-checked={task.status === 'done' ? 'true' : task.status === 'review' ? 'mixed' : 'false'} className="brief-check" title={checkTip} aria-label={checkTip}
                onClick={() => status(task.status === 'done' ? 'open' : 'done')} data-testid="brief-check">{task.status === 'done' ? <FocusIcon name="check" /> : null}</button>
            <Field multiline submitOnEnter rows={1} className="brief-task__text" value={task.text} onSave={(text) => run({ op: 'updateTask', text })} placeholder={ru ? 'Задание' : 'Task'} aria-label={ru ? 'Текст задания' : 'Task text'} />
            {task.priority === 'normal' ? <span /> : <span className={`brief-priority is-${task.priority}`}>{PRIORITY_LABELS[task.priority][ru ? 0 : 1].toLowerCase()}</span>}
            <button type="button" className="planting-icon" aria-expanded={open} onClick={() => setOpen((value) => !value)} title={ru ? 'Описание, приоритет, маркеры' : 'Description, priority, markers'} data-testid="brief-task-more">{open ? '▴' : '▾'}</button>
        </div>
        {!open && task.markers.length ? <div className="brief-markers">{task.markers.map((marker) => <span key={marker} title={markerOf(marker).title}>{markerOf(marker).label}</span>)}</div> : null}
        {!open && task.description ? <p className="brief-task__desc">{task.description.split('\n')[0]}</p> : null}
        {task.status === 'review' ? <div className="brief-review" data-testid="brief-review">
            <b>{ru ? 'Ждёт проверки' : 'Awaiting review'}{task.reviewAt ? ` · ${momentLabel(task.reviewAt, ru)}` : ''}</b>
            {task.note ? <p>{task.note}</p> : null}
            <div className="planting-actions">
                <button type="button" className="is-primary" onClick={() => status('done')} data-testid="brief-accept">{ru ? 'Принять' : 'Accept'}</button>
                <button type="button" onClick={() => { status('open'); setOpen(true); }} title={ru ? 'Назад в открытые; что не так — в описание' : 'Back to open; what is wrong — into the description'} data-testid="brief-return">{ru ? 'Вернуть' : 'Return'}</button>
            </div>
        </div> : null}
        {open ? <div className="brief-task__more">
            <Field multiline rows={3} className="planting-name" value={task.description} onSave={(description) => run({ op: 'updateTask', description })} placeholder={ru ? 'Описание: что, где, как должно быть' : 'Description: what, where, how it should be'} aria-label={ru ? 'Описание' : 'Description'} data-testid="brief-description" />
            <div className="brief-task__line"><span>{ru ? 'Приоритет' : 'Priority'}</span>
                <div className="planting-toggle">{PRIORITIES.map((priority) => <button key={priority} type="button" className={task.priority === priority ? 'is-active' : ''} onClick={() => run({ op: 'updateTask', priority })} data-testid={`brief-priority-${priority}`}>{PRIORITY_LABELS[priority][ru ? 0 : 1]}</button>)}</div>
            </div>
            <div className="plant-chips">
                {task.markers.map((marker) => <button key={marker} type="button" title={`${markerOf(marker).title} — ${ru ? 'убрать' : 'remove'}`} onClick={() => run({ op: 'updateTask', markers: task.markers.filter((item) => item !== marker) })}>{markerOf(marker).label} ×</button>)}
                <button type="button" className="plant-chips__add" onClick={(event) => setPicker(event.currentTarget.getBoundingClientRect())} data-testid="brief-marker-add">+ {ru ? 'Маркер' : 'Marker'}</button>
            </div>
            {task.note && task.status !== 'review' ? <p className="brief-note"><b>{ru ? 'Заметка агента' : 'Agent note'}</b> {task.note}</p> : null}
            <div className="planting-actions"><button type="button" onClick={remove} data-testid="brief-task-delete">{ru ? 'Удалить задание' : 'Delete task'}</button></div>
        </div> : null}
        {picker ? <MarkerPicker anchor={picker} groups={groups} chosen={task.markers} ru={ru} onClose={() => setPicker(null)}
            onChoose={(marker) => { setPicker(null); if (!task.markers.includes(marker)) run({ op: 'updateTask', markers: [...task.markers, marker] }); }} /> : null}
    </div>;
}

function ScrollBlock({ scroll, id, groups, markerOf, ru }) {
    // Свиток с незакрытыми заданиями открыт, принятый целиком — свёрнут; дальше — как оставил Денис.
    const [initiallyOpen] = useState(() => !scroll.tasks.length || scroll.tasks.some((task) => task.status !== 'done'));
    const counts = briefCounts({ scrolls: [scroll] });
    const add = (event) => {
        event.preventDefault();
        const form = event.currentTarget, text = String(new FormData(form).get('text') ?? '').trim();
        if (!text) { form.elements.text.focus(); return; }
        runBrief(id, { op: 'addTask', date: scroll.date, text });
        form.reset();
    };
    const remove = (event) => {
        event.preventDefault();
        if (!scroll.tasks.length || window.confirm(ru ? `Удалить свиток ${dayLabel(scroll.date, ru)} и его задания (${scroll.tasks.length})?` : `Delete the scroll of ${dayLabel(scroll.date, ru)} and its ${scroll.tasks.length} tasks?`)) runBrief(id, { op: 'removeScroll', date: scroll.date });
    };
    return <details className="brief-scroll" open={initiallyOpen} data-testid="brief-scroll">
        <summary>
            <span className="brief-scroll__date">{dayLabel(scroll.date, ru)}</span>
            {scroll.title ? <span className="brief-scroll__title">{scroll.title}</span> : null}
            <small>{[counts.open && `${ru ? 'открыто' : 'open'} ${counts.open}`, counts.review && `${ru ? 'проверка' : 'review'} ${counts.review}`, counts.done && `${ru ? 'принято' : 'done'} ${counts.done}`].filter(Boolean).join(' · ')}</small>
            <button type="button" className="planting-icon" onClick={remove} aria-label={ru ? 'Удалить свиток' : 'Delete scroll'} title={ru ? 'Удалить свиток' : 'Delete scroll'}>×</button>
        </summary>
        <div className="brief-scroll__body">
            <Field className="brief-scroll__topic" value={scroll.title} onSave={(title) => runBrief(id, { op: 'updateScroll', date: scroll.date, title })} placeholder={ru ? 'Тема: встреча, звонок, письмо…' : 'Topic: meeting, call, letter…'} aria-label={ru ? 'Тема свитка' : 'Scroll topic'} />
            {scroll.tasks.map((task) => <TaskRow key={task.id} task={task} id={id} groups={groups} markerOf={markerOf} ru={ru} />)}
            <form className="brief-add" onSubmit={add}>
                <input name="text" className="planting-name" placeholder={ru ? 'Новое задание…' : 'New task…'} aria-label={ru ? 'Новое задание' : 'New task'} autoComplete="off" maxLength={500} data-testid="brief-new-task" />
                <button type="submit" className="planting-add" data-testid="brief-add-task">+ {ru ? 'Задание' : 'Task'}</button>
            </form>
        </div>
    </details>;
}

function ClientForm({ brief, id, ru }) {
    const info = (key, patch) => runBrief(id, { op: 'updateInfo', [key]: patch });
    const { client, contract, deadline } = brief;
    const left = deadline.due ? daysUntil(deadline.due) : null;
    return <div className="brief-client" data-testid="brief-client">
        <label className="brief-field"><span>{ru ? 'Имя' : 'Name'}</span>
            <Field className="planting-name" value={client.name} onSave={(name) => info('client', { name })} placeholder={ru ? 'Заказчик' : 'Client'} data-testid="brief-client-name" /></label>
        <label className="brief-field"><span>{ru ? 'Контакты' : 'Contacts'}</span>
            <Field multiline rows={3} className="planting-name" value={client.contacts} onSave={(contacts) => info('client', { contacts })} placeholder={ru ? 'Телефон, почта, адрес' : 'Phone, email, address'} /></label>
        <label className="brief-field"><span>{ru ? 'Заметки' : 'Notes'}</span>
            <Field multiline rows={3} className="planting-name" value={client.notes} onSave={(notes) => info('client', { notes })} placeholder={ru ? 'Пожелания, бюджет, кто решает' : 'Wishes, budget, who decides'} /></label>

        <h4>{ru ? 'Договор' : 'Contract'}</h4>
        <div className="brief-field"><span>{ru ? 'Заключён' : 'Signed'}</span>
            <div className="planting-toggle">
                <button type="button" className={contract.signed ? 'is-active' : ''} onClick={() => info('contract', { signed: true })} data-testid="brief-contract-yes">{ru ? 'Да' : 'Yes'}</button>
                <button type="button" className={contract.signed ? '' : 'is-active'} onClick={() => info('contract', { signed: false })}>{ru ? 'Нет' : 'No'}</button>
            </div></div>
        {contract.signed ? <>
            <label className="brief-field"><span>{ru ? 'Номер' : 'Number'}</span>
                <Field className="planting-name" value={contract.number} onSave={(number) => info('contract', { number })} placeholder="№" /></label>
            <label className="brief-field"><span>{ru ? 'Дата' : 'Date'}</span>
                <Field type="date" className="planting-name" value={contract.date} onSave={(date) => info('contract', { date })} /></label>
        </> : null}

        <h4>{ru ? 'Сроки' : 'Deadlines'}</h4>
        <label className="brief-field"><span>{ru ? 'Начало' : 'Start'}</span>
            <Field type="date" className="planting-name" value={deadline.start} onSave={(start) => info('deadline', { start })} /></label>
        <label className="brief-field"><span>{ru ? 'Сдача' : 'Due'}</span>
            <Field type="date" className="planting-name" value={deadline.due} onSave={(due) => info('deadline', { due })} data-testid="brief-due" /></label>
        {left === null ? null : <p className="planting-status">{left > 0
            ? (ru ? `До сдачи ${left} дн.` : `${left} days to the deadline`)
            : left === 0 ? (ru ? 'Сдача сегодня' : 'Due today') : (ru ? `Срок прошёл ${-left} дн. назад` : `Overdue by ${-left} days`)}</p>}
        <p className="planting-hint">{ru
            ? 'Данные заказчика лежат в папке проекта на этом компьютере: не в сцене, на сайт и в git не уходят.'
            : 'Client data lives in the project folder on this computer: not in the scene, never on the site or in git.'}</p>
    </div>;
}

function BriefWorkspace({ editorTree, ru, t }) {
    const id = activeProjectId();
    const { brief, error } = useBrief(id);
    const [tab, setTab] = useState(readTab);
    const [date, setDate] = useState(today);
    useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* local UI only */ } }, [tab]);

    // Подписи маркеров — те же, что в дереве редактора; выбор — только видимые узлы.
    const tree = useMemo(() => (editorTree ?? []).filter((group) => group.id !== 'project'), [editorTree]);
    const groups = useMemo(() => tree.map((group) => ({
        id: group.id,
        label: t(`homeEditor.groups.${group.id}`),
        nodes: group.nodes.filter((node) => (import.meta.env.DEV || !node.devOnly) && !isEditorNodeHidden(`${group.id}/${node.id}`))
            .map((node) => ({ path: `${group.id}/${node.id}`, label: t(`homeEditor.nodes.${node.id}`) })),
    })).filter((group) => group.nodes.length), [tree, t]);
    const markerOf = useMemo(() => {
        const labels = new Map();
        for (const group of tree) {
            const groupLabel = t(`homeEditor.groups.${group.id}`);
            labels.set(group.id, { label: groupLabel, title: ru ? `Группа «${groupLabel}»` : `Group “${groupLabel}”` });
            for (const node of group.nodes) labels.set(`${group.id}/${node.id}`, { label: t(`homeEditor.nodes.${node.id}`), title: `${groupLabel} / ${t(`homeEditor.nodes.${node.id}`)}` });
        }
        return (marker) => labels.get(marker) ?? { label: marker, title: ru ? 'Свой маркер' : 'Own marker' };
    }, [tree, t, ru]);

    if (!id) return null;
    if (!brief) return <p className="planting-empty">{error || (ru ? 'Открываю ТЗ…' : 'Opening the brief…')}</p>;
    const counts = briefCounts(brief);
    const addScroll = (day) => runBrief(id, { op: 'addScroll', date: day });
    const showReview = () => {
        setTab('tasks');
        requestAnimationFrame(() => {
            const task = document.querySelector('.brief-task.is-review');
            const scroll = task?.closest('details');
            if (scroll) scroll.open = true;
            task?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    };

    return <div className="planting-workspace brief-workspace" data-testid="brief-workspace">
        {counts.review ? <button type="button" className="brief-awaiting" onClick={showReview} data-testid="brief-awaiting">
            <b>{counts.review}</b>{ru ? `${counts.review % 10 === 1 && counts.review % 100 !== 11 ? 'ждёт' : 'ждут'} проверки — агент сделал, посмотрите` : 'awaiting review — the agent is done, take a look'}</button> : null}
        <nav className="planting-tabs" role="tablist">
            {[['tasks', ru ? 'ТЗ' : 'Brief', counts.open + counts.review], ['client', ru ? 'Заказчик' : 'Client', null]].map(([key, label, count]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)} data-testid={`brief-tab-${key}`}>
                {label}{count ? <small className="lighting-tab-count">{count}</small> : null}</button>)}
        </nav>
        {tab === 'tasks' ? <>
            <div className="brief-new">
                <input type="date" className="planting-name" value={date} onChange={(event) => setDate(event.target.value)} aria-label={ru ? 'Дата свитка' : 'Scroll date'} data-testid="brief-date" />
                <button type="button" onClick={() => { setDate(today()); addScroll(today()); }} title={ru ? 'Свиток с сегодняшним числом' : 'A scroll dated today'} data-testid="brief-today">{ru ? 'Сегодня' : 'Today'}</button>
                <button type="button" onClick={() => addScroll(date)} disabled={!date} title={ru ? 'Свиток на выбранную дату' : 'A scroll on the chosen date'} data-testid="brief-add-scroll">+ {ru ? 'Свиток' : 'Scroll'}</button>
            </div>
            {brief.scrolls.length
                ? brief.scrolls.map((scroll) => <ScrollBlock key={scroll.date || 'none'} scroll={scroll} id={id} groups={groups} markerOf={markerOf} ru={ru} />)
                : <p className="planting-empty">{ru
                    ? 'Свитков пока нет. «Сегодня» — свиток с сегодняшним числом, в нём «+ Задание». Агент читает ТЗ сам: напишите ему «добавил задание, посмотри».'
                    : 'No scrolls yet. “Today” makes a scroll dated today; add tasks inside it. The agent reads the brief itself: tell it “added a task, take a look”.'}</p>}
        </> : <ClientForm brief={brief} id={id} ru={ru} />}
        {error ? <p className="planting-hint brief-error" role="alert">{error}</p> : null}
    </div>;
}

export function BriefSection({ editorTree }) {
    const { language, t } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    // В каталоге параметров (поиск, избранное, справочник) ТЗ нет: это не сцена.
    if (scope?.catalogOnly) return null;
    return <BriefWorkspace editorTree={editorTree} ru={ru} t={t} />;
}
