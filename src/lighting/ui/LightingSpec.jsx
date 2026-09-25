import React, { useState } from 'react';
import { kindLabel, makerLabel, makerOf, priceText, shortName } from '../luminaireLibrary.js';
import { LuminaireThumb } from './LuminairePicker.jsx';

// Обзор и спецификация освещения (рабочее место «Освещение»): считаются из
// расставленных светильников при каждой правке — luminaireSchedule
// (fixtures.js), та же, что в отчёте проекта.
const money = (value, ru) => Math.round(value).toLocaleString(ru ? 'ru-RU' : 'en-GB');
const format = (value, ru, digits = 0) => (Number.isFinite(value) ? value.toLocaleString(ru ? 'ru-RU' : 'en-GB', { maximumFractionDigits: digits }) : '—');

function Tiles({ totals, ru }) {
    const tiles = [
        [ru ? 'светильников' : 'luminaires', format(totals.count, ru)],
        [ru ? 'типов' : 'types', format(totals.types, ru)],
        [ru ? 'мощность' : 'load', format(totals.watts, ru), ru ? 'Вт' : 'W'],
        [ru ? 'по ценам' : 'priced', totals.sum ? format(Math.round(totals.sum / 1000), ru) : '—', totals.sum ? (ru ? 'тыс ₽' : 'k ₽') : ''],
    ];
    return <div className="planting-tiles">{tiles.map(([label, value, unit]) => <div key={label}><b>{value}{unit ? <small> {unit}</small> : null}</b><span>{label}</span></div>)}</div>;
}

export function LightingOverview({ schedule, fixtures, types, labels, circuits, ru, selectedId, onOpenType, onSelect, onRemove }) {
    if (!fixtures.length) return <p className="planting-empty">{ru
        ? 'Светильников пока нет. Выберите изделие в «Библиотеке» и нажмите «Ставить», или инструмент «Светильник» (O) и щелчок по земле или стене.'
        : 'No luminaires yet. Pick a product in the Library and press Place, or use the Luminaire tool (O) and click the ground or a wall.'}</p>;
    const max = Math.max(1, ...schedule.rows.map((row) => row.count));
    return <div className="planting-insights" data-testid="lighting-overview">
        <Tiles totals={schedule.totals} ru={ru} />
        <section className="planting-chart">
            <h4>{ru ? 'Состав' : 'Composition'}</h4>
            {schedule.groups.map((group) => <React.Fragment key={group.kind?.id ?? 'other'}>
                <p className="lum-group">{group.kind ? (ru ? group.kind.ru : group.kind.en) : (ru ? 'Нет в библиотеке' : 'Not in the library')}<small>{group.count}</small></p>
                {group.rows.map((row) => <button key={row.id} type="button" className="planting-bar" onClick={() => onOpenType(row.id)} title={row.type?.ru ?? row.id}>
                    <LuminaireThumb type={row.type} size={28} />
                    <span className="planting-bar__name">{row.type ? shortName(row.type, ru) : row.id}<small>{row.type ? makerLabel(makerOf(row.type), ru) : ''}</small></span>
                    <span className="planting-bar__track"><i style={{ width: `${(row.count / max) * 100}%`, background: '#d9c9a0' }} /></span>
                    <b>{row.count}</b>
                </button>)}
            </React.Fragment>)}
        </section>
        <section className="planting-chart" data-testid="lighting-list">
            <h4>{ru ? 'Расставлены' : 'Placed'}</h4>
            {schedule.groups.map((group) => <React.Fragment key={group.kind?.id ?? 'other'}>
                {fixtures.filter((fixture) => group.rows.some((row) => row.id === fixture.type)).map((fixture) => {
                    const type = types.get(fixture.type);
                    return <div key={fixture.id} className={`planting-point lum-point${fixture.id === selectedId ? ' is-active' : ''}`}>
                        <b className="lum-point__label">{labels.get(fixture.id)}</b>
                        <button type="button" className="lum-point__name" onClick={() => onSelect(fixture)} title={ru ? 'Выбрать и показать' : 'Select and frame'}>
                            <LuminaireThumb type={type} size={22} />
                            <span>{type ? shortName(type, ru) : fixture.type}<small>{[fixture.dim < 1 ? `${Math.round(fixture.dim * 100)}%` : null, circuits.get(fixture.circuit), fixture.locked ? '✓' : null].filter(Boolean).join(' · ')}</small></span>
                        </button>
                        <button type="button" className="planting-icon" onClick={() => onSelect(fixture)} title={ru ? 'Показать' : 'Frame'}>◎</button>
                        <button type="button" className="planting-icon" onClick={() => onRemove(fixture.id)} title={ru ? 'Убрать (⌘Z вернёт)' : 'Remove (⌘Z brings it back)'} data-testid="lighting-remove">×</button>
                    </div>;
                })}
            </React.Fragment>)}
        </section>
    </div>;
}

