import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { version } from '../../package.json';
import { FocusIcon } from '../features/home-scene/components/editor/focus/FocusIcons';
import { FocusContextMenu } from '../features/home-scene/components/editor/focus/FocusContextMenu';
import {
    createProject, listProjects, projectStore, readProject, removeProject, renameProject, setProjectKind,
} from '../features/engine/projectApi';
import {
    getBaseHomeSceneSettings, normalizeHomeSceneDraftSettings, readHomeSceneDraftSettings, sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import { designProjectObjectSettings, newProjectObjectSettings } from '../features/home-scene/lib/sceneObjects';
import { confirmPublishWithModels, publishHomeSceneSettings } from '../features/home-scene/lib/homeScenePublishClient';
import publishedSource from '../features/home-scene/data/publishedHomeSceneSource.json';
import './Engine.css';

// Главное меню движка. Проект — это числа: один файл настроек на общих ассетах,
// а не своя папка с моделями. Поэтому новый проект стоит ровно одну запись на
// диск, и «чистый» — это заводские значения тех же модулей настроек, из которых
// собран список публикуемых ключей.
//
// Сайт стоит в списке первым, но проектом движка не является: у него свой
// черновик и свои кнопки публикации, а проект движка на сайт уехать не может.
// Заводской берег — без вещей сайта и без того, что пока не умеет жить вдоль
// воды само: что именно выключено, записано в реестре объектов одним флагом.
//
// Второй вид проекта — «Участок» (kind 'design'): проектирование сада, а не
// берег сайта. Пустая сцена — небо, ровная земля, расстановка для модели
// SketchUp; моря, лодки, дома и прочих вещей сайта в нём нет совсем
// (sceneObjects.js, `site`).
const factoryScene = (kind) => normalizeHomeSceneDraftSettings({
    ...getBaseHomeSceneSettings(), ...newProjectObjectSettings(), ...(kind === 'design' ? designProjectObjectSettings() : {}),
});

const openEditor = (id) => { window.location.href = `/home/edit?project=${encodeURIComponent(id)}`; };

// Три вкладки меню — три рода работы. Игры — сцены движка на заводском
// берегу (вид не указан), сайт — заглавная страница и её сохранённые сцены
// (kind 'site'), ландшафт — участки (kind 'design'). Выбранная вкладка
// помнится в этом браузере; впервые — вкладка самого свежего проекта.
const TABS = [
    { id: 'game', ru: 'Игры', en: 'Games', lead: ['Сцены движка на заводском берегу: вода, свет, доска, живность.', 'Engine scenes on the factory coast: water, light, the board, creatures.'] },
    { id: 'site', ru: 'Сайт', en: 'Website', lead: ['Заглавная страница сайта и её сохранённые сцены.', 'The website home page and its saved scenes.'] },
    { id: 'design', ru: 'Ландшафт', en: 'Landscape', lead: ['Участки: модель SketchUp, цветники и деревья, план в шапках, ведомость.', 'Garden plots: the SketchUp model, beds and trees, the plan in caps, the schedule.'] },
];
const tabOf = (project) => (project.kind === 'design' ? 'design' : project.kind === 'site' ? 'site' : 'game');
const TAB_KEY = 'ddg_engine_tab_v1';
const readTab = () => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } };

// Сайт — не проект движка, а его собственный редактор: черновик в этом браузере,
// свои кнопки «В проект» и «На сайт». В меню он стоит первым и отдельно, чтобы
// было видно, что это он. Кадр берётся из миниатюр камер того же редактора.
const siteThumbnail = () => {
    try {
        const draft = readHomeSceneDraftSettings();
        const thumbnails = JSON.parse(localStorage.getItem('ddg_home_editor_camera_thumbnails_v1') || '{}');
        const cameraId = draft?.activeCameraId ?? draft?.sceneCameras?.[0]?.id;
        const layout = draft?.editorLayoutKey ?? 'desktop';
        return thumbnails[`${cameraId}:${layout}`] ?? Object.values(thumbnails)[0] ?? null;
    } catch {
        return null;
    }
};

const formatDate = (value, language) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
};

function NameField({ value, placeholder, onCommit, onCancel }) {
    const ref = useRef(null);
    useLayoutEffect(() => { ref.current?.select(); }, []);
    return <input
        ref={ref}
        className="engine-card__input"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') onCommit(event.currentTarget.value);
            if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
        }}
        onBlur={(event) => onCommit(event.currentTarget.value)}
    />;
}

