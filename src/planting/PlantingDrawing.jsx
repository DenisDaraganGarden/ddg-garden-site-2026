import React, { useMemo, useRef } from 'react';
import { drawingBounds, drawingSheets, layoutPlanLabels, makePlantingDrawing, PLAN_SHEET, planHeight, planLeaderPoints, planOpacity, planProjector, planRadius, sheetProjection } from './planDrawing.js';
import { plantName } from './plantLibrary.js';
import './planting-drawing.css';

const PAPER = '#fffefa', INK = '#303a2b';
const n = (value) => Math.round(value * 100) / 100;
const pathFor = (rings, at) => rings.map((ring) => `M${ring.map(([x, z]) => { const p = at({ x, z }); return `${n(p.x)},${n(p.y)}`; }).join('L')}Z`).join('');
function PlantSymbols({ plants, library, at, scale }) {
    const ordered = [...plants].sort((a, b) => planHeight(library.get(a.plant), a) - planHeight(library.get(b.plant), b));
    return ordered.map((p) => {
        const plant = library.get(p.plant), point = at(p), r = planRadius(plant, p) * scale;
        const arm = Math.min(r * 0.25, 8), fill = p.existing ? '#f4f3ee' : plant?.cap ?? '#999';
        return <g key={p.id} data-plant-id={p.id}>
            <circle cx={n(point.x)} cy={n(point.y)} r={n(r)} fill={fill} fillOpacity={planOpacity(planHeight(plant, p))} stroke={INK} strokeOpacity={p.existing ? 0.9 : 0.55} strokeWidth={0.7} />
            <path d={`M${n(point.x - arm)} ${n(point.y)}h${n(2 * arm)}M${n(point.x)} ${n(point.y - arm)}v${n(2 * arm)}`} fill="none" stroke={INK} strokeWidth={0.65} strokeOpacity={0.85} />
            {p.existing ? <circle cx={n(point.x)} cy={n(point.y)} r={Math.min(2.2, r * 0.12)} fill={INK} /> : null}
        </g>;
    });
}
function GroupLinks({ groups, at }) {
    return <g fill="none" stroke={INK} strokeWidth={0.65} strokeOpacity={0.56}>
        {groups.map((group) => <path key={group.id} d={group.links.map(([a, b]) => { const p = at(a), q = at(b); return `M${n(p.x)} ${n(p.y)}L${n(q.x)} ${n(q.y)}`; }).join('')} />)}
    </g>;
}
function saveSvg(svg, name) {
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', '186mm');
    copy.setAttribute('height', `${186 * svg.viewBox.baseVal.height / svg.viewBox.baseVal.width}mm`);
    const url = URL.createObjectURL(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DrawingSheet({ sheet, beds, library, bearing, title, ru, overview = false, fileName }) {
    const ref = useRef(), { at, scale, rect } = sheetProjection(sheet.bounds, bearing);
    const labels = overview ? [] : layoutPlanLabels(sheet.groups, at);
    const frame = PLAN_SHEET;
    const bar = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100].find((m) => m * scale >= 85) ?? 100;
    const key = new Map();
    for (const group of sheet.groups) {
        if (!key.has(group.plant)) key.set(group.plant, { plant: library.get(group.plant) ?? { id: group.plant }, number: group.number, count: 0 });
        key.get(group.plant).count += group.count;
    }
    const legend = overview ? [] : [...key.values()].sort((a, b) => a.number - b.number);
    const sheetHeight = frame.height + (legend.length ? Math.ceil(legend.length / 2) * 38 + 20 : 0);
    return <figure className={`plant-plan-sheet${overview ? ' is-overview' : ''}`} data-testid={overview ? 'plant-plan-overview' : 'plant-plan-sheet'}>
        <div className="plant-plan-sheet__tools"><span>{title}</span><button type="button" onClick={() => saveSvg(ref.current, `${fileName}.svg`)}>{ru ? 'Сохранить SVG' : 'Save SVG'}</button></div>
        <svg ref={ref} viewBox={`0 0 ${frame.width} ${sheetHeight}`} role="img" aria-label={title} style={{ fontFamily: 'Arial, sans-serif', fontVariantNumeric: 'tabular-nums' }} data-group-count={sheet.groups.length} data-plant-count={sheet.plants.length}>
            <title>{title}</title>
            <desc>{ru ? 'Выноска: номер вида в ведомости — число растений в группе. Все размеры — метры.' : 'Callout: schedule number — plants in this group. Dimensions are metres.'}</desc>
            <rect width={frame.width} height={sheetHeight} fill={PAPER} />
            <text x="24" y="30" fontSize="17" fontWeight="600" fill={INK}>{title}</text>
            <text x="24" y="51" fontSize="11" fill="#707467">{overview ? (ru ? 'Обзор участка · подробные выноски на следующих листах' : 'Site overview · detailed callouts on the following sheets') : (ru ? '№ ведомости — растений в группе, шт. · точка перекрестия — место посадки' : 'Schedule no. — plants in group · crosshair marks the planting position')}</text>
            <svg x={rect.x} y={rect.y} width={rect.width} height={rect.height} viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`} overflow="hidden">
                {beds.map((bed) => <path key={bed.id} d={pathFor([bed.points, ...(bed.holes ?? [])], at)} fill={bed.kind === 'lawn' ? '#edf2e2' : '#faf7ee'} fillRule="evenodd" stroke="#787868" strokeWidth="0.8" />)}
                <PlantSymbols plants={sheet.plants} library={library} at={at} scale={scale} />
                <GroupLinks groups={sheet.groups} at={at} />
            </svg>
            {labels.map((label) => { const { group, anchor, x, y, width } = label; return <g key={group.id} data-plan-label={group.id} data-quantity={group.count}>
                <title>{`${group.number ?? '?'} — ${plantName(library.get(group.plant) ?? { id: group.plant }, ru)} · ${group.count}${group.existing ? (ru ? ' существующих' : ' existing') : ''}`}</title>
                <path d={`M${planLeaderPoints(label).map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}`} fill="none" stroke="#4b5345" strokeWidth="0.7" />
                <circle cx={n(anchor.x)} cy={n(anchor.y)} r="1.8" fill={INK} />
                <rect x={x - 2} y={y - 20} width={width + 4} height="19" fill={PAPER} />
                <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={frame.font} fontWeight="500" fill={INK}>{group.number ?? '?'} — {group.count}{group.existing ? '*' : ''}</text>
            </g>; })}
            <g transform={`translate(${frame.left} 1030)`} fill={INK}>
                <path d={`M0 -4V4M0 0H${n(bar * scale)}M${n(bar * scale)} -4V4`} fill="none" stroke={INK} strokeWidth="1.4" />
                <text x={n(bar * scale / 2)} y="20" textAnchor="middle" fontSize="13">{bar} {ru ? 'м' : 'm'}</text>
            </g>
            <g transform="translate(930 1030)" fill={INK}><path d="M0 -20L5 0L0 -5L-5 0Z" /><text x="0" y="20" textAnchor="middle" fontSize="13">{ru ? 'С' : 'N'}</text></g>
            <text x="500" y="1080" textAnchor="middle" fontSize="11" fill="#707467">{ru ? `${sheet.plants.length} растений на листе · ${sheet.groups.length} групп${sheet.groups.some((group) => group.existing) ? ' · * существующие' : ''}` : `${sheet.plants.length} plants on sheet · ${sheet.groups.length} groups${sheet.groups.some((group) => group.existing) ? ' · * existing' : ''}`}</text>
            {legend.map(({ plant, number, count }, i) => <g key={plant.id} transform={`translate(${24 + (i % 2) * 484} ${frame.height + 22 + Math.floor(i / 2) * 38})`}>
                <text fontSize="13" fontWeight="600" fill={INK}>{number}</text>
                <text x="26" fontSize="12" fill={INK}>{plantName(plant, ru)}</text>
                <text x="26" y="15" fontSize="10.5" fontStyle="italic" fill="#73796b">{plant.latin}</text>
                <text x="450" y="15" textAnchor="end" fontSize="11" fill={INK}>{count} {ru ? 'шт.' : 'pcs'}</text>
            </g>)}
        </svg>
    </figure>;
}

export default function PlantingDrawing({ beds, instances, vines, library, schedule, bearing, name, ru }) {
    const drawing = useMemo(() => makePlantingDrawing({ beds, instances, vines, library, schedule }), [beds, instances, vines, library, schedule]);
    const sheets = useMemo(() => drawingSheets(drawing, library, bearing), [drawing, library, bearing]);
    const overview = useMemo(() => ({ groups: drawing.groups, plants: drawing.plants, bounds: drawingBounds(drawing.plants, library, planProjector(bearing), beds) }), [drawing, library, bearing, beds]);
    if (!sheets.length && !beds.length) return <p className="report-hint">{ru ? 'На плане пока нет посадок.' : 'There are no plantings on the plan yet.'}</p>;
    return <div className="plant-plan" data-testid="planting-vector-plan" data-count-match={!drawing.mismatches.length}>
        <p className="report-hint">{ru ? 'Выноски показывают фактические растения на плане. Закупка с запасом — отдельная колонка ведомости. Высокие кроны прозрачнее, чтобы были видны нижние ярусы.' : 'Callouts count actual plants on the plan. Purchase quantities with reserve have their own schedule column. Taller crowns are more transparent to reveal the lower layers.'}</p>
        {drawing.mismatches.length ? <p role="alert" className="report-hint">{ru ? 'Числа плана и ведомости не совпали для: ' : 'Plan and schedule counts differ for: '}{drawing.mismatches.join(', ')}</p> : null}
        {sheets.length !== 1 ? <DrawingSheet sheet={overview} beds={beds} library={library} bearing={bearing} title={`${name} · ${ru ? 'Посадочный план' : 'Planting plan'}`} ru={ru} overview fileName="planting-overview" /> : null}
        {sheets.map((sheet) => <DrawingSheet key={sheet.number} sheet={sheet} beds={beds} library={library} bearing={bearing} title={`${name} · ${sheets.length === 1 ? (ru ? 'Посадочный план' : 'Planting plan') : (ru ? `Фрагмент ${sheet.number} / ${sheets.length}` : `Detail ${sheet.number} / ${sheets.length}`)}`} ru={ru} fileName={`planting-${sheet.number}`} />)}
    </div>;
}
