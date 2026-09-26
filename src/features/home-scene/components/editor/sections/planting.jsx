import { COVER_DEFAULT, COVER_PLANT_PARTS, COVER_PRESETS, COVER_RANGES, normalizeCover, coverSeason } from '../../../../../groundcover/settings.js';
import { COVER_LABELS, COVER_CLIMATES } from '../../../../../groundcover/labels.js';
import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { PLANTING_BED_DEFAULT, PLANTING_LIMITS, PLANTING_RANGES } from '../../../../../planting/settings.js';
import { LAWN_MOWING_LABELS, lawnAngleFor, lawnNeeds, lawnNumber } from '../../../../../planting/lawnGround.js';
import { PLANTING_PALETTES } from '../../../../../planting/palettes.js';
import { bedArea } from '../../../../../planting/fillBed.js';
import { vineLength } from '../../../../../planting/vines.js';
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
// Лианы правятся кистью «Лиана» (I) и карточкой выбранной лианы.
const VINES_KEY = 'plantingVines';
const CLIMBERS = ['climber'];
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
        <RangeControl controlId="northAngle" label={ru ? 'Север' : 'North'} value={settings.northAngle ?? 0} min={-180} max={180} step={0.5} unit="°" onChange={(event) => handleSettingChange(event, 'northAngle')} />
        <SelectControl controlId="plantingBeds" label={ru ? 'Цветник' : 'Bed'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...settings.plantingBeds.map((b) => ({ value: b.id, label: b.name }))]} onChange={(event) => plantingEditor?.select(event.target.value || null)} />
        <SelectControl controlId="plantingBeds[].palette" label={ru ? 'Палитра' : 'Palette'} value="" options={[{ value: '', label: ru ? 'Своя — заменить на…' : 'Own — replace with…' }, ...PLANTING_PALETTES.map((p) => ({ value: p.id, label: ru ? p.ru : p.en }))]} onChange={() => {}} />
        <RangeControl controlId="plantingBeds[].drift" label={ru ? 'Размер пятна' : 'Drift size'} value={bed.drift} min={PLANTING_RANGES.drift[0]} max={PLANTING_RANGES.drift[1]} step={PLANTING_RANGES.drift[2]} unit=" m" onChange={() => {}} />
        <RangeControl controlId="plantingBeds[].density" label={ru ? 'Густота' : 'Density'} value={bed.density} min={PLANTING_RANGES.density[0]} max={PLANTING_RANGES.density[1]} step={PLANTING_RANGES.density[2]} unit=" ×" onChange={() => {}} />
        <CheckboxControl controlId="plantingBeds[].cover.enabled" label={ru ? 'Нижний почвопокров' : 'Groundcover layer'} checked={true} onChange={() => {}} />
        <SelectControl controlId="plantingBeds[].cover.climate" label={ru ? 'Климат почвопокрова' : 'Groundcover climate'} value="temperate" options={Object.entries(COVER_CLIMATES).map(([value, names]) => ({ value, label: names[ru ? 0 : 1] }))} onChange={() => {}} />
        {Object.entries(COVER_RANGES).map(([key, [min, max, step]]) => <RangeControl key={key} controlId={`plantingBeds[].cover.${key}`} label={COVER_LABELS[key][ru ? 0 : 1]} value={COVER_DEFAULT[key]} min={min} max={max} step={step} onChange={() => {}} />)}
        {COVER_PLANT_PARTS.map((part) => <SelectControl key={part} controlId={`plantingBeds[].cover.plants.${part}`} label={COVER_PLANT_LABELS[part][ru ? 0 : 1]} value="" options={[{ value: '', label: ru ? 'Не выбрано' : 'None' }]} onChange={() => {}} />)}
        <SelectControl controlId={VINES_KEY} label={ru ? 'Лиана' : 'Climber'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...(settings[VINES_KEY] ?? []).map((v) => ({ value: v.id, label: plantName(library.get(v.plant), ru) || v.plant }))]} onChange={(event) => event.target.value && plantingEditor?.selectVine(event.target.value)} />
        <SelectControl controlId="plantingPlant" label={ru ? 'Растение' : 'Plant'} value={plantingEditor?.plantChoice ?? ''} options={[...library.values()].sort(byCategory).map((p) => ({ value: p.id, label: plantName(p, ru) }))} onChange={(event) => plantingEditor?.setPlantChoice(event.target.value)} />
    </>;
}

