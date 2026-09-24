import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import {
    PLACED_KIND_DEFAULTS, PLACED_KIND_RANGES, PLACED_KINDS, PLACED_LIMITS, PLACED_SPECIES, PLACED_TRANSFORM_DEFAULT, placedSpeciesLabel, placedTransformRanges,
} from '../../../../../placed/settings.js';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { copiesOf, findPart, partName, SKETCHUP_VIEW_FOV, sketchupSceneNodes, sketchupViews, useSketchupModel } from '../../../../../placed/sketchupModel.js';

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

// The SketchUp block of a selected model: its 2D plants, the component a click
// picked (with the chain of groups it sits in, as SketchUp shows it), the
// parts hidden, and the scenes as cameras.
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
    return <>
        <SectionHeading label="SketchUp" subtle />
        <CheckboxControl controlId="sketchupModels[].faceCamera" testId="placed-sketchup-face" label={ru ? 'Растения к камере' : 'Plants face the camera'} checked={sketchup.faceCamera}
            onChange={(event) => placedEditor.setSketchup(object.id, { faceCamera: event.target.checked })} />
        {entry?.crowns ? <CheckboxControl controlId="sketchupModels[].crowns" testId="placed-sketchup-crowns" label={ru ? 'Круги крон' : 'Crown circles'} checked={sketchup.crowns}
            onChange={(event) => placedEditor.setSketchup(object.id, { crowns: event.target.checked })} /> : null}
        <div className="home-editor-status" data-testid="placed-sketchup-status">{entry
            ? `${ru ? '2D-растений' : '2D plants'}: ${entry.cards} · ${ru ? 'кругов крон' : 'crown circles'}: ${entry.crowns} · ${ru ? 'скрыто частей' : 'parts hidden'}: ${sketchup.hidden.length}`
            : object.hidden ? (ru ? 'Модель скрыта: компоненты и сцены — когда она снова видна.' : 'The model is hidden: its components and scenes come back with it.')
                : !activeProjectId() ? (ru ? 'Файл модели лежит в проекте движка — компоненты видны, когда редактор открыт в проекте.' : 'The model’s file lives in an engine project: open the editor in the project to reach its parts.')
                    : (ru ? 'Модель загружается…' : 'The model is loading…')}</div>
        {part && picked ? <>
            <div className="home-editor-tabs" data-testid="placed-sketchup-trail">
                {part.trail.map((node) => { const at = findPart(entry.root, node); return at ? <button key={node} type="button" className={`home-editor-tab${node === part.node ? ' active' : ''}`} aria-pressed={node === part.node} onClick={() => placedEditor.selectPart(node)}>{partName(at, ru)}</button> : null; })}
            </div>
            <div className="home-editor-tabs">
                {button(ru ? 'Скрыть' : 'Hide', () => placedEditor.hideParts(object.id, [part.node]), { 'data-testid': 'placed-sketchup-hide' })}
                {copies.length > 1 ? button(`${ru ? 'Скрыть все такие' : 'Hide all copies'} · ${copies.length}`, () => placedEditor.hideParts(object.id, copies.map((copy) => copy.userData.gltfNode)), { 'data-testid': 'placed-sketchup-hide-copies' }) : null}
                {button(ru ? 'Показать' : 'Frame', () => layoutEditor?.frameObject?.(picked))}
            </div>
        </> : <div className="home-editor-status">{ru
            ? 'Щелчок по модели выделяет компонент целиком, как в SketchUp; кнопки над ним — группы, в которых он лежит, чтобы подняться выше или зайти внутрь.'
            : 'A click on the model picks a whole component, as in SketchUp; the buttons above it are the groups it sits in, to go up or inside.'}</div>}
        <div className="home-editor-tabs">
            {sketchup.hidden.length ? button(`${ru ? 'Показать скрытые' : 'Show hidden'} · ${sketchup.hidden.length}`, () => placedEditor.showParts(object.id), { 'data-testid': 'placed-sketchup-show' }) : null}
            {views.length ? button(fresh.length ? `${ru ? 'Сцены SketchUp → камеры' : 'SketchUp scenes → cameras'} · ${fresh.length}` : (ru ? 'Сцены SketchUp уже в камерах' : 'SketchUp scenes are cameras already'),
                () => layoutEditor?.addCameras?.(fresh), { disabled: !fresh.length, 'data-testid': 'placed-sketchup-cameras' }) : null}
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
    </>;
}

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
    const importInput = (sketchup) => <input type="file" accept=".glb,model/gltf-binary" hidden disabled={full || !inProject || Boolean(upload?.megabytes)}
        onChange={(event) => { const [file] = event.target.files ?? []; event.target.value = ''; void importModel(file, { sketchup }); }} />;
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
    return <>
        <div className="home-editor-tabs">
            {PLACED_KINDS.filter((id) => id !== 'model').map((id) => <button key={id} type="button" className="home-editor-tab" disabled={full} data-testid={`placed-add-${id}`} onClick={() => placedEditor?.add(id)}>+ {KIND_LABELS[id][ru ? 0 : 1]}</button>)}
            <label className={`home-editor-tab${full || !inProject || upload?.megabytes ? ' is-disabled' : ''}`} title={inProject ? '' : (ru ? 'Модели импортируются в проект движка' : 'Models are imported into an engine project')} data-testid="placed-import-model">
                + {ru ? 'Модель .glb' : 'Model .glb'}
                {importInput(false)}
            </label>
            <label className={`home-editor-tab${full || !inProject || upload?.megabytes ? ' is-disabled' : ''}`} title={inProject ? (ru ? 'Выгрузка SketchUp (.glb, плагин SimLab): компоненты, 2D-растения, сцены' : 'A SketchUp export (.glb, SimLab plugin): components, 2D plants, scenes') : (ru ? 'Модели импортируются в проект движка' : 'Models are imported into an engine project')} data-testid="placed-import-sketchup">
                + SketchUp .glb
                {importInput(true)}
            </label>
            {selected ? <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.(`placed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button> : null}
        </div>
        <div className="home-editor-status">{ru ? 'Объект ставится в точку, куда смотрит камера, и садится на землю; дальше — перенос, поворот и масштаб теми же инструментами, что у лодки.' : 'An object lands where the camera looks and sits on the ground; then move, rotate and scale it with the boat’s tools.'}</div>
        {upload ? <div className="home-editor-status" data-testid="placed-import-status">{upload.error
            ? `${ru ? 'Не загрузилась' : 'Not imported'} «${upload.name}»: ${upload.error}`
            : upload.replaced ? `${ru ? 'Новая версия' : 'New version'} «${upload.name}» ${ru ? 'стоит на месте старой' : 'stands where the old one stood'}${upload.replaced.hidden ? ` · ${ru ? 'скрытые части' : 'hidden parts'} ${upload.replaced.kept}/${upload.replaced.hidden}` : ''}${upload.report ? ` · ${sketchupReport(upload, ru)}` : ''}`
                : upload.report ? sketchupReport(upload, ru)
                    : `${ru ? (upload.replacing ? 'Заменяю на' : upload.sketchup ? 'Загружаю и готовлю' : 'Загружаю') : (upload.replacing ? 'Replacing with' : upload.sketchup ? 'Importing and preparing' : 'Importing')} «${upload.name}» · ${upload.megabytes.toFixed(1)} ${ru ? 'МБ' : 'MB'}…`}</div> : null}
        <SectionHeading label={`${ru ? 'Объекты' : 'Objects'} · ${objects.length}/${PLACED_LIMITS.objects}`} subtle />
        <SelectControl controlId="placedObjects" label={ru ? 'Объект' : 'Object'} value={selected?.id ?? ''} options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...objects.map((o) => ({ value: o.id, label: `${o.name} · ${KIND_LABELS[o.kind][ru ? 0 : 1]}` }))]}
            onChange={(event) => placedEditor?.select(event.target.value || null)} />
        {selected ? <div className="home-editor-control-group"><input className="home-editor-select" aria-label={ru ? 'Имя объекта' : 'Object name'} value={selected.name} maxLength={64} onChange={(event) => placedEditor.update(selected.id, { name: event.target.value })} /></div> : null}
        {(selected || scope?.catalogOnly) && PLACED_SPECIES[kind].length > 1 ? <SelectControl controlId="placedObjects[].species" label={kind === 'model' ? (ru ? 'Свет' : 'Light') : (ru ? 'Вид' : 'Species')} value={object.species} options={PLACED_SPECIES[kind].map((species) => ({ value: species, label: placedSpeciesLabel(kind, species, language) }))}
            onChange={(event) => selected && placedEditor.setSpecies(selected.id, event.target.value)} /> : null}
        {selected ? toggle('hidden', ['Скрыть', 'Hide'], Boolean(selected.hidden)) : null}
        {selected?.kind === 'model' ? <>
            {toggle('wet', ['Реакция на воду', 'Wet by the sea'], selected.wet)}
            {toggle('collision', ['Коллизия', 'Collision'], selected.collision)}
            <div className="home-editor-tabs">
                <label className={`home-editor-tab${upload?.megabytes ? ' is-disabled' : ''}`} title={ru ? 'Новая выгрузка того же файла встанет на место старой; скрытые части переедут' : 'A new export of the same file stands where the old one stood; hidden parts move along'} data-testid="placed-replace-model">
                    {ru ? 'Заменить версию…' : 'Replace version…'}
                    <input type="file" accept=".glb,model/gltf-binary" hidden disabled={Boolean(upload?.megabytes)}
                        onChange={(event) => { const [file] = event.target.files ?? []; event.target.value = ''; void replaceModel(file); }} />
                </label>
            </div>
        </> : null}
        {selected?.kind === 'model' && sketchup ? <SketchupModel object={selected} sketchup={sketchup} placedEditor={placedEditor} layoutEditor={layoutEditor} ru={ru} /> : null}
        {selected || scope?.catalogOnly ? <>
            <SectionHeading label={ru ? 'Форма' : 'Form'} subtle />
            {Object.entries(PLACED_KIND_RANGES[kind]).map(([key, limits]) => range(key, KNOB_LABELS[key], limits))}
            <SectionHeading label={ru ? 'Место' : 'Place'} subtle />
            {Object.entries(placedTransformRanges(kind)).filter(([key]) => !(kind === 'model' && key === 'seed')).map(([key, limits]) => range(key, TRANSFORM_LABELS[key], limits))}
        </> : null}
        {selected ? <div className="home-editor-tabs">
            <button type="button" className="home-editor-tab" onClick={() => placedEditor.seat(selected.id)}>{ru ? 'На землю' : 'Seat on ground'}</button>
            <button type="button" className="home-editor-tab" disabled={full} onClick={() => placedEditor.duplicate(selected.id)}>{ru ? 'Дублировать' : 'Duplicate'}</button>
            <button type="button" className="home-editor-tab" onClick={() => placedEditor.remove(selected.id)} data-testid="placed-delete">{ru ? 'Удалить' : 'Delete'}</button>
        </div> : null}
    </>;
}
