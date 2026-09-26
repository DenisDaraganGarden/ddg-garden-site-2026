import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { projectStore, readProject } from '../features/engine/projectApi';
import { normalizePlantingSettings } from '../planting/settings.js';
import { bedArea, coverSchedule, plantingInstances, plantingSchedule, PLANTING_RESERVE, spacingFor } from '../planting/fillBed.js';
import { normalizeTopiarySettings } from '../topiary/settings.js';
import { FENCE_STYLE_LABELS, fenceSchedule, POST_SPAN } from '../topiary/fenceLayout.js';
import { LAWN_MOWING_LABELS, lawnSeed, lawnTurf } from '../planting/lawnGround.js';
import { isSeasonSheet, plantCardUrl, plantName, plantPhotoUrl, useBedFills, usePlantLibrary } from '../planting/plantLibrary.js';
import { bloomMonths, byCategory, CATEGORY_LABELS } from '../planting/insights.js';
import { vineRoot } from '../planting/vines.js';
import { formatLevel, markLevels, normalizeAnnotationSettings } from '../annotations/settings.js';
import { LightingReportBlocks } from '../lighting/LightingReport.jsx';
import { useLightingReport } from '../lighting/lightingReport.js';
import './PlantingReport.css';

// Отчёт по посадкам проекта — для заказчика и дендролога: план в шапках
// легенды, календарь цветения, альбом растений с картинками и ведомость.
// Одна страница, печатается в PDF (⌘P). Числа — те же, что рисует сцена.
const MONTHS = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const LEGEND = [['perennial', '#bf6d3f'], ['grass', '#bfb83f'], ['shrub', '#84b03a'], ['conifer', '#414c19'], ['tree', '#98bf71'], ['climber', '#9a6fb0']];

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
        {beds.map((bed) => <path key={bed.id} d={[bed.points, ...(bed.holes ?? [])].map((ring) => `M${ring.map((p) => p.join(',')).join('L')}Z`).join('')} fillRule="evenodd" className={`report-plan__bed${bed.kind === 'lawn' ? ' is-lawn' : ''}`} style={{ strokeWidth: width / 500 }} />)}
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