function PlainRange({ label, value, min, max, step, unit = '', onChange, testId }) {
    return <label className="planting-range"><span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId} />
        <b>{Number(value.toFixed(2))}{unit}</b></label>;
}

// Газон (цветник kind: 'lawn', lawnGround.js): стрижка — узор, ширина
// прохода, направление, высота травы, контраст полос; полив. Площадь — и
// сколько брать (lawnNeeds).
const COVER_PLANT_LABELS = { leaf: ['Копытник в ведомости', 'Ginger in the schedule'], thyme: ['Тимьян в ведомости', 'Thyme in the schedule'] };
function CoverFields({ bed, plantingEditor, ru }) {
    const cover = normalizeCover(bed.cover), set = (patch) => plantingEditor.updateBed(bed.id, { cover: normalizeCover({ ...cover, ...patch }) });
    const { plants: library } = usePlantLibrary();
    const choices = useMemo(() => [...library.values()].sort(byCategory), [library]);
    return <>
        <label className="planting-select"><span>{ru ? 'Нижний покров' : 'Underplanting'}</span><select value={cover.enabled ? 'on' : 'off'} onChange={(event) => set({ enabled: event.target.value === 'on' })}><option value="on">{ru ? 'Включён' : 'On'}</option><option value="off">{ru ? 'Выключен' : 'Off'}</option></select></label>
        {cover.enabled ? <>
            <label className="planting-select"><span>{ru ? 'Сообщество' : 'Community'}</span><select value="" onChange={(event) => event.target.value && set(COVER_PRESETS[event.target.value].values)} data-testid="cover-preset"><option value="">{ru ? 'Выбрать…' : 'Choose…'}</option>{Object.entries(COVER_PRESETS).map(([id, p]) => <option key={id} value={id}>{p[ru ? 'ru' : 'en']}</option>)}</select></label>
            {Object.entries(COVER_RANGES).map(([key, [min, max, step]]) => <PlainRange key={key} label={COVER_LABELS[key][ru ? 0 : 1]} value={cover[key]} min={min} max={max} step={step} onChange={(value) => set({ [key]: value })} testId={`cover-${key}`} />)}
            <label className="planting-select"><span>{ru ? 'Климат' : 'Climate'}</span><select value={cover.climate} onChange={(event) => set({ climate: event.target.value })}>{Object.entries(COVER_CLIMATES).map(([id, names]) => <option key={id} value={id}>{names[ru ? 0 : 1]}</option>)}</select></label>
            {COVER_PLANT_PARTS.map((part) => <label key={part} className="planting-select"><span>{COVER_PLANT_LABELS[part][ru ? 0 : 1]}</span><select value={cover.plants?.[part] ?? ''} onChange={(event) => set({ plants: { ...cover.plants, [part]: event.target.value || undefined } })} data-testid={`cover-plant-${part}`}>
                <option value="">{ru ? 'Не выбрано' : 'None'}</option>{choices.map((plant) => <option key={plant.id} value={plant.id}>{plantName(plant, ru)}</option>)}</select></label>)}
        </> : null}
    </>;
}
function CoverEditor({ bed, plantingEditor, layoutEditor, ru }) {
    return <>
        <input className="planting-name" value={bed.name} maxLength={64} aria-label={ru ? 'Имя почвопокрова' : 'Groundcover name'} onChange={(event) => plantingEditor.updateBed(bed.id, { name: event.target.value })} />
        <p className="planting-status">{bedArea(bed).toFixed(1)} {ru ? 'м² в плане' : 'm² in plan'}</p>
        <CoverFields bed={bed} plantingEditor={plantingEditor} ru={ru} />
        <div className="planting-actions"><button type="button" onClick={() => plantingEditor.reseed(bed.id)}>{ru ? 'Перемешать' : 'Reshuffle'}</button><button type="button" onClick={() => layoutEditor?.frameObject?.(`planting-bed-${bed.id}`)}>{ru ? 'Показать' : 'Frame'}</button><button type="button" onClick={() => plantingEditor.removeBed(bed.id)} data-testid="planting-delete">{ru ? 'Удалить' : 'Delete'}</button></div>
    </>;
}

