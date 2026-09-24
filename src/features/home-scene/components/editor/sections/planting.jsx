import React, { useMemo } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { PLANTING_BED_DEFAULT, PLANTING_LIMITS, PLANTING_RANGES } from '../../../../../planting/settings.js';
import { PLANTING_PALETTES } from '../../../../../planting/palettes.js';
import { plantingSchedule, polygonArea, scheduleCsv } from '../../../../../planting/fillBed.js';
import { plantName, useBedFills, usePlantLibrary } from '../../../../../planting/plantLibrary.js';
import { MONTHS_EN, MONTHS_RU } from '../../../../../planting/season.js';
import { activeProjectId } from '../../../../engine/projectApi.js';

const CATEGORY = {
    tree: ['Дерево', 'Tree'], shrub: ['Кустарник', 'Shrub'], conifer: ['Хвойное', 'Conifer'], topiary: ['Стриженое', 'Topiary'],
    grass: ['Злак', 'Grass'], perennial: ['Многолетник', 'Perennial'], groundcover: ['Почвопокров', 'Groundcover'],
};
const ORDER = ['tree', 'conifer', 'topiary', 'shrub', 'grass', 'perennial', 'groundcover'];
const byCategory = (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category);
const Dot = ({ color }) => <span className="planting-dot" style={{ background: color }} aria-hidden="true" />;
// Одиночные растения правятся инструментом «Посадить» и кнопкой «Убрать
// последнее», а не ползунком; ключ назван здесь для сверки параметров
// (check-editor-keys.mjs).
const POINTS_KEY = 'plantingPoints';

// Рецепт цветника: вид и его доля площади, %. Строки не входят в каталог
// параметров — их столько, сколько видов в цветнике.
function RecipeRows({ bed, library, plantingEditor, ru }) {
    const options = useMemo(() => [...library.values()].filter((p) => p.category !== 'tree').sort(byCategory), [library]);
    const set = (recipe) => plantingEditor.updateBed(bed.id, { recipe });
    const total = bed.recipe.reduce((sum, row) => sum + row.share, 0) || 1;
    const free = options.find((plant) => !bed.recipe.some((row) => row.plant === plant.id));
    return <>
        {bed.recipe.map((row, index) => {
            const plant = library.get(row.plant);
            return <div key={row.plant} className="focus-control-row planting-recipe-row" data-testid="planting-recipe-row">
                <Dot color={plant?.cap ?? '#777'} />
                <select value={row.plant} aria-label={ru ? 'Растение' : 'Plant'} onChange={(event) => set(bed.recipe.map((r, i) => (i === index ? { ...r, plant: event.target.value } : r)))}>
                    {!plant ? <option value={row.plant}>{row.plant}</option> : null}
                    {options.filter((p) => p.id === row.plant || !bed.recipe.some((r) => r.plant === p.id)).map((p) => <option key={p.id} value={p.id}>{plantName(p, ru)}</option>)}
                </select>
                <input type="number" min={1} max={100} step={1} value={row.share} aria-label={ru ? 'Доля, %' : 'Share, %'} title={`${Math.round((row.share / total) * 100)}%`}
                    onChange={(event) => set(bed.recipe.map((r, i) => (i === index ? { ...r, share: Number(event.target.value) } : r)))} />
                <button type="button" className="planting-remove" aria-label={ru ? 'Убрать из цветника' : 'Remove from bed'} onClick={() => set(bed.recipe.filter((_, i) => i !== index))}>×</button>
            </div>;
        })}
        {free && bed.recipe.length < PLANTING_LIMITS.recipe ? <div className="home-editor-tabs">
            <button type="button" className="home-editor-tab" data-testid="planting-recipe-add" onClick={() => set([...bed.recipe, { plant: free.id, share: 10 }])}>{ru ? '+ Растение' : '+ Plant'}</button>
        </div> : null}
    </>;
}

