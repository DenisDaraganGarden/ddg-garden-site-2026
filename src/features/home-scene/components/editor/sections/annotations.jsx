import React, { useMemo } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { ANNOTATION_LIMITS, ANNOTATION_RANGES, ANNOTATION_STEPS, formatLevel, markLevels } from '../../../../../annotations/settings.js';
import './annotations.css';

// Отметки уровня (src/annotations): инструмент «Отметка» (M) — щелчок по
// поверхности ставит отметку; первая — ноль. Список: число с живой
// поверхности, ноль, показать, сделать нулём, убрать. Ниже — как они
// выглядят: цвет, единицы, округление, размер, с какого расстояния гаснут.
const MARKS_KEY = 'annotationMarks';
const UNIT_OPTIONS = [['m', 'Метры', 'Metres'], ['cm', 'Сантиметры', 'Centimetres'], ['mm', 'Миллиметры', 'Millimetres']];
const STEP_LABELS = { 0.001: ['1 мм', '1 mm'], 0.005: ['5 мм', '5 mm'], 0.01: ['1 см', '1 cm'], 0.05: ['5 см', '5 cm'], 0.1: ['10 см', '10 cm'] };

export function AnnotationsSection({ settings, handleSettingChange, annotationEditor, layoutEditor, gizmo }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const marks = settings[MARKS_KEY];
    const levels = useMemo(() => markLevels(marks ?? []), [marks]);
    const format = (id) => formatLevel(levels.get(id), { units: settings.annotationUnits, step: settings.annotationStep, ru });
    const catalog = Boolean(scope?.catalogOnly);
    const active = gizmo?.tool === 'mark';
    const frame = (mark) => layoutEditor?.previewPose?.({ cameraPosition: { x: mark.x + 5, y: mark.y + 3.5, z: mark.z + 7 }, cameraTarget: { x: mark.x, y: mark.y + 0.4, z: mark.z }, cameraFov: 45 });
    const list = marks ?? [];
    return <>
        {catalog ? <SelectControl controlId={MARKS_KEY} label={ru ? 'Отметка' : 'Mark'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...list.map((mark) => ({ value: mark.id, label: format(mark.id) }))]} onChange={(event) => event.target.value && annotationEditor?.select(event.target.value)} /> : <>
            <button type="button" className={`annotations-tool${active ? ' is-active' : ''}`} onClick={() => (active ? gizmo?.setTool?.('select') : annotationEditor?.begin())} disabled={list.length >= ANNOTATION_LIMITS.marks} data-testid="annotations-place">
                <FocusIcon name="level" /><span>{ru ? 'Поставить отметку' : 'Place a level mark'}</span><kbd>M</kbd>
            </button>
            <p className="annotations-hint">{active
                ? (ru ? 'Щелчок по поверхности — отметка там. Первая — ноль ±0,000, дальше числа от неё. Протяжка крутит камеру. Esc — выйти.' : 'A click on a surface places a mark. The first is zero ±0.000, the rest count from it. A drag turns the camera. Esc to leave.')
                : (ru ? 'Отметка берёт высоту с поверхности под собой: модель заменили или сдвинули — число пересчитается само.' : 'A mark takes its height from the surface under it: replace or move the model and the number follows.')}</p>
            {list.length ? <div className="annotations-list" data-testid="annotations-list">
                {list.map((mark) => <div key={mark.id} className={`annotations-row${mark.id === annotationEditor?.selectedId ? ' is-active' : ''}`}>
                    <button type="button" className="annotations-row__value" onClick={() => { annotationEditor?.select(mark.id); frame(mark); }} title={ru ? 'Выбрать и показать' : 'Select and frame'}>
                        <b>{format(mark.id)}</b>{mark.zero ? <small>{ru ? 'ноль' : 'zero'}</small> : null}
                    </button>
                    {!mark.zero ? <button type="button" className="annotations-row__action" onClick={() => annotationEditor?.setZero(mark.id)} title={ru ? 'Принять за ноль' : 'Make it zero'} data-testid="annotations-zero">±0</button> : null}
                    <button type="button" className="annotations-row__action" onClick={() => annotationEditor?.remove(mark.id)} title={ru ? 'Убрать отметку' : 'Remove the mark'} data-testid="annotations-remove"><FocusIcon name="trash" /></button>
                </div>)}
            </div> : null}
        </>}
        <SectionHeading label={ru ? 'Вид отметок' : 'How marks look'} />
        <ColorControl controlId="annotationColor" label={ru ? 'Цвет' : 'Colour'} value={settings.annotationColor} onChange={(event) => handleSettingChange(event, 'annotationColor', 'color')} />
        <CheckboxControl controlId="annotationFill" label={ru ? 'Заливка под числом' : 'Fill under the number'} checked={settings.annotationFill !== false} onChange={(event) => handleSettingChange(event, 'annotationFill', 'boolean')} testId="annotations-fill" />
        <CheckboxControl controlId="annotationOutline" label={ru ? 'Обводка числа' : 'Frame round the number'} checked={settings.annotationOutline !== false} onChange={(event) => handleSettingChange(event, 'annotationOutline', 'boolean')} testId="annotations-outline" />
        <SelectControl controlId="annotationUnits" label={ru ? 'Единицы' : 'Units'} value={settings.annotationUnits} options={UNIT_OPTIONS.map(([value, r, e]) => ({ value, label: ru ? r : e }))} onChange={(event) => handleSettingChange(event, 'annotationUnits', 'string')} />
        <SelectControl controlId="annotationStep" label={ru ? 'Округление' : 'Rounding'} value={String(settings.annotationStep)} options={ANNOTATION_STEPS.map((step) => ({ value: String(step), label: STEP_LABELS[step][ru ? 0 : 1] }))} onChange={(event) => handleSettingChange(event, 'annotationStep')} />
        <RangeControl controlId="annotationSize" label={ru ? 'Размер' : 'Size'} value={settings.annotationSize} min={ANNOTATION_RANGES.size[0]} max={ANNOTATION_RANGES.size[1]} step={ANNOTATION_RANGES.size[2]} unit=" ×" onChange={(event) => handleSettingChange(event, 'annotationSize')} />
        <RangeControl controlId="annotationLine" label={ru ? 'Толщина линий' : 'Line weight'} value={settings.annotationLine ?? 1} min={ANNOTATION_RANGES.line[0]} max={ANNOTATION_RANGES.line[1]} step={ANNOTATION_RANGES.line[2]} unit=" ×" onChange={(event) => handleSettingChange(event, 'annotationLine')} />
        <RangeControl controlId="annotationFade" label={ru ? 'Гаснут дальше' : 'Fade beyond'} value={settings.annotationFade} min={ANNOTATION_RANGES.fade[0]} max={ANNOTATION_RANGES.fade[1]} step={ANNOTATION_RANGES.fade[2]} unit=" m" onChange={(event) => handleSettingChange(event, 'annotationFade')} />
    </>;
}