export default function Engine() {
    const { language, setLanguage } = useLanguage();
    const tr = (ru, en) => (language === 'ru' ? ru : en);
    const [state, setState] = useState({ status: 'loading', projects: [], message: '' });
    const [editing, setEditing] = useState(null);
    const [menu, setMenu] = useState(null);
    const [sitePreview] = useState(siteThumbnail);
    const [tab, setTab] = useState(readTab);
    useEffect(() => { if (tab) { try { localStorage.setItem(TAB_KEY, tab); } catch { /* local UI only */ } } }, [tab]);
    // The source file is bundled: it says who was on the home page when this
    // page loaded; a publish from here updates the note without a reload.
    const [homeSource, setHomeSource] = useState(publishedSource);
    const [homeNote, setHomeNote] = useState('');
    // The whole project becomes the home page scene: the file the site builds
    // from, exactly as the editor's «На заглавную» writes it. The trip to
    // GitHub stays a separate, deliberate button in the editor.
    const toHomePage = async (project) => {
        try {
            setHomeNote(tr(`Ставлю «${project.name}» на заглавную…`, `Putting "${project.name}" on the home page…`));
            const full = await readProject(project.id);
            if (!confirmPublishWithModels(full.settings, language === 'ru')) { setHomeNote(''); return; }
            await publishHomeSceneSettings(sanitizeHomeSceneSettingsForPublish(full.settings), { source: { projectId: project.id, projectName: project.name } });
            setHomeSource({ projectId: project.id, projectName: project.name, publishedAt: new Date().toISOString() });
            setHomeNote(tr(`«${project.name}» — сцена заглавной. Выложить на сайт: открыть проект → «На сайт».`, `"${project.name}" is the home page scene. To publish: open the project → "To the site".`));
        } catch (error) {
            setHomeNote(tr(`Не удалось: ${error.message}`, `Failed: ${error.message}`));
        }
    };

    const reload = useCallback(async () => {
        try {
            setState({ status: 'ready', projects: await listProjects(), message: '' });
        } catch (error) {
            // Собранный сайт не держит хранилище проектов — это не поломка, а
            // ответ на вопрос «где я»: движок живёт в приложении.
            setState({ status: 'offline', projects: [], message: error.message });
        }
    }, []);

    const fail = (error) => setState((previous) => ({ ...previous, message: error.message }));
    const current = TABS.some((item) => item.id === tab) ? tab : state.projects[0] ? tabOf(state.projects[0]) : 'design';

    useEffect(() => { void reload(); }, [reload]);
    useEffect(() => {
        document.documentElement.dataset.engineMenu = 'true';
        return () => { delete document.documentElement.dataset.engineMenu; };
    }, []);

    // from: the project a copy is made of; its imported models go with it.
    const create = async (name, settings, from, kind) => {
        setEditing(null);
        try {
            openEditor((await createProject({ name, settings: settings ?? factoryScene(kind), engine: version, from, ...(kind ? { kind } : {}) })).id);
        } catch (error) { fail(error); }
    };

    const rename = async (id, name) => {
        setEditing(null);
        try {
            await renameProject(id, name);
            await reload();
        } catch (error) { fail(error); }
    };

    // Копия — это вариация: те же числа под другим именем. Сцена читается с
    // диска, а не берётся из списка: список нарочно приходит без настроек.
    const duplicate = async (project) => {
        try {
            await create(`${project.name} · ${tr('копия', 'copy')}`, (await readProject(project.id)).settings, project.id, project.kind);
        } catch (error) { fail(error); }
    };

    const remove = async (project) => {
        const asked = tr(
            `Удалить проект «${project.name}»? Файл со сценой будет стёрт.`,
            `Delete project “${project.name}”? Its scene file will be erased.`,
        );
        if (!window.confirm(asked)) return;
        try {
            await removeProject(project.id);
            await reload();
        } catch (error) { fail(error); }
    };

    const moveTo = async (project, kind) => {
        try {
            await setProjectKind(project.id, kind);
            await reload();
        } catch (error) { fail(error); }
    };

    const projectMenu = (project) => [
        { label: tr('Открыть', 'Open'), icon: 'right', onSelect: () => openEditor(project.id) },
        { label: tr('Переименовать', 'Rename'), icon: 'sliders', onSelect: () => setEditing({ id: project.id, name: project.name }) },
        { label: tr('Сделать копию', 'Duplicate'), icon: 'folder', onSelect: () => duplicate(project) },
        { label: tr('На заглавную сайта', 'To the site home page'), icon: 'upload', onSelect: () => toHomePage(project) },
        project.kind === 'design' ? null : project.kind === 'site'
            ? { label: tr('Во вкладку «Игры»', 'Move to “Games”'), icon: 'grid', onSelect: () => moveTo(project, null) }
            : { label: tr('Во вкладку «Сайт»', 'Move to “Website”'), icon: 'grid', onSelect: () => moveTo(project, 'site') },
        '-',
        { label: tr('Удалить', 'Delete'), icon: 'close', danger: true, onSelect: () => remove(project) },
    ];

    const naming = (project) => <NameField
        value={project?.name ?? ''}
        placeholder={tr('Название проекта', 'Project name')}
        onCommit={(name) => (project
            ? rename(project.id, name)
            : (name.trim() ? create(name, undefined, undefined, editing?.kind) : setEditing(null)))}
        onCancel={() => setEditing(null)}
    />;

    return <div className="engine-menu">
        <header className="engine-topbar">
            <div className="engine-brand">
                <img src="/ouroboros-mark.webp" width="34" height="34" alt="" aria-hidden="true" />
                <span>OUROBOROS<small>ENGINE {version}</small></span>
            </div>
            <span className="engine-spacer" />
            <button type="button" className="engine-ghost" onClick={() => { window.location.href = '/asset-lab.html'; }}>
                <FocusIcon name="grid" />{tr('Лаборатория', 'Asset lab')}
            </button>
            <button type="button" className="engine-ghost" onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}>
                {language.toUpperCase()}<FocusIcon name="chevron" />
            </button>
        </header>

        <main className="engine-body">
            <h1>{tr('Проекты', 'Projects')}</h1>
            <nav className="engine-tabs" role="tablist" aria-label={tr('Вкладки проектов', 'Project tabs')}>
                {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === current} className={item.id === current ? 'is-active' : ''} onClick={() => setTab(item.id)} data-testid={`engine-tab-${item.id}`}>
                    {tr(item.ru, item.en)}<small>{state.projects.filter((project) => tabOf(project) === item.id).length + (item.id === 'site' ? 1 : 0)}</small>
                </button>)}
            </nav>
            <p className="engine-lead">{tr(...TABS.find((item) => item.id === current).lead)}</p>

            {state.message ? <p className="engine-note" role="status">{state.message}</p> : null}
            {homeNote ? <p className="engine-note" role="status">{homeNote}</p> : null}
            {state.status === 'offline' ? <p className="engine-note">{tr(
                'Хранилище проектов отвечает только на локальном сервере движка. Запусти редактор из приложения.',
                'The project store answers only on the engine’s local server. Start the editor from the app.',
            )}</p> : null}

            <div className="engine-grid" role="tabpanel">
                {current === 'game' ? (editing && editing.id === null && !editing.kind
                    ? <div className="engine-card engine-card--new is-naming">{naming(null)}</div>
                    : <button type="button" className="engine-card engine-card--new" onClick={() => setEditing({ id: null, name: '' })} disabled={state.status !== 'ready'}>
                        <FocusIcon name="plus" />
                        <span>{tr('Новая игра', 'New game')}</span>
                        <small>{tr('Заводской берег', 'Factory coast')}</small>
                    </button>) : null}
                {current === 'design' ? (editing && editing.id === null && editing.kind === 'design'
                    ? <div className="engine-card engine-card--new is-naming">{naming(null)}</div>
                    : <button type="button" className="engine-card engine-card--new" onClick={() => setEditing({ id: null, name: '', kind: 'design' })} disabled={state.status !== 'ready'} data-testid="engine-new-design">
                        <FocusIcon name="plus" />
                        <span>{tr('Новый участок', 'New garden plot')}</span>
                        <small>{tr('Пустая сцена · SketchUp · посадки', 'Empty scene · SketchUp · planting')}</small>
                    </button>) : null}

                {current === 'site' ? <article className="engine-card engine-card--site">
                    <button type="button" className="engine-card__open" onClick={() => { window.location.href = '/home/edit'; }}>
                        {sitePreview ? <img className="engine-card__preview" src={sitePreview} alt="" /> : <span className="engine-card__preview" aria-hidden="true" />}
                        <span className="engine-card__name">{tr('Сайт · заглавная страница', 'Website · home page')}</span>
                        <small>{homeSource?.projectId
                            ? tr(`на заглавной: ${homeSource.projectName ?? homeSource.projectId}`, `on the home page: ${homeSource.projectName ?? homeSource.projectId}`)
                            : tr('свой черновик · публикуется на сайт', 'own draft · publishes to the site')}</small>
                    </button>
                    <span className="engine-card__tag">{tr('сайт', 'site')}</span>
                </article> : null}

                {state.projects.filter((project) => tabOf(project) === current).map((project) => <article
                    key={project.id}
                    className="engine-card"
                    onContextMenu={(event) => { if (event.shiftKey) return; event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, project }); }}
                >
                    {project.thumbnail
                        ? <img className="engine-card__preview" src={`${projectStore.thumbnailUrl(project.id)}?t=${encodeURIComponent(project.updated)}`} alt="" />
                        : <span className="engine-card__preview" aria-hidden="true" />}
                    {editing?.id === project.id
                        ? naming(project)
                        : <button type="button" className="engine-card__open" onClick={() => openEditor(project.id)}>
                            <span className="engine-card__name">{project.name}</span>
                            <small>{formatDate(project.updated, language)} · {project.id}</small>
                        </button>}
                    {homeSource?.projectId === project.id ? <span className="engine-card__tag">{tr('на заглавной', 'on the home page')}</span> : null}
                </article>)}
            </div>

            {state.status === 'ready' && state.projects.length === 0 && !editing
                ? <p className="engine-note">{tr(
                    'Проектов пока нет. Новый откроется на заводском берегу — том же движке с заводскими числами, не на твоём Азове.',
                    'No projects yet. A new one opens on the factory coast — the same engine with factory numbers, not your Azov.',
                )}</p>
                : null}
        </main>

        {menu ? <FocusContextMenu x={menu.x} y={menu.y} title={menu.project.name} items={projectMenu(menu.project)} onClose={() => setMenu(null)} /> : null}
    </div>;
}
