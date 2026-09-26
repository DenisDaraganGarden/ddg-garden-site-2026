import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import {
    PLACED_KIND_DEFAULTS, PLACED_KIND_RANGES, PLACED_KINDS, PLACED_LIMITS, PLACED_SPECIES, PLACED_TRANSFORM_DEFAULT, placedSpeciesLabel, placedTransformRanges,
} from '../../../../../placed/settings.js';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { sceneObjectOn } from '../../../lib/sceneObjects';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import './placed.css';
import { copiesOf, findPart, partName, selectedNodes, SKETCHUP_VIEW_FOV, sketchupSceneNodes, sketchupViews, useSketchupModel } from '../../../../../placed/sketchupModel.js';
import { SketchupOutliner } from '../../../../../placed/SketchupOutliner.jsx';

const KIND_LABELS = { tree: ['Дерево', 'Tree'], shrub: ['Куст', 'Shrub'], rock: ['Камень', 'Rock'], model: ['Модель', 'Model'] };
const KNOB_LABELS = {
    height: ['Высота', 'Height', ' m'], spread: ['Ширина кроны', 'Crown width', ' m'], lean: ['Наклон от ветра', 'Wind lean', ''], twist: ['Кручение ствола', 'Trunk twist', ''],
    density: ['Плотность листвы', 'Foliage density', ''], leafSize: ['Размер листа', 'Leaf size', ''], deadwood: ['Сухие ветви', 'Deadwood', ''], translucency: ['Просвечивание', 'Translucency', ''],
    dryness: ['Сухость', 'Dryness', ''], size: ['Размер', 'Size', ' m'], squash: ['Приплюснутость', 'Squash', ''], stretch: ['Вытянутость', 'Stretch', ''], variant: ['Форма', 'Form', ''], tilt: ['Наклон', 'Tilt', '°'],
    tiltX: ['Наклон вперёд', 'Tilt forward', '°'], tiltZ: ['Наклон вбок', 'Tilt sideways', '°'],
};
const TRANSFORM_LABELS = { x: ['Положение X', 'Position X', ' m'], z: ['Положение Z', 'Position Z', ' m'], y: ['Основание Y', 'Base Y', ' m'], rotation: ['Поворот', 'Rotation', '°'], scale: ['Масштаб', 'Scale', ' x'], seed: ['Вариант', 'Seed', ''] };

// One tree, one shrub, one rock at a time: the library's objects placed by
// hand, each with its own knobs. Follows the hedge section's shape so the two
// read the same way, minus the brush.
// A SketchUp model's own entry (placed/settings.js): its switches and hidden
// parts stay the same whichever camera is chosen.
const SKETCHUP_KEY = 'sketchupModels';

// What the server did to a SketchUp file, in one line under the buttons.
function sketchupReport({ name, report }, ru) {
    const parts = [
        `${ru ? '2D-растений' : '2D plants'} ${report.billboards}`,
        `${ru ? 'сцен' : 'scenes'} ${report.views}`,
        report.removed.length ? `${ru ? 'убрано обломков' : 'strays removed'} ${report.removed.length} (${report.removed.map((piece) => `${piece.name}, ${piece.distance} ${ru ? 'м' : 'm'}`).join('; ')})` : '',
        report.texturesResized.length ? `${ru ? 'уменьшено картинок' : 'pictures reduced'} ${report.texturesResized.length}` : '',
    ].filter(Boolean);
    return `SketchUp «${name}»: ${parts.join(' · ')}`;
}

