import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { PLANTING_BED_DEFAULT, PLANTING_LIMITS, PLANTING_RANGES } from '../../../../../planting/settings.js';
import { PLANTING_PALETTES } from '../../../../../planting/palettes.js';
import { bedArea } from '../../../../../planting/fillBed.js';
import { plantName, useBedFills, usePlantLibrary } from '../../../../../planting/plantLibrary.js';
import { bloomMonths, byCategory } from '../../../../../planting/insights.js';
import { MONTHS_EN, MONTHS_RU } from '../../../../../planting/season.js';
import { PlantChoice, PlantPicker } from '../../../../../planting/ui/PlantPicker.jsx';
import { PlantingInsights } from '../../../../../planting/ui/PlantingInsights.jsx';
import { PlantLibraryView } from '../../../../../planting/ui/PlantLibraryView.jsx';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { flushProjectSave } from '../../../hooks/useHomeSceneSettings';
import '../../../../../planting/ui/planting-ui.css';

// Одиночные растения правятся инструментом «Посадить» и списком «По одному»
// в обзоре, а не ползунком; ключ назван здесь для сверки параметров
// (check-editor-keys.mjs).
const POINTS_KEY = 'plantingPoints';
const TAB_KEY = 'ddg_planting_tab_v1';
const LETTERS_RU = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const LETTERS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const seasonOf = (month) => (month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn');
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'overview'; } catch { return 'overview'; } };

// Каталог параметров (поиск ⌘K, избранное, справочник): те же ключи, что и
// раньше, в обычных контролах. На экране их нет — работа идёт в рабочем
// месте ниже, а эти строки нужны поиску и справочнику.
function PlantingCatalog({ settings, handleSettingChange, plantingEditor, ru }) {
    const { plants: library } = usePlantLibrary();
    const bed = PLANTING_BED_DEFAULT;
    const months = ru ? MONTHS_RU : MONTHS_EN;
    return <>
        <RangeControl controlId="plantingMonth" label={ru ? 'Месяц' : 'Month'} value={settings.plantingMonth} min={PLANTING_RANGES.month[0]} max={PLANTING_RANGES.month[1]} step={1}
            formatValue={(value) => months[Math.round(value) - 1] ?? value} onChange={(event) => handleSettingChange(event, 'plantingMonth', 'integer')} />
        <CheckboxControl controlId="plantingPlan" label={ru ? 'План в шапках' : 'Plan with caps'} checked={settings.plantingPlan} onChange={(event) => handleSettingChange(event, 'plantingPlan', 'boolean')} />
        <SelectControl controlId="plantingBeds" label={ru ? 'Цветник' : 'Bed'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...settings.plantingBeds.map((b) => ({ value: b.id, label: b.name }))]} onChange={(event) => plantingEditor?.select(event.target.value || null)} />
        <SelectControl controlId="plantingBeds[].palette" label={ru ? 'Палитра' : 'Palette'} value="" options={[{ value: '', label: ru ? 'Своя — заменить на…' : 'Own — replace with…' }, ...PLANTING_PALETTES.map((p) => ({ value: p.id, label: ru ? p.ru : p.en }))]} onChange={() => {}} />
        <RangeControl controlId="plantingBeds[].drift" label={ru ? 'Размер пятна' : 'Drift size'} value={bed.drift} min={PLANTING_RANGES.drift[0]} max={PLANTING_RANGES.drift[1]} step={PLANTING_RANGES.drift[2]} unit=" m" onChange={() => {}} />
        <RangeControl controlId="plantingBeds[].density" label={ru ? 'Густота' : 'Density'} value={bed.density} min={PLANTING_RANGES.density[0]} max={PLANTING_RANGES.density[1]} step={PLANTING_RANGES.density[2]} unit=" ×" onChange={() => {}} />
        <SelectControl controlId="plantingPlant" label={ru ? 'Растение' : 'Plant'} value={plantingEditor?.plantChoice ?? ''} options={[...library.values()].sort(byCategory).map((p) => ({ value: p.id, label: plantName(p, ru) }))} onChange={(event) => plantingEditor?.setPlantChoice(event.target.value)} />
    </>;
}

function PlainRange({ label, value, min, max, step, unit = '', onChange, testId }) {
    return <label className="planting-range"><span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId} />
        <b>{Number(value.toFixed(2))}{unit}</b></label>;
}

