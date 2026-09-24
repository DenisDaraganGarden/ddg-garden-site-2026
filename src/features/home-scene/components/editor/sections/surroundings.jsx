import React, { lazy, Suspense, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl, RangeControl, SectionHeading } from '../../HomeEditorControls';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { SURROUNDINGS_RANGES } from '../../../../../surroundings/settings.js';
import { parseCoordinates, projector, summarizeSurroundings } from '../../../../../surroundings/osm.js';
import { requestSurroundings, searchPlaces, useSurroundingsData } from '../../../../../surroundings/data.js';
import '../../../../../surroundings/surroundings.css';

const MiniMap = lazy(() => import('../../../../../surroundings/MiniMap.jsx'));

// Окружение участка (только «Участок»): адрес → точка на карте → дома,
// дороги, рельеф и деревья OpenStreetMap вокруг модели. Точка и радиус —
// здесь, сами данные — файлом в проекте (scripts/surroundings.mjs).
const COLOR_LABELS = {
    surroundingsBuildingColor: ['Дома', 'Buildings'],
    surroundingsGroundColor: ['Земля', 'Ground'],
    surroundingsRoadColor: ['Дороги', 'Roads'],
    surroundingsGreenColor: ['Зелень', 'Greenery'],
    surroundingsWaterColor: ['Вода', 'Water'],
};

const summaryLine = (summary, ru) => (ru
    ? `Домов ${summary.buildings}: высота из карты — ${summary.measured}, по этажам — ${summary.levels}, оценкой — ${summary.guessed}. Дорог ${summary.roadsKm} км, деревьев ${summary.trees}, заборов ${summary.fences}.`
    : `${summary.buildings} buildings: mapped height ${summary.measured}, by storeys ${summary.levels}, estimated ${summary.guessed}. Roads ${summary.roadsKm} km, trees ${summary.trees}, fences ${summary.fences}.`);