// Блок SketchUp у выбранной модели: часть, выбранная щелчком, как в SketchUp
// (цепочка групп над ней, двойной щелчок — внутрь, Esc — наружу), и что с ней
// сделать; «Состав модели» деревом со скрытыми и удалёнными; 2D-растения;
// сцены как камеры и их общий объектив.
function SketchupModel({ object, sketchup, placedEditor, layoutEditor, ru }) {
    const entry = useSketchupModel(object.id);
    const part = placedEditor.part;
    const picked = useMemo(() => (entry && part ? findPart(entry.root, part.node) : null), [entry, part]);
    const copies = useMemo(() => (entry && picked ? copiesOf(entry.root, picked) : []), [entry, picked]);
    // A scene is a camera already when one stands within half a metre of it
    // under its name, with the model where it stands now: a model moved on
    // further gets its scenes anew.
    const scenes = useMemo(() => (entry ? sketchupSceneNodes(entry.root) : null), [entry]);
    const { x, y, z, rotation, tiltX, tiltZ, scale } = object;
    const views = useMemo(() => (scenes ? sketchupViews(scenes, { x, y, z, rotation, tiltX, tiltZ, scale }) : []), [scenes, x, y, z, rotation, tiltX, tiltZ, scale]);
    const isCamera = (view) => (layoutEditor?.cameras ?? []).some((camera) => {
        const at = camera.name === view.name ? camera.scene?.layouts?.desktop?.cameraPosition : null;
        return at && Math.hypot(at.x - view.cameraPosition.x, at.y - view.cameraPosition.y, at.z - view.cameraPosition.z) < 0.5;
    });
    const fresh = views.filter((view) => !isCamera(view));
    const button = (label, onClick, extra = {}) => <button type="button" className="home-editor-tab" onClick={onClick} {...extra}>{label}</button>;
    // Камеры из сцен этой модели и их общий объектив: SimLab его не передаёт.
    const sceneCameras = (layoutEditor?.cameras ?? []).filter((camera) => views.some((view) => camera.name === view.name));
    const lenses = sceneCameras.map((camera) => camera.scene?.layouts?.desktop?.cameraFov).filter(Number.isFinite);
    const commonLens = lenses.length ? lenses.sort((a, b) => lenses.filter((v) => v === b).length - lenses.filter((v) => v === a).length)[0] : SKETCHUP_VIEW_FOV;
    const [lens, setLens] = useState(null);
    if (!entry) return <div className="home-editor-status" data-testid="placed-sketchup-status">{object.hidden ? (ru ? 'Модель скрыта: её части и сцены — когда она снова видна.' : 'The model is hidden: its parts and scenes come back with it.')
        : !activeProjectId() ? (ru ? 'Файл модели лежит в проекте движка — части видны, когда редактор открыт в проекте.' : 'The model’s file lives in an engine project: open the editor in the project to reach its parts.')
            : (ru ? 'Модель загружается…' : 'The model is loading…')}</div>;
    const level = part ? part.trail.indexOf(part.node) : -1;
    const openGroup = level > 0 ? findPart(entry.root, part.trail[level - 1]) : null;
    const copyNodes = copies.map((copy) => copy.userData.gltfNode);
    // Выбор с Shift: действия — для всех выбранных.
    const nodes = selectedNodes(part), many = nodes.length > 1;
    const pickedAll = () => nodes.map((node) => findPart(entry.root, node)).filter(Boolean);
    return <>
        <SectionHeading label={ru ? 'Части модели' : 'Model parts'} subtle />
        {part && picked ? <>
            <div className="placed-trail" data-testid="placed-sketchup-trail">
                {part.trail.map((node, i) => { const at = findPart(entry.root, node); return at ? <React.Fragment key={node}>{i ? <span aria-hidden="true">›</span> : null}<button type="button" className={node === part.node ? 'is-active' : ''} aria-pressed={node === part.node} onClick={() => placedEditor.selectPart(node)}>{partName(at, ru)}</button></React.Fragment> : null; })}
            </div>
            {openGroup ? <p className={`placed-hint placed-hint--open${part.isolated ? ' is-isolated' : ''}`} data-testid="placed-sketchup-open">{part.isolated
                ? (ru ? `На экране только группа «${partName(openGroup, ru)}». Q — вернуть сцену.` : `Only group “${partName(openGroup, ru)}” is on screen. Q brings the scene back.`)
                : (ru ? `Открыта группа «${partName(openGroup, ru)}»: щелчок выбирает её части, Shift — добавляет к выбору. Q — только эта группа на экране. Esc — выйти на уровень выше.`
                    : `Group “${partName(openGroup, ru)}” is open: a click picks its parts, Shift adds to the selection. Q leaves only this group on screen. Esc steps back out.`)}</p> : null}
            {many ? <p className="placed-hint" data-testid="placed-sketchup-many">{ru ? `Выбрано частей: ${nodes.length}. Shift-щелчок — добавить или убрать.` : `${nodes.length} parts selected. Shift-click adds or takes one out.`}</p> : null}
            <div className="placed-actions placed-actions--part">
                <button type="button" onClick={() => layoutEditor?.frameObject?.(pickedAll())} title={ru ? 'Навести камеру на выбранное' : 'Frame the selection'}><FocusIcon name="target" />{ru ? 'В кадр' : 'Frame'}</button>
                <button type="button" onClick={() => placedEditor.hideParts(object.id, nodes)} data-testid="placed-sketchup-hide" title={ru ? 'Скрыть — вернуть: глаз в «Составе» или «Показать все скрытые»' : 'Hide — bring back with the eye in the outline or “Show all hidden”'}><FocusIcon name="eyeoff" />{ru ? 'Скрыть' : 'Hide'}{many ? ` · ${nodes.length}` : ''}</button>
                <button type="button" className="is-danger" onClick={() => placedEditor.removeParts(object.id, nodes)} data-testid="placed-sketchup-remove" title={ru ? 'Удалить · Delete — вернуть: «Удалённые» внизу или ⌘Z' : 'Delete · Delete key — bring back from “Deleted” below or with ⌘Z'}><FocusIcon name="trash" />{ru ? 'Удалить' : 'Delete'}{many ? ` · ${nodes.length}` : ''}</button>
            </div>
            {!many && copies.length > 1 ? <div className="home-editor-tabs">
                {button(`${ru ? 'Скрыть все такие' : 'Hide all copies'} · ${copies.length}`, () => placedEditor.hideParts(object.id, copyNodes), { 'data-testid': 'placed-sketchup-hide-copies' })}
                {button(`${ru ? 'Удалить все такие' : 'Delete all copies'} · ${copies.length}`, () => placedEditor.removeParts(object.id, copyNodes), { 'data-testid': 'placed-sketchup-remove-copies' })}
            </div> : null}
        </> : <p className="placed-hint">{ru
            ? 'Как в SketchUp: щелчок по модели выбирает компонент, Shift-щелчок — добавляет к выбору, двойной щелчок — заходит внутрь и выбирает его часть, Esc — выходит на уровень выше, Q внутри — только эта группа на экране. Delete — удалить выбранное, правый щелчок — скрыть или удалить. Всё, что есть в модели, — в «Составе» ниже.'
            : 'As in SketchUp: a click on the model picks a component, Shift-click adds to the selection, a double click goes inside and picks its part, Esc steps back out, Q inside leaves only that group on screen. Delete removes the selection, a right click hides or deletes. Everything in the model is in the outline below.'}</p>}
        <SectionHeading label={ru ? 'Состав модели' : 'Model outline'} subtle />
        <SketchupOutliner object={object} entry={entry} sketchup={sketchup} placedEditor={placedEditor} layoutEditor={layoutEditor} ru={ru} />
        <SectionHeading label={ru ? '2D-растения SketchUp' : 'SketchUp 2D plants'} subtle />
        <CheckboxControl controlId="sketchupModels[].faceCamera" testId="placed-sketchup-face" label={ru ? 'Растения к камере' : 'Plants face the camera'} checked={sketchup.faceCamera}
            onChange={(event) => placedEditor.setSketchup(object.id, { faceCamera: event.target.checked })} />
        {entry.crowns ? <CheckboxControl controlId="sketchupModels[].crowns" testId="placed-sketchup-crowns" label={ru ? 'Круги крон' : 'Crown circles'} checked={sketchup.crowns}
            onChange={(event) => placedEditor.setSketchup(object.id, { crowns: event.target.checked })} /> : null}
        <div className="home-editor-status" data-testid="placed-sketchup-status">{`${ru ? '2D-растений' : '2D plants'}: ${entry.cards} · ${ru ? 'кругов крон' : 'crown circles'}: ${entry.crowns} · ${ru ? 'скрыто частей' : 'parts hidden'}: ${sketchup.hidden.length}${sketchup.removed?.length ? ` · ${ru ? 'удалено' : 'deleted'}: ${sketchup.removed.length}` : ''}`}</div>
        {views.length ? <>
            <SectionHeading label={`${ru ? 'Сцены SketchUp' : 'SketchUp scenes'} · ${views.length}`} subtle />
            <div className="home-editor-tabs">
                {button(fresh.length ? `${ru ? 'Сделать камерами' : 'Make them cameras'} · ${fresh.length}` : (ru ? 'Все сцены уже камеры' : 'All scenes are cameras'),
                    () => layoutEditor?.addCameras?.(fresh), { disabled: !fresh.length, 'data-testid': 'placed-sketchup-cameras' })}
            </div>
            {sceneCameras.length ? <div className="focus-control-row focus-control-row--range sketchup-lens" data-testid="placed-sketchup-lens">
                <span /><label title={ru ? 'Угол обзора камер из сцен SketchUp — по высоте кадра, как в SketchUp' : 'Field of view of the cameras made from SketchUp scenes — by height, as in SketchUp'}>{ru ? 'Объектив сцен' : 'Scene lens'}</label>
                <input type="range" min={15} max={90} step={0.5} value={lens ?? commonLens} onChange={(event) => setLens(Number(event.target.value))} aria-label={ru ? 'Объектив сцен' : 'Scene lens'} />
                <input type="number" min={15} max={90} step={0.5} value={lens ?? commonLens} onChange={(event) => setLens(Number(event.target.value))} aria-label={ru ? 'Объектив сцен, градусы' : 'Scene lens, degrees'} />
                <span className="focus-control-unit">°</span>
            </div> : null}
            {sceneCameras.length ? <div className="home-editor-tabs">
                {button(`${ru ? 'Объектив ко всем сценам' : 'Lens to every scene'} · ${sceneCameras.length}`, () => { layoutEditor?.setCamerasFov?.(sceneCameras.map((camera) => camera.id), lens ?? commonLens); setLens(null); }, { disabled: lens === null || lens === commonLens, 'data-testid': 'placed-sketchup-lens-apply' })}
            </div> : null}
        </> : null}
    </>;
}