// Генплан — снимок камеры «Генплан» (usePlanCapture.js): модель сверху,
// растения шапками. Камера смотрела прямо вниз, поэтому точка земли ложится
// на снимок простым масштабом: подписи цветников, номера растений по
// ведомости, масштабная линейка и север — поверх, векторами.
const DEG = Math.PI / 180;
function PlanShot({ id, shot, beds, points, vines = [], numberOf, annotations, lighting, ru }) {
    const [size, setSize] = useState(null);
    const date = new Date(shot.captured).toLocaleString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const image = <img src={projectStore.planUrl(id, shot.captured)} alt={ru ? 'Генплан' : 'Site plan'} onLoad={(event) => setSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />;
    if (!size) return <figure className="report-shot">{image}</figure>;
    const [w, h] = size, f = h / 2 / Math.tan((shot.fov / 2) * DEG);
    const up = [Math.sin(shot.bearing * DEG), -Math.cos(shot.bearing * DEG)], right = [Math.cos(shot.bearing * DEG), Math.sin(shot.bearing * DEG)];
    const at = (x, y, z) => {
        const depth = shot.position.y - y, dx = x - shot.position.x, dz = z - shot.position.z;
        return [w / 2 + (f * (dx * right[0] + dz * right[1])) / depth, h / 2 - (f * (dx * up[0] + dz * up[1])) / depth];
    };
    const font = w / 80, perPixel = (shot.position.y - shot.target.y) / f;
    const bar = [1, 2, 5, 10, 20, 50, 100].find((m) => m / perPixel >= w * 0.1) ?? 100;
    const turn = (Number.isFinite(shot.north) ? shot.north : 0) - shot.bearing;
    const inside = ([x, y]) => x > 0 && y > 0 && x < w && y < h;
    return <figure className="report-shot">
        {image}
        <svg viewBox={`0 0 ${w} ${h}`} className="report-shot__marks" aria-hidden="true" style={{ '--mark': `${font}px` }}>
            {beds.map((bed) => {
                const [cx, cz] = bed.points.reduce(([a, b], [x, z]) => [a + x / bed.points.length, b + z / bed.points.length], [0, 0]);
                const place = at(cx, bed.y, cz);
                const numbers = [...new Set(bed.recipe.map((row) => numberOf.get(row.plant)).filter(Boolean))].sort((a, b) => a - b);
                return inside(place) ? <text key={bed.id} x={place[0]} y={place[1]} className="report-shot__bed">{bed.name}{numbers.length ? <tspan x={place[0]} dy="1.25em" className="report-shot__numbers">{numbers.join(', ')}</tspan> : null}</text> : null;
            })}
            {[...vines.map((vine) => { const [x, y, z] = vineRoot(vine); return { id: vine.id, plant: vine.plant, x, y, z }; }), ...points].length <= 250 ? [...vines.map((vine) => { const [x, y, z] = vineRoot(vine); return { id: vine.id, plant: vine.plant, x, y, z }; }), ...points].map((point) => {
                const place = at(point.x, point.y, point.z), number = numberOf.get(point.plant);
                return number && inside(place) ? <g key={point.id} transform={`translate(${place[0]} ${place[1]})`} className="report-shot__point"><circle r={font * 0.8} /><text>{number}</text></g> : null;
            }) : null}
            {/* Светильники — кружок и номер по ведомости освещения. */}
            {lighting?.lighting.lightingFixtures.map((fixture) => {
                const place = at(fixture.x, fixture.y, fixture.z);
                return inside(place) ? <g key={fixture.id} transform={`translate(${place[0]} ${place[1]})`} className="report-shot__light"><circle r={font * 0.45} /><text x={font * 0.7} y={font * 0.35}>{lighting.labels.get(fixture.id)}</text></g> : null;
            })}
            {/* Отметки уровня — как на генплане: крестик в точке, число в рамке. */}
            {annotations?.annotationMarks.map((mark) => {
                const [x, y] = at(mark.x, mark.y, mark.z), levels = markLevels(annotations.annotationMarks);
                const text = formatLevel(levels.get(mark.id), { units: annotations.annotationUnits, step: annotations.annotationStep, ru });
                return inside([x, y]) ? <g key={mark.id} transform={`translate(${x} ${y})`} className="report-shot__mark" style={{ '--mark-color': annotations.annotationColor }}>
                    <path d={`M${-font * 0.35} ${-font * 0.35} L${font * 0.35} ${font * 0.35} M${font * 0.35} ${-font * 0.35} L${-font * 0.35} ${font * 0.35}`} />
                    <rect x={font * 0.5} y={-font * 1.55} width={text.length * font * 0.58 + font * 0.5} height={font * 1.15} rx={font * 0.25} />
                    <text x={font * 0.75} y={-font * 0.95}>{text}</text>
                </g> : null;
            })}
            <g transform={`translate(${w * 0.03} ${h - h * 0.05})`} className="report-shot__scale">
                <rect x={-font * 0.5} y={-font * 2.2} width={bar / perPixel + font} height={font * 3} rx={font * 0.3} />
                <path d={`M0 0 H${bar / perPixel}`} />
                <text x={bar / perPixel / 2} y={-font * 0.7}>{bar} {ru ? 'м' : 'm'}</text>
            </g>
            <g transform={`translate(${w - font * 5} ${font * 5}) rotate(${turn})`} className="report-shot__north">
                <circle r={font * 2.6} /><path d={`M0 ${-font * 1.9} L${font * 0.75} ${font * 0.9} L0 ${font * 0.3} L${-font * 0.75} ${font * 0.9} Z`} />
                <text y={-font * 3.6} transform={`rotate(${-turn} 0 ${-font * 3.6})`}>{ru ? 'С' : 'N'}</text>
            </g>
        </svg>
        <figcaption>{ru ? `Камера «Генплан», снимок ${date}. Номера — строки ведомости.` : `The “Site plan” camera, frame of ${date}. Numbers are schedule rows.`}</figcaption>
    </figure>;
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
    const [shot, setShot] = useState(null);
    useEffect(() => { projectStore.readPlan(id).then(setShot, () => setShot(null)); }, [id]);
    const planting = useMemo(() => normalizePlantingSettings(entry?.settings ?? {}), [entry]);
    const annotations = useMemo(() => normalizeAnnotationSettings(entry?.settings ?? {}), [entry]);
    const fills = useBedFills(planting.plantingBeds, library);
    const instances = useMemo(() => [...plantingInstances(planting.plantingBeds, fills, planting.plantingPoints).values()].flat(), [planting, fills]);
    const schedule = useMemo(() => plantingSchedule(planting.plantingBeds, fills, planting.plantingPoints, library, planting.plantingVines), [planting, fills, library]);
    const species = useMemo(() => [...schedule].sort((a, b) => byCategory(a.plant, b.plant)), [schedule]);
    const existing = planting.plantingPoints.filter((p) => p.status === 'existing').length;
    // Где растёт: цветники, лианы с длиной побегов или поштучно.
    const where = (r) => [...r.beds, ...(r.length ? [`${ru ? 'лианы' : 'climbers'}, ${r.length.toFixed(1)} ${ru ? 'м побегов' : 'm of shoots'}`] : []), ...(r.existing ? [`${ru ? 'существующие' : 'existing'}: ${r.existing}`] : [])].join(', ') || (ru ? 'одиночные' : 'single');
    const reserve = Math.round(PLANTING_RESERVE * 100);
    // Газоны — отдельно: площадь и сколько брать, растений в них нет.
    const flowerBeds = planting.plantingBeds.filter((bed) => bed.kind !== 'lawn');
    const lawns = planting.plantingBeds.filter((bed) => bed.kind === 'lawn');
    const area = flowerBeds.reduce((sum, bed) => sum + bedArea(bed), 0);
    const lawnArea = lawns.reduce((sum, bed) => sum + bedArea(bed), 0);
    const date = new Date().toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const lighting = useLightingReport(id, entry?.settings);
    const covers = useMemo(() => coverSchedule(planting.plantingBeds), [planting]);
    const lines = useMemo(() => fenceSchedule(normalizeTopiarySettings(entry?.settings ?? {}).topiaryObjects), [entry]);
    const m = (value) => value.toFixed(1);

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
            <h2>{ru ? `Посадки: план, цветение, альбом растений и ведомость${lighting ? '; освещение' : ''}` : `Planting: plan, bloom, plant album and schedule${lighting ? '; lighting' : ''}`}</h2>
            <p>{date}</p>
        </header>

        <section className="report-tiles">
            {[[schedule.reduce((sum, r) => sum + r.order, 0), ru ? 'растений к заказу' : 'plants to order'], [schedule.length, ru ? 'видов' : 'species'], [flowerBeds.length, ru ? 'цветников' : 'beds'], [`${area.toFixed(1)} м²`, ru ? 'цветников по площади' : 'of beds'], ...(lawns.length ? [[`${lawnArea.toFixed(1)} м²`, ru ? 'газонов' : 'of lawns']] : []), [planting.plantingPoints.length - existing, ru ? 'деревьев и кустов — новых' : 'new trees and shrubs'], [existing, ru ? 'существующих' : 'existing'], ...(planting.plantingVines.length ? [[planting.plantingVines.length, ru ? 'лиан' : 'climbers']] : [])].map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
        </section>

        <section className="report-block">
            <h3>{ru ? 'План' : 'Plan'}</h3>
            {shot ? <PlanShot id={id} shot={shot} beds={planting.plantingBeds} points={planting.plantingPoints} vines={planting.plantingVines} annotations={annotations} lighting={lighting} numberOf={new Map(schedule.map((r, i) => [r.plant.id, i + 1]))} ru={ru} />
                : <><Plan beds={planting.plantingBeds} instances={instances} library={library} />
                    <p className="report-hint">{ru ? 'Генплан с моделью появится здесь, когда в проекте откроют камеру «Генплан» — кнопка в «Растениях».' : 'The site plan with the model appears here once the “Site plan” camera is opened in the project — the button is in Plants.'}</p></>}
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
                        <p><b>{r.order} {ru ? 'шт' : 'pcs'}</b> · {CATEGORY_LABELS[r.plant.category]?.[ru ? 0 : 1]} · {where(r)}</p>
                        {r.plant.category === 'climber'
                            ? <p>{ru ? 'Поднимается до' : 'Climbs to'} {r.plant.height} м{r.plant.vine?.support ? ` · ${r.plant.vine.support}` : ''}</p>
                            : <p>{ru ? 'Высота' : 'Height'} {r.plant.height} м · {ru ? 'ширина' : 'spread'} {r.plant.spread} м{r.plant.density && r.plant.category !== 'tree' ? ` · ${r.plant.density} шт/м², ${ru ? 'шаг' : 'spacing'} ${Math.round(spacingFor(r.plant.density) * 100)} см` : ''}</p>}
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
                <th>№</th><th>{ru ? 'Растение' : 'Plant'}</th><th>{ru ? `К заказу, шт (+${reserve} %)` : `To order (+${reserve} %)`}</th><th>{ru ? 'Нарисовано, шт' : 'Drawn'}</th><th>{ru ? 'Площадь, м²' : 'Area, m²'}</th><th>{ru ? 'шт/м²' : '/m²'}</th><th>{ru ? 'Высота, м' : 'Height, m'}</th><th>{ru ? 'Где' : 'Where'}</th><th>{ru ? 'Замечания дендролога' : 'Dendrologist notes'}</th>
            </tr></thead><tbody>{schedule.map((r, i) => <tr key={r.plant.id}>
                <td>{i + 1}</td><td>{plantName(r.plant, ru)}<small>{r.plant.latin}</small></td><td>{r.order}</td><td>{r.count}</td><td>{r.area ? r.area.toFixed(1) : '—'}</td><td>{r.plant.category === 'tree' ? '—' : r.plant.density ?? '—'}</td><td>{r.plant.height}</td><td>{where(r)}</td><td />
            </tr>)}</tbody></table>
        </section>

        {covers.length ? <section className="report-block">
            <h3>{ru ? 'Почвопокровы' : 'Ground covers'}</h3>
            <table className="report-table"><thead><tr>
                <th>{ru ? 'Покров' : 'Cover'}</th><th>{ru ? 'Площадь, м²' : 'Area, m²'}</th><th>{ru ? 'Копытник, м²' : 'Wild ginger, m²'}</th><th>{ru ? 'Тимьян, м²' : 'Thyme, m²'}</th><th>{ru ? 'Мох, м²' : 'Moss, m²'}</th>
            </tr></thead><tbody>{covers.map((r) => <tr key={r.id}><td>{r.name}{r.layer ? <small>{ru ? 'нижний слой цветника' : 'under a bed'}</small> : null}</td><td>{m(r.area)}</td><td>{m(r.ginger)}</td><td>{m(r.thyme)}</td><td>{m(r.moss)}</td></tr>)}
                {covers.length > 1 ? <tr><td><b>{ru ? 'Всего' : 'Total'}</b></td>{['area', 'ginger', 'thyme', 'moss'].map((key) => <td key={key}><b>{m(covers.reduce((sum, r) => sum + r[key], 0))}</b></td>)}</tr> : null}</tbody></table>
            <p className="report-hint">{ru ? 'Покров процедурный: состав — доли площади, нормы посадки в штуках задаёт дендролог.' : 'The cover is procedural: the mix is by area; plants per m² are for the dendrologist.'}</p>
        </section> : null}

        {lines.length ? <section className="report-block">
            <h3>{ru ? 'Изгороди и ограды' : 'Hedges and fences'}</h3>
            <table className="report-table"><thead><tr>
                <th>{ru ? 'Линия' : 'Line'}</th><th>{ru ? 'Длина, п.м.' : 'Length, m'}</th><th>{ru ? 'Высота, м' : 'Height, m'}</th><th>{ru ? 'Изгородь, ширина, м' : 'Hedge, width, m'}</th><th>{ru ? 'Ограда' : 'Fence'}</th><th>{ru ? `Секций (до ${POST_SPAN} м)` : `Sections (up to ${POST_SPAN} m)`}</th><th>{ru ? 'Столбов' : 'Posts'}</th>
            </tr></thead><tbody>{lines.map((r) => <tr key={r.id}><td>{r.name}</td><td>{m(r.length)}</td><td>{r.height.toFixed(2)}</td><td>{r.hedge ? r.width.toFixed(2) : '—'}</td><td>{r.fence ? FENCE_STYLE_LABELS[r.fence]?.[ru ? 0 : 1] ?? r.fence : '—'}</td><td>{r.fence ? r.sections : '—'}</td><td>{r.fence ? r.posts : '—'}</td></tr>)}</tbody></table>
        </section> : null}

        {lawns.length ? <section className="report-block">
            <h3>{ru ? 'Газоны' : 'Lawns'}</h3>
            <table className="report-table"><thead><tr>
                <th>{ru ? 'Газон' : 'Lawn'}</th><th>{ru ? 'Площадь, м²' : 'Area, m²'}</th><th>{ru ? 'Стрижка' : 'Mowing'}</th><th>{ru ? 'Высота, см' : 'Height, cm'}</th><th>{ru ? 'Рулонный, м² (+5 %)' : 'Turf, m² (+5 %)'}</th><th>{ru ? 'Семена, кг (35 г/м²)' : 'Seed, kg (35 g/m²)'}</th><th>{ru ? 'Полив' : 'Irrigation'}</th>
            </tr></thead><tbody>{lawns.map((bed) => {
                const size = bedArea(bed), striped = ['stripes', 'checker', 'diamond'].includes(bed.lawn.mowing);
                return <tr key={bed.id}><td>{bed.name}</td><td>{size.toFixed(1)}</td><td>{LAWN_MOWING_LABELS[bed.lawn.mowing][ru ? 0 : 1]}{striped ? <small>{ru ? `проход ${bed.lawn.stripe} м` : `${bed.lawn.stripe} m passes`}</small> : null}</td><td>{bed.lawn.cut}</td><td>{Math.round(lawnTurf(size))}</td><td>{lawnSeed(size).toFixed(1)}</td><td>{bed.lawn.irrigated ? (ru ? 'да' : 'yes') : (ru ? 'нет' : 'no')}</td></tr>;
            })}{lawns.length > 1 ? <tr><td><b>{ru ? 'Всего' : 'Total'}</b></td><td><b>{lawnArea.toFixed(1)}</b></td><td /><td /><td><b>{Math.round(lawnTurf(lawnArea))}</b></td><td><b>{lawnSeed(lawnArea).toFixed(1)}</b></td><td /></tr> : null}</tbody></table>
        </section> : null}

        <LightingReportBlocks report={lighting} ru={ru} />

        <footer className="report-foot">{ru
            ? `Высоты, плотность и календарь — справочные данные библиотеки растений (уверенность средняя), не заключение дендролога. К заказу: в цветнике — площадь вида по доле рецепта × шт/м² × густота цветника + ${reserve} %; одиночные и лианы — поштучно, существующие не заказываются. «Нарисовано» — растения на плане, для сверки.`
            : `Heights, density and calendar are reference data from the plant library (medium confidence), not a dendrologist’s opinion. To order: in a bed, the species’ area by its recipe share × plants per m² × the bed’s density + ${reserve} %; single plants and climbers by the piece, existing ones not ordered. “Drawn” is what is on the plan, for checking.`}</footer>
    </main>;
}
