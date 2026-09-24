import React, { useEffect, useMemo, useState } from 'react';
import { plantName } from '../plantLibrary.js';
import { bloomCurve, bloomMonths, conditionMix, risks, scopeRows } from '../insights.js';
import { PlantThumb } from './PlantPicker.jsx';

// Обзор сада — чтение, а не правка: выбрал часть сада и видишь её числами
// и картинками. Цветники — все или один; деревья и кусты поштучно — все,
// новые или существующие. Графики — из тех же заполнений, что рисует сцена.
const MONTH_LETTERS_RU = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const MONTH_LETTERS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const LIGHT_COLORS = { 'солнце': '#e3c35b', 'солнце — полутень': '#b8b06a', 'полутень': '#86a283', 'тень — полутень': '#5f7a8c', 'тень': '#4d6173' };
const WATER_COLORS = { 'сухо': '#c9a66b', 'умеренно': '#8fae7e', 'влажно': '#5f8fb0' };
const format = (value, digits = 0) => (Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—');

function Chips({ items, value, onChange }) {
    return <div className="plant-chips">{items.map((item) => <button key={item.value ?? 'all'} type="button" className={item.value === value ? 'is-active' : ''} onClick={() => onChange(item.value)} data-testid={item.testId}>
        {item.label}{item.count !== undefined ? <small>{item.count}</small> : null}
    </button>)}</div>;
}

function Tiles({ tiles }) {
    return <div className="planting-tiles">{tiles.map(([label, value, unit]) => <div key={label}><b>{value}{unit ? <small> {unit}</small> : null}</b><span>{label}</span></div>)}</div>;
}

// Состав: строка на вид — превью, имя, полоса в цвет шапки, штук.
function Composition({ rows, ru, onOpenPlant }) {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return <section className="planting-chart">
        <h4>{ru ? 'Состав' : 'Composition'}</h4>
        {rows.map((r) => <button key={r.id} type="button" className="planting-bar" onClick={() => onOpenPlant(r.id)} title={r.plant.latin}>
            <PlantThumb plant={r.plant} size={28} />
            <span className="planting-bar__name">{plantName(r.plant, ru)}<small>{r.plant.latin}</small></span>
            <span className="planting-bar__track"><i style={{ width: `${(r.count / max) * 100}%`, background: r.plant.cap ?? '#888' }} /></span>
            <b>{format(r.count)}</b>
        </button>)}
    </section>;
}

// Календарь цветения: месяцы × виды, клетка — цвет цветка с картинки.
function BloomCalendar({ rows, month, ru }) {
    const blooming = rows.filter((r) => bloomMonths(r.plant).length);
    if (!blooming.length) return null;
    const letters = ru ? MONTH_LETTERS_RU : MONTH_LETTERS_EN;
    const curve = bloomCurve(blooming);
    const top = Math.max(1, ...curve);
    return <section className="planting-chart">
        <h4>{ru ? 'Цветение по месяцам' : 'Bloom by month'}</h4>
        <div className="planting-bloom">
            <span />
            <div className="planting-bloom__curve">{curve.map((n, i) => <i key={i} className={i + 1 === month ? 'is-now' : ''} style={{ height: `${(n / top) * 100}%` }} title={`${n}`} />)}</div>
            <span />
            <div className="planting-bloom__months">{letters.map((letter, i) => <span key={i} className={i + 1 === month ? 'is-now' : ''}>{letter}</span>)}</div>
            {blooming.map((r) => <React.Fragment key={r.id}>
                <span className="planting-bloom__name" title={r.plant.latin}><PlantThumb plant={r.plant} size={18} />{plantName(r.plant, ru)}</span>
                <div className="planting-bloom__row">{Array.from({ length: 12 }, (_, i) => <i key={i} className={i + 1 === month ? 'is-now' : ''} style={bloomMonths(r.plant).includes(i + 1) ? { background: r.plant.bloomColor ?? '#c9b77a' } : undefined} />)}</div>
            </React.Fragment>)}
        </div>
    </section>;
}

// Высоты: виды по росту рядом с человеком 1.75 м — ярусы посадки.
const PERSON = 'M5.2 0a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7ZM3.6 3.3h3.2c.8 0 1.4.6 1.4 1.4v4.4H7.1V17H5.7v-7.1h-1V17H3.3V9.1H2.2V4.7c0-.8.6-1.4 1.4-1.4Z';
function Heights({ rows, ru }) {
    const sorted = [...rows].sort((a, b) => (b.plant.height ?? 0) - (a.plant.height ?? 0)).slice(0, 14);
    if (!sorted.length) return null;
    const top = Math.max(2, ...sorted.map((r) => r.plant.height ?? 0)) * 1.08;
    const w = 300, h = 120, bar = Math.min(22, (w - 34) / sorted.length - 4);
    return <section className="planting-chart">
        <h4>{ru ? 'Высоты' : 'Heights'}</h4>
        <svg className="planting-heights" viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label={ru ? 'Высоты растений' : 'Plant heights'}>
            <line x1="0" x2={w} y1={h} y2={h} />
            <path d={PERSON} transform={`translate(8 ${h - (1.75 / top) * h}) scale(${((1.75 / top) * h) / 17})`} className="planting-heights__person" />
            {sorted.map((r, i) => {
                const x = 30 + i * (bar + 4), bh = ((r.plant.height ?? 0) / top) * h;
                return <g key={r.id}><title>{`${plantName(r.plant, ru)} — ${r.plant.height} м`}</title>
                    <rect x={x} y={h - bh} width={bar} height={bh} rx="2" fill={r.plant.cap ?? '#888'} />
                    <text x={x + bar / 2} y={h - bh - 3}>{r.plant.height}</text>
                    <text x={x + bar / 2} y={h + 11} className="planting-heights__label">{plantName(r.plant, ru).slice(0, 4)}</text>
                </g>;
            })}
        </svg>
    </section>;
}

function Mix({ title, entries, colors }) {
    const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
    return <div className="planting-mix">
        <span>{title}</span>
        <div className="planting-mix__bar">{entries.map(([key, n]) => <i key={key} style={{ width: `${(n / total) * 100}%`, background: colors[key] ?? '#777' }} title={`${key}: ${n}`} />)}</div>
        <div className="planting-mix__legend">{entries.map(([key, n]) => <small key={key}><i style={{ background: colors[key] ?? '#777' }} />{key} · {Math.round((n / total) * 100)}%</small>)}</div>
    </div>;
}

// Растения поштучно: новое или существующее, показать, убрать.
function PointList({ points, library, ru, onPointStatus, onRemovePoint, onFramePoint }) {
    if (!points.length) return null;
    return <section className="planting-chart">
        <h4>{ru ? 'По одному' : 'One by one'}</h4>
        {points.map((point) => { const plant = library.get(point.plant); return <div key={point.id} className="planting-point">
            <PlantThumb plant={plant} size={24} />
            <span>{plantName(plant, ru) || point.plant}</span>
            <div className="planting-toggle">
                <button type="button" className={point.status !== 'existing' ? 'is-active' : ''} onClick={() => onPointStatus(point.id, 'new')}>{ru ? 'Новое' : 'New'}</button>
                <button type="button" className={point.status === 'existing' ? 'is-active' : ''} onClick={() => onPointStatus(point.id, 'existing')}>{ru ? 'Сущ.' : 'Existing'}</button>
            </div>
            <button type="button" className="planting-icon" onClick={() => onFramePoint(point)} title={ru ? 'Показать' : 'Frame'}>◎</button>
            <button type="button" className="planting-icon" onClick={() => onRemovePoint(point.id)} title={ru ? 'Убрать' : 'Remove'}>×</button>
        </div>; })}
    </section>;
}

export function PlantingInsights({ beds, fills, points, library, month, ru, focusBedId, onOpenPlant, onPointStatus, onRemovePoint, onFramePoint }) {
    const [view, setView] = useState(beds.length || !points.length ? 'beds' : 'trees');
    const [bed, setBed] = useState(null);
    const [status, setStatus] = useState('all');
    // Выбрал цветник в сцене — обзор показывает его.
    useEffect(() => { if (focusBedId) { setView('beds'); setBed(focusBedId); } }, [focusBedId]);
    const scope = view === 'beds' ? { kind: 'beds', bed: beds.some((b) => b.id === bed) ? bed : null } : { kind: 'trees', status };
    const data = useMemo(() => scopeRows(scope, beds, fills, points, library), [scope.kind, scope.bed, scope.status, beds, fills, points, library]); // eslint-disable-line react-hooks/exhaustive-deps
    const existing = points.filter((p) => p.status === 'existing').length;
    const listed = view === 'trees' ? points.filter((p) => status === 'all' || (status === 'existing') === (p.status === 'existing')) : [];

    return <div className="planting-insights" data-testid="planting-insights">
        <div className="planting-segment">
            <button type="button" className={view === 'beds' ? 'is-active' : ''} onClick={() => setView('beds')} data-testid="planting-view-beds">{ru ? 'Цветники' : 'Beds'}<small>{beds.length}</small></button>
            <button type="button" className={view === 'trees' ? 'is-active' : ''} onClick={() => setView('trees')} data-testid="planting-view-trees">{ru ? 'Деревья и кусты' : 'Trees and shrubs'}<small>{points.length}</small></button>
        </div>
        {view === 'beds'
            ? <Chips value={scope.bed} onChange={setBed} items={[{ value: null, label: ru ? 'Все' : 'All', count: beds.length }, ...beds.map((b) => ({ value: b.id, label: b.name }))]} />
            : <Chips value={status} onChange={setStatus} items={[
                { value: 'all', label: ru ? 'Все' : 'All', count: points.length },
                { value: 'new', label: ru ? 'Новые' : 'New', count: points.length - existing, testId: 'planting-trees-new' },
                { value: 'existing', label: ru ? 'Существующие' : 'Existing', count: existing, testId: 'planting-trees-existing' }]} />}

        {data.count ? <>
            <Tiles tiles={view === 'beds'
                ? [[ru ? 'растений' : 'plants', format(data.count)], [ru ? 'видов' : 'species', data.species], [ru ? 'площадь' : 'area', format(data.area, 1), 'м²'], [ru ? 'на м²' : 'per m²', format(data.count / Math.max(0.01, data.area), 1)]]
                : [[ru ? 'растений' : 'plants', format(data.count)], [ru ? 'видов' : 'species', data.species], [ru ? 'новых' : 'new', points.length - existing], [ru ? 'сущ.' : 'existing', existing]]} />
            <Composition rows={data.rows} ru={ru} onOpenPlant={onOpenPlant} />
            <BloomCalendar rows={data.rows} month={month} ru={ru} />
            <Heights rows={data.rows} ru={ru} />
            <section className="planting-chart">
                <h4>{ru ? 'Условия' : 'Conditions'}</h4>
                <Mix title={ru ? 'Свет' : 'Light'} entries={conditionMix(data.rows, 'light')} colors={LIGHT_COLORS} />
                <Mix title={ru ? 'Влага' : 'Water'} entries={conditionMix(data.rows, 'water')} colors={WATER_COLORS} />
            </section>
            {risks(data.rows).length ? <section className="planting-chart planting-risks">
                <h4>{ru ? 'Риски в Ростове' : 'Risks in Rostov'}</h4>
                {risks(data.rows).map(({ plant, text }) => <p key={plant.id}><b>{plantName(plant, ru)}.</b> {text}</p>)}
            </section> : null}
        </> : <p className="planting-empty">{view === 'beds'
            ? (ru ? 'Цветников пока нет — нарисуйте контур инструментом «Цветник» (L).' : 'No beds yet — draw an outline with the Bed tool (L).')
            : (ru ? 'Деревьев и кустов пока нет — «Посадить» (T) и клик по земле.' : 'No trees or shrubs yet — Plant (T) and click the ground.')}</p>}
        {view === 'trees' ? <PointList points={listed} library={library} ru={ru} onPointStatus={onPointStatus} onRemovePoint={onRemovePoint} onFramePoint={onFramePoint} /> : null}
    </div>;
}