export function SurroundingsSection({ settings, handleSettingChange, applySettings }) {
    const { language } = useLanguage(), ru = language === 'ru';
    const tr = (a, b) => (ru ? a : b);
    const scope = useFocusControlScope();
    const projectId = activeProjectId();
    const data = useSurroundingsData(projectId, settings.surroundingsStamp);
    const [query, setQuery] = useState(settings.geoAddress ?? '');
    const [places, setPlaces] = useState(null);
    const [status, setStatus] = useState(null);
    const [layer, setLayer] = useState('scheme');
    const { geoLatitude: lat, geoLongitude: lon, surroundingsRadius: radius } = settings;
    const located = lat !== null && lon !== null;
    const busy = Boolean(status?.busy);

    // Загружено вокруг другой точки или меньше, чем просят, — пора обновить.
    const stale = data && located && (Math.hypot(...projector(data.center.lat, data.center.lon).toLocal(lat, lon)) > 1 || radius > data.radius);

    const find = async () => {
        const typed = parseCoordinates(query);
        if (typed) {
            applySettings({ geoLatitude: typed.lat, geoLongitude: typed.lon, geoAddress: '' });
            setPlaces(null);
            return;
        }
        if (!query.trim()) return;
        setStatus({ busy: true, text: tr('Ищу адрес…', 'Searching…') });
        try {
            const found = await searchPlaces(query.trim());
            setPlaces(found);
            setStatus(found.length ? null : { text: tr('Адрес не нашёлся. Уточните улицу и город или поставьте точку на карте.', 'Nothing found. Add the street and the city, or click the map.') });
        } catch (error) {
            setStatus({ text: error.message });
        }
    };
    // Адрес Nominatim — до страны и индекса; для подписи хватает дома, улицы, района и города.
    const choose = (place) => {
        const label = place.label.split(', ').slice(0, 4).join(', ');
        applySettings({ geoLatitude: place.lat, geoLongitude: place.lon, geoAddress: label });
        setQuery(label);
        setPlaces(null);
    };
    const load = async () => {
        setStatus({ busy: true, text: tr('Загружаю OpenStreetMap и рельеф — до минуты…', 'Loading OpenStreetMap and relief — up to a minute…') });
        try {
            const result = await requestSurroundings(projectId, { lat, lon, radius });
            // Первая загрузка: землю даёт окружение, ровная «Плоскость» легла бы поверх рельефа.
            const first = !settings.surroundingsStamp && settings.planeEnabled;
            applySettings({ surroundingsStamp: result.stamp, surroundingsEnabled: true, ...(first ? { planeEnabled: false } : {}) });
            // Отказавшие по пути серверы записаны в файле (notes) — здесь только итог.
            const relief = result.elevation !== null
                ? tr(`участок на ${Math.round(result.elevation)} м над морем`, `the plot is ${Math.round(result.elevation)} m above sea level`)
                : tr('рельеф не загрузился — земля ровная', 'no relief came — the ground is flat');
            setStatus({ text: `${tr('Готово', 'Done')}: ${relief}.${first ? ` ${tr('«Плоскость» выключена — землю теперь даёт окружение.', '“Plane” is off — the surroundings are the ground now.')}` : ''}` });
        } catch (error) {
            setStatus({ text: error.message });
        }
    };

    const range = (key, [label, labelEn], [min, max, step], unit) => <RangeControl key={key} controlId={key} testId={`surroundings-${key}`} label={tr(label, labelEn)}
        value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(event) => handleSettingChange(event, key)} />;
    const toggle = (key, [label, labelEn]) => <CheckboxControl key={key} controlId={key} testId={`surroundings-${key}`} label={tr(label, labelEn)}
        checked={settings[key]} onChange={(event) => handleSettingChange(event, key, 'boolean')} />;

    return <>
        {!scope?.catalogOnly ? <>
            <div className="surroundings-search">
                <input className="home-editor-select" value={query} placeholder={tr('Адрес участка или 47.2225, 39.7188', 'Plot address or 47.2225, 39.7188')}
                    aria-label={tr('Адрес участка', 'Plot address')} data-testid="surroundings-address"
                    onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void find(); }} />
                <button type="button" className="home-editor-tab" disabled={busy || !query.trim()} onClick={() => void find()} data-testid="surroundings-find">{tr('Найти', 'Find')}</button>
            </div>
            {places?.length ? <div className="surroundings-places">
                {places.map((place) => <button key={`${place.lat},${place.lon}`} type="button" className="home-editor-tab" title={place.label} onClick={() => choose(place)}>{place.label}</button>)}
            </div> : null}
            <div className="home-editor-tabs">
                {[['scheme', tr('Схема', 'Map')], ['photo', tr('Спутник', 'Satellite')]].map(([id, label]) => <button key={id} type="button"
                    className={`home-editor-tab${layer === id ? ' active' : ''}`} aria-pressed={layer === id} onClick={() => setLayer(id)}>{label}</button>)}
            </div>
            <Suspense fallback={<div className="surroundings-map" />}>
                <MiniMap lat={lat} lon={lon} radius={radius} layer={layer}
                    loaded={data ? { lat: data.center.lat, lon: data.center.lon, radius: data.radius } : null}
                    onPick={(y, x) => applySettings({ geoLatitude: Math.round(y * 1e7) / 1e7, geoLongitude: Math.round(x * 1e7) / 1e7 })} />
            </Suspense>
            <div className="home-editor-status">{located
                ? `${lat.toFixed(6)}, ${lon.toFixed(6)}${settings.geoAddress ? ` · ${settings.geoAddress}` : ''}`
                : tr('Найдите адрес участка или щёлкните по карте. Точку можно перетащить.', 'Find the plot address or click the map. The point can be dragged.')}</div>
        </> : null}
        {range('surroundingsRadius', ['Радиус карты', 'Map radius'], SURROUNDINGS_RANGES.radius, 'm')}
        {!scope?.catalogOnly ? <>
            <div className="home-editor-tabs">
                <button type="button" className="home-editor-tab" disabled={busy || !located || !projectId} onClick={() => void load()} data-testid="surroundings-load">
                    {settings.surroundingsStamp ? tr('Обновить окружение', 'Reload surroundings') : tr('Загрузить окружение', 'Load surroundings')}
                </button>
            </div>
            {status ? <div className="home-editor-status" role="status" data-testid="surroundings-status">{status.text}</div> : null}
            {stale && !busy ? <div className="home-editor-status">{tr('Точка или радиус изменились — «Обновить окружение», чтобы перестроить карту.', 'The point or the radius changed — reload to rebuild the map.')}</div> : null}
            {data ? <div className="home-editor-status" data-testid="surroundings-summary">{summaryLine(summarizeSurroundings(data), ru)}</div> : null}
        </> : null}

        <SectionHeading label={tr('Слои', 'Layers')} subtle />
        {toggle('surroundingsBuildings', ['Здания', 'Buildings'])}
        {toggle('surroundingsTrees', ['Деревья и лес', 'Trees and woods'])}
        {toggle('surroundingsFences', ['Заборы и изгороди', 'Fences and hedges'])}
        {range('surroundingsRelief', ['Рельеф', 'Relief'], SURROUNDINGS_RANGES.relief)}

        <SectionHeading label={tr('Совмещение с моделью', 'Fit to the model')} subtle />
        {range('northAngle', ['Север', 'North'], SURROUNDINGS_RANGES.north, '°')}
        {range('surroundingsOffsetX', ['Сдвиг X', 'Shift X'], SURROUNDINGS_RANGES.offset, 'm')}
        {range('surroundingsOffsetZ', ['Сдвиг Z', 'Shift Z'], SURROUNDINGS_RANGES.offset, 'm')}
        {range('surroundingsClear', ['Круг участка', 'Plot circle'], SURROUNDINGS_RANGES.clear, 'm')}
        {!scope?.catalogOnly ? <div className="home-editor-status">{tr(
            'Точка карты садится на модель SketchUp. В круге участка чужих домов нет и земля ровная.',
            'The map point sits on the SketchUp model. Inside the plot circle there are no other buildings and the ground is flat.',
        )}</div> : null}

        <SectionHeading label={tr('Цвета', 'Colours')} subtle />
        {Object.entries(COLOR_LABELS).map(([key, [label, labelEn]]) => <ColorControl key={key} controlId={key} label={tr(label, labelEn)} value={settings[key]}
            onChange={(event) => handleSettingChange(event, key, 'color')} />)}
        {!scope?.catalogOnly ? <div className="home-editor-status">{tr(
            'Данные © участники OpenStreetMap (ODbL). Рельеф: Terrarium, AWS Open Data (SRTM). Спутник на мини-карте: Esri.',
            'Data © OpenStreetMap contributors (ODbL). Relief: Terrarium, AWS Open Data (SRTM). Satellite on the mini map: Esri.',
        )}</div> : null}
    </>;
}