function LawnEditor({ bed, plantingEditor, layoutEditor, ru }) {
    const lawn = bed.lawn, set = (patch) => plantingEditor.updateBed(bed.id, { lawn: { ...lawn, ...patch } });
    const area = bedArea(bed), striped = ['stripes', 'checker', 'diamond'].includes(lawn.mowing);
    return <>
        <input className="planting-name" value={bed.name} maxLength={64} aria-label={ru ? 'Имя газона' : 'Lawn name'} onChange={(event) => plantingEditor.updateBed(bed.id, { name: event.target.value })} />
        <p className="planting-status" data-testid="planting-lawn-status">{`${ru ? 'Площадь' : 'Area'} ${lawnNumber(area, ru)} ${ru ? 'м²' : 'm²'} · ${lawnNeeds(area, ru)}`}</p>
        <div className="plant-chips" role="radiogroup" aria-label={ru ? 'Стрижка' : 'Mowing'}>
            {Object.entries(LAWN_MOWING_LABELS).map(([id, labels]) => <button key={id} type="button" role="radio" aria-checked={lawn.mowing === id} className={lawn.mowing === id ? 'is-active' : ''} onClick={() => set({ mowing: id, ...(id === 'meadow' && lawn.cut < 12 ? { cut: 18 } : id !== 'meadow' && lawn.cut > 12 ? { cut: 4 } : {}) })} data-testid={`planting-lawn-${id}`}>{labels[ru ? 0 : 1]}</button>)}
        </div>
        {striped ? <PlainRange label={ru ? 'Ширина прохода' : 'Pass width'} value={lawn.stripe} min={PLANTING_RANGES.stripe[0]} max={PLANTING_RANGES.stripe[1]} step={PLANTING_RANGES.stripe[2]} unit={ru ? ' м' : ' m'} onChange={(stripe) => set({ stripe })} testId="planting-lawn-stripe" /> : null}
        {striped ? <PlainRange label={ru ? 'Направление' : 'Direction'} value={lawn.angle} min={-90} max={90} step={1} unit="°" onChange={(angle) => set({ angle })} testId="planting-lawn-angle" /> : null}
        <PlainRange label={ru ? 'Высота травы' : 'Grass height'} value={lawn.cut} min={PLANTING_RANGES.cut[0]} max={PLANTING_RANGES.cut[1]} step={PLANTING_RANGES.cut[2]} unit={ru ? ' см' : ' cm'} onChange={(cut) => set({ cut })} testId="planting-lawn-cut" />
        {striped || lawn.mowing === 'meadow' ? <PlainRange label={lawn.mowing === 'meadow' ? (ru ? 'Ветер по траве' : 'Wind sheen') : (ru ? 'Контраст полос' : 'Stripe contrast')} value={lawn.contrast} min={PLANTING_RANGES.contrast[0]} max={PLANTING_RANGES.contrast[1]} step={PLANTING_RANGES.contrast[2]} onChange={(contrast) => set({ contrast })} testId="planting-lawn-contrast" /> : null}
        <PlainRange label={ru ? 'Пятна' : 'Patches'} value={lawn.patches} min={PLANTING_RANGES.patches[0]} max={PLANTING_RANGES.patches[1]} step={PLANTING_RANGES.patches[2]} onChange={(patches) => set({ patches })} testId="planting-lawn-patches" />
        <PlainRange label={ru ? 'Размер травинок' : 'Blade size'} value={lawn.blades} min={PLANTING_RANGES.blades[0]} max={PLANTING_RANGES.blades[1]} step={PLANTING_RANGES.blades[2]} unit=" ×" onChange={(blades) => set({ blades })} testId="planting-lawn-blades" />
        <PlainRange label={ru ? 'Оттенки' : 'Shades'} value={lawn.variety} min={PLANTING_RANGES.variety[0]} max={PLANTING_RANGES.variety[1]} step={PLANTING_RANGES.variety[2]} onChange={(variety) => set({ variety })} testId="planting-lawn-variety" />
        <PlainRange label={ru ? 'Тон: тёплый ↔ холодный' : 'Tone: warm ↔ cool'} value={lawn.tint} min={PLANTING_RANGES.tint[0]} max={PLANTING_RANGES.tint[1]} step={PLANTING_RANGES.tint[2]} onChange={(tint) => set({ tint })} testId="planting-lawn-tint" />
        <div className="planting-lawn-water"><span>{ru ? 'Полив' : 'Irrigation'}</span>
            <div className="planting-toggle">
                <button type="button" className={lawn.irrigated ? 'is-active' : ''} onClick={() => set({ irrigated: true })}>{ru ? 'Есть' : 'Yes'}</button>
                <button type="button" className={lawn.irrigated ? '' : 'is-active'} onClick={() => set({ irrigated: false })} data-testid="planting-lawn-dry">{ru ? 'Нет — летом выгорает' : 'No — burns in summer'}</button>
            </div>
        </div>
        <div className="planting-actions">
            {striped ? <button type="button" onClick={() => set({ angle: lawnAngleFor(bed.points) })} title={ru ? 'Проходы косилки — вдоль длинной стороны газона' : 'Mower passes along the lawn’s long side'}>{ru ? 'Вдоль длинной стороны' : 'Along the long side'}</button> : null}
            <button type="button" onClick={() => plantingEditor.reseed(bed.id)} title={ru ? 'Другие пятна сочности и выгорания' : 'Other patches of lush and dry grass'}>{ru ? 'Перемешать' : 'Reshuffle'}</button>
            <button type="button" onClick={() => layoutEditor?.frameObject?.(`planting-bed-${bed.id}`)}>{ru ? 'Показать' : 'Frame'}</button>
            <button type="button" onClick={() => plantingEditor.removeBed(bed.id)} data-testid="planting-delete">{ru ? 'Удалить' : 'Delete'}</button>
        </div>
    </>;
}

