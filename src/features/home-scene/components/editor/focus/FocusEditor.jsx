import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { version } from '../../../../../../package.json';
import { EDITOR_TREE, resolveEditorPath } from '../editorTree';
import { isEditorNodeHidden } from '../hiddenNodes.js';
import { sceneObjectBlockedBy, sceneObjectsForNode } from '../../../lib/sceneObjects';
import { HOME_SCENE_CAMERA_FOV_MAX } from '../../../lib/layout';
import { GIZMO_MODES } from '../../../hooks/useEditorTool';
import { describeGizmoAxes, gizmoAllows } from '../EditorGizmo';
import { RangeControl, CheckboxControl, SectionHeading } from '../../HomeEditorControls';
import { FocusControlsProvider, FocusControlScope, useFocusControls } from './FocusControlsContext';
import { SectionFoldContext, applyFolds, foldsHiding, loadFolds, saveFolds, useSectionFold } from './sectionFolds';
import { RegisteredFocusControl } from './FocusControlComponents';
import { FOCUS_DOMAINS, SETTINGS_PAGES, getFocusDomain, getFocusGroups, getFocusLabel, getNodeIcon } from './focusNavigation';
import { FocusIcon } from './FocusIcons';
import { flushProjectSave } from '../../../hooks/useHomeSceneSettings';
import { FocusColorPalette, useFocusColorPalette, useFocusIconColors } from './FocusIconPalette';
import { FocusContextMenu } from './FocusContextMenu';
import FocusPresets from './FocusPresets';
import FocusProjectHistory from './FocusProjectHistory';
import FocusToolPie from './FocusToolPie';
import { FocusCameraManager, FocusCameraParameters, FocusCameraStrip, FocusTechnicalViews } from './FocusCameras';
import { NorthCompass } from './NorthCompass';
import { useCompassPlace } from './compassPlace.js';
import logo from './ouroboros-reference.png';
// «Сгенерировать / доработать текстуру…» — окно текстуры по ИИ (src/materials).
import MaterialPanel from '../../../../../materials/MaterialPanel.jsx';
import { selectedNodes } from '../../../../../placed/sketchupModel.js';
// ТЗ проекта (src/brief): на рейке — сколько заданий ждут проверки Дениса.
import { briefCounts } from '../../../../../brief/brief.js';
import { useBrief } from '../../../../../brief/useBrief.js';
import PhotoRenderStudio from '../../../../../photo-render/PhotoRenderStudio.jsx';
import './FocusEditor.css';

const TraceStudio = React.lazy(() => import('../../../../../path-trace/TraceStudio.jsx'));

const UI_KEY = 'ddg_focus_editor_ui_v1';
const readUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
const ALL_NODES = EDITOR_TREE.flatMap((group) => group.nodes.filter((node) => import.meta.env.DEV || !node.devOnly).map((node) => ({ group, node, path: `${group.id}/${node.id}` })));
const matchesSearch = (text, query) => query.toLocaleLowerCase().trim().split(/\s+/).every((word) => text.toLocaleLowerCase().includes(word));
const textTarget = (target) => target?.closest?.('input,textarea,select,[contenteditable=true],dialog');

// Линейка инструментов: один активен, остальные нет. Трансформации всегда на
// месте и серые, пока не выбран объект, который можно двигать, — панель не
// прыгает. Растения — одна кнопка с меню (цветник, посадка, изгородь), а их
// рабочее место — раздел «Растения» слева. Список объектов — под чертой: это
// панель, а не инструмент.
const TOOLS = [
    { id: 'select', icon: 'cursor', ru: 'Выбор', en: 'Select', key: 'V' },
    { id: 'translate', icon: 'move', ru: 'Перенос', en: 'Move', key: 'G', transform: true },
    { id: 'rotate', icon: 'rotate', ru: 'Поворот', en: 'Rotate', key: 'R', transform: true },
    { id: 'scale', icon: 'scale', ru: 'Масштаб', en: 'Scale', key: 'S', transform: true },
    { id: 'material', icon: 'grid', ru: 'Материалы', en: 'Materials', key: 'B' },
    { id: 'hand', icon: 'hand', ru: 'Только обзор', en: 'Navigate only', key: 'H' },
];
const PLANT_TOOLS = [
    { id: 'bed', icon: 'bed', ru: 'Цветник', en: 'Bed', key: 'L', group: 'plants' },
    { id: 'plant', icon: 'sprout', ru: 'Посадить', en: 'Plant', key: 'T', group: 'plants' },
    { id: 'vine', icon: 'vine', ru: 'Лиана', en: 'Climber', key: 'I', group: 'plants' },
    { id: 'topiary', icon: 'leaf', ru: 'Изгородь', en: 'Hedge', key: 'Shift+B', group: 'plants' },
];
// Отметка уровня (src/annotations): щелчок по поверхности ставит отметку.
const MARK_TOOL = { id: 'mark', icon: 'level', ru: 'Отметка', en: 'Level mark', key: 'M' };
const START_TOOL = { id: 'start', icon: 'flag', ru: 'Старт', en: 'Walk start', key: 'K' };
// Светильник (src/lighting): щелчок — место, протяжка — на что светит.
const LIGHT_TOOL = { id: 'luminaire', icon: 'light', ru: 'Светильник', en: 'Luminaire', key: 'O' };
const ALL_TOOLS = [...TOOLS, ...PLANT_TOOLS, MARK_TOOL, START_TOOL, LIGHT_TOOL];
// Кольцо на пробеле — по часовой от верха. Растения — один пункт-свиток
// «Озеленение»: навёл — выпадает список, как у кнопки на линейке.
const GREENERY = { id: 'greenery', icon: 'sprout', ru: 'Озеленение', en: 'Greenery', key: 'L · T · I · Shift+B', children: PLANT_TOOLS };
// Прогулка в кольце: отпустил на пункте — он идёт (main), в свитке — «Старт».
const WALKING = { id: 'walking', icon: 'walk', ru: 'Прогулка', en: 'Walk', key: 'K', main: 'walk', children: [{ id: 'walk', icon: 'walk', ru: 'Идти', en: 'Go for a walk', key: '' }, START_TOOL] };
const PIE_GROUPS = [GREENERY, WALKING];
const PIE_ORDER = ['select', 'translate', 'rotate', 'scale', 'hand', 'greenery', 'luminaire', 'mark', 'walking'];

// Растения на линейке — одна кнопка: значок последнего растительного
// инструмента, клик раскрывает меню из трёх с подписями и клавишами.
function PlantToolGroup({ gizmo, tr }) {
    const [open, setOpen] = useState(false);
    const [last, setLast] = useState('bed');
    const ref = useRef(null);
    const active = PLANT_TOOLS.find((tool) => tool.id === gizmo?.tool);
    useEffect(() => { if (active) setLast(active.id); }, [active]);
    useEffect(() => {
        if (!open) return undefined;
        const away = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        const key = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key); };
    }, [open]);
    const shown = active ?? PLANT_TOOLS.find((tool) => tool.id === last);
    return <div ref={ref} className="focus-tool-group">
        <Button icon={shown.icon} className="focus-tool-group__button" label={tr('Растения — цветник, посадка, лиана, изгородь', 'Plants — bed, plant, climber, hedge')} aria-pressed={Boolean(active)} aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid="focus-tool-plants" />
        {open ? <div className="focus-tool-flyout focus-glass" role="menu">
            <header>{tr('Растения', 'Plants')}</header>
            {PLANT_TOOLS.map((tool) => <button key={tool.id} type="button" role="menuitemradio" aria-checked={gizmo?.tool === tool.id} onClick={() => { gizmo?.setTool?.(tool.id); setOpen(false); }} data-testid={`focus-tool-${tool.id}`}>
                <FocusIcon name={tool.icon} /><span>{tr(tool.ru, tool.en)}</span><kbd>{tool.key}</kbd>
            </button>)}
        </div> : null}
    </div>;
}

function Button({ icon, label, children, className = '', ...props }) {
    return <button type="button" className={`focus-button ${className}`} aria-label={label} data-focus-tip={label} {...props}>{icon ? <FocusIcon name={icon} /> : null}{children}</button>;
}