// Цветник: выбор, имя, палитра, рецепт с картинками, пятна и густота.
function BedEditor({ beds, fills, library, plantingEditor, layoutEditor, ru }) {
    const selected = beds.find((bed) => bed.id === plantingEditor.selectedId) ?? null;
    const [adding, setAdding] = useState(null);
    const count = selected ? fills[beds.indexOf(selected)]?.length ?? 0 : 0;
    const set = (patch) => plantingEditor.updateBed(selected.id, patch);
    const total = selected ? selected.recipe.reduce((sum, row) => sum + row.share, 0) || 1 : 1;
    return <div className="planting-bed">
        <div className="plant-chips">
            {beds.map((bed) => <button key={bed.id} type="button" className={bed.id === selected?.id ? 'is-active' : ''} onClick={() => plantingEditor.select(bed.id)} data-testid="planting-bed-chip">{bed.name}</button>)}
            <button type="button" className="plant-chips__add" onClick={() => plantingEditor.begin('bed')} disabled={beds.length >= PLANTING_LIMITS.beds}>+ {ru ? 'Нарисовать' : 'Draw'}</button>
        </div>
        {!selected ? <p className="planting-empty">{beds.length
            ? (ru ? 'Выберите цветник выше или щёлкните по нему в сцене.' : 'Pick a bed above or click it in the scene.')
            : (ru ? 'Цветников пока нет — «Цветник» (L) и контур по земле.' : 'No beds yet — Bed (L) and an outline on the ground.')}</p> : <>
            <input className="planting-name" value={selected.name} maxLength={64} aria-label={ru ? 'Имя цветника' : 'Bed name'} onChange={(event) => set({ name: event.target.value })} />
            <p className="planting-status" data-testid="planting-bed-status">{ru
                ? `Площадь ${bedArea(selected).toFixed(1)} м² · растений ${count}${selected.surface ? ' · поверхность модели' : ''}`
                : `Area ${bedArea(selected).toFixed(1)} m² · ${count} plants${selected.surface ? ' · model surface' : ''}`}</p>
            <label className="planting-select"><span>{ru ? 'Палитра' : 'Palette'}</span>
                <select value="" onChange={(event) => event.target.value && plantingEditor.applyPalette(selected.id, event.target.value)} data-testid="planting-palette">
                    <option value="">{ru ? 'Заменить рецепт на…' : 'Replace the recipe with…'}</option>
                    {PLANTING_PALETTES.map((p) => <option key={p.id} value={p.id}>{ru ? p.ru : p.en}</option>)}
                </select></label>
            <div className="planting-recipe">
                {selected.recipe.map((row, index) => <div key={row.plant} className="planting-recipe__row" data-testid="planting-recipe-row">
                    <PlantChoice library={library} value={row.plant} ru={ru} exclude={selected.recipe.map((r) => r.plant)} title={ru ? 'Заменить растение' : 'Replace the plant'}
                        onChoose={(id) => set({ recipe: selected.recipe.map((r, i) => (i === index ? { ...r, plant: id } : r)) })} />
                    <input type="number" min={1} max={100} step={1} value={row.share} aria-label={ru ? 'Доля' : 'Share'}
                        onChange={(event) => set({ recipe: selected.recipe.map((r, i) => (i === index ? { ...r, share: Number(event.target.value) } : r)) })} />
                    <span className="planting-recipe__pct">{Math.round((row.share / total) * 100)}%</span>
                    <button type="button" className="planting-icon" aria-label={ru ? 'Убрать из цветника' : 'Remove from bed'} onClick={() => set({ recipe: selected.recipe.filter((_, i) => i !== index) })}>×</button>
                </div>)}
                {selected.recipe.length < PLANTING_LIMITS.recipe ? <button type="button" className="planting-add" onClick={(event) => setAdding(event.currentTarget.getBoundingClientRect())} data-testid="planting-recipe-add">+ {ru ? 'Растение' : 'Plant'}</button> : null}
                {adding ? <PlantPicker library={library} anchor={adding} ru={ru} exclude={selected.recipe.map((r) => r.plant)} title={ru ? 'Добавить в цветник' : 'Add to the bed'}
                    onClose={() => setAdding(null)} onChoose={(id) => { setAdding(null); set({ recipe: [...selected.recipe, { plant: id, share: 10 }] }); }} /> : null}
            </div>
            <PlainRange label={ru ? 'Размер пятна' : 'Drift size'} value={selected.drift} min={PLANTING_RANGES.drift[0]} max={PLANTING_RANGES.drift[1]} step={PLANTING_RANGES.drift[2]} unit={ru ? ' м' : ' m'} onChange={(drift) => set({ drift })} testId="planting-drift" />
            <PlainRange label={ru ? 'Густота' : 'Density'} value={selected.density} min={PLANTING_RANGES.density[0]} max={PLANTING_RANGES.density[1]} step={PLANTING_RANGES.density[2]} unit=" ×" onChange={(density) => set({ density })} testId="planting-density" />
            <div className="planting-actions">
                <button type="button" onClick={() => plantingEditor.reseed(selected.id)} data-testid="planting-reseed">{ru ? 'Перемешать' : 'Reshuffle'}</button>
                <button type="button" onClick={() => layoutEditor?.frameObject?.(`planting-bed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button>
                <button type="button" onClick={() => plantingEditor.removeBed(selected.id)} data-testid="planting-delete">{ru ? 'Удалить' : 'Delete'}</button>
            </div>
        </>}
    </div>;
}

// Рабочее место «Растения»: инструменты, месяц и три вкладки — обзор
// (читать), цветник (править), библиотека (растения с картинками).
function PlantingWorkspace({ settings, handleSettingChange, applySettings, plantingEditor, topiaryEditor, layoutEditor, ru }) {
    const { plants: library, status } = usePlantLibrary();
    const beds = settings.plantingBeds, points = settings[POINTS_KEY];
    const fills = useBedFills(beds, library);
    const [tab, setTab] = useState(readTab);
    const [openPlant, setOpenPlant] = useState(null);
    useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* local UI only */ } }, [tab]);
    const mode = plantingEditor?.mode;
    const month = settings.plantingMonth;
    const selectedBed = beds.find((bed) => bed.id === plantingEditor?.selectedId);
    const inBloom = useMemo(() => [...new Set([...fills.flat().map((p) => p.plant), ...points.map((p) => p.plant)])].filter((id) => bloomMonths(library.get(id)).includes(month)), [fills, points, library, month]);
    const setMonth = (value) => handleSettingChange({ target: { value } }, 'plantingMonth', 'integer');
    const topView = () => {
        const all = [...(selectedBed ? [selectedBed] : beds).flatMap((b) => b.points.map(([x, z]) => [x, b.y, z])), ...(selectedBed ? [] : points.map((p) => [p.x, p.y, p.z]))];
        if (!all.length) all.push([0, settings.planeHeight ?? 0, 0]);
        const xs = all.map((p) => p[0]), zs = all.map((p) => p[2]), y = Math.max(...all.map((p) => p[1]));
        const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
        const reach = Math.max(8, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.15;
        layoutEditor?.previewPose?.({ cameraPosition: { x, y: y + reach, z: z + 0.01 }, cameraTarget: { x, y, z }, cameraFov: 50 });
    };
    const project = activeProjectId();
    const openPlantCard = (id) => { setOpenPlant(id); setTab('library'); };
    const months = ru ? MONTHS_RU : MONTHS_EN;

    return <div className="planting-workspace" data-testid="planting-workspace">
        <div className="planting-tools" role="toolbar" aria-label={ru ? 'Инструменты растений' : 'Plant tools'}>
            <button type="button" className={mode === 'bed' ? 'is-active' : ''} onClick={() => (mode === 'bed' ? plantingEditor.stop() : plantingEditor.begin('bed'))} data-testid="planting-draw-bed"><FocusIcon name="bed" />{ru ? 'Цветник' : 'Bed'}<kbd>L</kbd></button>
            <button type="button" className={mode === 'plant' ? 'is-active' : ''} onClick={() => (mode === 'plant' ? plantingEditor.stop() : plantingEditor.begin('plant'))} data-testid="planting-place"><FocusIcon name="sprout" />{ru ? 'Посадить' : 'Plant'}<kbd>T</kbd></button>
            <button type="button" onClick={() => topiaryEditor?.begin()} data-testid="planting-hedge"><FocusIcon name="leaf" />{ru ? 'Изгородь' : 'Hedge'}<kbd>B</kbd></button>
        </div>
        {mode === 'bed' ? <p className="planting-hint">{ru
            ? 'Поверхность модели подсвечивается под курсором. Щелчок — цветник на всю поверхность. Протяжка по ней — только та её часть, что внутри контура: дорожки и газон в обводке останутся пустыми. Протяжка по плоскости — просто контур. Палитра «Степной». Esc — выйти.'
            : 'The model’s surface lights up under the cursor. A click plants the whole surface. A drag over it plants only its part inside the outline: paths and lawn inside it stay empty. A drag over the plane is a plain outline. “Steppe” palette. Esc to leave.'}</p> : null}
        {mode === 'plant' ? <div className="planting-plantrow">
            <PlantChoice library={library} value={plantingEditor.plantChoice} ru={ru} onChoose={plantingEditor.setPlantChoice} title={ru ? 'Что сажать' : 'What to plant'} testId="planting-plant" />
            <div className="planting-toggle">
                <button type="button" className={plantingEditor.plantStatus !== 'existing' ? 'is-active' : ''} onClick={() => plantingEditor.setPlantStatus('new')}>{ru ? 'Новое' : 'New'}</button>
                <button type="button" className={plantingEditor.plantStatus === 'existing' ? 'is-active' : ''} onClick={() => plantingEditor.setPlantStatus('existing')} data-testid="planting-existing">{ru ? 'Существующее' : 'Existing'}</button>
            </div>
            <p className="planting-hint">{ru ? 'Клик по земле сажает; протяжка крутит камеру.' : 'A click on the ground plants; a drag turns the camera.'}</p>
        </div> : null}

        <div className="planting-months" role="radiogroup" aria-label={ru ? 'Месяц' : 'Month'}>
            {(ru ? LETTERS_RU : LETTERS_EN).map((letter, i) => <button key={i} type="button" role="radio" aria-checked={month === i + 1} className={`is-${seasonOf(i + 1)} ${month === i + 1 ? 'is-active' : ''}`} title={months[i]} onClick={() => setMonth(i + 1)} data-testid={`planting-month-${i + 1}`}>{letter}</button>)}
        </div>
        <div className="planting-monthline">
            <span>{months[month - 1]}</span>
            <small>{inBloom.length ? `${ru ? 'в цвету' : 'in bloom'}: ${inBloom.slice(0, 3).map((id) => plantName(library.get(id), ru).split(' ')[0].toLowerCase()).join(', ')}${inBloom.length > 3 ? ` +${inBloom.length - 3}` : ''}` : (ru ? 'ничего не цветёт' : 'nothing in bloom')}</small>
            <span className="planting-spacer" />
            <button type="button" onClick={topView} data-testid="planting-top-view" title={ru ? 'Камера сверху' : 'Camera from above'}>{ru ? 'Сверху' : 'Top'}</button>
            <button type="button" className={settings.plantingPlan ? 'is-active' : ''} onClick={() => handleSettingChange({ target: { checked: !settings.plantingPlan } }, 'plantingPlan', 'boolean')} data-testid="planting-plan" title={ru ? 'План в шапках легенды' : 'Plan with legend caps'}>{ru ? 'План' : 'Plan'}</button>
        </div>
        {status === 'missing' ? <p className="planting-hint">{ru ? 'Библиотеки растений нет: она лежит в ~/Ouroboros/library/plants и видна только в локальном редакторе.' : 'No plant library: it lives in ~/Ouroboros/library/plants and is seen by the local editor only.'}</p> : null}

        <nav className="planting-tabs" role="tablist">
            {[['overview', ru ? 'Обзор' : 'Overview'], ['bed', ru ? 'Цветник' : 'Bed'], ['library', ru ? 'Библиотека' : 'Library']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); if (id === 'library') setOpenPlant(null); }} data-testid={`planting-tab-${id}`}>{label}</button>)}
        </nav>
        {tab === 'overview' ? <>
            <PlantingInsights beds={beds} fills={fills} points={points} library={library} month={month} ru={ru} focusBedId={plantingEditor?.selectedId} onOpenPlant={openPlantCard}
                onPointStatus={(id, value) => applySettings({ [POINTS_KEY]: points.map((p) => (p.id === id ? { ...p, status: value === 'existing' ? 'existing' : undefined } : p)) })}
                onRemovePoint={(id) => applySettings({ [POINTS_KEY]: points.filter((p) => p.id !== id) })}
                onFramePoint={(point) => layoutEditor?.previewPose?.({ cameraPosition: { x: point.x + 6, y: point.y + 4, z: point.z + 8 }, cameraTarget: { x: point.x, y: point.y + 1.5, z: point.z }, cameraFov: 45 })} />
            <button type="button" className="planting-report" disabled={!project} onClick={async () => { await flushProjectSave(); window.location.href = `/engine/report?project=${encodeURIComponent(project)}`; }} data-testid="planting-report">
                <FocusIcon name="upload" />{project ? (ru ? 'Отчёт для заказчика и дендролога' : 'Report for the client and the dendrologist') : (ru ? 'Отчёт — в проекте движка' : 'Report — in an engine project')}</button>
        </> : null}
        {tab === 'bed' ? <BedEditor beds={beds} fills={fills} library={library} plantingEditor={plantingEditor} layoutEditor={layoutEditor} ru={ru} /> : null}
        {tab === 'library' ? <PlantLibraryView library={library} ru={ru} openId={openPlant} setOpenId={setOpenPlant} bedName={selectedBed?.name}
            onPlantWith={(id) => { plantingEditor.setPlantChoice(id); plantingEditor.begin('plant'); }}
            onAddToBed={(id) => selectedBed && !selectedBed.recipe.some((r) => r.plant === id) && plantingEditor.updateBed(selectedBed.id, { recipe: [...selectedBed.recipe, { plant: id, share: 10 }] })} /> : null}
    </div>;
}

export function PlantingSection(props) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    return scope?.catalogOnly ? <PlantingCatalog {...props} ru={ru} /> : <PlantingWorkspace {...props} ru={ru} />;
}