// Газоны в обзоре: общая площадь и строка на газон — выбрать и править.
function LawnSummary({ lawns, ru, selectedId, onSelect }) {
    if (!lawns.length) return null;
    const total = lawns.reduce((sum, lawn) => sum + bedArea(lawn), 0);
    return <section className="planting-chart planting-lawns" data-testid="planting-lawns">
        <h4>{ru ? 'Газоны' : 'Lawns'} · {lawnNumber(total, ru)} {ru ? 'м²' : 'm²'}</h4>
        {lawns.map((lawn) => <button key={lawn.id} type="button" className={`planting-lawn-row${lawn.id === selectedId ? ' is-active' : ''}`} onClick={() => onSelect(lawn.id)}>
            <i className={`planting-lawn-swatch is-${lawn.lawn.mowing}`} />
            <span>{lawn.name}<small>{LAWN_MOWING_LABELS[lawn.lawn.mowing][ru ? 0 : 1]} · {lawnNumber(lawn.lawn.cut, ru)} {ru ? 'см' : 'cm'}{lawn.lawn.irrigated ? '' : (ru ? ' · без полива' : ' · not irrigated')}</small></span>
            <b>{lawnNumber(bedArea(lawn), ru)} {ru ? 'м²' : 'm²'}</b>
        </button>)}
    </section>;
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
            {beds.map((bed) => <button key={bed.id} type="button" className={`${bed.id === selected?.id ? 'is-active' : ''}${bed.kind === 'lawn' ? ' is-lawn' : ''}`} onClick={() => plantingEditor.select(bed.id)} data-testid="planting-bed-chip">{bed.name}</button>)}
            <button type="button" className="plant-chips__add" onClick={() => plantingEditor.begin('bed')} disabled={beds.length >= PLANTING_LIMITS.beds}>+ {ru ? 'Нарисовать' : 'Draw'}</button>
        </div>
        {!selected ? <p className="planting-empty">{beds.length
            ? (ru ? 'Выберите цветник выше или щёлкните по нему в сцене.' : 'Pick a bed above or click it in the scene.')
            : (ru ? 'Цветников пока нет — «Цветник» (L) и контур по земле.' : 'No beds yet — Bed (L) and an outline on the ground.')}</p> : selected.kind === 'cover' ? <CoverEditor bed={selected} plantingEditor={plantingEditor} layoutEditor={layoutEditor} ru={ru} /> : selected.kind === 'lawn' ? <LawnEditor bed={selected} plantingEditor={plantingEditor} layoutEditor={layoutEditor} ru={ru} /> : <>
            <input className="planting-name" value={selected.name} maxLength={64} aria-label={ru ? 'Имя цветника' : 'Bed name'} onChange={(event) => set({ name: event.target.value })} />
            <p className="planting-status" data-testid="planting-bed-status">{ru
                ? `Площадь ${bedArea(selected).toFixed(1)} м² · растений ${count}${selected.surface ? ' · поверхность модели' : ''}`
                : `Area ${bedArea(selected).toFixed(1)} m² · ${count} plants${selected.surface ? ' · model surface' : ''}`}</p>
            <p className="planting-hint" data-testid="planting-inside-hint">{plantingEditor.inside === selected.id
                ? (ru ? 'Внутри цветника: щелчок — растение, Delete — убрать, «Перенос» — двигать, Esc — выйти.' : 'Inside the bed: click a plant, Delete removes it, Move drags it, Esc leaves.')
                : (ru ? 'Двойной щелчок по цветнику — править растения по одному.' : 'Double-click the bed to edit plants one by one.')}</p>
            {selected.edits ? <div className="planting-actions">
                <span className="planting-status">{ru ? `Вручную: убрано ${selected.edits.removed?.length ?? 0}, сдвинуто ${selected.edits.moved?.length ?? 0}` : `By hand: ${selected.edits.removed?.length ?? 0} removed, ${selected.edits.moved?.length ?? 0} moved`}</span>
                <button type="button" onClick={() => set({ edits: null })} data-testid="planting-edits-reset">{ru ? 'Вернуть как было' : 'Undo hand edits'}</button>
            </div> : null}
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
            {selected.cover ? <CoverFields bed={selected} plantingEditor={plantingEditor} ru={ru} /> : <button type="button" className="planting-add" onClick={() => set({ cover: COVER_DEFAULT })}>{ru ? '+ Нижний почвопокров' : '+ Groundcover layer'}</button>}
            <div className="planting-actions">
                <button type="button" onClick={() => plantingEditor.reseed(selected.id)} data-testid="planting-reseed">{ru ? 'Перемешать' : 'Reshuffle'}</button>
                <button type="button" onClick={() => layoutEditor?.frameObject?.(`planting-bed-${selected.id}`)}>{ru ? 'Показать' : 'Frame'}</button>
                <button type="button" onClick={() => plantingEditor.removeBed(selected.id)} data-testid="planting-delete">{ru ? 'Удалить' : 'Delete'}</button>
            </div>
        </>}
    </div>;
}

