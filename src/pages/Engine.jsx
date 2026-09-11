import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { version } from '../../package.json';
import { FocusIcon } from '../features/home-scene/components/editor/focus/FocusIcons';
import { FocusContextMenu } from '../features/home-scene/components/editor/focus/FocusContextMenu';
import {
    createProject, listProjects, projectStore, readProject, removeProject, renameProject,
} from '../features/engine/projectApi';
import {
    getBaseHomeSceneSettings, normalizeHomeSceneDraftSettings, readHomeSceneDraftSettings,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import './Engine.css';

// Главное меню движка. Проект — это числа: один файл настроек на общих ассетах,
// а не своя папка с моделями. Поэтому новый проект стоит ровно одну запись на
// диск, и «чистый» — это заводские значения тех же модулей настроек, из которых
// собран список публикуемых ключей.
//
// Сайт стоит в списке первым, но проектом движка не является: у него свой
// черновик и свои кнопки публикации, а проект движка на сайт уехать не может.
const factoryScene = () => normalizeHomeSceneDraftSettings(getBaseHomeSceneSettings());

const openEditor = (id) => { window.location.href = `/home/edit?project=${encodeURIComponent(id)}`; };

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

    const reload = useCallback(async () => {
        try {
            setState({ status: 'ready', projects: await listProjects(), message: '' });
        } catch (error) {
            // Собранный сайт не держит хранилище проектов — это не поломка, а
            // ответ на вопрос «где я»: движок живёт в приложении.
            setState({ status: 'offline', projects: [], message: error.message });
        }
    }, []);

    const fail = (error) => setState((current) => ({ ...current, message: error.message }));

    useEffect(() => { void reload(); }, [reload]);
    useEffect(() => {
        document.documentElement.dataset.engineMenu = 'true';
        return () => { delete document.documentElement.dataset.engineMenu; };
    }, []);

    const create = async (name, settings) => {
        setEditing(null);
        try {
            openEditor((await createProject({ name, settings: settings ?? factoryScene(), engine: version })).id);
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
            await create(`${project.name} · ${tr('копия', 'copy')}`, (await readProject(project.id)).settings);
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

    const projectMenu = (project) => [
        { label: tr('Открыть', 'Open'), icon: 'right', onSelect: () => openEditor(project.id) },
        { label: tr('Переименовать', 'Rename'), icon: 'sliders', onSelect: () => setEditing({ id: project.id, name: project.name }) },
        { label: tr('Сделать копию', 'Duplicate'), icon: 'folder', onSelect: () => duplicate(project) },
        '-',
        { label: tr('Удалить', 'Delete'), icon: 'close', danger: true, onSelect: () => remove(project) },
    ];

    const naming = (project) => <NameField
        value={project?.name ?? ''}
        placeholder={tr('Название проекта', 'Project name')}
        onCommit={(name) => (project
            ? rename(project.id, name)
            : (name.trim() ? create(name) : setEditing(null)))}
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
            <p className="engine-lead">{tr(
                'Проект — это сцена в числах: ландшафт, вода, свет, растения. Ассеты общие для всех проектов и в проект не копируются.',
                'A project is a scene in numbers: land, water, light, plants. Assets are shared by every project and are never copied into one.',
            )}</p>

            {state.message ? <p className="engine-note" role="status">{state.message}</p> : null}
            {state.status === 'offline' ? <p className="engine-note">{tr(
                'Хранилище проектов отвечает только на локальном сервере движка. Запусти редактор из приложения.',
                'The project store answers only on the engine’s local server. Start the editor from the app.',
            )}</p> : null}

            <div className="engine-grid">
                {editing && editing.id === null
                    ? <div className="engine-card engine-card--new is-naming">{naming(null)}</div>
                    : <button type="button" className="engine-card engine-card--new" onClick={() => setEditing({ id: null, name: '' })} disabled={state.status !== 'ready'}>
                        <FocusIcon name="plus" />
                        <span>{tr('Новый проект', 'New project')}</span>
                        <small>{tr('Заводской берег', 'Factory coast')}</small>
                    </button>}

                <article className="engine-card engine-card--site">
                    <button type="button" className="engine-card__open" onClick={() => { window.location.href = '/home/edit'; }}>
                        {sitePreview ? <img className="engine-card__preview" src={sitePreview} alt="" /> : <span className="engine-card__preview" aria-hidden="true" />}
                        <span className="engine-card__name">{tr('Сайт · заглавная страница', 'Website · home page')}</span>
                        <small>{tr('свой черновик · публикуется на сайт', 'own draft · publishes to the site')}</small>
                    </button>
                    <span className="engine-card__tag">{tr('сайт', 'site')}</span>
                </article>

                {state.projects.map((project) => <article
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