// Таблица для Excel: строка на тип, через табуляцию.
function scheduleTsv(schedule, ru) {
    const head = ru
        ? ['Вид', 'Марки', 'Светильник', 'Производитель', 'Артикул', 'Кол-во', 'лм', 'Вт', 'В', 'K', 'IP', 'Цена за шт., ₽', 'Сумма, ₽', 'Страница']
        : ['Kind', 'Marks', 'Luminaire', 'Maker', 'Article', 'Qty', 'lm', 'W', 'V', 'K', 'IP', 'Unit price, ₽', 'Sum, ₽', 'Page'];
    const rows = schedule.rows.map((row) => [
        kindLabel(row.kind, ru), row.labels.join(', '), row.type ? shortName(row.type, ru) : row.id, row.type?.generic ? '' : row.type?.maker ?? '', row.type?.article ?? '',
        row.count, row.type?.optics?.lumens ?? '', row.type?.power?.watts ?? '', row.type?.power?.volts ?? '', row.type?.optics?.cct ?? '', row.type?.ip ?? '',
        row.price ?? '', row.sum ?? '', row.type?.url ?? '',
    ]);
    return [head, ...rows].map((cells) => cells.map((cell) => String(cell).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
}

export function LightingSpecTable({ schedule, ru, onOpenType, onReport, reportReady }) {
    const [copied, setCopied] = useState('');
    if (!schedule.rows.length) return <p className="planting-empty">{ru ? 'Спецификация появится, когда будут расставлены светильники.' : 'The schedule appears once luminaires are placed.'}</p>;
    const copy = async () => {
        try { await navigator.clipboard.writeText(scheduleTsv(schedule, ru)); setCopied(ru ? 'Скопировано — вставьте в Excel или Таблицы' : 'Copied — paste into Excel or Sheets'); } catch { setCopied(ru ? 'Не скопировалось' : 'Copy failed'); }
    };
    const { totals } = schedule;
    return <div className="lum-spec" data-testid="lighting-spec">
        {schedule.groups.map((group) => <section key={group.kind?.id ?? 'other'} className="lum-spec__group">
            <h4>{group.kind ? (ru ? group.kind.ru : group.kind.en) : (ru ? 'Нет в библиотеке' : 'Not in the library')}<small>{group.count} {ru ? 'шт.' : 'pcs'}</small></h4>
            {group.rows.map((row) => <button key={row.id} type="button" className="lum-spec__row" onClick={() => onOpenType(row.id)} data-testid="lighting-spec-row">
                <LuminaireThumb type={row.type} size={40} />
                <span className="lum-spec__name">
                    <b>{row.type ? shortName(row.type, ru) : row.id}</b>
                    <small>{row.type ? [makerLabel(makerOf(row.type), ru), row.type.generic ? null : row.type.article].filter(Boolean).join(' · ') : (ru ? 'типа нет в библиотеке' : 'type missing')}</small>
                    <small className="lum-spec__marks">{row.labels.join(', ')}</small>
                </span>
                <span className="lum-spec__qty">{row.count}<small>{ru ? 'шт.' : 'pcs'}</small></span>
                <span className="lum-spec__sum">{row.sum ? money(row.sum, ru) : '—'}<small>{row.price ? `${money(row.price, ru)} × ${row.count}` : priceText(row.type, ru)}</small></span>
            </button>)}
        </section>)}
        <div className="lum-spec__totals">
            <span>{ru ? 'Всего' : 'Total'} <b>{totals.count}</b> {ru ? 'шт.' : 'pcs'} · {totals.types} {ru ? 'типов' : 'types'} · {format(totals.watts, ru)} {ru ? 'Вт' : 'W'} · {format(totals.lumens, ru)} {ru ? 'лм' : 'lm'}</span>
            <b>{totals.sum ? `${money(totals.sum, ru)} ₽` : '—'}</b>
            {totals.unpriced ? <small>{ru ? `Без цены ${totals.unpriced} шт. (Flos — у дилера, заготовки — не изделия): в сумму не вошли.` : `${totals.unpriced} pcs without a price (Flos via dealers, generic stand-ins): not in the sum.`}</small> : null}
        </div>
        <div className="planting-actions">
            <button type="button" onClick={copy} data-testid="lighting-spec-copy">{ru ? 'Копировать для Excel' : 'Copy for Excel'}</button>
            <button type="button" onClick={onReport} disabled={!reportReady}>{reportReady ? (ru ? 'Отчёт для заказчика' : 'Client report') : (ru ? 'Отчёт — в проекте движка' : 'Report — in an engine project')}</button>
        </div>
        {copied ? <p className="planting-status">{copied}</p> : null}
    </div>;
}
