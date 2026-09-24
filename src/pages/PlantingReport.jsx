import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { readProject } from '../features/engine/projectApi';
import { normalizePlantingSettings } from '../planting/settings.js';
import { bedArea, plantingInstances, plantingSchedule, spacingFor } from '../planting/fillBed.js';
import { isSeasonSheet, plantCardUrl, plantName, plantPhotoUrl, useBedFills, usePlantLibrary } from '../planting/plantLibrary.js';
import { bloomMonths, byCategory, CATEGORY_LABELS } from '../planting/insights.js';
import './PlantingReport.css';

// Отчёт по посадкам проекта — для заказчика и дендролога: план в шапках
// легенды, календарь цветения, альбом растений с картинками и ведомость.
// Одна страница, печатается в PDF (⌘P). Числа — те же, что рисует сцена.
const MONTHS = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const LEGEND = [['perennial', '#bf6d3f'], ['grass', '#bfb83f'], ['shrub', '#84b03a'], ['conifer', '#414c19'], ['tree', '#98bf71']];

function Plan({ beds, instances, library }) {
    const all = [...beds.flatMap((bed) => bed.points), ...instances.map((p) => [p.x, p.z])];
    if (!all.length) return null;
    const pad = 2 + Math.max(0, ...instances.map((p) => (library.get(p.plant)?.spread ?? 1) / 2));
    const x0 = Math.min(...all.map((p) => p[0])) - pad, x1 = Math.max(...all.map((p) => p[0])) + pad;
    const z0 = Math.min(...all.map((p) => p[1])) - pad, z1 = Math.max(...all.map((p) => p[1])) + pad;
    const width = x1 - x0, bar = [1, 2, 5, 10, 20, 50].find((m) => m >= width / 8) ?? 50;
    const layer = { tree: 3, conifer: 2, shrub: 2, topiary: 2 };
    const ordered = [...instances].sort((a, b) => (layer[library.get(a.plant)?.category] ?? 1) - (layer[library.get(b.plant)?.category] ?? 1));
    return <svg className="report-plan" viewBox={`${x0} ${z0} ${width} ${z1 - z0}`} role="img" aria-label="План посадок">
        {beds.map((bed) => <path key={bed.id} d={[bed.points, ...(bed.holes ?? [])].map((ring) => `M${ring.map((p) => p.join(',')).join('L')}Z`).join('')} fillRule="evenodd" className="report-plan__bed" style={{ strokeWidth: width / 500 }} />)}
        {ordered.map((p, i) => {
            const plant = library.get(p.plant), r = ((plant?.spread ?? 0.5) * p.scale) / 2;
            return <g key={i}>
                <circle cx={p.x} cy={p.z} r={r} fill={p.existing ? '#f4f3ee' : plant?.cap ?? '#999'} fillOpacity={p.existing ? 0.9 : 0.61} stroke={p.existing ? '#2d2f2c' : '#00000040'} strokeWidth={width / 900} />
                {p.existing ? <circle cx={p.x} cy={p.z} r={Math.max(r * 0.12, width / 300)} fill="#2d2f2c" /> : null}
            </g>;
        })}
        {beds.map((bed) => { const [cx, cz] = bed.points.reduce(([a, b], [x, z]) => [a + x / bed.points.length, b + z / bed.points.length], [0, 0]); return <text key={bed.id} x={cx} y={cz} className="report-plan__label" style={{ fontSize: width / 55 }}>{bed.name}</text>; })}
        <g transform={`translate(${x0 + width * 0.03} ${z1 - (z1 - z0) * 0.04})`}>
            <rect width={bar} height={width / 180} fill="#222" />
            <text x={bar / 2} y={-width / 120} className="report-plan__scale" style={{ fontSize: width / 70 }}>{bar} м</text>
        </g>
    </svg>;
}

