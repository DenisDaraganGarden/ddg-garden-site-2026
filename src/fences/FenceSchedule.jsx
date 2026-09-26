import React, { useMemo } from 'react';
import { fenceSchedule } from './layout.js';
const ROLE = { post: ['Столб', 'Post'], cap: ['Крышка', 'Cap'], panel: ['Стена', 'Wall'], infill: ['Заполнение', 'Infill'], rail: ['Лага', 'Rail'], wire: ['Проволока', 'Wire'] };
const KIND = { metal: ['Металл', 'Metal'], timber: ['Древесина', 'Timber'], concrete: ['Бетон', 'Concrete'], brick: ['Кладка', 'Masonry'] };
export default function FenceSchedule({ objects, ru = true, expanded = false }) {
    const rows = useMemo(() => fenceSchedule(objects), [objects]);
    return <div className="fence-schedule" data-testid="fence-schedule">
        {rows.map(row => <section key={row.id}>
            <h4>{row.name}</h4>
            {!row.valid ? <p role="alert">{ru ? 'Слишком много деталей. Увеличьте шаг или разделите линию. Ведомость не рассчитана.' : 'Too many parts. Increase spacing or split the path. Schedule unavailable.'}</p> : <>
                <dl className="fence-totals">
                    {[[ru ? 'Длина по рельефу' : 'Length on slope', `${row.length.toFixed(3)} m`], [ru ? 'Длина в плане' : 'Plan length', `${row.planLength.toFixed(3)} m`],
                        [ru ? 'Высота' : 'Height', `${row.heights.map(v => Number(v.toFixed(3))).join(' / ')} m`],
                        [ru ? 'Секции / столбы / крышки' : 'Sections / posts / caps', `${row.sections} / ${row.posts} / ${row.caps}`],
                        ...Object.entries(row.materials).filter(([, amount]) => amount > 0).map(([kind, amount]) => [KIND[kind][ru ? 0 : 1], `${amount.toFixed(4)} m³`])].map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}
                </dl>
                {row.warnings.length ? <p role="status">{ru ? 'Есть участки короче ширины опор; заполнение в них не помещается.' : 'Some spans are shorter than the posts; their infill cannot fit.'}</p> : null}
                <details open={expanded}><summary>{ru ? 'Детали и сечения' : 'Parts and sections'}</summary>
                    <table className="report-table"><thead><tr><th>{ru ? 'Деталь / сечение, мм' : 'Part / section, mm'}</th><th>m</th><th>{ru ? 'шт.' : 'qty'}</th></tr></thead>
                        <tbody>{row.cuts.map(cut => <tr key={cut.key}><td>{ROLE[cut.role]?.[ru ? 0 : 1]} · {KIND[cut.kind]?.[ru ? 0 : 1]}<small>{cut.profile}</small></td><td>{cut.length.toFixed(3)}</td><td>{cut.count}</td></tr>)}</tbody></table>
                </details>
                <details open={expanded}><summary>{ru ? 'Пролёты: по осям / в свету' : 'Spans: centres / clear'}</summary>
                    <table className="report-table"><thead><tr><th>№</th><th>{ru ? 'По осям, м' : 'Centres, m'}</th><th>{ru ? 'В свету, м' : 'Clear, m'}</th></tr></thead><tbody>{row.spans.map((span, i) => <tr key={i}><td>{i + 1}</td><td>{span.length.toFixed(3)}</td><td>{span.clear.toFixed(3)}</td></tr>)}</tbody></table>
                </details>
            </>}
        </section>)}
        {rows.length ? <p className="fence-note">{ru ? 'Чистые геометрические объёмы. Металл — с учётом стенки профиля; кладка — объём стены. Без фундаментов, крепежа и запаса на раскрой.' : 'Net geometric quantities. Metal accounts for profile wall thickness; masonry is wall volume. Foundations, fasteners and cutting waste excluded.'}</p> : null}
    </div>;
}
