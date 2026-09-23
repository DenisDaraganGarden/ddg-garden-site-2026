import React, { useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import {
    PLACED_KIND_DEFAULTS, PLACED_KIND_RANGES, PLACED_KINDS, PLACED_LIMITS, PLACED_SPECIES, PLACED_TRANSFORM_DEFAULT, placedSpeciesLabel, placedTransformRanges,
} from '../../../../../placed/settings.js';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { useFocusControlScope } from '../focus/FocusControlsContext';

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
export function PlacedSection({ settings, placedEditor, layoutEditor }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const objects = settings.placedObjects ?? [], selected = objects.find((o) => o.id === placedEditor?.selectedId);
    const kind = selected?.kind ?? 'tree';
    const object = selected ?? { ...PLACED_TRANSFORM_DEFAULT, ...PLACED_KIND_DEFAULTS.tree };
    const full = objects.length >= PLACED_LIMITS.objects;
    // Models are a project's own files: the site's own scene imports none.
    const inProject = Boolean(activeProjectId());
    const [upload, setUpload] = useState(null);
    const importModel = async (file) => {
        if (!file) return;
        setUpload({ name: file.name, megabytes: file.size / 2 ** 20 });
        try {
            await placedEditor.importModel(file);
            setUpload(null);
        } catch (error) {
            setUpload({ name: file.name, error: error.message });
        }
    };
    const range = (key, [r, e, unit], [min, max, step]) => <RangeControl key={key} controlId={`placedObjects[].${key}`} testId={`placed-${key}`} label={ru ? r : e} value={object[key]} min={min} max={max} step={step} unit={unit}
        onChange={(event) => selected && placedEditor.update(selected.id, { [key]: Number(event.target.value) })} />;
    const toggle = (key, [r, e], checked) => <CheckboxControl key={key} controlId={`placedObjects[].${key}`} testId={`placed-${key}`} label={ru ? r : e} checked={checked}
        onChange={(event) => selected && placedEditor.update(selected.id, { [key]: event.target.checked })} />;
    return <>
        <div className="home-editor-tabs">
            {PLACED_KINDS.filter((id) => id !== 'model').map((id) => <button key={id} type="button" className="home-editor-tab" disabled={full} data-testid={`placed-add-${id}`} onClick={() => placedEditor?.add(id)}>+ {KIND_LABELS[id][ru ? 0 : 1]}</button>)}
            <label className={`home-editor-tab${full || !inProject || upload?.megabytes ? ' is-disabled' : ''}`} title={inProject ? '' : (ru ? 'Модели импортируются в проект движка' : 'Models are imported into an engine project')} data-testid="placed-import-model">
                + {ru ? 'Модель .glb' : 'Model .glb'}
                <input type="file" accept=".glb,model/gltf-binary" hidden disabled={full || !inProject || Boolean(upload?.megabytes)}
                    onChange={(event) => { const [file] = event.target.files ?? []; event.target.value = ''; void importModel(file); }} />
            </label>
            {selected ? <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.(`placed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button> : null}
        </div>
        <div className="home-editor-status">{ru ? 'Объект ставится в точку, куда смотрит камера, и садится на землю; дальше — перенос, поворот и масштаб теми же инструментами, что у лодки.' : 'An object lands where the camera looks and sits on the ground; then move, rotate and scale it with the boat’s tools.'}</div>
        {upload ? <div className="home-editor-status" data-testid="placed-import-status">{upload.error
            ? `${ru ? 'Не загрузилась' : 'Not imported'} «${upload.name}»: ${upload.error}`
            : `${ru ? 'Загружаю' : 'Importing'} «${upload.name}» · ${upload.megabytes.toFixed(1)} ${ru ? 'МБ' : 'MB'}…`}</div> : null}
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
        </> : null}
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