export function PlantingSection({ settings, handleSettingChange, plantingEditor, layoutEditor }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const { plants: library, status } = usePlantLibrary();
    const beds = settings.plantingBeds, points = settings[POINTS_KEY];
    const selected = beds.find((bed) => bed.id === plantingEditor?.selectedId);
    const bed = selected ?? { ...PLANTING_BED_DEFAULT, recipe: [], points: [] };
    const fills = useBedFills(beds, library);
    const schedule = useMemo(() => plantingSchedule(beds, fills, points, library), [beds, fills, points, library]);
    const mode = plantingEditor?.mode;
    const months = ru ? MONTHS_RU : MONTHS_EN;
    const singles = useMemo(() => [...library.values()].sort(byCategory), [library]);
    const selectedCount = selected ? fills[beds.indexOf(selected)]?.length ?? 0 : 0;

    const topView = () => {
        const all = [...(selected ? [selected] : beds).flatMap((b) => b.points.map(([x, z]) => [x, b.y, z])), ...(selected ? [] : points.map((p) => [p.x, p.y, p.z]))];
        if (!all.length) all.push([0, settings.planeHeight ?? 0, 0]);
        const xs = all.map((p) => p[0]), zs = all.map((p) => p[2]), y = Math.max(...all.map((p) => p[1]));
        const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
        const reach = Math.max(8, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.15;
        layoutEditor?.previewPose?.({ cameraPosition: { x, y: y + reach, z: z + 0.01 }, cameraTarget: { x, y, z }, cameraFov: 50 });
    };
    const download = () => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([scheduleCsv(schedule, ru)], { type: 'text/csv;charset=utf-8' }));
        link.download = `${ru ? 'vedomost' : 'planting'}-${activeProjectId() ?? 'posadki'}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    };

    return <>
        <div className="home-editor-tabs">
            <button type="button" className={`home-editor-tab ${mode === 'bed' ? 'is-active' : ''}`} data-testid="planting-draw-bed"
                disabled={beds.length >= PLANTING_LIMITS.beds && mode !== 'bed'} onClick={() => (mode === 'bed' ? plantingEditor.stop() : plantingEditor?.begin('bed'))}>
                {mode === 'bed' ? (ru ? 'Завершить · Esc' : 'Finish · Esc') : (ru ? 'Цветник · L' : 'Bed · L')}</button>
            <button type="button" className={`home-editor-tab ${mode === 'plant' ? 'is-active' : ''}`} data-testid="planting-place"
                onClick={() => (mode === 'plant' ? plantingEditor.stop() : plantingEditor?.begin('plant'))}>
                {mode === 'plant' ? (ru ? 'Завершить · Esc' : 'Finish · Esc') : (ru ? 'Посадить · T' : 'Plant · T')}</button>
            <button type="button" className="home-editor-tab" data-testid="planting-top-view" onClick={topView}>{ru ? 'Сверху' : 'Top'}</button>
        </div>
        {status === 'missing' ? <div className="home-editor-status">{ru
            ? 'Библиотеки растений нет: она лежит в ~/Ouroboros/library/plants и видна только в локальном редакторе.'
            : 'No plant library: it lives in ~/Ouroboros/library/plants and is seen by the local editor only.'}</div> : null}
        {mode === 'bed' ? <div className="home-editor-status">{ru
            ? 'Проведите контур цветника по земле и отпустите — он засадится палитрой «Степной». Камера — правой кнопкой и колесом.'
            : 'Draw the bed outline on the ground and let go — it is planted with the “Steppe” palette. Camera: right button and wheel.'}</div> : null}
        {mode === 'plant' ? <div className="home-editor-status">{ru
            ? `Клик по земле сажает «${plantName(library.get(plantingEditor.plantChoice), ru) || '—'}»; растение выбирается ниже.`
            : `A click on the ground plants “${plantName(library.get(plantingEditor.plantChoice), ru) || '—'}”; choose the plant below.`}</div> : null}

        <RangeControl controlId="plantingMonth" testId="planting-month" label={ru ? 'Месяц' : 'Month'} value={settings.plantingMonth} min={PLANTING_RANGES.month[0]} max={PLANTING_RANGES.month[1]} step={1}
            formatValue={(value) => months[Math.round(value) - 1] ?? value} onChange={(event) => handleSettingChange(event, 'plantingMonth', 'integer')} />
        <CheckboxControl controlId="plantingPlan" testId="planting-plan" label={ru ? 'План в шапках' : 'Plan with caps'} checked={settings.plantingPlan}
            onChange={(event) => handleSettingChange(event, 'plantingPlan', 'boolean')} />

        <SectionHeading label={`${ru ? 'Цветники' : 'Beds'} · ${beds.length}/${PLANTING_LIMITS.beds}`} subtle />
        <SelectControl controlId="plantingBeds" testId="planting-bed" label={ru ? 'Цветник' : 'Bed'} value={selected?.id ?? ''}
            options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...beds.map((b) => ({ value: b.id, label: b.name }))]} onChange={(event) => plantingEditor?.select(event.target.value || null)} />
        {selected ? <div className="home-editor-control-group"><input className="home-editor-select" aria-label={ru ? 'Имя цветника' : 'Bed name'} value={selected.name} maxLength={64}
            onChange={(event) => plantingEditor.updateBed(selected.id, { name: event.target.value })} /></div> : null}
        {selected || scope?.catalogOnly ? <>
            <SelectControl controlId="plantingBeds[].palette" testId="planting-palette" label={ru ? 'Палитра' : 'Palette'} value=""
                options={[{ value: '', label: ru ? 'Своя — заменить на…' : 'Own — replace with…' }, ...PLANTING_PALETTES.map((p) => ({ value: p.id, label: ru ? p.ru : p.en }))]}
                onChange={(event) => selected && event.target.value && plantingEditor.applyPalette(selected.id, event.target.value)} />
            {selected ? <RecipeRows bed={selected} library={library} plantingEditor={plantingEditor} ru={ru} /> : null}
            <RangeControl controlId="plantingBeds[].drift" testId="planting-drift" label={ru ? 'Размер пятна' : 'Drift size'} value={bed.drift} min={PLANTING_RANGES.drift[0]} max={PLANTING_RANGES.drift[1]} step={PLANTING_RANGES.drift[2]} unit=" m"
                formatValue={(value) => Number(value.toFixed(1))} onChange={(event) => selected && plantingEditor.updateBed(selected.id, { drift: Number(event.target.value) })} />
            <RangeControl controlId="plantingBeds[].density" testId="planting-density" label={ru ? 'Густота' : 'Density'} value={bed.density} min={PLANTING_RANGES.density[0]} max={PLANTING_RANGES.density[1]} step={PLANTING_RANGES.density[2]} unit=" ×"
                formatValue={(value) => Number(value.toFixed(2))} onChange={(event) => selected && plantingEditor.updateBed(selected.id, { density: Number(event.target.value) })} />
        </> : null}
        {selected ? <>
            <div className="home-editor-status" data-testid="planting-bed-status">{ru
                ? `Площадь ${polygonArea(selected.points).toFixed(1)} м² · растений ${selectedCount}`
                : `Area ${polygonArea(selected.points).toFixed(1)} m² · ${selectedCount} plants`}</div>
            <div className="home-editor-tabs">
                <button type="button" className="home-editor-tab" data-testid="planting-reseed" onClick={() => plantingEditor.reseed(selected.id)}>{ru ? 'Перемешать' : 'Reshuffle'}</button>
                <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.(`planting-bed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button>
                <button type="button" className="home-editor-tab" data-testid="planting-delete" onClick={() => plantingEditor.removeBed(selected.id)}>{ru ? 'Удалить цветник' : 'Delete bed'}</button>
            </div>
        </> : null}

        <SectionHeading label={`${ru ? 'Одиночные' : 'Single plants'} · ${points.length}`} subtle />
        <SelectControl controlId="plantingPlant" testId="planting-plant" label={ru ? 'Растение' : 'Plant'} value={plantingEditor?.plantChoice ?? ''}
            options={singles.length ? singles.map((p) => ({ value: p.id, label: `${CATEGORY[p.category]?.[ru ? 0 : 1] ?? ''} · ${plantName(p, ru)}` })) : [{ value: plantingEditor?.plantChoice ?? '', label: '—' }]}
            onChange={(event) => { plantingEditor?.setPlantChoice(event.target.value); if (mode !== 'plant') plantingEditor?.begin('plant'); }} />
        {points.length ? <div className="home-editor-tabs"><button type="button" className="home-editor-tab" data-testid="planting-undo-point" onClick={() => plantingEditor.removeLastPoint()}>{ru ? 'Убрать последнее' : 'Remove last'}</button></div> : null}

        <SectionHeading label={ru ? 'Ведомость' : 'Schedule'} subtle />
        {schedule.length ? <div className="planting-schedule" data-testid="planting-schedule">
            {schedule.map((row) => <div key={row.plant.id} className="planting-schedule-row">
                <Dot color={row.plant.cap ?? '#777'} /><span title={row.plant.latin}>{plantName(row.plant, ru)}</span><b>{row.count}</b>
            </div>)}
            <div className="planting-schedule-row planting-schedule-total"><span /><span>{ru ? 'Всего' : 'Total'}</span><b>{schedule.reduce((sum, row) => sum + row.count, 0)}</b></div>
        </div> : <div className="home-editor-status">{ru ? 'Пока пусто: нарисуйте цветник (L) или посадите растение (T).' : 'Empty so far: draw a bed (L) or plant something (T).'}</div>}
        {schedule.length ? <div className="home-editor-tabs"><button type="button" className="home-editor-tab" data-testid="planting-csv" onClick={download}>{ru ? 'Скачать CSV' : 'Download CSV'}</button></div> : null}
    </>;
}