export default function PlantingReport() {
    const { language } = useLanguage(), ru = language !== 'en';
    const id = new URLSearchParams(window.location.search).get('project');
    const [entry, setEntry] = useState(null);
    const [error, setError] = useState('');
    const { plants: library, status } = usePlantLibrary();
    useEffect(() => {
        document.documentElement.dataset.plantingReport = 'true';
        return () => { delete document.documentElement.dataset.plantingReport; };
    }, []);
    useEffect(() => { readProject(id).then(setEntry, (reason) => setError(reason.message)); }, [id]);
    const planting = useMemo(() => normalizePlantingSettings(entry?.settings ?? {}), [entry]);
    const fills = useBedFills(planting.plantingBeds, library);
    const instances = useMemo(() => [...plantingInstances(planting.plantingBeds, fills, planting.plantingPoints).values()].flat(), [planting, fills]);
    const schedule = useMemo(() => plantingSchedule(planting.plantingBeds, fills, planting.plantingPoints, library), [planting, fills, library]);
    const species = useMemo(() => [...schedule].sort((a, b) => byCategory(a.plant, b.plant)), [schedule]);
    const existing = planting.plantingPoints.filter((p) => p.status === 'existing').length;
    const area = planting.plantingBeds.reduce((sum, bed) => sum + bedArea(bed), 0);
    const date = new Date().toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (error) return <main className="report"><p className="report-note">{error}</p></main>;
    if (!entry || status === 'loading' || status === 'idle') return <main className="report"><p className="report-note">{ru ? 'Собираю отчёт…' : 'Building the report…'}</p></main>;

    return <main className="report" data-testid="planting-report-page">
        <nav className="report-toolbar">
            <button type="button" onClick={() => { window.location.href = `/home/edit?project=${encodeURIComponent(id)}`; }}>← {ru ? 'К проекту' : 'Back to the project'}</button>
            <span />
            <button type="button" className="is-primary" onClick={() => window.print()}>{ru ? 'Печать / PDF' : 'Print / PDF'}</button>
        </nav>

        <header className="report-head">
            <p>DDG buro · Ouroboros</p>
            <h1>{entry.name}</h1>
            <h2>{ru ? 'Посадки: план, цветение, альбом растений и ведомость' : 'Planting: plan, bloom, plant album and schedule'}</h2>
            <p>{date}</p>
        </header>

        <section className="report-tiles">
            {[[schedule.reduce((sum, r) => sum + r.count, 0), ru ? 'растений' : 'plants'], [schedule.length, ru ? 'видов' : 'species'], [planting.plantingBeds.length, ru ? 'цветников' : 'beds'], [`${area.toFixed(1)} м²`, ru ? 'цветников по площади' : 'of beds'], [planting.plantingPoints.length - existing, ru ? 'деревьев и кустов — новых' : 'new trees and shrubs'], [existing, ru ? 'существующих' : 'existing']].map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
        </section>

        <section className="report-block">
            <h3>{ru ? 'План' : 'Plan'}</h3>
            <Plan beds={planting.plantingBeds} instances={instances} library={library} />
            <div className="report-legend">{LEGEND.map(([id2, color]) => <span key={id2}><i style={{ background: color }} />{CATEGORY_LABELS[id2][ru ? 0 : 1]}</span>)}<span><i className="is-existing" />{ru ? 'существующее' : 'existing'}</span></div>
        </section>

        {species.some((r) => bloomMonths(r.plant).length) ? <section className="report-block report-bloom">
            <h3>{ru ? 'Цветение по месяцам' : 'Bloom by month'}</h3>
            <table><thead><tr><th />{MONTHS.map((m, i) => <th key={i}>{m}</th>)}</tr></thead>
                <tbody>{species.filter((r) => bloomMonths(r.plant).length).map((r) => <tr key={r.plant.id}><td>{plantName(r.plant, ru)}</td>{MONTHS.map((_, i) => <td key={i} style={bloomMonths(r.plant).includes(i + 1) ? { background: r.plant.bloomColor ?? '#c9b77a' } : undefined} />)}</tr>)}</tbody></table>
        </section> : null}

        <section className="report-block">
            <h3>{ru ? 'Растения' : 'Plants'}</h3>
            <div className="report-album">{species.map((r) => {
                const photo = plantPhotoUrl(r.plant), sheet = photo && isSeasonSheet(r.plant.photoSize);
                return <article key={r.plant.id} className={sheet ? 'is-sheet' : ''}>
                    <div className="report-album__image"><img src={photo ?? plantCardUrl(r.plant)} alt={plantName(r.plant, ru)} /></div>
                    <div className="report-album__text">
                        <h4>{plantName(r.plant, ru)}</h4>
                        <p className="report-album__latin">{r.plant.latin}</p>
                        <p><b>{r.count} {ru ? 'шт' : 'pcs'}</b> · {CATEGORY_LABELS[r.plant.category]?.[ru ? 0 : 1]} · {[...r.beds].join(', ') || (ru ? 'одиночные' : 'single')}</p>
                        <p>{ru ? 'Высота' : 'Height'} {r.plant.height} м · {ru ? 'ширина' : 'spread'} {r.plant.spread} м{r.plant.density && r.plant.category !== 'tree' ? ` · ${r.plant.density} шт/м², ${ru ? 'шаг' : 'spacing'} ${Math.round(spacingFor(r.plant.density) * 100)} см` : ''}</p>
                        <p>{[r.plant.light, r.plant.water, r.plant.zone ? `USDA ${r.plant.zone}` : ''].filter(Boolean).join(' · ')}</p>
                        {bloomMonths(r.plant).length ? <div className="report-album__bloom">{MONTHS.map((m, i) => <span key={i} style={bloomMonths(r.plant).includes(i + 1) ? { background: r.plant.bloomColor ?? '#c9b77a' } : undefined}>{m}</span>)}</div> : null}
                        {r.plant.rostov ? <p className="report-album__note">{r.plant.rostov}</p> : null}
                        {r.plant.risk ? <p className="report-album__note is-risk">{r.plant.risk}</p> : null}
                    </div>
                </article>;
            })}</div>
        </section>

        <section className="report-block">
            <h3>{ru ? 'Ассортиментная ведомость' : 'Planting schedule'}</h3>
            <table className="report-table"><thead><tr>
                <th>№</th><th>{ru ? 'Растение' : 'Plant'}</th><th>{ru ? 'Кол-во, шт' : 'Qty'}</th><th>{ru ? 'Площадь, м²' : 'Area, m²'}</th><th>{ru ? 'шт/м²' : '/m²'}</th><th>{ru ? 'Высота, м' : 'Height, m'}</th><th>{ru ? 'Где' : 'Where'}</th><th>{ru ? 'Замечания дендролога' : 'Dendrologist notes'}</th>
            </tr></thead><tbody>{schedule.map((r, i) => <tr key={r.plant.id}>
                <td>{i + 1}</td><td>{plantName(r.plant, ru)}<small>{r.plant.latin}</small></td><td>{r.count}</td><td>{r.area ? r.area.toFixed(1) : '—'}</td><td>{r.plant.category === 'tree' ? '—' : r.plant.density ?? '—'}</td><td>{r.plant.height}</td><td>{[...r.beds].join(', ') || (ru ? 'одиночные' : 'single')}</td><td />
            </tr>)}</tbody></table>
        </section>

        <footer className="report-foot">{ru
            ? 'Высоты, плотность и календарь — справочные данные библиотеки растений (уверенность средняя), не заключение дендролога. Количества посчитаны по нарисованным цветникам.'
            : 'Heights, density and calendar are reference data from the plant library (medium confidence), not a dendrologist’s opinion. Quantities are counted from the drawn beds.'}</footer>
    </main>;
}