// Выбранная лиана: вид (заменить), побеги и длина, перемешать, показать, удалить.
function VineCard({ vine, library, plantingEditor, layoutEditor, ru }) {
    const plant = library.get(vine.plant);
    const length = useMemo(() => vineLength(vine), [vine]);
    const frame = () => {
        const all = vine.shoots.flat(), mean = (i) => all.reduce((sum, p) => sum + p[i], 0) / all.length;
        const center = [0, 1, 2].map(mean), normal = [3, 4, 5].map(mean), reach = Math.max(3, length * 0.7);
        const k = reach / (Math.hypot(...normal) || 1);
        layoutEditor?.previewPose?.({ cameraPosition: { x: center[0] + normal[0] * k, y: center[1] + normal[1] * k + 1.2, z: center[2] + normal[2] * k }, cameraTarget: { x: center[0], y: center[1], z: center[2] }, cameraFov: 45 });
    };
    return <div className="planting-vine" data-testid="planting-vine-card">
        <PlantChoice library={library} value={vine.plant} kinds={CLIMBERS} ru={ru} onChoose={(id) => plantingEditor.updateVine(vine.id, { plant: id })} title={ru ? 'Заменить лиану' : 'Replace the climber'} />
        <p className="planting-status" data-testid="planting-vine-status">{ru
            ? `Побегов ${vine.shoots.length} · ${length.toFixed(1)} м · в ведомости 1 шт`
            : `${vine.shoots.length} shoots · ${length.toFixed(1)} m · 1 plant in the schedule`}{plant?.vine?.support ? ` · ${plant.vine.support}` : ''}</p>
        <div className="planting-actions">
            <button type="button" onClick={() => plantingEditor.reseedVine(vine.id)} data-testid="planting-vine-reseed">{ru ? 'Перемешать' : 'Reshuffle'}</button>
            <button type="button" onClick={frame}>{ru ? 'Показать' : 'Frame'}</button>
            <button type="button" onClick={() => plantingEditor.removeVine(vine.id)} data-testid="planting-vine-delete">{ru ? 'Удалить' : 'Delete'}</button>
        </div>
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
    const coverMode = mode === 'bed' && plantingEditor?.bedKind === 'cover';
    const lawnMode = mode === 'bed' && plantingEditor?.bedKind === 'lawn';
    const month = settings.plantingMonth;
    const flowerBeds = useMemo(() => beds.filter((bed) => bed.kind !== 'lawn' && bed.kind !== 'cover'), [beds]);
    const flowerFills = useMemo(() => fills.filter((_, index) => beds[index]?.kind !== 'lawn' && beds[index]?.kind !== 'cover'), [fills, beds]);
    const lawns = useMemo(() => beds.filter((bed) => bed.kind === 'lawn'), [beds]);
    const selectedBed = beds.find((bed) => bed.id === plantingEditor?.selectedId);
    const vines = settings[VINES_KEY];
    const inBloom = useMemo(() => [...new Set([...fills.flat().map((p) => p.plant), ...points.map((p) => p.plant), ...(vines ?? []).map((v) => v.plant)])].filter((id) => bloomMonths(library.get(id)).includes(month)), [fills, points, vines, library, month]);
    const coverInBloom = beds.some((bed) => bed.cover?.enabled && bed.cover.thyme > 0 && coverSeason(month, bed.cover).bloom > .12);
    const bloomNames = [...inBloom.map((id) => plantName(library.get(id), ru).split(' ')[0].toLowerCase()), ...(coverInBloom ? [ru ? 'тимьян' : 'thyme'] : [])];
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
        <div className="planting-tools planting-tools--six" role="toolbar" aria-label={ru ? 'Инструменты растений' : 'Plant tools'}>
            <button type="button" className={mode === 'bed' && lawnMode === false && !coverMode ? 'is-active' : ''} onClick={() => (mode === 'bed' && !lawnMode && !coverMode ? plantingEditor.stop() : plantingEditor.begin('bed'))} data-testid="planting-draw-bed"><FocusIcon name="bed" />{ru ? 'Цветник' : 'Bed'}<kbd>L</kbd></button>
            <button type="button" className={lawnMode ? 'is-active' : ''} onClick={() => (lawnMode ? plantingEditor.stop() : plantingEditor.beginLawn())} data-testid="planting-draw-lawn"><FocusIcon name="ground" />{ru ? 'Газон' : 'Lawn'}<kbd>&nbsp;</kbd></button>
            <button type="button" className={coverMode ? 'is-active' : ''} onClick={() => (coverMode ? plantingEditor.stop() : plantingEditor.beginCover())} data-testid="planting-draw-cover"><FocusIcon name="ground" />{ru ? 'Покров' : 'Cover'}<kbd>&nbsp;</kbd></button>
            <button type="button" className={mode === 'plant' ? 'is-active' : ''} onClick={() => (mode === 'plant' ? plantingEditor.stop() : plantingEditor.begin('plant'))} data-testid="planting-place"><FocusIcon name="sprout" />{ru ? 'Посадить' : 'Plant'}<kbd>T</kbd></button>
            <button type="button" className={mode === 'vine' ? 'is-active' : ''} onClick={() => (mode === 'vine' ? plantingEditor.stop() : plantingEditor.begin('vine'))} data-testid="planting-vine"><FocusIcon name="vine" />{ru ? 'Лиана' : 'Climber'}<kbd>I</kbd></button>
            <button type="button" onClick={() => topiaryEditor?.begin()} data-testid="planting-hedge"><FocusIcon name="leaf" />{ru ? 'Изгородь' : 'Hedge'}<kbd>Shift+B</kbd></button>
        </div>
        {coverMode ? <p className="planting-hint">{ru ? 'Щелчок по грунту модели — весь участок; протяжка — контур. Esc — выйти.' : 'Click a model’s ground for the whole patch; drag for an outline. Esc to leave.'}</p> : null}
        {lawnMode ? <p className="planting-hint">{ru
            ? 'Газон рисуется как цветник: щелчок по поверхности модели — газон на всю поверхность, протяжка по ней или по плоскости — контур. Трава — само покрытие, со стрижкой полосами вдоль длинной стороны; узор, высота и полив — в карточке газона. Esc — выйти.'
            : 'A lawn is drawn as a bed: a click on the model’s surface lays it over the whole surface, a drag over it or the plane is an outline. The grass is the surface itself, mown in stripes along the long side; pattern, height and irrigation are in the lawn’s card. Esc to leave.'}</p> : null}
        {mode === 'bed' && !lawnMode && !coverMode ? <p className="planting-hint">{ru
            ? 'Поверхность модели подсвечивается под курсором. Щелчок — цветник на всю поверхность. Протяжка по ней — только та её часть, что внутри контура: дорожки и газон в обводке останутся пустыми. Протяжка по плоскости — просто контур. Палитра «Степной». Esc — выйти.'
            : 'The model’s surface lights up under the cursor. A click plants the whole surface. A drag over it plants only its part inside the outline: paths and lawn inside it stay empty. A drag over the plane is a plain outline. “Steppe” palette. Esc to leave.'}</p> : null}
        {mode === 'vine' ? <div className="planting-plantrow">
            <PlantChoice library={library} value={plantingEditor.vineChoice} ru={ru} kinds={CLIMBERS} onChoose={plantingEditor.setVineChoice} title={ru ? 'Какую лиану' : 'Which climber'} testId="planting-vine-plant" />
            <p className="planting-hint">{ru
                ? 'Ведите по стене, кашпо, сетке или земле: где начали — там корень, лиана растёт по мазку. Вниз от края кашпо — свисает. Ещё мазок от того же корня — ещё побег того же растения. Esc — выйти.'
                : 'Drag over a wall, a planter, a mesh or the ground: where you start is the root, the climber grows along the stroke. Down from a planter’s rim it hangs. Another stroke from the same root is another shoot of the same plant. Esc to leave.'}</p>
        </div> : null}
        {plantingEditor?.vineId ? <VineCard vine={settings[VINES_KEY].find((v) => v.id === plantingEditor.vineId)} library={library} plantingEditor={plantingEditor} layoutEditor={layoutEditor} ru={ru} /> : null}
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
            <small>{bloomNames.length ? `${ru ? 'в цвету' : 'in bloom'}: ${bloomNames.slice(0, 3).join(', ')}${bloomNames.length > 3 ? ` +${bloomNames.length - 3}` : ''}` : (ru ? 'ничего не цветёт' : 'nothing in bloom')}</small>
            <span className="planting-spacer" />
            <button type="button" onClick={topView} data-testid="planting-top-view" title={ru ? 'Камера сверху' : 'Camera from above'}>{ru ? 'Сверху' : 'Top'}</button>
            <button type="button" className={settings.plantingPlan ? 'is-active' : ''} onClick={() => handleSettingChange({ target: { checked: !settings.plantingPlan } }, 'plantingPlan', 'boolean')} data-testid="planting-plan" title={ru ? 'План в шапках легенды' : 'Plan with legend caps'}>{ru ? 'План' : 'Plan'}</button>
            <button type="button" onClick={() => layoutEditor?.openPlanCamera?.()} data-testid="planting-plan-camera" title={ru ? 'Камера «Генплан»: весь участок сверху, север вверху, растения шапками. Её снимок идёт в отчёт.' : 'The “Site plan” camera: the whole site from above, north up, plants as caps. Its frame goes to the report.'}>{ru ? 'Генплан' : 'Site plan'}</button>
        </div>
        {status === 'missing' ? <p className="planting-hint">{ru ? 'Библиотеки растений нет: она лежит в ~/Ouroboros/library/plants и видна только в локальном редакторе.' : 'No plant library: it lives in ~/Ouroboros/library/plants and is seen by the local editor only.'}</p> : null}

        <nav className="planting-tabs" role="tablist">
            {[['overview', ru ? 'Обзор' : 'Overview'], ['bed', ru ? 'Цветник' : 'Bed'], ['library', ru ? 'Библиотека' : 'Library']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); if (id === 'library') setOpenPlant(null); }} data-testid={`planting-tab-${id}`}>{label}</button>)}
        </nav>
        {tab === 'overview' ? <>
            {beds.some((bed) => bed.kind === 'cover') ? <section className="planting-chart"><h4>{ru ? 'Почвопокров' : 'Groundcover'}</h4>{beds.filter((bed) => bed.kind === 'cover').map((bed) => <button key={bed.id} type="button" className="planting-lawn-row planting-lawn-row--plain" onClick={() => { plantingEditor.select(bed.id); setTab('bed'); }}><span>{bed.name}</span><b>{bedArea(bed).toFixed(1)} {ru ? 'м²' : 'm²'}</b></button>)}</section> : null}
            <LawnSummary lawns={lawns} ru={ru} selectedId={plantingEditor?.selectedId} onSelect={(id) => { plantingEditor.select(id); setTab('bed'); }} />
            <PlantingInsights beds={flowerBeds} fills={flowerFills} points={points} vines={settings[VINES_KEY] ?? []} library={library} month={month} ru={ru} focusBedId={plantingEditor?.selectedId} focusVineId={plantingEditor?.vineId} onOpenPlant={openPlantCard}
                onSelectVine={(id) => plantingEditor?.selectVine(id)} onRemoveVine={(id) => plantingEditor?.removeVine(id)}
                onPointStatus={(id, value) => applySettings({ [POINTS_KEY]: points.map((p) => (p.id === id ? { ...p, status: value === 'existing' ? 'existing' : undefined } : p)) })}
                onRemovePoint={(id) => applySettings({ [POINTS_KEY]: points.filter((p) => p.id !== id) })}
                onFramePoint={(point) => layoutEditor?.previewPose?.({ cameraPosition: { x: point.x + 6, y: point.y + 4, z: point.z + 8 }, cameraTarget: { x: point.x, y: point.y + 1.5, z: point.z }, cameraFov: 45 })} />
            <button type="button" className="planting-report" disabled={!project} onClick={async () => { if (await flushProjectSave()) window.location.href = `/engine/report?project=${encodeURIComponent(project)}`; }} data-testid="planting-report">
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
