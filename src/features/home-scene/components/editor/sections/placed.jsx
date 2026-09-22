import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import {
    PLACED_KIND_DEFAULTS, PLACED_KIND_RANGES, PLACED_KINDS, PLACED_LIMITS, PLACED_SPECIES, PLACED_TRANSFORM_DEFAULT, PLACED_TRANSFORM_RANGES, placedSpeciesLabel,
} from '../../../../../placed/settings.js';
import { useFocusControlScope } from '../focus/FocusControlsContext';

const KIND_LABELS = { tree: ['Дерево', 'Tree'], shrub: ['Куст', 'Shrub'], rock: ['Камень', 'Rock'] };
const KNOB_LABELS = {
    height: ['Высота', 'Height', ' m'], spread: ['Ширина кроны', 'Crown width', ' m'], lean: ['Наклон от ветра', 'Wind lean', ''], twist: ['Кручение ствола', 'Trunk twist', ''],
    density: ['Плотность листвы', 'Foliage density', ''], leafSize: ['Размер листа', 'Leaf size', ''], deadwood: ['Сухие ветви', 'Deadwood', ''], translucency: ['Просвечивание', 'Translucency', ''],
    dryness: ['Сухость', 'Dryness', ''], size: ['Размер', 'Size', ' m'], squash: ['Приплюснутость', 'Squash', ''], stretch: ['Вытянутость', 'Stretch', ''], variant: ['Форма', 'Form', ''], tilt: ['Наклон', 'Tilt', '°'],
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
    const range = (key, [r, e, unit], [min, max, step]) => <RangeControl key={key} controlId={`placedObjects[].${key}`} testId={`placed-${key}`} label={ru ? r : e} value={object[key]} min={min} max={max} step={step} unit={unit}
        onChange={(event) => selected && placedEditor.update(selected.id, { [key]: Number(event.target.value) })} />;
    return <>
        <div className="home-editor-tabs">
            {PLACED_KINDS.map((id) => <button key={id} type="button" className="home-editor-tab" disabled={full} data-testid={`placed-add-${id}`} onClick={() => placedEditor?.add(id)}>+ {KIND_LABELS[id][ru ? 0 : 1]}</button>)}
            {selected ? <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.(`placed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button> : null}
        </div>
        <div className="home-editor-status">{ru ? 'Объект ставится в точку, куда смотрит камера, и садится на землю; дальше — перенос, поворот и масштаб теми же инструментами, что у лодки.' : 'An object lands where the camera looks and sits on the ground; then move, rotate and scale it with the boat’s tools.'}</div>
        <SectionHeading label={`${ru ? 'Объекты' : 'Objects'} · ${objects.length}/${PLACED_LIMITS.objects}`} subtle />
        <SelectControl controlId="placedObjects" label={ru ? 'Объект' : 'Object'} value={selected?.id ?? ''} options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...objects.map((o) => ({ value: o.id, label: `${o.name} · ${KIND_LABELS[o.kind][ru ? 0 : 1]}` }))]}
            onChange={(event) => placedEditor?.select(event.target.value || null)} />
        {selected ? <div className="home-editor-control-group"><input className="home-editor-select" aria-label={ru ? 'Имя объекта' : 'Object name'} value={selected.name} maxLength={64} onChange={(event) => placedEditor.update(selected.id, { name: event.target.value })} /></div> : null}
        {(selected || scope?.catalogOnly) && PLACED_SPECIES[kind].length > 1 ? <SelectControl controlId="placedObjects[].species" label={ru ? 'Вид' : 'Species'} value={object.species} options={PLACED_SPECIES[kind].map((species) => ({ value: species, label: placedSpeciesLabel(kind, species, language) }))}
            onChange={(event) => selected && placedEditor.setSpecies(selected.id, event.target.value)} /> : null}
        {selected || scope?.catalogOnly ? <>
            <SectionHeading label={ru ? 'Форма' : 'Form'} subtle />
            {Object.entries(PLACED_KIND_RANGES[kind]).map(([key, limits]) => range(key, KNOB_LABELS[key], limits))}
            <SectionHeading label={ru ? 'Место' : 'Place'} subtle />
            {Object.entries(PLACED_TRANSFORM_RANGES).map(([key, limits]) => range(key, TRANSFORM_LABELS[key], limits))}
        </> : null}
        {selected ? <div className="home-editor-tabs">
            <button type="button" className="home-editor-tab" onClick={() => placedEditor.seat(selected.id)}>{ru ? 'На землю' : 'Seat on ground'}</button>
            <button type="button" className="home-editor-tab" disabled={full} onClick={() => placedEditor.duplicate(selected.id)}>{ru ? 'Дублировать' : 'Duplicate'}</button>
            <button type="button" className="home-editor-tab" onClick={() => placedEditor.remove(selected.id)} data-testid="placed-delete">{ru ? 'Удалить' : 'Delete'}</button>
        </div> : null}
    </>;
}
