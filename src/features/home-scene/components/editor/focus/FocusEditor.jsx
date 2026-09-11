import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { version } from '../../../../../../package.json';
import { EDITOR_TREE, resolveEditorPath } from '../editorTree';
import { sceneObjectsForNode } from '../../../lib/sceneObjects';
import { RangeControl, CheckboxControl, SectionHeading } from '../../HomeEditorControls';
import { FocusControlsProvider, FocusControlScope, useFocusControls } from './FocusControlsContext';
import { RegisteredFocusControl } from './FocusControlComponents';
import { FOCUS_DOMAINS, getFocusDomain, getFocusGroups, getFocusLabel, getNodeIcon } from './focusNavigation';
import { FocusIcon } from './FocusIcons';
import { FocusColorPalette, useFocusColorPalette, useFocusIconColors } from './FocusIconPalette';
import { FocusContextMenu } from './FocusContextMenu';
import FocusPresets from './FocusPresets';
import { FocusCameraManager, FocusCameraParameters, FocusCameraStrip, FocusTechnicalViews } from './FocusCameras';
import logo from './ouroboros-reference.png';
import './FocusEditor.css';

const UI_KEY = 'ddg_focus_editor_ui_v1';
const readUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
const ALL_NODES = EDITOR_TREE.flatMap((group) => group.nodes.filter((node) => import.meta.env.DEV || !node.devOnly).map((node) => ({ group, node, path: `${group.id}/${node.id}` })));
const matchesSearch = (text, query) => query.toLocaleLowerCase().trim().split(/\s+/).every((word) => text.toLocaleLowerCase().includes(word));
const textTarget = (target) => target?.closest?.('input,textarea,select,[contenteditable=true],dialog');

function Button({ icon, label, children, className = '', ...props }) {
    return <button type="button" className={`focus-button ${className}`} aria-label={label} data-focus-tip={label} {...props}>{icon ? <FocusIcon name={icon} /> : null}{children}</button>;
}

function Dialog({ title, children, onClose }) {
    const ref = useRef(null);
    const { language } = useLanguage();
    useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
    return <dialog ref={ref} className="focus-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => {
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
    return <FocusControlScope path={`${group.id}/${node.id}`} groupLabel={t(`homeEditor.groups.${group.id}`)} nodeLabel={t(`homeEditor.nodes.${node.id}`)} catalogOnly={catalogOnly}>
        {sceneObjectsForNode(`${group.id}/${node.id}`).map(({ key }) => <CheckboxControl key={key} controlId={key} label={t(`homeEditor.controls.${key}`)} checked={Boolean(sectionProps.settings[key])} onChange={(event) => sectionProps.handleSettingChange(event, key, 'boolean')} testId={`home-editor-object-${key}`} />)}
        {node.aspects.map(({ id, Section }) => <React.Fragment key={id}>{node.aspects.length > 1 ? <SectionHeading label={t(`homeEditor.aspects.${id}`)} /> : null}<Section {...sectionProps} /></React.Fragment>)}
    </FocusControlScope>;
}