function Dialog({ title, children, onClose, className = '' }) {
    const ref = useRef(null);
    const { language } = useLanguage();
    useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
    return <dialog ref={ref} className={`focus-dialog ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}><header><h2>{title}</h2><Button icon="close" label={language === 'ru' ? 'Закрыть' : 'Close'} onClick={onClose} /></header>{children}</dialog>;
}

function useCatalog() {
    const { store } = useFocusControls();
    useSyncExternalStore(store.subscribe, store.version, store.version);
    return store.all();
}

function NodeSections({ group, node, catalogOnly = false, sectionProps }) {
    const { t } = useLanguage();
    // Folding (sectionFolds.js): after every render, and whenever a section
    // adds rows by itself, the headings get their keys and what they fold is hidden.
    const fold = useSectionFold(); const ref = useRef(null); const path = `${group.id}/${node.id}`;
    const folded = useRef(fold?.folded); folded.current = fold?.folded;
    useLayoutEffect(() => { if (fold && ref.current) applyFolds(ref.current, path, fold.folded); });
    useEffect(() => {
        if (!fold || !ref.current) return undefined;
        const observer = new MutationObserver(() => applyFolds(ref.current, path, folded.current));
        observer.observe(ref.current, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [fold, path]);
    const sections = <FocusControlScope path={path} groupLabel={t(`homeEditor.groups.${group.id}`)} nodeLabel={t(`homeEditor.nodes.${node.id}`)} catalogOnly={catalogOnly}>
        {sceneObjectsForNode(path).map(({ key }) => <CheckboxControl key={key} controlId={key} label={t(`homeEditor.controls.${key}`)} checked={Boolean(sectionProps.settings[key])} onChange={(event) => sectionProps.handleSettingChange(event, key, 'boolean')} testId={`home-editor-object-${key}`} />)}
        {node.aspects.map(({ id, Section }) => <React.Fragment key={id}>{node.aspects.length > 1 ? <SectionHeading label={t(`homeEditor.aspects.${id}`)} /> : null}<Section {...sectionProps} /></React.Fragment>)}
    </FocusControlScope>;
    return fold ? <div ref={ref} className="focus-sections">{sections}</div> : sections;
}

// Список клавиш один: он и в справке, и в окне настроек.
const shortcutRows = (tr) => [[tr('Поиск', 'Search'), '⌘ K'], [tr('Отменить / повторить параметр', 'Undo / redo parameter'), '⌘ Z / ⌘ ⇧ Z'], [tr('Снять выделение, инструмент «Выбор»', 'Deselect, Select tool'), tr('Пробел · щелчок мимо', 'Space · click empty')], [tr('Пауза', 'Pause'), tr('Shift + Пробел', 'Shift + Space')], [tr('Круг инструментов: повести мышь и отпустить', 'Tool ring: move the mouse and let go'), tr('держать Пробел', 'hold Space')], [tr('Выбор · перенос · поворот · масштаб · обзор', 'Select · move · rotate · scale · navigate'), 'V · G · R · S · H'], [tr('Материалы: выбор граней', 'Materials: select faces'), 'B'], [tr('Цветник · посадить · лиана · изгородь', 'Bed · plant · climber · hedge'), 'L · T · I · Shift+B'], [tr('Отметка уровня', 'Level mark'), 'M'], [tr('Старт прогулки: щелчок — где, протянуть — куда лицом', 'Walk start: click — where, drag — facing'), 'K'], [tr('Светильник: щелчок — где, протянуть — на что светит', 'Luminaire: click — where, drag — what it lights'), 'O'], [tr('Свободный полёт', 'Free flight'), 'W A S D Q E'], [tr('Скрыть / вернуть панели', 'Hide / show panels'), 'Tab'], [tr('Изменить число', 'Scrub value'), tr('ЛКМ ↔ · Shift точнее', 'LMB ↔ · Shift precise')], [tr('Меню объекта, камеры, параметра', 'Object, camera, parameter menu'), tr('ПКМ', 'RMB')], [tr('Цвет значка', 'Icon colour'), tr('ПКМ в списке', 'RMB in the list')], [tr('Отменить жест / вернуться к выбору', 'Cancel gesture / back to select'), 'Esc'],
    [tr('Модель SketchUp: зайти в группу · выйти', 'SketchUp model: into a group · out'), tr('двойной щелчок · Esc', 'double-click · Esc')], [tr('Модель SketchUp: добавить к выбору или убрать', 'SketchUp model: add to the selection or take out'), tr('Shift + щелчок', 'Shift + click')], [tr('Модель SketchUp: только открытая группа / всё', 'SketchUp model: only the open group / everything'), 'Q'], [tr('Удалить выбранное', 'Delete the selection'), 'Delete'],
    [tr('Играть на доске / стоп', 'Ride the board / stop'), 'P'], [tr('Доска: вес · гребок', 'Board: weight · paddle'), 'W S'], [tr('Доска: наклон', 'Board: lean'), 'A D'], [tr('Доска: присед', 'Board: crouch'), 'Shift'], [tr('Доска: встать · прыжок', 'Board: stand up · jump'), 'Space'], [tr('Доска: спрыгнуть (W A S D — куда) · залезть · взять под мышку · положить', 'Board: jump off (W A S D — where) · climb on · carry · put down'), 'F'], [tr('Доска: лиш — отстегнуть · пристегнуть', 'Board: leash — off · on'), 'L'], [tr('Доска: оглянуться', 'Board: look back'), tr('Q · средняя кнопка', 'Q · middle button')], [tr('Доска: камера', 'Board: camera'), 'C / 1–4'], [tr('Доска: обзор · ближе/дальше', 'Board: look · closer/further'), tr('тащить · колесо', 'drag · wheel')], [tr('Доска: на чекпоинт', 'Board: back to the checkpoint'), 'R'], [tr('Доска: поставить чекпоинт', 'Board: set the checkpoint'), 'T'], [tr('Доска: выйти', 'Board: leave'), 'Esc'],
    [tr('Доска: захватить мышь', 'Board: capture the mouse'), tr('клик', 'click')], [tr('Доска: наклон и вес', 'Board: lean and weight'), tr('мышь', 'mouse')], [tr('Доска: присед · гребок левой', 'Board: crouch · left stroke'), tr('ЛКМ', 'LMB')], [tr('Доска: хват канта · гребок правой', 'Board: rail grab · right stroke'), tr('ПКМ', 'RMB')], [tr('Доска: отпустить мышь', 'Board: release the mouse'), 'Esc'],
    [tr('Геймпад: наклон и вес', 'Gamepad: lean and weight'), tr('левый стик', 'left stick')], [tr('Геймпад: обзор', 'Gamepad: look'), tr('правый стик', 'right stick')], [tr('Геймпад: присед · гребок правой', 'Gamepad: crouch · right stroke'), 'RT'], [tr('Геймпад: хват канта · гребок левой', 'Gamepad: rail grab · left stroke'), 'LT'], [tr('Геймпад: встать · прыжок', 'Gamepad: stand up · jump'), 'A'], [tr('Геймпад: камера', 'Gamepad: camera'), 'Y'], [tr('Геймпад: оглянуться', 'Gamepad: look back'), 'LB'], [tr('Геймпад: на чекпоинт', 'Gamepad: back to the checkpoint'), 'View'], [tr('Геймпад: поставить чекпоинт', 'Gamepad: set the checkpoint'), tr('крестовина ↑', 'D-pad ↑')], [tr('Геймпад: выйти', 'Gamepad: leave'), 'Menu'],
    [tr('Прогулка: идти · бежать', 'Walk: go · run'), 'W A S D · Shift'], [tr('Прогулка: прыжок', 'Walk: jump'), tr('Пробел', 'Space')], [tr('Прогулка: от глаз / со стороны', 'Walk: first / third person'), 'C'], [tr('Прогулка: обзор · дальше/ближе', 'Walk: look · farther/closer'), tr('клик или тащить · колесо', 'click or drag · wheel')], [tr('Прогулка: старт здесь · на старт', 'Walk: start here · back to start'), 'T · R'], [tr('Прогулка: выйти', 'Walk: leave'), 'Esc'],
    [tr('Прогулка, геймпад: идти · обзор', 'Walk, gamepad: go · look'), tr('левый стик · правый стик', 'left stick · right stick')], [tr('Прогулка, геймпад: бежать · прыжок · вид · выйти', 'Walk, gamepad: run · jump · view · leave'), 'RT · A · Y · Menu'], [tr('Прогулка, геймпад: старт здесь · на старт', 'Walk, gamepad: start here · back to start'), tr('крестовина ↑ · View', 'D-pad ↑ · View')]];

// Окно настроек движка: слева разделы, справа те же секции, что и в инспекторе,
// — контролы регистрируются в том же каталоге, поиск и избранное их видят.
function SettingsDialog({ sectionProps, onClose }) {
    const { language, t } = useLanguage(); const tr = (ru, en) => language === 'ru' ? ru : en;
    const pages = SETTINGS_PAGES.filter((page) => import.meta.env.DEV || !page.devOnly);
    const [pageId, setPageId] = useState(pages[0].id);
    const page = pages.find((item) => item.id === pageId) ?? pages[0];
    return <Dialog title={tr('Настройки движка', 'Engine settings')} onClose={onClose} className="focus-dialog--wide">
        <div className="focus-settings">
            <nav className="focus-settings__nav" aria-label={tr('Разделы настроек', 'Settings sections')}>
                {pages.map((item) => <button key={item.id} type="button" aria-pressed={item.id === page.id} onClick={() => setPageId(item.id)}><FocusIcon name={item.icon} />{getFocusLabel(item, language)}</button>)}
            </nav>
            <div className="focus-settings__body focus-inspector-scroll">
                <h3>{getFocusLabel(page, language)}</h3>
                {page.id === 'keys'
                    ? <div className="focus-shortcuts">{shortcutRows(tr).map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
                    : page.paths.map((path) => { const { group, node } = resolveEditorPath(path, { includeDevOnly: import.meta.env.DEV }); return <React.Fragment key={path}>{page.paths.length > 1 ? <SectionHeading label={t(`homeEditor.nodes.${node.id}`)} /> : null}<NodeSections group={group} node={node} sectionProps={sectionProps} /></React.Fragment>; })}
                {page.id === 'editor' ? <p className="focus-settings__note">{tr('Настройки редактора живут в этом браузере и на сайт не попадают. Графика и плёнка — часть сцены: они сохраняются в камеру и уезжают в проект.', 'Editor preferences live in this browser and never reach the site. Graphics and film belong to the scene: they are stored per camera and go into the project.')}</p> : null}
            </div>
        </div>
    </Dialog>;
}

function SearchDialog({ onClose, onSelect, commands }) {
    const { t, language } = useLanguage(); const [query, setQuery] = useState(''); const [index, setIndex] = useState(0); const catalog = useCatalog();
    const source = useMemo(() => [
        ...ALL_NODES.filter(({ path }) => !isEditorNodeHidden(path)).map(({ group, node, path }) => ({ id: path, label: t(`homeEditor.nodes.${node.id}`), trail: t(`homeEditor.groups.${group.id}`), path, icon: getNodeIcon(node.id) })),
        ...catalog.map((item) => ({ ...item, trail: `${item.groupLabel} / ${item.nodeLabel}`, icon: getNodeIcon(item.path.split('/')[1]), field: true })),
        ...commands,
    ], [catalog, commands, t]);
    const matches = source.filter((item) => matchesSearch(`${item.label} ${item.trail || ''} ${item.controlId || ''}`, query)).slice(0, 60);
    const choose = (item) => { if (!item) return; onClose(); if (item.action) item.action(); else onSelect(item.path, item.field ? item.id : null); };
    return <Dialog title={language === 'ru' ? 'Поиск' : 'Search'} onClose={onClose}><div className="focus-search-input"><FocusIcon name="search" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} placeholder={language === 'ru' ? 'Объект, параметр или команда…' : 'Object, parameter or command…'} aria-label={language === 'ru' ? 'Поиск по функциям' : 'Search controls'} role="combobox" aria-expanded="true" aria-controls="focus-search-results" aria-activedescendant={matches.length ? `focus-result-${index}` : undefined} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); setIndex(next); document.getElementById(`focus-result-${next}`)?.scrollIntoView({ block: 'nearest' }); }
        if (event.key === 'Enter') { event.preventDefault(); choose(matches[index]); }
    }} /></div><div className="focus-search-results" id="focus-search-results" role="listbox">{matches.map((item, row) => <button id={`focus-result-${row}`} key={item.id} type="button" role="option" aria-selected={index === row} className={index === row ? 'is-active' : ''} onClick={() => choose(item)}><FocusIcon name={item.icon || 'sliders'} /><span>{item.label}<small>{item.trail}</small></span></button>)}{!matches.length ? <p>{language === 'ru' ? 'Ничего не найдено' : 'No results'}</p> : null}</div></Dialog>;
}

function InspectorContents({ selected, paramsTab, filter, sectionProps, pendingField, onFieldFound }) {
    const controls = useFocusControls(); const catalog = useCatalog(); const ref = useRef(null); const { language } = useLanguage();
    const filtered = catalog.filter((item) => (paramsTab === 'pinned' ? controls.pinnedIds.has(item.id) : item.path === selected.path) && matchesSearch(`${item.label} ${item.nodeLabel} ${item.controlId || ''}`, filter));
    // Which section headings are folded, remembered in this browser.
    const [folded, setFolded] = useState(loadFolds);
    const fold = useMemo(() => ({
        folded,
        toggle(key) {
            if (!key) return;
            setFolded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); saveFolds(next); return next; });
        },
    }), [folded]);
    useLayoutEffect(() => {
        if (!pendingField || !ref.current) return;
        const row = [...ref.current.querySelectorAll('[data-focus-control-id]')].find((item) => item.dataset.focusControlId === pendingField);
        if (!row) return;
        // A field found in a folded section opens it first, and is shown on the next pass.
        const hiding = foldsHiding(row);
        if (hiding.length) { setFolded((current) => { const next = new Set(current); hiding.forEach((key) => next.delete(key)); saveFolds(next); return next; }); return; }
        let parent = row.parentElement; while (parent && parent !== ref.current) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
        row.scrollIntoView({ block: 'center' }); row.classList.add('focus-field-found'); row.querySelector('input,select')?.focus({ preventScroll: true }); onFieldFound();
    }, [pendingField, selected.path, onFieldFound, catalog, folded]);
    return <div ref={ref} className="focus-inspector-scroll" data-testid="focus-inspector-scroll">{paramsTab === 'pinned' || filter ? <>{filtered.map((item, index) => <React.Fragment key={item.id}>{paramsTab === 'pinned' && (index === 0 || filtered[index - 1].path !== item.path) ? <h4 className="home-editor-section-heading">{item.nodeLabel}</h4> : null}<RegisteredFocusControl id={item.id} /></React.Fragment>)}{!filtered.length ? <p className="focus-empty">{language === 'ru' ? 'Наведите на параметр и закрепите звёздочкой.' : 'Hover a parameter and pin it with the star.'}</p> : null}</> : selected.node.id === 'camera' ? <FocusCameraManager settings={sectionProps.settings} layoutEditor={sectionProps.layoutEditor} /> : <SectionFoldContext.Provider value={fold}><NodeSections group={selected.group} node={selected.node} sectionProps={sectionProps} /></SectionFoldContext.Provider>}</div>;
}

function FocusTooltip() {
    const [tip, setTip] = useState(null);
    useEffect(() => {
        let timer;
        const hide = () => { clearTimeout(timer); setTip(null); };
        // A «?» is asked on purpose and answers at once; a description can run to
        // a few lines, so near the bottom of the window the tip hangs above its
        // anchor by its own bottom edge, whatever its height.
        const show = (event) => {
            const target = event.target.closest?.('[data-focus-tip]'); hide();
            if (!target || !target.dataset.focusTip) return;
            const quick = 'focusTipQuick' in target.dataset;
            timer = setTimeout(() => { const r = target.getBoundingClientRect(); const above = r.bottom > innerHeight - (quick ? 150 : 95); setTip({ text: target.dataset.focusTip, x: Math.max(8, Math.min(innerWidth - 274, r.left)), top: above ? undefined : r.bottom + 8, bottom: above ? innerHeight - r.top + 8 : undefined }); }, quick ? 120 : 600);
        };
        document.addEventListener('mouseover', show); document.addEventListener('mouseout', hide); document.addEventListener('focusin', show); document.addEventListener('focusout', hide); document.addEventListener('pointerdown', hide); document.addEventListener('scroll', hide, true);
        return () => { hide(); document.removeEventListener('mouseover', show); document.removeEventListener('mouseout', hide); document.removeEventListener('focusin', show); document.removeEventListener('focusout', hide); document.removeEventListener('pointerdown', hide); document.removeEventListener('scroll', hide, true); };
    }, []);
    return tip ? <div role="tooltip" className="focus-tooltip" style={{ left: tip.x, top: tip.top, bottom: tip.bottom }}>{tip.text}</div> : null;
}

function FocusShell(props) {
    const { settings, activeTab, setActiveTab, layoutEditor: cameraEditor, gizmo, history, onPublish, onDeploy, onAdoptPublished, publishState, hasPublishChanges, publishEnabled, publishHint, playing = false, onPlay, onWalk } = props;
    const layoutEditor = { ...cameraEditor,
        onFovChange: (value) => history.recordChange([`layouts.${cameraEditor.selectedKey}.cameraFov`, `layouts.${cameraEditor.selectedKey}.customized`], () => cameraEditor.onFovChange(value)),
        onFrameInsetChange: (value) => history.recordChange([`layouts.${cameraEditor.selectedKey}.frameInset`, `layouts.${cameraEditor.selectedKey}.customized`], () => cameraEditor.onFrameInsetChange(value)),
        updateSlideshow: (patch) => history.recordChange(Object.keys(patch).map((key) => `slideshow.${key}`), () => cameraEditor.updateSlideshow(patch)),
    };
    const { language, setLanguage, t } = useLanguage(); const tr = (ru, en) => language === 'ru' ? ru : en;
    const [stored] = useState(readUi); const [width, setWidth] = useState(() => Math.min(420, Math.max(280, stored.width || 304)));
    const [collapsed, setCollapsed] = useState(Boolean(stored.collapsed)); const [navOpen, setNavOpen] = useState(false); const [compassPlace, setCompassPlace] = useCompassPlace(); const [treeQuery, setTreeQuery] = useState('');
    const [filter, setFilter] = useState(''); const [paramsTab, setParamsTab] = useState('all'); const [pendingField, setPendingField] = useState(null);
    const [stripOpen, setStripOpen] = useState(stored.stripOpen !== false); const [focus, setFocus] = useState(false); const [preview, setPreview] = useState(false);
    const [modal, setModal] = useState(null); const [viewsOpen, setViewsOpen] = useState(false); const grip = useRef(null); const resize = useRef(null); const lastNodes = useRef({});
    // Окно текстуры не модальное: живёт рядом с диалогами, модель под ним крутится.
    const materialEditor = props.materialEditor;
    // Riding the board hides the chrome the way Tab does; the ride has its own HUD and exit.
    const hidden = focus || preview || playing;
    // Чёрная рамка — это то, как кадр обрежется на сайте; полупрозрачная показывает,
    // что осталось за кадром. Настройка вида, живёт рядом с шириной панели.
    const [solidFrame, setSolidFrame] = useState(stored.solidFrame === true); const [rowMenu, setRowMenu] = useState(null);
    const controls = useFocusControls(); const colors = useFocusIconColors(); const palette = useFocusColorPalette();
    const selected = resolveEditorPath(activeTab, { includeDevOnly: import.meta.env.DEV }); const domain = getFocusDomain(selected.path);
    const groups = getFocusGroups(domain.id, { includeDevOnly: import.meta.env.DEV });
    const currentCamera = layoutEditor.activeWorkCameraId ? layoutEditor.workCameras.find((camera) => camera.id === layoutEditor.activeWorkCameraId) : layoutEditor.cameras.find((camera) => camera.id === layoutEditor.activeCameraId);
    const localScope = selected.group.id === 'editor'; const globalScope = selected.group.id === 'audio';
    const sectionProps = { settings, handleSettingChange: props.handleSettingChange, applySettings: props.applySettings, layoutEditor, audioLab: props.audioLab, topiaryEditor: props.topiaryEditor, placedEditor: props.placedEditor, plantingEditor: props.plantingEditor, annotationEditor: props.annotationEditor, lightingEditor: props.lightingEditor, gizmo: props.gizmo, editorTree: EDITOR_TREE };
    const brief = useBrief(props.project?.id).brief; const awaiting = brief ? briefCounts(brief).review : 0;
    useEffect(() => {
        try { localStorage.setItem(UI_KEY, JSON.stringify({ width, collapsed, stripOpen, solidFrame, pinnedIds: [...controls.pinnedIds], path: selected.path })); } catch { /* local UI only */ }
    }, [width, collapsed, stripOpen, solidFrame, controls.pinnedIds, selected.path]);
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.focusEditor = 'true'; root.dataset.focusPreview = String(preview && !playing); root.dataset.focusCanvas = String(focus || playing); root.dataset.focusFrame = solidFrame ? 'solid' : 'soft';
        root.style.setProperty('--focus-inspector-width', `${width}px`); root.style.setProperty('--focus-panel-space', collapsed || hidden ? '0px' : `${width}px`);
        root.style.setProperty('--focus-rail-space', hidden ? '0px' : '42px');
        return () => { delete root.dataset.focusEditor; delete root.dataset.focusPreview; delete root.dataset.focusCanvas; delete root.dataset.focusFrame; ['--focus-inspector-width', '--focus-panel-space', '--focus-rail-space'].forEach((name) => root.style.removeProperty(name)); };
    }, [width, collapsed, focus, preview, playing, hidden, solidFrame]);
    // A row menu or the icon palette would float over the ride and take its first Esc.
    const closePalette = palette.close;
    useEffect(() => { if (playing) { setRowMenu(null); closePalette(); } }, [playing, closePalette]);
    useEffect(() => { if (stored.path) setActiveTab(resolveEditorPath(stored.path, { includeDevOnly: import.meta.env.DEV }).path); }, [stored.path, setActiveTab]);
    const selectNode = useCallback((path, field = null) => {
        const next = resolveEditorPath(path, { includeDevOnly: import.meta.env.DEV }); lastNodes.current[getFocusDomain(next.path).id] = next.path;
        setActiveTab(next.path); setNavOpen(false); setCollapsed(false); setFilter(''); setTreeQuery(''); setParamsTab('all'); setPendingField(field); setFocus(false);
        gizmo?.setTool?.(gizmo.lastTransform ?? 'translate');
    }, [setActiveTab, gizmo]);
    const selectDomain = (item) => {
        if (item.dialog) { setModal(item.dialog); setNavOpen(false); return; }
        const nextGroups = getFocusGroups(item.id, { includeDevOnly: import.meta.env.DEV }); const hasTree = nextGroups.reduce((total, group) => total + group.nodes.length, 0) > 1;
        if (item.id === domain.id) { setNavOpen(hasTree && !navOpen); setCollapsed(false); return; }
        selectNode(lastNodes.current[item.id] || `${nextGroups[0].id}/${nextGroups[0].nodes[0].id}`); setNavOpen(hasTree);
    };
    useEffect(() => {
        const keyboard = (event) => {
            if (playing || event.defaultPrevented || event.target.closest?.('dialog')) return;
            if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') { event.preventDefault(); setModal('search'); return; }
            if (textTarget(event.target)) return;
            if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? history?.redo() : history?.undo(); }
            if (event.key === '?') { event.preventDefault(); setModal('help'); }
            if (event.key === 'Escape') { setNavOpen(false); setViewsOpen(false); }
            if (event.key === 'Tab' && !event.target.closest?.('button,a,summary,[role=separator]')) { event.preventDefault(); setFocus((value) => !value); }
        };
        document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
    }, [history, playing]);
    // ПКМ принадлежит редактору, а не браузеру: «Копировать изображение» поверх
    // ленты камер — не то меню. Строка параметра получает своё, поля ввода
    // сохраняют родное (там нужна вставка), остальное просто гасится. Меню
    // вьюпорта приходит из сцены через gizmo — там нужен луч, а не DOM.
    useEffect(() => {
        const menu = (event) => {
            // Shift — запасной выход к родному меню браузера: «Сохранить
            // изображение» у миниатюры камеры иначе не достать.
            if (event.defaultPrevented || event.shiftKey) return;
            const row = event.target.closest?.('[data-focus-control-id]');
            if (row) {
                event.preventDefault();
                setRowMenu({ x: event.clientX, y: event.clientY, id: row.dataset.focusControlId, label: row.querySelector('label')?.textContent ?? '' });
                return;
            }
            if (event.target.closest?.('textarea,[contenteditable=true],input:not([type=range]):not([type=checkbox]):not([type=color])')) return;
            event.preventDefault();
        };
        document.addEventListener('contextmenu', menu); return () => document.removeEventListener('contextmenu', menu);
    }, []);
    const endResize = (event, cancel = false) => {
        const current = resize.current; if (!current) return; resize.current = null;
        if (cancel) setWidth(current.width); else if (!current.moved) setCollapsed(true);
        try { event.currentTarget.releasePointerCapture(current.pointerId); } catch { /* capture ended */ }
    };
    const onFieldFound = useCallback(() => setPendingField(null), []);
    // Короткий пробел — как в SketchUp: инструмент «Выбор», выделение снято;
    // долгий — круг инструментов (FocusToolPie); пауза — Shift + пробел.
    const selectionState = useRef(); selectionState.current = gizmo;
    const clearSelection = useCallback(() => { selectionState.current?.clearSelection?.(); selectionState.current?.setTool?.('select'); }, []);
    // Меню вьюпорта. Попадание пришло лучом, поэтому здесь только пункты: что
    // делать с объектом под курсором, а на пустом месте — как смотреть сцену.
    const sceneMenuItems = (hit) => {
        const target = hit.node ? resolveEditorPath(hit.node, { includeDevOnly: import.meta.env.DEV }) : null;
        const objects = target ? sceneObjectsForNode(target.path) : [];
        const visible = objects.every(({ key }) => settings[key] !== false);
        // Манипулятор предлагается только тому объекту, который уже выбран:
        // правило «что можно двигать» живёт в HomeEdit и второй копии не заводит.
        const holding = Boolean(gizmo?.movable) && selected.path === target?.path;
        // Часть модели SketchUp под курсором — та, что выбрал бы щелчок; если
        // она в выборе с Shift — пункты для всего выбора.
        const modelPart = hit.placedId && hit.object ? props.placedEditor?.partAt?.(hit.placedId, hit.object) : null;
        const chosen = modelPart && props.placedEditor.part?.id === hit.placedId ? selectedNodes(props.placedEditor.part) : [];
        const many = chosen.length > 1 && chosen.includes(modelPart.node) ? chosen : null;
        return [
            target ? { label: tr('Открыть параметры', 'Open parameters'), icon: 'sliders', onSelect: () => selectNode(target.path) } : null,
            target ? { label: tr('Детали объекта…', 'Parts of this object…'), icon: 'folder', onSelect: () => setModal({ kind: 'presets', path: target.path, label: t(`homeEditor.nodes.${target.node.id}`) }) } : null,
            hit.placedId && hit.object?.isMesh ? { label: tr('Материалы… · B', 'Materials… · B'), icon: 'grid', onSelect: () => materialEditor?.open(hit) } : null,
            many ? { label: tr(`Скрыть выбранные · ${many.length}`, `Hide selected · ${many.length}`), icon: 'eyeoff', onSelect: () => props.placedEditor.hideParts(hit.placedId, many) }
                : modelPart ? { label: tr(`Скрыть «${modelPart.name}»`, `Hide “${modelPart.name}”`), icon: 'eyeoff', onSelect: () => props.placedEditor.hideParts(hit.placedId, [modelPart.node]) } : null,
            !many && modelPart?.copies.length > 1 ? { label: tr(`Скрыть все такие · ${modelPart.copies.length}`, `Hide all copies · ${modelPart.copies.length}`), icon: 'eyeoff', onSelect: () => props.placedEditor.hideParts(hit.placedId, modelPart.copies) } : null,
            many ? { label: tr(`Удалить выбранные · ${many.length}`, `Delete selected · ${many.length}`), icon: 'trash', hint: 'Del', onSelect: () => props.placedEditor.removeParts(hit.placedId, many) }
                : modelPart ? { label: tr(`Удалить «${modelPart.name}»`, `Delete “${modelPart.name}”`), icon: 'trash', hint: 'Del', onSelect: () => props.placedEditor.removeParts(hit.placedId, [modelPart.node]) } : null,
            hit.lightingFixture ? { label: tr('Удалить светильник', 'Delete luminaire'), icon: 'trash', hint: 'Del', onSelect: () => props.lightingEditor?.remove(hit.lightingFixture) } : null,
            hit.lightingPanel ? { label: tr('Удалить щиток и его цепи', 'Delete panel and its circuits'), icon: 'trash', hint: 'Del', onSelect: () => props.lightingEditor?.removePanel(hit.lightingPanel) } : null,
            hit.root ? { label: tr('Смотреть на объект', 'Frame object'), icon: 'target', onSelect: () => layoutEditor.frameObject?.(hit.root) } : null,
            hit.root ? { label: tr('Смотреть сверху', 'Frame from above'), icon: 'camera', onSelect: () => layoutEditor.frameObject?.(hit.root, { above: true }) } : null,
            ...(holding ? GIZMO_MODES.filter((mode) => gizmoAllows(gizmo.movable, mode)).map((mode) => ({
                label: t(`homeEditor.gizmo.${mode}`), icon: mode === 'translate' ? 'move' : mode, hint: { translate: 'G', rotate: 'R', scale: 'S' }[mode],
                checked: gizmo.tool === mode, onSelect: () => gizmo.setTool(mode),
            })) : []),
            objects.length ? { label: visible ? tr('Скрыть объект', 'Hide object') : tr('Показать объект', 'Show object'), icon: visible ? 'eyeoff' : 'eye', onSelect: () => props.applySettings(Object.fromEntries(objects.map(({ key }) => [key, !visible]))) } : null,
            // Небо накрывает сцену куполом, поэтому «пустого места» во вьюпорте
            // почти не бывает: показ кадра нужен в меню всегда, а не в отдельной ветке.
            '-',
            { label: tr('Выбор', 'Select'), icon: 'cursor', hint: 'V', checked: gizmo?.tool === 'select', onSelect: () => gizmo?.setTool?.('select') },
            { label: tr('Только обзор', 'Navigate only'), icon: 'hand', hint: 'H', checked: gizmo?.tool === 'hand', onSelect: () => { gizmo?.setTool?.('hand'); document.querySelector('.home-editor-render-frame canvas')?.focus({ preventScroll: true }); } },
            { label: tr('Чёрная рамка кадра', 'Solid frame mask'), icon: 'desktop', checked: solidFrame, onSelect: () => setSolidFrame((value) => !value) },
            { label: tr('Посмотреть кадр сайта', 'Preview site framing'), icon: 'eye', onSelect: () => setPreview(true) },
        ];
    };
    const commands = [{ id: 'command:trace', label: tr('Трассировка', 'Path tracing'), icon: 'sun', action: () => setModal('trace') }, { id: 'command:save', label: props.project ? tr('На заглавную', 'To the home page') : tr('В проект', 'Save to project'), icon: 'upload', action: () => setModal('save') }, { id: 'command:presets', label: tr('Детали объекта', 'Parts of this object'), icon: 'folder', action: () => setModal({ kind: 'presets', path: selected.path, label: t(`homeEditor.nodes.${selected.node.id}`) }) }, { id: 'command:settings', label: tr('Настройки движка', 'Engine settings'), icon: 'settings', action: () => setModal('settings') }, { id: 'command:help', label: tr('Горячие клавиши', 'Keyboard shortcuts'), icon: 'help', action: () => setModal('help') }, ...(onPlay ? [{ id: 'command:play', label: tr('Играть на доске', 'Ride the board'), trail: 'P', icon: 'water', action: onPlay }] : []), ...(onWalk ? [{ id: 'command:walk', label: tr('Прогулка по проекту', 'Walk the project'), icon: 'walk', action: onWalk }] : [])];
    const nodeTarget = { kind: 'node', path: selected.path, label: t(`homeEditor.nodes.${selected.node.id}`) };
    return <div className={`focus-editor ${hidden ? 'focus-editor--hidden' : ''} ${navOpen ? 'focus-editor--nav-open' : ''}`}>
        <header className="focus-topbar"><div className="focus-brand"><svg viewBox="243 157 535 535" aria-hidden="true"><image href={logo} width="1536" height="1024" /></svg><span>OUROBOROS<small>ENGINE {version}</small></span></div>{props.project
            ? <button type="button" className="focus-project-label focus-project-label--link" onClick={async () => { if (await flushProjectSave()) window.location.href = '/engine'; }} data-focus-tip={tr('К списку проектов', 'Back to the project list')}><FocusIcon name="folder" />{props.project.name}</button>
            : <span className="focus-project-label">{tr('Редактор сцены', 'Scene editor')}</span>}<span className="focus-saved" data-focus-tip={tr('Настройки автоматически сохраняются в этом браузере.', 'Settings are saved automatically in this browser.')}>●</span><span className="focus-separator" /><Button icon="undo" label={tr('Отменить · ⌘Z', 'Undo · ⌘Z')} disabled={!history?.canUndo} onClick={history?.undo} data-testid="focus-undo" /><Button icon="redo" label={tr('Повторить · ⌘⇧Z', 'Redo · ⌘⇧Z')} disabled={!history?.canRedo} onClick={history?.redo} data-testid="focus-redo" /><span className="focus-spacer" /><span className="focus-active-camera" data-focus-tip={layoutEditor.activeWorkCameraId ? tr('Рабочий снимок — только локально', 'Working snapshot — local only') : tr('Сцена входит в проект', 'Scene is included in the project')}><FocusIcon name={layoutEditor.activeWorkCameraId ? 'lock' : 'camera'} />{currentCamera?.name}</span><div className="focus-formats">{['desktop', 'portrait'].map((key) => <Button key={key} icon={key === 'desktop' ? 'desktop' : 'mobile'} label={key === 'desktop' ? 'Desktop' : 'Mobile'} aria-pressed={layoutEditor.selectedKey === key} onClick={() => layoutEditor.setSelectedKey(key)} data-testid={`home-editor-camera-variant-${key}`} />)}</div><Button icon={settings.animationPaused ? 'play' : 'pause'} label={tr('Пауза / продолжить · Shift + Пробел', 'Pause / play · Shift + Space')} onClick={() => props.handleSettingChange({ target: { checked: !settings.animationPaused } }, 'animationPaused', 'boolean')} /><Button icon="eye" label={tr('Посмотреть кадр сайта', 'Preview site framing')} onClick={() => setPreview(true)} /><Button className="focus-play" icon="water" label={onPlay ? tr('Играть на доске · P', 'Ride the board · P') : tr('Играть на доске — нужна вода', 'Ride the board — needs the water')} onClick={onPlay} disabled={!onPlay} data-testid="focus-play">{tr('Играть', 'Play')}</Button><Button className="focus-play" icon="walk" label={tr('Прогулка по проекту: от глаз или со стороны', 'Walk the project: first or third person')} onClick={onWalk} disabled={!onWalk} data-testid="focus-walk">{tr('Прогулка', 'Walk')}</Button><span className="focus-separator" />{props.project
                ? <Button icon="undo" label={tr('История проекта: вернуть прежнюю версию', 'Project history: restore an earlier version')} onClick={() => setModal('history')} data-testid="home-editor-project-history" />
                : <Button icon="undo" label={t('homeEditor.publish.adoptHint')} onClick={() => setModal('revert')} data-testid="home-editor-adopt-published" />}<Button className="focus-primary" label={tr('Сохранить сцены в проект', 'Save scenes to project')} onClick={() => setModal('save')} disabled={!publishEnabled || publishState?.busy || !hasPublishChanges} data-testid="home-editor-publish">{tr('В проект', 'Save')}</Button><Button label={tr('Опубликовать на сайте', 'Publish to website')} onClick={() => setModal('publish')} disabled={!publishEnabled || publishState?.busy} data-testid="home-editor-deploy">{tr('На сайт', 'Publish')}<FocusIcon name="chevron" /></Button>{compassPlace.mode === 'topbar' ? <NorthCompass settings={settings} applySettings={props.applySettings} tr={tr} place={compassPlace} onPlace={setCompassPlace} variant="topbar" /> : null}</header>
        <nav className="focus-rail" aria-label={tr('Рабочие области', 'Workspaces')}>{FOCUS_DOMAINS.filter((item) => item.dialog || getFocusGroups(item.id, { includeDevOnly: import.meta.env.DEV }).length).map((item) => <Button key={item.id} icon={item.icon} label={item.id === 'project' && awaiting ? `${getFocusLabel(item, language)} · ${tr('ждут проверки', 'awaiting review')}: ${awaiting}` : getFocusLabel(item, language)} aria-pressed={item.dialog ? modal === item.dialog : item.id === domain.id} onClick={() => selectDomain(item)} data-testid={`focus-domain-${item.id}`}>{item.id === 'project' && awaiting ? <small className="focus-rail-badge">{awaiting}</small> : null}</Button>)}<span className="focus-spacer" /><Button icon="search" label={tr('Поиск · ⌘K', 'Search · ⌘K')} onClick={() => setModal('search')} /><Button icon="help" label={tr('Горячие клавиши · ?', 'Keyboard shortcuts · ?')} onClick={() => setModal('help')} /></nav>
        {navOpen ? <aside className="focus-navigator"><header>{getFocusLabel(domain, language)}<span className="focus-spacer" /><Button icon="close" label={tr('Закрыть список', 'Close list')} onClick={() => setNavOpen(false)} /></header><div className="focus-tree-search"><FocusIcon name="search" /><input value={treeQuery} onChange={(event) => setTreeQuery(event.target.value)} aria-label={tr('Фильтр объектов', 'Filter objects')} placeholder={tr('Объекты…', 'Objects…')} /></div><div className="focus-tree-scroll">{groups.map((group) => <details key={group.id} open><summary onContextMenu={(event) => palette.open(event, { kind: 'group', groupId: group.id, label: t(`homeEditor.groups.${group.id}`) })} data-focus-tip={tr('ПКМ — цвет группы', 'Right click — group colour')}><FocusIcon name="folder" style={{ color: colors.groupColor(group.id) }} />{t(`homeEditor.groups.${group.id}`)}</summary>{group.nodes.filter((node) => matchesSearch(t(`homeEditor.nodes.${node.id}`), treeQuery)).map((node) => {
            const path = `${group.id}/${node.id}`; const objects = sceneObjectsForNode(path); const visible = objects.every(({ key }) => settings[key] !== false);
            // Включён, но его нет: без чего-то он не бывает (чайки без воды). Глаз
            // показывает это и говорит почему; клик по-прежнему двигает свой выключатель.
            const blockedBy = visible ? objects.flatMap((object) => sceneObjectBlockedBy(settings, object)) : [];
            const eyeTip = blockedBy.length ? tr(`Нет: выключено — ${blockedBy.map((item) => t(`homeEditor.nodes.${item.node.split('/')[1]}`)).join(', ')}`, `Absent: needs ${blockedBy.map((item) => t(`homeEditor.nodes.${item.node.split('/')[1]}`)).join(', ')}`) : tr('Видимость объекта', 'Object visibility');
            return <div key={path} className={`focus-tree-row ${selected.path === path ? 'is-active' : ''} ${blockedBy.length ? 'is-blocked' : ''}`}><button type="button" onClick={() => selectNode(path)} onContextMenu={(event) => palette.open(event, { kind: 'node', path, label: t(`homeEditor.nodes.${node.id}`) })} data-testid={`home-editor-tab-${node.id}`}><FocusIcon name={getNodeIcon(node.id)} style={{ color: colors.colorFor(path) }} /><span>{t(`homeEditor.nodes.${node.id}`)}</span></button>{objects.length ? <Button className="focus-tree-eye" icon={visible && !blockedBy.length ? 'eye' : 'eyeoff'} label={eyeTip} onClick={() => props.applySettings(Object.fromEntries(objects.map(({ key }) => [key, !visible])))} /> : null}</div>;
        })}</details>)}</div></aside> : null}
        {!collapsed ? <aside className="focus-inspector" id="focus-inspector" style={{ '--home-editor-heading-color': settings.editorHeadingColor }}><div ref={grip} className="focus-resize" role="separator" tabIndex="0" aria-label={tr('Ширина инспектора', 'Inspector width')} aria-orientation="vertical" aria-valuenow={width} aria-valuemin="280" aria-valuemax="420" data-focus-tip={tr('Клик — свернуть. Потяните край — ширина.', 'Click to collapse. Drag to resize.')} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); resize.current = { pointerId: event.pointerId, x: event.clientX, width, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const current = resize.current; if (!current) return; const delta = current.x - event.clientX; if (!current.moved && Math.abs(delta) < 4) return; current.moved = true; setWidth(Math.max(280, Math.min(420, current.width + delta))); }} onPointerUp={endResize} onPointerCancel={(event) => endResize(event, true)} onLostPointerCapture={(event) => endResize(event, true)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth((value) => Math.max(280, Math.min(420, value + (event.key === 'ArrowLeft' ? 10 : -10)))); } if (event.key === 'Enter') setCollapsed(true); }} /><div className="focus-inspector-head"><div className="focus-breadcrumb">{getFocusLabel(domain, language)}{getFocusLabel(domain, language) !== t(`homeEditor.groups.${selected.group.id}`) ? <><FocusIcon name="right" />{t(`homeEditor.groups.${selected.group.id}`)}</> : null}</div><div className="focus-object-title"><Button className="focus-object-icon" icon={getNodeIcon(selected.node.id)} label={tr('Цвет значка', 'Icon colour')} onClick={(event) => palette.open(event, nodeTarget)} onContextMenu={(event) => palette.open(event, nodeTarget)} style={{ color: colors.colorFor(selected.path) }} /><h1>{t(`homeEditor.nodes.${selected.node.id}`)}</h1></div><div className="focus-scope"><FocusIcon name={globalScope ? 'sound' : localScope ? 'settings' : layoutEditor.activeWorkCameraId ? 'lock' : 'camera'} /><span>{globalScope ? tr('Общий звук', 'Global audio') : localScope ? tr('Локальные настройки', 'Local preferences') : layoutEditor.activeWorkCameraId ? tr('Локальный снимок', 'Local snapshot') : tr('Сцена в проекте', 'Project scene')}</span>{!localScope && !globalScope ? <FocusControlScope path="cameras/camera" nodeLabel={t('homeEditor.nodes.camera')}><RangeControl controlId="cameraFov" label="FOV" value={layoutEditor.layouts?.[layoutEditor.selectedKey]?.cameraFov ?? settings.cameraFov} min={15} max={HOME_SCENE_CAMERA_FOV_MAX} step={0.1} unit="°" onChange={(event) => layoutEditor.onFovChange(Number(event.target.value))} testId="focus-camera-fov" /></FocusControlScope> : null}</div></div>{selected.node.workspace ? null : <div className="focus-inspector-tabs"><button type="button" className={paramsTab === 'all' ? 'is-active' : ''} onClick={() => setParamsTab('all')}>{tr('Параметры', 'Parameters')}</button><button type="button" className={paramsTab === 'pinned' ? 'is-active' : ''} onClick={() => setParamsTab('pinned')}><FocusIcon name="star" />{tr('Избранное', 'Favorites')}{controls.pinnedIds.size ? <small>{controls.pinnedIds.size}</small> : null}</button></div>}{!selected.node.workspace && (selected.node.id !== 'camera' || paramsTab === 'pinned') ? <div className="focus-parameter-search"><FocusIcon name="search" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={tr('Найти параметр…', 'Find parameter…')} aria-label={tr('Найти параметр', 'Find parameter')} /></div> : null}<InspectorContents selected={selected} paramsTab={paramsTab} filter={filter} sectionProps={sectionProps} pendingField={pendingField} onFieldFound={onFieldFound} /><footer><span className="focus-spacer" /><button type="button" onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')} aria-label={tr('Сменить язык', 'Change language')}>{language.toUpperCase()}<FocusIcon name="chevron" /></button></footer></aside> : null}
        <Button className={`focus-panel-tab ${collapsed ? 'is-collapsed' : ''}`} icon="right" label={collapsed ? tr('Развернуть инспектор', 'Expand inspector') : tr('Свернуть инспектор', 'Collapse inspector')} aria-expanded={!collapsed} aria-controls="focus-inspector" onClick={() => setCollapsed((value) => !value)} />
        <div className="focus-stage-toolbar"><div className="focus-glass"><Button label={t('homeEditor.controls.technicalFrames')} onClick={() => setViewsOpen((value) => !value)}><FocusIcon name="camera" />{tr('Виды', 'Views')}<FocusIcon name="chevron" /></Button>{viewsOpen ? <FocusTechnicalViews settings={settings} layoutEditor={layoutEditor} frame={{ solid: solidFrame, toggle: () => setSolidFrame((value) => !value) }} /> : null}</div><span className="focus-spacer" />{!compassPlace.mode ? <NorthCompass settings={settings} applySettings={props.applySettings} tr={tr} place={compassPlace} onPlace={setCompassPlace} /> : null}<span className="focus-spacer" /></div>
        {compassPlace.mode === 'float' ? <NorthCompass settings={settings} applySettings={props.applySettings} tr={tr} place={compassPlace} onPlace={setCompassPlace} /> : null}
        <div className="focus-stage-tools focus-glass" role="toolbar" aria-label={tr('Инструменты', 'Tools')}>
            {TOOLS.map((item) => <React.Fragment key={item.id}>
                {item.id === 'hand' ? <>
                    <PlantToolGroup gizmo={gizmo} tr={tr} />
                    <Button icon={MARK_TOOL.icon} label={`${tr('Отметка уровня', 'Level mark')} · ${MARK_TOOL.key}`} aria-pressed={gizmo?.tool === MARK_TOOL.id} onClick={() => gizmo?.setTool?.(MARK_TOOL.id)} data-testid="focus-tool-mark" />
                    <Button icon={START_TOOL.icon} label={`${tr('Старт прогулки', 'Walk start')} · ${START_TOOL.key}`} aria-pressed={gizmo?.tool === START_TOOL.id} onClick={() => gizmo?.setTool?.(START_TOOL.id)} data-testid="focus-tool-start" />
                    {props.project?.kind === 'design' ? <Button icon={LIGHT_TOOL.icon} label={`${tr('Светильник', 'Luminaire')} · ${LIGHT_TOOL.key}`} aria-pressed={gizmo?.tool === LIGHT_TOOL.id} onClick={() => props.lightingEditor?.begin()} data-testid="focus-tool-luminaire" /> : null}
                </> : null}
                <Button icon={item.icon} label={`${tr(item.ru, item.en)} · ${item.key}`} aria-pressed={gizmo?.tool === item.id} disabled={item.transform && !gizmoAllows(gizmo?.movable, item.id)} onClick={() => { gizmo?.setTool?.(item.id); if (item.id === 'hand') document.querySelector('.home-editor-render-frame canvas')?.focus({ preventScroll: true }); }} data-testid={`focus-tool-${item.id}`} />
            </React.Fragment>)}
            <hr />
            <Button icon="panel" label={tr('Список объектов', 'Object list')} aria-pressed={navOpen} onClick={() => { setNavOpen((value) => !value); setCollapsed(false); }} data-testid="focus-tool-list" />
        </div>
        <div className="focus-film-area">{stripOpen ? <FocusCameraStrip layoutEditor={layoutEditor} /> : null}<Button className="focus-film-toggle focus-glass" icon="camera" label={tr('Лента камер', 'Camera film strip')} aria-expanded={stripOpen} onClick={() => setStripOpen((value) => !value)}>{tr('Камеры', 'Cameras')}<FocusIcon name="chevron" /></Button></div>
        <footer className="focus-statusbar"><span>{t(`homeEditor.groups.${selected.group.id}`) === t(`homeEditor.nodes.${selected.node.id}`) ? t(`homeEditor.nodes.${selected.node.id}`) : `${t(`homeEditor.groups.${selected.group.id}`)} / ${t(`homeEditor.nodes.${selected.node.id}`)}`}</span><span className="focus-spacer" />{props.project ? <span role="status" data-testid="project-save-status" title={props.projectSaveStatus?.error ?? ''}>{
            props.projectSaveStatus?.phase === 'error' ? tr('Не сохранено · правки остаются в этом браузере', 'Not saved · edits remain in this browser')
                : props.projectSaveStatus?.phase === 'recovery-error' ? tr('Нет копии восстановления · не закрывайте окно', 'Recovery unavailable · keep this window open')
                    : props.projectSaveStatus?.phase === 'saving' ? tr('Сохраняется…', 'Saving…')
                        : props.projectSaveStatus?.phase === 'pending' ? tr('Есть несохранённые правки', 'Unsaved changes') : tr('Сохранено', 'Saved')
        }</span> : null}{publishState?.message || (!props.project && publishHint) ? <span role="status">{publishState?.message || publishHint}</span> : null}<span>{(() => { const item = ALL_TOOLS.find((entry) => entry.id === gizmo?.tool); if (!item) return tr('Пробел — снять выбор, держать — инструменты', 'Space — deselect, hold — tools'); const axes = item.transform && gizmo?.movable ? describeGizmoAxes(gizmo.movable, item.id, language) : ''; return [`${tr(item.ru, item.en)} · ${item.key}`, axes].filter(Boolean).join(' · '); })()}</span></footer>
        {(focus || preview) && !playing ? <Button className="focus-return" icon="panel" label={tr('Вернуться к инструментам', 'Return to tools')} onClick={() => { setFocus(false); setPreview(false); }}>{tr('К редактору', 'Editor')}</Button> : null}
        {modal === 'search' ? <SearchDialog onClose={() => setModal(null)} onSelect={selectNode} commands={commands} /> : null}
        {modal?.kind === 'presets' ? <Dialog title={`${tr('Детали', 'Parts')} · ${modal.label}`} onClose={() => setModal(null)}><FocusPresets path={modal.path} label={modal.label} settings={settings} applySettings={props.applySettings} onClose={() => setModal(null)} /></Dialog> : null}
        {materialEditor?.opened ? <MaterialPanel target={materialEditor.targets.at(-1) ?? null} targets={materialEditor.targets} scope={materialEditor.scope} onScope={materialEditor.setScope} onActivate={() => materialEditor.open()} settings={settings} applySettings={props.applySettings} onClose={materialEditor.close} /> : null}
        {modal === 'trace' ? <React.Suspense fallback={null}><TraceStudio layoutEditor={layoutEditor} project={props.project} onClose={() => setModal(null)} /></React.Suspense> : null}
        {modal === 'help' ? <Dialog title={tr('Управление', 'Controls')} onClose={() => setModal(null)}><div className="focus-shortcuts">{shortcutRows(tr).map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div></Dialog> : null}
        {modal === 'settings' ? <SettingsDialog sectionProps={sectionProps} onClose={() => setModal(null)} /> : null}
        {modal === 'photo' ? <PhotoRenderStudio settings={settings} layoutEditor={layoutEditor} project={props.project} onClose={() => setModal(null)} /> : null}
        {modal === 'history' && props.project ? <Dialog title={tr('История проекта', 'Project history')} onClose={() => setModal(null)}><FocusProjectHistory projectId={props.project.id} onRestore={props.onRestoreVersion} onDone={() => setModal(null)} language={language} Button={Button} /></Dialog> : null}
        {['save', 'publish', 'revert'].includes(modal) ? <Dialog title={modal === 'revert' ? t('homeEditor.publish.adopt') : modal === 'publish' ? tr('Публикация на сайт', 'Publish to website') : props.project ? tr('Сцена проекта — на заглавную', 'Project scene to the home page') : tr('Сохранение в проект', 'Save to project')} onClose={() => setModal(null)}><div className="focus-save-summary"><p>{modal === 'revert' ? tr('Текущий вид будет заменён опубликованными настройками проекта. Рабочие камеры останутся в браузере.', 'The current view will be replaced with published project settings. Working cameras remain in the browser.') : props.project ? tr(`Сцена проекта «${props.project.name}» станет сценой заглавной страницы: обычные камеры, их Desktop и Mobile, общий звук. Прежняя сцена сайта остаётся в git и в проектах, вернуть её можно так же.`, `The scene of "${props.project.name}" becomes the home page scene: its cameras, Desktop and Mobile views and global audio. The previous site scene stays in git and in the projects; put it back the same way.`) : tr('В проект входят обычные сцены, их Desktop и Mobile, общий звук. Рабочие камеры и настройки редактора остаются локальными.', 'The project includes scenes, their Desktop and Mobile views and global audio. Working cameras and editor preferences remain local.')}</p>{modal !== 'revert' ? <div className="focus-scene-names">{layoutEditor.cameras.map((camera) => <span key={camera.id}>{camera.name}</span>)}</div> : null}{modal === 'publish' ? <p>{tr('Это действие обновит живой сайт.', 'This will update the live website.')}</p> : null}<footer><Button label={tr('Отмена', 'Cancel')} onClick={() => setModal(null)}>{tr('Отмена', 'Cancel')}</Button><Button className="focus-primary" label={tr('Подтвердить действие', 'Confirm action')} data-testid="home-editor-dialog-confirm" onClick={() => { const action = modal === 'revert' ? onAdoptPublished : modal === 'publish' ? onDeploy : onPublish; setModal(null); action?.(); }}>{modal === 'revert' ? tr('Откатить', 'Revert') : modal === 'publish' ? tr('Опубликовать', 'Publish') : props.project ? tr('На заглавную', 'To the home page') : tr('В проект', 'Save')}</Button></footer></div></Dialog> : null}
        {gizmo?.sceneMenu ? <FocusContextMenu x={gizmo.sceneMenu.x} y={gizmo.sceneMenu.y} title={gizmo.sceneMenu.node ? t(`homeEditor.nodes.${resolveEditorPath(gizmo.sceneMenu.node, { includeDevOnly: import.meta.env.DEV }).node.id}`) : tr('Сцена', 'Scene')} items={sceneMenuItems(gizmo.sceneMenu)} onClose={gizmo.closeSceneMenu} /> : null}
        {rowMenu ? <FocusContextMenu x={rowMenu.x} y={rowMenu.y} title={rowMenu.label} items={[
            { label: controls.pinnedIds.has(rowMenu.id) ? tr('Убрать из избранного', 'Remove from favourites') : tr('В избранное', 'Add to favourites'), icon: 'star', onSelect: () => controls.togglePin(rowMenu.id) },
            { label: tr('Открыть избранное', 'Open favourites'), icon: 'panel', onSelect: () => { setParamsTab('pinned'); setCollapsed(false); } },
        ]} onClose={() => setRowMenu(null)} /> : null}
        {palette.popup ? <FocusColorPalette {...palette.popup} colors={colors} language={language} onClose={palette.close} /> : null}<FocusTooltip />
        <FocusToolPie language={language} fill={settings.editorPieFill !== false} outline={settings.editorPieOutline !== false} enabled={!playing && !modal} current={gizmo?.tool} onTap={clearSelection}
            tools={PIE_ORDER.filter((id) => id !== 'luminaire' || props.project?.kind === 'design').map((id) => PIE_GROUPS.find((group) => group.id === id) ?? ALL_TOOLS.find((tool) => tool.id === id)).map((tool) => ({ ...tool, disabled: Boolean(tool.transform && !gizmoAllows(gizmo?.movable, tool.id)) }))}
            onChoose={(id) => { if (id === 'walk') { onWalk?.(); return; } gizmo?.setTool?.(id); if (id === 'hand') document.querySelector('.home-editor-render-frame canvas')?.focus({ preventScroll: true }); }} />
        <div hidden aria-hidden="true" data-testid="focus-control-catalog"><FocusCameraParameters settings={settings} layoutEditor={layoutEditor} catalogOnly />{ALL_NODES.filter(({ node }) => node.id !== 'camera').map(({ group, node, path }) => <NodeSections key={path} group={group} node={node} catalogOnly sectionProps={sectionProps} />)}</div>
    </div>;
}

export default function FocusEditor(props) {
    const [pinnedIds, setPinnedIds] = useState(() => { const saved = readUi().pinnedIds; return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []; });
    return <FocusControlsProvider pinnedIds={pinnedIds} onPinnedChange={setPinnedIds} onNumericGestureStart={props.history?.onGestureStart} onNumericGestureCommit={props.history?.onGestureCommit} onNumericGestureCancel={props.history?.onGestureCancel}><FocusShell {...props} /></FocusControlsProvider>;
}
