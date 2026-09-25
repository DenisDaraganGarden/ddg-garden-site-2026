import React from 'react';
import { cableSchedule } from './electric.js';
import { luminaireName } from './luminaireLibrary.js';
import { LuminaireThumb } from './ui/LuminairePicker.jsx';
import './ui/lighting-ui.css';

// Освещение в отчёте проекта (docs/garden-lighting-2026-09-25.md): ведомость
// светильников с происхождением данных, цепи с длинами, нагрузками, ΔU,
// сечениями и автоматами, траншеи по покрытиям, конфликты. Трассы — по
// сетке участка, которую положил редактор (site-grid.json). Всё —
// предварительная схема, не рабочая документация электрики.
const sourceOf = (type, ru) => {
    if (!type) return ru ? 'типа нет в библиотеке' : 'type missing';
    if (type.generic) return ru ? 'заготовка, числа ориентировочные' : 'generic, indicative numbers';
    const guessed = Object.values(type.source ?? {}).filter((from) => from === 'guess').length;
    return guessed ? (ru ? `паспорт, ${guessed} полей — догадка` : `datasheet, ${guessed} fields guessed`) : (ru ? 'паспорт' : 'datasheet');
};

// Цена — из магазина, где агент нашёл изделие, на дату, когда смотрел:
// за штуку и за строку ведомости.
const price = (row, ru) => {
    const rub = Number(row.type?.price?.rub);
    if (!(rub > 0)) return '—';
    const money = (value) => Math.round(value).toLocaleString(ru ? 'ru-RU' : 'en-GB');
    return <>{money(rub * row.labels.length)}<small>{money(rub)} × {row.labels.length}{row.type.price.at ? ` · ${row.type.price.at}${row.type.price.date ? `, ${row.type.price.date}` : ''}` : ''}</small></>;
};