function SearchDialog({ onClose, onSelect, commands }) {
    const { t, language } = useLanguage(); const [query, setQuery] = useState(''); const [index, setIndex] = useState(0); const catalog = useCatalog();
    const source = useMemo(() => [
        ...ALL_NODES.map(({ group, node, path }) => ({ id: path, label: t(`homeEditor.nodes.${node.id}`), trail: t(`homeEditor.groups.${group.id}`), path, icon: getNodeIcon(node.id) })),
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
    useLayoutEffect(() => {
        if (!pendingField || !ref.current) return;
        const row = [...ref.current.querySelectorAll('[data-focus-control-id]')].find((item) => item.dataset.focusControlId === pendingField);
        if (!row) return;
        let parent = row.parentElement; while (parent && parent !== ref.current) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
        row.scrollIntoView({ block: 'center' }); row.classList.add('focus-field-found'); row.querySelector('input,select')?.focus({ preventScroll: true }); onFieldFound();
    }, [pendingField, selected.path, onFieldFound, catalog]);
    return <div ref={ref} className="focus-inspector-scroll" data-testid="focus-inspector-scroll">{paramsTab === 'pinned' || filter ? <>{filtered.map((item, index) => <React.Fragment key={item.id}>{paramsTab === 'pinned' && (index === 0 || filtered[index - 1].path !== item.path) ? <h4 className="home-editor-section-heading">{item.nodeLabel}</h4> : null}<RegisteredFocusControl id={item.id} /></React.Fragment>)}{!filtered.length ? <p className="focus-empty">{language === 'ru' ? 'Наведите на параметр и закрепите звёздочкой.' : 'Hover a parameter and pin it with the star.'}</p> : null}</> : selected.node.id === 'camera' ? <FocusCameraManager settings={sectionProps.settings} layoutEditor={sectionProps.layoutEditor} /> : <NodeSections group={selected.group} node={selected.node} sectionProps={sectionProps} />}</div>;
}

function FocusTooltip() {
    const [tip, setTip] = useState(null);
    useEffect(() => {
        let timer;
        const hide = () => { clearTimeout(timer); setTip(null); };
        const show = (event) => {
            const target = event.target.closest?.('[data-focus-tip]'); hide();
            if (!target || !target.dataset.focusTip) return;
            timer = setTimeout(() => { const r = target.getBoundingClientRect(); setTip({ text: target.dataset.focusTip, x: Math.max(8, Math.min(innerWidth - 274, r.left)), y: r.bottom > innerHeight - 95 ? r.top - 66 : r.bottom + 8 }); }, 600);
        };
        document.addEventListener('mouseover', show); document.addEventListener('mouseout', hide); document.addEventListener('focusin', show); document.addEventListener('focusout', hide); document.addEventListener('pointerdown', hide); document.addEventListener('scroll', hide, true);
        return () => { hide(); document.removeEventListener('mouseover', show); document.removeEventListener('mouseout', hide); document.removeEventListener('focusin', show); document.removeEventListener('focusout', hide); document.removeEventListener('pointerdown', hide); document.removeEventListener('scroll', hide, true); };
    }, []);
    return tip ? <div role="tooltip" className="focus-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
}

function FocusShell(props) {
    const { settings, activeTab, setActiveTab, layoutEditor: cameraEditor, gizmo, history, onPublish, onDeploy, onAdoptPublished, publishState, hasPublishChanges, publishEnabled, publishHint } = props;
    const layoutEditor = { ...cameraEditor,
        onFovChange: (value) => history.recordChange([`layouts.${cameraEditor.selectedKey}.cameraFov`, `layouts.${cameraEditor.selectedKey}.customized`], () => cameraEditor.onFovChange(value)),
        onFrameInsetChange: (value) => history.recordChange([`layouts.${cameraEditor.selectedKey}.frameInset`, `layouts.${cameraEditor.selectedKey}.customized`], () => cameraEditor.onFrameInsetChange(value)),
        updateSlideshow: (patch) => history.recordChange(Object.keys(patch).map((key) => `slideshow.${key}`), () => cameraEditor.updateSlideshow(patch)),
    };
    const { language, setLanguage, t } = useLanguage(); const tr = (ru, en) => language === 'ru' ? ru : en;
    const [stored] = useState(readUi); const [width, setWidth] = useState(() => Math.min(420, Math.max(280, stored.width || 304)));
    const [collapsed, setCollapsed] = useState(Boolean(stored.collapsed)); const [navOpen, setNavOpen] = useState(false); const [treeQuery, setTreeQuery] = useState('');
    const [filter, setFilter] = useState(''); const [paramsTab, setParamsTab] = useState('all'); const [pendingField, setPendingField] = useState(null);
    const [stripOpen, setStripOpen] = useState(stored.stripOpen !== false); const [focus, setFocus] = useState(false); const [preview, setPreview] = useState(false);
    const [modal, setModal] = useState(null); const [viewsOpen, setViewsOpen] = useState(false); const grip = useRef(null); const resize = useRef(null); const lastNodes = useRef({});
    // Чёрная рамка — это то, как кадр обрежется на сайте; полупрозрачная показывает,
    // что осталось за кадром. Настройка вида, живёт рядом с шириной панели.
    const [solidFrame, setSolidFrame] = useState(stored.solidFrame === true); const [rowMenu, setRowMenu] = useState(null);
    const controls = useFocusControls(); const colors = useFocusIconColors(); const palette = useFocusColorPalette();
    const selected = resolveEditorPath(activeTab, { includeDevOnly: import.meta.env.DEV }); const domain = getFocusDomain(selected.path);
    const groups = getFocusGroups(domain.id, { includeDevOnly: import.meta.env.DEV });
    const currentCamera = layoutEditor.activeWorkCameraId ? layoutEditor.workCameras.find((camera) => camera.id === layoutEditor.activeWorkCameraId) : layoutEditor.cameras.find((camera) => camera.id === layoutEditor.activeCameraId);
    const localScope = selected.group.id === 'editor'; const globalScope = selected.group.id === 'audio';
    const sectionProps = { settings, handleSettingChange: props.handleSettingChange, applySettings: props.applySettings, layoutEditor, audioLab: props.audioLab };
    useEffect(() => {
        try { localStorage.setItem(UI_KEY, JSON.stringify({ width, collapsed, stripOpen, solidFrame, pinnedIds: [...controls.pinnedIds], path: selected.path })); } catch { /* local UI only */ }
    }, [width, collapsed, stripOpen, solidFrame, controls.pinnedIds, selected.path]);
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.focusEditor = 'true'; root.dataset.focusPreview = String(preview); root.dataset.focusCanvas = String(focus); root.dataset.focusFrame = solidFrame ? 'solid' : 'soft';
        root.style.setProperty('--focus-inspector-width', `${width}px`); root.style.setProperty('--focus-panel-space', collapsed || focus || preview ? '0px' : `${width}px`);
        root.style.setProperty('--focus-rail-space', focus || preview ? '0px' : '42px');
        return () => { delete root.dataset.focusEditor; delete root.dataset.focusPreview; delete root.dataset.focusCanvas; delete root.dataset.focusFrame; ['--focus-inspector-width', '--focus-panel-space', '--focus-rail-space'].forEach((name) => root.style.removeProperty(name)); };
    }, [width, collapsed, focus, preview, solidFrame]);
    useEffect(() => { if (stored.path) setActiveTab(resolveEditorPath(stored.path, { includeDevOnly: import.meta.env.DEV }).path); }, [stored.path, setActiveTab]);
    const selectNode = useCallback((path, field = null) => {
        const next = resolveEditorPath(path, { includeDevOnly: import.meta.env.DEV }); lastNodes.current[getFocusDomain(next.path).id] = next.path;
        setActiveTab(next.path); setNavOpen(false); setCollapsed(false); setFilter(''); setTreeQuery(''); setParamsTab('all'); setPendingField(field); setFocus(false);
        gizmo?.show?.();
    }, [setActiveTab, gizmo]);
    const selectDomain = (item) => {
        const nextGroups = getFocusGroups(item.id, { includeDevOnly: import.meta.env.DEV }); const hasTree = nextGroups.reduce((total, group) => total + group.nodes.length, 0) > 1;
        if (item.id === domain.id) { setNavOpen(hasTree && !navOpen); setCollapsed(false); return; }
        selectNode(lastNodes.current[item.id] || `${nextGroups[0].id}/${nextGroups[0].nodes[0].id}`); setNavOpen(hasTree);
    };
    useEffect(() => {
        const keyboard = (event) => {
            if (event.defaultPrevented || event.target.closest?.('dialog')) return;
            if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') { event.preventDefault(); setModal('search'); return; }
            if (textTarget(event.target)) return;
            if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? history?.redo() : history?.undo(); }
            if (event.key === '?') { event.preventDefault(); setModal('help'); }
            if (event.key === 'Escape') { setNavOpen(false); setViewsOpen(false); }
            if (event.key === 'Tab' && !event.target.closest?.('button,a,summary,[role=separator]')) { event.preventDefault(); setFocus((value) => !value); }
        };
        document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
    }, [history]);
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
    // Меню вьюпорта. Попадание пришло лучом, поэтому здесь только пункты: что
    // делать с объектом под курсором, а на пустом месте — как смотреть сцену.
    const sceneMenuItems = (hit) => {
        const target = hit.node ? resolveEditorPath(hit.node, { includeDevOnly: import.meta.env.DEV }) : null;
        const objects = target ? sceneObjectsForNode(target.path) : [];
        const visible = objects.every(({ key }) => settings[key] !== false);
        // Манипулятор предлагается только тому объекту, который уже выбран:
        // правило «что можно двигать» живёт в HomeEdit и второй копии не заводит.
        const holding = Boolean(gizmo?.selection) && selected.path === target?.path;
        return [
            target ? { label: tr('Открыть параметры', 'Open parameters'), icon: 'sliders', onSelect: () => selectNode(target.path) } : null,
            target ? { label: tr('Детали объекта…', 'Parts of this object…'), icon: 'folder', onSelect: () => setModal({ kind: 'presets', path: target.path, label: t(`homeEditor.nodes.${target.node.id}`) }) } : null,
            hit.root ? { label: tr('Смотреть на объект', 'Frame object'), icon: 'target', onSelect: () => layoutEditor.frameObject?.(hit.root) } : null,
            hit.root ? { label: tr('Смотреть сверху', 'Frame from above'), icon: 'camera', onSelect: () => layoutEditor.frameObject?.(hit.root, { above: true }) } : null,
            ...(holding ? ['translate', ...(gizmo.selection.startsWith('light') ? [] : ['rotate', 'scale'])].map((mode) => ({
                label: t(`homeEditor.gizmo.${mode}`), icon: mode === 'translate' ? 'move' : mode, hint: { translate: 'G', rotate: 'R', scale: 'S' }[mode],
                checked: !gizmo.suppressed && gizmo.mode === mode, onSelect: () => { gizmo.setMode(mode); gizmo.show?.(); },
            })) : []),
            objects.length ? { label: visible ? tr('Скрыть объект', 'Hide object') : tr('Показать объект', 'Show object'), icon: visible ? 'eyeoff' : 'eye', onSelect: () => props.applySettings(Object.fromEntries(objects.map(({ key }) => [key, !visible]))) } : null,
            // Небо накрывает сцену куполом, поэтому «пустого места» во вьюпорте
            // почти не бывает: показ кадра нужен в меню всегда, а не в отдельной ветке.
            '-',
            { label: tr('Выбор объекта в сцене', 'Pick objects in the scene'), icon: 'target', hint: 'V', checked: Boolean(gizmo?.picking), onSelect: () => gizmo?.setPicking?.(!gizmo?.picking) },
            { label: tr('Управление обзором', 'Viewport navigation'), icon: 'hand', onSelect: () => { gizmo?.hide?.(); document.querySelector('.home-editor-render-frame canvas')?.focus({ preventScroll: true }); } },
            { label: tr('Чёрная рамка кадра', 'Solid frame mask'), icon: 'desktop', checked: solidFrame, onSelect: () => setSolidFrame((value) => !value) },
            { label: tr('Посмотреть кадр сайта', 'Preview site framing'), icon: 'eye', onSelect: () => setPreview(true) },
        ];
    };
    const commands = [{ id: 'command:save', label: tr('В проект', 'Save to project'), icon: 'upload', action: () => setModal('save') }, { id: 'command:presets', label: tr('Детали объекта', 'Parts of this object'), icon: 'folder', action: () => setModal({ kind: 'presets', path: selected.path, label: t(`homeEditor.nodes.${selected.node.id}`) }) }, { id: 'command:help', label: tr('Горячие клавиши', 'Keyboard shortcuts'), icon: 'help', action: () => setModal('help') }];
    const nodeTarget = { kind: 'node', path: selected.path, label: t(`homeEditor.nodes.${selected.node.id}`) };
    return <div className={`focus-editor ${focus || preview ? 'focus-editor--hidden' : ''}`}>
        <header className="focus-topbar"><div className="focus-brand"><svg viewBox="243 157 535 535" aria-hidden="true"><image href={logo} width="1536" height="1024" /></svg><span>OUROBOROS<small>ENGINE {version}</small></span></div>{props.project
            ? <button type="button" className="focus-project-label focus-project-label--link" onClick={() => { window.location.href = '/engine'; }} data-focus-tip={tr('К списку проектов', 'Back to the project list')}><FocusIcon name="folder" />{props.project.name}</button>
            : <span className="focus-project-label">{tr('Редактор сцены', 'Scene editor')}</span>}<span className="focus-saved" data-focus-tip={tr('Настройки автоматически сохраняются в этом браузере.', 'Settings are saved automatically in this browser.')}>●</span><span className="focus-spacer" /><span className="focus-active-camera" data-focus-tip={layoutEditor.activeWorkCameraId ? tr('Рабочий снимок — только локально', 'Working snapshot — local only') : tr('Сцена входит в проект', 'Scene is included in the project')}><FocusIcon name={layoutEditor.activeWorkCameraId ? 'lock' : 'camera'} />{currentCamera?.name}</span><div className="focus-formats">{['desktop', 'portrait'].map((key) => <Button key={key} icon={key === 'desktop' ? 'desktop' : 'mobile'} label={key === 'desktop' ? 'Desktop' : 'Mobile'} aria-pressed={layoutEditor.selectedKey === key} onClick={() => layoutEditor.setSelectedKey(key)} data-testid={`home-editor-camera-variant-${key}`} />)}</div><Button icon={settings.animationPaused ? 'play' : 'pause'} label={tr('Пауза / продолжить · Пробел', 'Pause / play · Space')} onClick={() => props.handleSettingChange({ target: { checked: !settings.animationPaused } }, 'animationPaused', 'boolean')} /><Button icon="eye" label={tr('Посмотреть кадр сайта', 'Preview site framing')} onClick={() => setPreview(true)} /><span className="focus-separator" /><Button icon="undo" label={t('homeEditor.publish.adoptHint')} onClick={() => setModal('revert')} data-testid="home-editor-adopt-published" /><Button className="focus-primary" label={tr('Сохранить сцены в проект', 'Save scenes to project')} onClick={() => setModal('save')} disabled={!publishEnabled || publishState?.busy || !hasPublishChanges} data-testid="home-editor-publish">{tr('В проект', 'Save')}</Button><Button label={tr('Опубликовать на сайте', 'Publish to website')} onClick={() => setModal('publish')} disabled={!publishEnabled || publishState?.busy} data-testid="home-editor-deploy">{tr('На сайт', 'Publish')}<FocusIcon name="chevron" /></Button></header>
        <nav className="focus-rail" aria-label={tr('Рабочие области', 'Workspaces')}>{FOCUS_DOMAINS.map((item) => <Button key={item.id} icon={item.icon} label={getFocusLabel(item, language)} aria-pressed={item.id === domain.id} onClick={() => selectDomain(item)} data-testid={`focus-domain-${item.id}`} />)}<span className="focus-spacer" /><Button icon="search" label={tr('Поиск · ⌘K', 'Search · ⌘K')} onClick={() => setModal('search')} /><Button icon="help" label={tr('Горячие клавиши · ?', 'Keyboard shortcuts · ?')} onClick={() => setModal('help')} /></nav>
        {navOpen ? <aside className="focus-navigator"><header>{getFocusLabel(domain, language)}<span className="focus-spacer" /><Button icon="close" label={tr('Закрыть список', 'Close list')} onClick={() => setNavOpen(false)} /></header><div className="focus-tree-search"><FocusIcon name="search" /><input value={treeQuery} onChange={(event) => setTreeQuery(event.target.value)} aria-label={tr('Фильтр объектов', 'Filter objects')} placeholder={tr('Объекты…', 'Objects…')} /></div><div className="focus-tree-scroll">{groups.map((group) => <details key={group.id} open><summary onContextMenu={(event) => palette.open(event, { kind: 'group', groupId: group.id, label: t(`homeEditor.groups.${group.id}`) })} data-focus-tip={tr('ПКМ — цвет группы', 'Right click — group colour')}><FocusIcon name="folder" style={{ color: colors.groupColor(group.id) }} />{t(`homeEditor.groups.${group.id}`)}</summary>{group.nodes.filter((node) => matchesSearch(t(`homeEditor.nodes.${node.id}`), treeQuery)).map((node) => {
            const path = `${group.id}/${node.id}`; const objects = sceneObjectsForNode(path); const visible = objects.every(({ key }) => settings[key] !== false);
            return <div key={path} className={`focus-tree-row ${selected.path === path ? 'is-active' : ''}`}><button type="button" onClick={() => selectNode(path)} onContextMenu={(event) => palette.open(event, { kind: 'node', path, label: t(`homeEditor.nodes.${node.id}`) })} data-testid={`home-editor-tab-${node.id}`}><FocusIcon name={getNodeIcon(node.id)} style={{ color: colors.colorFor(path) }} /><span>{t(`homeEditor.nodes.${node.id}`)}</span></button>{objects.length ? <Button className="focus-tree-eye" icon={visible ? 'eye' : 'eyeoff'} label={tr('Видимость объекта', 'Object visibility')} onClick={() => props.applySettings(Object.fromEntries(objects.map(({ key }) => [key, !visible])))} /> : null}</div>;
        })}</details>)}</div></aside> : null}
        {!collapsed ? <aside className="focus-inspector" id="focus-inspector" style={{ '--home-editor-heading-color': settings.editorHeadingColor }}><div ref={grip} className="focus-resize" role="separator" tabIndex="0" aria-label={tr('Ширина инспектора', 'Inspector width')} aria-orientation="vertical" aria-valuenow={width} aria-valuemin="280" aria-valuemax="420" data-focus-tip={tr('Клик — свернуть. Потяните край — ширина.', 'Click to collapse. Drag to resize.')} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); resize.current = { pointerId: event.pointerId, x: event.clientX, width, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const current = resize.current; if (!current) return; const delta = current.x - event.clientX; if (!current.moved && Math.abs(delta) < 4) return; current.moved = true; setWidth(Math.max(280, Math.min(420, current.width + delta))); }} onPointerUp={endResize} onPointerCancel={(event) => endResize(event, true)} onLostPointerCapture={(event) => endResize(event, true)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth((value) => Math.max(280, Math.min(420, value + (event.key === 'ArrowLeft' ? 10 : -10)))); } if (event.key === 'Enter') setCollapsed(true); }} /><div className="focus-inspector-head"><div className="focus-breadcrumb">{getFocusLabel(domain, language)}{getFocusLabel(domain, language) !== t(`homeEditor.groups.${selected.group.id}`) ? <><FocusIcon name="right" />{t(`homeEditor.groups.${selected.group.id}`)}</> : null}</div><div className="focus-object-title"><Button className="focus-object-icon" icon={getNodeIcon(selected.node.id)} label={tr('Цвет значка', 'Icon colour')} onClick={(event) => palette.open(event, nodeTarget)} onContextMenu={(event) => palette.open(event, nodeTarget)} style={{ color: colors.colorFor(selected.path) }} /><h1>{t(`homeEditor.nodes.${selected.node.id}`)}</h1></div><div className="focus-scope"><FocusIcon name={globalScope ? 'sound' : localScope ? 'settings' : layoutEditor.activeWorkCameraId ? 'lock' : 'camera'} /><span>{globalScope ? tr('Общий звук', 'Global audio') : localScope ? tr('Локальные настройки', 'Local preferences') : layoutEditor.activeWorkCameraId ? tr('Локальный снимок', 'Local snapshot') : tr('Сцена в проекте', 'Project scene')}</span>{!localScope && !globalScope ? <FocusControlScope path="cameras/camera" nodeLabel={t('homeEditor.nodes.camera')}><RangeControl controlId="cameraFov" label="FOV" value={layoutEditor.layouts?.[layoutEditor.selectedKey]?.cameraFov ?? settings.cameraFov} min={15} max={100} step={0.1} unit="°" onChange={(event) => layoutEditor.onFovChange(Number(event.target.value))} testId="focus-camera-fov" /></FocusControlScope> : null}</div></div><div className="focus-inspector-tabs"><button type="button" className={paramsTab === 'all' ? 'is-active' : ''} onClick={() => setParamsTab('all')}>{tr('Параметры', 'Parameters')}</button><button type="button" className={paramsTab === 'pinned' ? 'is-active' : ''} onClick={() => setParamsTab('pinned')}><FocusIcon name="star" />{tr('Избранное', 'Favorites')}{controls.pinnedIds.size ? <small>{controls.pinnedIds.size}</small> : null}</button></div>{selected.node.id !== 'camera' || paramsTab === 'pinned' ? <div className="focus-parameter-search"><FocusIcon name="search" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={tr('Найти параметр…', 'Find parameter…')} aria-label={tr('Найти параметр', 'Find parameter')} /></div> : null}<InspectorContents selected={selected} paramsTab={paramsTab} filter={filter} sectionProps={sectionProps} pendingField={pendingField} onFieldFound={onFieldFound} /><footer><span className="focus-spacer" /><button type="button" onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')} aria-label={tr('Сменить язык', 'Change language')}>{language.toUpperCase()}<FocusIcon name="chevron" /></button></footer></aside> : null}
        <Button className={`focus-panel-tab ${collapsed ? 'is-collapsed' : ''}`} icon="right" label={collapsed ? tr('Развернуть инспектор', 'Expand inspector') : tr('Свернуть инспектор', 'Collapse inspector')} aria-expanded={!collapsed} aria-controls="focus-inspector" onClick={() => setCollapsed((value) => !value)} />
        <div className="focus-stage-toolbar"><div className="focus-glass"><Button label={t('homeEditor.controls.technicalFrames')} onClick={() => setViewsOpen((value) => !value)}><FocusIcon name="camera" />{tr('Виды', 'Views')}<FocusIcon name="chevron" /></Button>{viewsOpen ? <FocusTechnicalViews settings={settings} layoutEditor={layoutEditor} frame={{ solid: solidFrame, toggle: () => setSolidFrame((value) => !value) }} /> : null}</div><span className="focus-spacer" /><div className="focus-glass"><Button icon="undo" label={tr('Отменить · ⌘Z', 'Undo · ⌘Z')} disabled={!history?.canUndo} onClick={history?.undo} /><Button icon="redo" label={tr('Повторить · ⌘⇧Z', 'Redo · ⌘⇧Z')} disabled={!history?.canRedo} onClick={history?.redo} /></div></div>
        <div className="focus-stage-tools focus-glass"><Button icon="cursor" label={tr('Выбор объекта в списке', 'Select an object from the list')} onClick={() => { setNavOpen(true); setCollapsed(false); }} /><Button icon="target" label={tr('Выбор объекта в сцене · V', 'Pick an object in the scene · V')} aria-pressed={gizmo?.picking} onClick={() => gizmo?.setPicking?.(!gizmo?.picking)} data-testid="focus-tool-pick" />{gizmo?.selection ? <>{['translate', ...(gizmo.selection.startsWith('light') ? [] : ['rotate', 'scale'])].map((mode) => <Button key={mode} icon={mode === 'translate' ? 'move' : mode} label={t(`homeEditor.gizmo.${mode}Hint`)} aria-pressed={!gizmo.suppressed && gizmo.mode === mode} onClick={() => { gizmo.setMode(mode); gizmo.show?.(); }} />)}</> : null}<Button icon="hand" label={tr('Управление обзором', 'Viewport navigation')} aria-pressed={gizmo?.suppressed} onClick={() => { gizmo?.hide?.(); document.querySelector('.home-editor-render-frame canvas')?.focus({ preventScroll: true }); }} /></div>
        <div className="focus-film-area">{stripOpen ? <FocusCameraStrip layoutEditor={layoutEditor} /> : null}<Button className="focus-film-toggle focus-glass" icon="camera" label={tr('Лента камер', 'Camera film strip')} aria-expanded={stripOpen} onClick={() => setStripOpen((value) => !value)}>{tr('Камеры', 'Cameras')}<FocusIcon name="chevron" /></Button></div>
        <footer className="focus-statusbar"><span>{t(`homeEditor.groups.${selected.group.id}`) === t(`homeEditor.nodes.${selected.node.id}`) ? t(`homeEditor.nodes.${selected.node.id}`) : `${t(`homeEditor.groups.${selected.group.id}`)} / ${t(`homeEditor.nodes.${selected.node.id}`)}`}</span><span className="focus-spacer" />{publishState?.message || publishHint ? <span role="status">{publishState?.message || publishHint}</span> : null}<span>{gizmo?.selection ? 'G · R · S' : tr('Пробел — пауза', 'Space — pause')}</span></footer>
        {focus || preview ? <Button className="focus-return" icon="panel" label={tr('Вернуться к инструментам', 'Return to tools')} onClick={() => { setFocus(false); setPreview(false); }}>{tr('К редактору', 'Editor')}</Button> : null}
        {modal === 'search' ? <SearchDialog onClose={() => setModal(null)} onSelect={selectNode} commands={commands} /> : null}
        {modal?.kind === 'presets' ? <Dialog title={`${tr('Детали', 'Parts')} · ${modal.label}`} onClose={() => setModal(null)}><FocusPresets path={modal.path} label={modal.label} settings={settings} applySettings={props.applySettings} onClose={() => setModal(null)} /></Dialog> : null}
        {modal === 'help' ? <Dialog title={tr('Управление', 'Controls')} onClose={() => setModal(null)}><div className="focus-shortcuts">{[[tr('Поиск', 'Search'), '⌘ K'], [tr('Отменить / повторить параметр', 'Undo / redo parameter'), '⌘ Z / ⌘ ⇧ Z'], [tr('Пауза', 'Pause'), 'Space'], [tr('Перенос / поворот / масштаб', 'Move / rotate / scale'), 'G / R / S'], [tr('Свободный полёт', 'Free flight'), 'W A S D Q E'], [tr('Скрыть / вернуть панели', 'Hide / show panels'), 'Tab'], [tr('Изменить число', 'Scrub value'), tr('ЛКМ ↔ · Shift точнее', 'LMB ↔ · Shift precise')], [tr('Меню объекта, камеры, параметра', 'Object, camera, parameter menu'), tr('ПКМ', 'RMB')], [tr('Цвет значка', 'Icon colour'), tr('ПКМ в списке', 'RMB in the list')], [tr('Отменить жест / скрыть манипулятор', 'Cancel gesture / hide gizmo'), 'Esc']].map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div></Dialog> : null}
        {['save', 'publish', 'revert'].includes(modal) ? <Dialog title={modal === 'revert' ? t('homeEditor.publish.adopt') : modal === 'publish' ? tr('Публикация на сайт', 'Publish to website') : tr('Сохранение в проект', 'Save to project')} onClose={() => setModal(null)}><div className="focus-save-summary"><p>{modal === 'revert' ? tr('Текущий вид будет заменён опубликованными настройками проекта. Рабочие камеры останутся в браузере.', 'The current view will be replaced with published project settings. Working cameras remain in the browser.') : tr('В проект входят обычные сцены, их Desktop и Mobile, общий звук. Рабочие камеры и настройки редактора остаются локальными.', 'The project includes scenes, their Desktop and Mobile views and global audio. Working cameras and editor preferences remain local.')}</p>{modal !== 'revert' ? <div className="focus-scene-names">{layoutEditor.cameras.map((camera) => <span key={camera.id}>{camera.name}</span>)}</div> : null}{modal === 'publish' ? <p>{tr('Это действие обновит живой сайт.', 'This will update the live website.')}</p> : null}<footer><Button label={tr('Отмена', 'Cancel')} onClick={() => setModal(null)}>{tr('Отмена', 'Cancel')}</Button><Button className="focus-primary" label={tr('Подтвердить действие', 'Confirm action')} onClick={() => { const action = modal === 'revert' ? onAdoptPublished : modal === 'publish' ? onDeploy : onPublish; setModal(null); action?.(); }}>{modal === 'revert' ? tr('Откатить', 'Revert') : modal === 'publish' ? tr('Опубликовать', 'Publish') : tr('В проект', 'Save')}</Button></footer></div></Dialog> : null}
        {gizmo?.sceneMenu ? <FocusContextMenu x={gizmo.sceneMenu.x} y={gizmo.sceneMenu.y} title={gizmo.sceneMenu.node ? t(`homeEditor.nodes.${resolveEditorPath(gizmo.sceneMenu.node, { includeDevOnly: import.meta.env.DEV }).node.id}`) : tr('Сцена', 'Scene')} items={sceneMenuItems(gizmo.sceneMenu)} onClose={gizmo.closeSceneMenu} /> : null}
        {rowMenu ? <FocusContextMenu x={rowMenu.x} y={rowMenu.y} title={rowMenu.label} items={[
            { label: controls.pinnedIds.has(rowMenu.id) ? tr('Убрать из избранного', 'Remove from favourites') : tr('В избранное', 'Add to favourites'), icon: 'star', onSelect: () => controls.togglePin(rowMenu.id) },
            { label: tr('Открыть избранное', 'Open favourites'), icon: 'panel', onSelect: () => { setParamsTab('pinned'); setCollapsed(false); } },
        ]} onClose={() => setRowMenu(null)} /> : null}
        {palette.popup ? <FocusColorPalette {...palette.popup} colors={colors} language={language} onClose={palette.close} /> : null}<FocusTooltip />
        <div hidden aria-hidden="true" data-testid="focus-control-catalog"><FocusCameraParameters settings={settings} layoutEditor={layoutEditor} catalogOnly />{ALL_NODES.filter(({ node }) => node.id !== 'camera').map(({ group, node, path }) => <NodeSections key={path} group={group} node={node} catalogOnly sectionProps={sectionProps} />)}</div>
    </div>;
}

export default function FocusEditor(props) {
    const [pinnedIds, setPinnedIds] = useState(() => { const saved = readUi().pinnedIds; return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []; });
    return <FocusControlsProvider pinnedIds={pinnedIds} onPinnedChange={setPinnedIds} onNumericGestureStart={props.history?.onGestureStart} onNumericGestureCommit={props.history?.onGestureCommit} onNumericGestureCancel={props.history?.onGestureCancel}><FocusShell {...props} /></FocusControlsProvider>;
}