// «+ Добавить»: что поставить в сцену — одним меню, а не рядом кнопок. Модель
// .glb и выгрузка SketchUp — файлы, они живут в проекте движка.
function AddMenu({ placedEditor, full, inProject, busy, importModel, ru }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const away = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', away, true);
        return () => document.removeEventListener('pointerdown', away, true);
    }, [open]);
    const fileItem = (sketchup, label, hint, testId) => <label className={`placed-menu__item${full || !inProject || busy ? ' is-disabled' : ''}`} title={inProject ? hint : (ru ? 'Модели импортируются в проект движка' : 'Models are imported into an engine project')} data-testid={testId}>
        <FocusIcon name="box" /><span>{label}<small>{hint}</small></span>
        <input type="file" accept=".glb,model/gltf-binary" hidden disabled={full || !inProject || busy}
            onChange={(event) => { const [file] = event.target.files ?? []; event.target.value = ''; setOpen(false); void importModel(file, { sketchup }); }} />
    </label>;
    return <div ref={ref} className="placed-add">
        <button type="button" className="placed-add__button" onClick={() => setOpen((value) => !value)} aria-expanded={open} disabled={full} data-testid="placed-add"><FocusIcon name="plus" />{ru ? 'Добавить' : 'Add'}</button>
        {open ? <div className="placed-menu" role="menu">
            {PLACED_KINDS.filter((id) => id !== 'model').map((id) => <button key={id} type="button" role="menuitem" className="placed-menu__item" disabled={full} data-testid={`placed-add-${id}`} onClick={() => { setOpen(false); placedEditor?.add(id); }}>
                <FocusIcon name={KIND_ICONS[id]} /><span>{KIND_LABELS[id][ru ? 0 : 1]}</span>
            </button>)}
            <hr />
            {fileItem(true, 'SketchUp .glb', ru ? 'выгрузка SimLab: компоненты, 2D-растения, сцены' : 'a SimLab export: components, 2D plants, scenes', 'placed-import-sketchup')}
            {fileItem(false, ru ? 'Модель .glb' : 'Model .glb', ru ? 'любой glTF: скан, предмет' : 'any glTF: a scan, an object', 'placed-import-model')}
            <p>{ru ? 'Встаёт туда, куда смотрит камера, и садится на землю.' : 'It lands where the camera looks and sits on the ground.'}</p>
        </div> : null}
    </div>;
}