export function LightingReportBlocks({ report, ru }) {
    if (!report) return null;
    const { lighting, schedule, network } = report;
    const cables = network ? cableSchedule(network) : null;
    const circuitName = new Map(lighting.lightingCircuits.map((circuit) => [circuit.id, circuit.name]));
    const panelName = new Map(lighting.lightingPanels.map((panel) => [panel.id, panel.name]));
    return <>
        <section className="report-block">
            <h3>{ru ? 'Ведомость светильников' : 'Luminaire schedule'}</h3>
            <table className="report-table"><thead><tr>
                <th>{ru ? 'Номера' : 'Marks'}</th><th>{ru ? 'Светильник' : 'Luminaire'}</th><th>{ru ? 'Кол-во' : 'Qty'}</th><th>{ru ? 'лм' : 'lm'}</th><th>K</th><th>{ru ? 'Вт' : 'W'}</th><th>{ru ? 'В' : 'V'}</th><th>{ru ? 'Управление' : 'Control'}</th><th>{ru ? 'Цена, ₽' : 'Price, ₽'}</th><th>{ru ? 'Данные' : 'Data'}</th>
            </tr></thead><tbody>{schedule.groups.map((group) => <React.Fragment key={group.kind?.id ?? 'other'}>
                <tr className="report-table__group"><th colSpan={10}>{group.kind ? (ru ? group.kind.ru : group.kind.en) : (ru ? 'Нет в библиотеке' : 'Not in the library')} · {group.count} {ru ? 'шт.' : 'pcs'}</th></tr>
                {group.rows.map((row) => <tr key={row.id}>
                <td>{row.labels.join(', ')}</td>
                <td><span className="report-luminaire"><LuminaireThumb type={row.type} size={46} /><span>{luminaireName(row.type, ru) || row.id}{row.type && !row.type.generic ? <small>{[row.type.maker, row.type.model, row.type.article].filter(Boolean).join(' ')}</small> : null}</span></span></td>
                <td>{row.labels.length}</td><td>{row.type?.optics?.lumens ?? '—'}</td><td>{row.type?.optics?.cct ?? '—'}</td><td>{row.type?.power?.watts ?? '—'}</td><td>{row.type?.power?.volts ?? '—'}</td>
                <td>{(row.type?.control ?? []).join(', ') || '—'}</td><td>{price(row, ru)}</td><td>{sourceOf(row.type, ru)}</td>
            </tr>)}</React.Fragment>)}</tbody></table>
            <p className="report-hint">{ru ? 'Всего' : 'Total'}: {schedule.totals.count} {ru ? 'шт.' : 'pcs'}, {schedule.totals.types} {ru ? 'типов' : 'types'}, {Math.round(schedule.totals.watts)} {ru ? 'Вт' : 'W'}.{schedule.totals.sum ? ` ${ru ? 'По известным ценам' : 'Known prices'}: ${Math.round(schedule.totals.sum).toLocaleString(ru ? 'ru-RU' : 'en-GB')} ₽${schedule.totals.unpriced ? (ru ? ` — ${schedule.totals.unpriced} шт. без цены (Flos — по запросу у дилера) в сумму не вошли.` : ` — ${schedule.totals.unpriced} pcs without a price (Flos is priced by dealers) are not included.`) : '.'}` : ''}</p>
        </section>
        <section className="report-block">
            <h3>{ru ? 'Питание — предварительная схема' : 'Power — preliminary scheme'}</h3>
            {!network ? <p className="report-hint">{ru ? 'Трассы появятся, когда проект откроют в редакторе: он строит сетку участка из модели.' : 'Routes appear once the project is opened in the editor: it builds the site grid from the model.'}</p> : <>
                {network.circuits.length ? <table className="report-table"><thead><tr>
                    <th>{ru ? 'Цепь' : 'Circuit'}</th><th>{ru ? 'Щиток' : 'Panel'}</th><th>{ru ? 'Светильники' : 'Luminaires'}</th><th>{ru ? 'Нагрузка, Вт' : 'Load, W'}</th><th>{ru ? 'Кабель, м' : 'Cable, m'}</th><th>{ru ? 'Сечение, мм²' : 'Section, mm²'}</th><th>{ru ? 'Автомат' : 'Breaker'}</th><th>ΔU, %</th>
                </tr></thead><tbody>{network.circuits.map((circuit) => <tr key={circuit.id}>
                    <td>{circuitName.get(circuit.id) ?? circuit.id}<small>{circuit.volts} {ru ? 'В' : 'V'}</small></td><td>{panelName.get(circuit.panel) ?? circuit.panel}</td>
                    <td>{circuit.fixtures.map((fixture) => report.labels.get(fixture)).join(', ')}</td><td>{Math.round(circuit.loadW)}</td><td>{Math.round(circuit.cableLength * 10) / 10}</td>
                    <td>{circuit.section}</td><td>{circuit.breaker.curve}{circuit.breaker.amps}{circuit.perBreaker === 'unknown' ? (ru ? ' · пусковые — по паспорту драйвера' : ' · inrush — check driver datasheet') : circuit.perBreaker === 'over' ? (ru ? ' · больше, чем допускает паспорт' : ' · over the datasheet limit') : ''}</td>
                    <td>{circuit.dropPct.toFixed(1)}</td>
                </tr>)}</tbody></table> : <p className="report-hint">{ru ? 'Цепей ещё нет.' : 'No circuits yet.'}</p>}
                {cables ? <p>{ru ? 'Траншеи' : 'Trenches'}: {Math.round(network.totals.trenchLength * 10) / 10} {ru ? 'м' : 'm'}{cables.trenches.length ? ` (${cables.trenches.map((row) => `${ru ? row.ru : row.en} ${row.length}`).join(', ')})` : ''}. {cables.cables.map((row) => `${ru ? 'Кабель' : 'Cable'} ${row.section} ${ru ? 'мм²' : 'mm²'} — ${row.length} ${ru ? 'м' : 'm'}`).join('; ')}.</p> : null}
                {network.conflicts.length ? <ul>{network.conflicts.map((conflict, index) => <li key={index}>{ru ? conflict.ru : conflict.en}</li>)}</ul> : null}
            </>}
            <p className="report-hint">{ru
                ? 'Длины, нагрузки и падение напряжения посчитаны по плану участка; сечения, защита, число драйверов на автомат и УЗО 30 мА — к проверке электриком по исходным данным и нормам региона. Подземные сети, которых нет в модели, не известны.'
                : 'Lengths, loads and voltage drop are computed from the site plan; sections, protection, drivers per breaker and 30 mA RCDs are for an electrician to check against the source data and local codes. Underground services not in the model are unknown.'}</p>
        </section>
    </>;
}