const KIND_ICONS = { tree: 'tree', shrub: 'sprout', rock: 'rock', model: 'box' };

// Расстановка: сверху — «Добавить» и список всего, что стоит в сцене (глаз —
// скрыть); у выбранного — имя и действия сразу под ним (показать, на землю,
// копия, удалить), дальше разделы, которые сворачиваются: модель, SketchUp,
// форма, место. Щелчок по объекту в сцене выбирает его в этом списке.
export function PlacedSection({ settings, placedEditor, layoutEditor }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const objects = settings.placedObjects ?? [], selected = objects.find((o) => o.id === placedEditor?.selectedId);
    const kind = selected?.kind ?? 'tree';
    const object = selected ?? { ...PLACED_TRANSFORM_DEFAULT, ...PLACED_KIND_DEFAULTS.tree };
    const full = objects.length >= PLACED_LIMITS.objects;
    // Models are a project's own files: the site's own scene imports none.
    const inProject = Boolean(activeProjectId());
    const [upload, setUpload] = useState(null);
    const importModel = async (file, options) => {
        if (!file) return;
        setUpload({ name: file.name, megabytes: file.size / 2 ** 20, sketchup: options?.sketchup });
        try {
            const { report } = await placedEditor.importModel(file, options);
            setUpload(report ? { name: file.name, report } : null);
        } catch (error) {
            setUpload({ name: file.name, error: error.message });
        }
    };
    const replaceModel = async (file) => {
        if (!file || !selected) return;
        setUpload({ name: file.name, megabytes: file.size / 2 ** 20, replacing: true });
        try {
            const { report, kept, hidden } = await placedEditor.replaceModel(selected.id, file);
            setUpload({ name: file.name, replaced: { kept, hidden }, report });
        } catch (error) {
            setUpload({ name: file.name, error: error.message });
        }
    };
    const sketchup = selected ? settings[SKETCHUP_KEY]?.[selected.id] : null;
    const range = (key, [r, e, unit], [min, max, step]) => <RangeControl key={key} controlId={`placedObjects[].${key}`} testId={`placed-${key}`} label={ru ? r : e} value={object[key]} min={min} max={max} step={step} unit={unit}
        onChange={(event) => selected && placedEditor.update(selected.id, { [key]: Number(event.target.value) })} />;
    const toggle = (key, [r, e], checked) => <CheckboxControl key={key} controlId={`placedObjects[].${key}`} testId={`placed-${key}`} label={ru ? r : e} checked={checked}
        onChange={(event) => selected && placedEditor.update(selected.id, { [key]: event.target.checked })} />;
    const catalog = Boolean(scope?.catalogOnly);
    const species = (selected || catalog) && PLACED_SPECIES[kind].length > 1
        ? <SelectControl controlId="placedObjects[].species" label={kind === 'model' ? (ru ? 'Свет' : 'Light') : (ru ? 'Вид' : 'Species')} value={object.species} options={PLACED_SPECIES[kind].map((id) => ({ value: id, label: placedSpeciesLabel(kind, id, language) }))}
            onChange={(event) => selected && placedEditor.setSpecies(selected.id, event.target.value)} /> : null;
    return <>
        {catalog ? <>
            <SelectControl controlId="placedObjects" label={ru ? 'Объект' : 'Object'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...objects.map((o) => ({ value: o.id, label: o.name }))]} onChange={(event) => placedEditor?.select(event.target.value || null)} />
        </> : <>
            <div className="placed-bar">
                <AddMenu placedEditor={placedEditor} full={full} inProject={inProject} busy={Boolean(upload?.megabytes)} importModel={importModel} ru={ru} />
                <span className="placed-bar__count">{ru ? 'Объектов' : 'Objects'} {objects.length}/{PLACED_LIMITS.objects}</span>
            </div>
            {upload ? <div className="home-editor-status" data-testid="placed-import-status">{upload.error
                ? `${ru ? 'Не загрузилась' : 'Not imported'} «${upload.name}»: ${upload.error}`
                : upload.replaced ? `${ru ? 'Новая версия' : 'New version'} «${upload.name}» ${ru ? 'стоит на месте старой' : 'stands where the old one stood'}${upload.replaced.hidden ? ` · ${ru ? 'скрытые части' : 'hidden parts'} ${upload.replaced.kept}/${upload.replaced.hidden}` : ''}${upload.report ? ` · ${sketchupReport(upload, ru)}` : ''}`
                    : upload.report ? sketchupReport(upload, ru)
                        : `${ru ? (upload.replacing ? 'Заменяю на' : upload.sketchup ? 'Загружаю и готовлю' : 'Загружаю') : (upload.replacing ? 'Replacing with' : upload.sketchup ? 'Importing and preparing' : 'Importing')} «${upload.name}» · ${upload.megabytes.toFixed(1)} ${ru ? 'МБ' : 'MB'}…`}</div> : null}
            {objects.length ? <div className="placed-list" role="listbox" aria-label={ru ? 'Объекты расстановки' : 'Placed objects'} data-testid="placed-list">
                {objects.map((o) => <div key={o.id} className={`placed-row${o.id === selected?.id ? ' is-active' : ''}${o.hidden ? ' is-hidden' : ''}`} role="option" aria-selected={o.id === selected?.id}>
                    <button type="button" className="placed-row__name" onClick={() => placedEditor?.select(o.id)} onDoubleClick={() => layoutEditor?.frameObject?.(`placed-${o.id}`)} title={ru ? 'Двойной щелчок — показать' : 'Double-click to frame'} data-testid={`placed-row-${o.kind}`}>
                        <FocusIcon name={KIND_ICONS[o.kind]} /><span>{o.name}</span><small>{settings[SKETCHUP_KEY]?.[o.id] ? 'SketchUp' : KIND_LABELS[o.kind][ru ? 0 : 1]}</small>
                    </button>
                    <button type="button" className="placed-row__eye" onClick={() => placedEditor.update(o.id, { hidden: !o.hidden })} aria-pressed={Boolean(o.hidden)} title={o.hidden ? (ru ? 'Показать объект' : 'Show the object') : (ru ? 'Скрыть объект' : 'Hide the object')} data-testid="placed-hidden"><FocusIcon name={o.hidden ? 'eyeoff' : 'eye'} /></button>
                </div>)}
            </div> : <p className="placed-hint">{ru ? 'Пока пусто. «Добавить» — дерево, куст, камень или модель; модель SketchUp — её выгрузка .glb.' : 'Nothing yet. “Add” a tree, a shrub, a rock or a model; a SketchUp model is its .glb export.'}</p>}
            {selected ? <div className="placed-card" data-testid="placed-card">
                <div className="placed-card__title"><FocusIcon name={KIND_ICONS[kind]} /><input value={selected.name} maxLength={64} aria-label={ru ? 'Имя объекта' : 'Object name'} onChange={(event) => placedEditor.update(selected.id, { name: event.target.value })} /></div>
                <div className="placed-actions">
                    <button type="button" onClick={() => layoutEditor?.frameObject?.(`placed-${selected.id}`)} title={ru ? 'Показать в кадре' : 'Frame it'}><FocusIcon name="target" />{ru ? 'Показать' : 'Frame'}</button>
                    <button type="button" onClick={() => placedEditor.seat(selected.id)} title={ru ? 'Поставить на землю' : 'Seat on the ground'}><FocusIcon name="ground" />{ru ? 'На землю' : 'Ground'}</button>
                    <button type="button" disabled={full} onClick={() => placedEditor.duplicate(selected.id)} title={ru ? 'Копия рядом' : 'A copy beside it'}><FocusIcon name="copy" />{ru ? 'Копия' : 'Copy'}</button>
                    <button type="button" className="is-danger" onClick={() => placedEditor.remove(selected.id)} data-testid="placed-delete" title={ru ? 'Удалить из сцены (⌘Z вернёт)' : 'Delete from the scene (⌘Z brings it back)'}><FocusIcon name="trash" />{ru ? 'Удалить' : 'Delete'}</button>
                </div>
            </div> : objects.length ? <p className="placed-hint">{ru ? 'Выберите объект в списке или щелчком в сцене.' : 'Pick an object in the list or with a click in the scene.'}</p> : null}
        </>}
        {selected?.kind === 'model' || (catalog && kind === 'model') ? <>
            <SectionHeading label={ru ? 'Модель' : 'Model'} />
            {/* Модель SketchUp строится по правилам движка: светится сценой и
                всегда твёрдая. «Свет» и «Коллизия» — для чужих моделей, «Вода» —
                только там, где есть море. */}
            {catalog || !sketchup ? species : null}
            {catalog || sceneObjectOn(settings, 'water') ? toggle('wet', ['Реакция на воду', 'Wet by the sea'], Boolean(selected?.wet)) : null}
            {catalog || !sketchup ? toggle('collision', ['Коллизия', 'Collision'], Boolean(selected?.collision)) : null}
            {selected ? <div className="home-editor-tabs">
                <label className={`home-editor-tab${upload?.megabytes ? ' is-disabled' : ''}`} title={ru ? 'Новая выгрузка того же файла встанет на место старой; скрытые части переедут' : 'A new export of the same file stands where the old one stood; hidden parts move along'} data-testid="placed-replace-model">
                    {ru ? 'Заменить версию…' : 'Replace version…'}
                    <input type="file" accept=".glb,model/gltf-binary" hidden disabled={Boolean(upload?.megabytes)}
                        onChange={(event) => { const [file] = event.target.files ?? []; event.target.value = ''; void replaceModel(file); }} />
                </label>
            </div> : null}
        </> : species ? <>
            <SectionHeading label={ru ? 'Вид' : 'Species'} />
            {species}
        </> : null}
        {selected?.kind === 'model' && sketchup ? <>
            <SectionHeading label="SketchUp" />
            <SketchupModel object={selected} sketchup={sketchup} placedEditor={placedEditor} layoutEditor={layoutEditor} ru={ru} />
        </> : null}
        {selected || catalog ? <>
            <SectionHeading label={ru ? 'Форма' : 'Form'} />
            {Object.entries(PLACED_KIND_RANGES[kind]).map(([key, limits]) => range(key, KNOB_LABELS[key], limits))}
            <SectionHeading label={ru ? 'Место' : 'Place'} />
            {Object.entries(placedTransformRanges(kind)).filter(([key]) => !(kind === 'model' && key === 'seed')).map(([key, limits]) => range(key, TRANSFORM_LABELS[key], limits))}
        </> : null}
    </>;
}
