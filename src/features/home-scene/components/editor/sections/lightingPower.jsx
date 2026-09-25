import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, SectionHeading } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { LIGHTING_LIMITS, LIGHTING_RANGES } from '../../../../../lighting/settings.js';
import { cableSchedule } from '../../../../../lighting/electric.js';
import { useLightingState } from '../../../../../lighting/lightingStore.js';
import './annotations.css';
import './lighting.css';

// Питание освещения (src/lighting/electric.js): щитки, цепи, траншеи и
// кабели. Трассы не хранятся — считаются из расстановки при каждой правке;
// здесь их итог: длины, нагрузки, падение напряжения, сечения, автоматы и
// конфликты. Всё — предварительная схема: сечения и защиту проверяет
// электрик по нормам региона.
const COLORS = ['#e8b04a', '#5fb3d9', '#d46a6a', '#8cc46b', '#b58ad6', '#e08a3c', '#4fc1a6', '#d9d36a'];
const metres = (value) => `${Math.round(value * 10) / 10}`;

function PlainRange({ label, value, min, max, step, unit = '', onChange }) {
    return <label className="lighting-range"><span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <b>{Number(value.toFixed(2))}{unit}</b></label>;
}

export function LightingPowerSection({ settings, handleSettingChange, applySettings, lightingEditor, gizmo }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const { grid, network, status } = useLightingState();
    const layer = <CheckboxControl controlId="lightingConnections" label={ru ? 'Показать подключения' : 'Show connections'} checked={settings.lightingConnections === true} onChange={(event) => handleSettingChange(event, 'lightingConnections', 'boolean')} testId="lighting-connections" />;
    if (scope?.catalogOnly) return layer;
    const panels = settings.lightingPanels ?? [], site = settings.lightingSite ?? {};
    const placing = gizmo?.tool === 'luminaire' && lightingEditor?.placeKind === 'panel';
    const schedule = network ? cableSchedule(network) : null;
    const setSite = (patch) => applySettings?.({ lightingSite: { ...site, ...patch } });
    const names = new Map((settings.lightingCircuits ?? []).map((circuit) => [circuit.id, circuit.name]));
    const unassigned = (settings.lightingFixtures ?? []).filter((fixture) => !fixture.circuit || !names.has(fixture.circuit)).length;
    return <>
        {layer}
        <p className="annotations-hint">{ru
            ? 'Предварительная схема: трассы, длины и нагрузки считаются из расстановки. Сечения и защиту проверяет электрик по нормам региона; неизвестные подземные сети — неизвестны.'
            : 'A preliminary scheme: routes, lengths and loads follow from the layout. An electrician checks sections and protection against local codes; unknown underground services stay unknown.'}</p>
        <SectionHeading label={ru ? 'Щитки' : 'Panels'} />
        <button type="button" className={`annotations-tool${placing ? ' is-active' : ''}`} onClick={() => (placing ? gizmo?.setTool?.('select') : lightingEditor?.beginPanel())} disabled={panels.length >= LIGHTING_LIMITS.panels} data-testid="lighting-panel-place">
            <FocusIcon name="box" /><span>{ru ? 'Поставить щиток' : 'Place a panel'}</span><kbd>O</kbd>
        </button>
        {panels.length ? <div className="annotations-list">
            {panels.map((panel) => <div key={panel.id} className={`annotations-row${panel.id === lightingEditor?.panelId ? ' is-active' : ''}`}>
                <button type="button" className="annotations-row__value" onClick={() => lightingEditor?.selectPanel(panel.id)}><b>{panel.name}</b><small>{panel.by === 'agent' ? (ru ? 'агент' : 'agent') : ''}</small></button>
                <button type="button" className="annotations-row__action" onClick={() => lightingEditor?.removePanel(panel.id)} title={ru ? 'Убрать щиток и его цепи' : 'Remove the panel and its circuits'}><FocusIcon name="trash" /></button>
            </div>)}
        </div> : null}
        <SectionHeading label={ru ? 'Цепи' : 'Circuits'} />
        <button type="button" className="annotations-tool" onClick={() => lightingEditor?.layCircuits(grid)} disabled={!panels.length || !unassigned} data-testid="lighting-lay-circuits">
            <FocusIcon name="light" /><span>{ru ? `Разложить по цепям${unassigned ? ` (${unassigned})` : ''}` : `Lay out circuits${unassigned ? ` (${unassigned})` : ''}`}</span>
        </button>
        {status !== 'ready' ? <p className="annotations-hint">{ru ? 'Сетка участка строится из модели…' : 'Building the site grid from the model…'}</p> : null}
        {network?.circuits.length ? <div className="annotations-list" data-testid="lighting-circuits">
            {network.circuits.map((circuit, index) => <div key={circuit.id} className="annotations-row" title={`${ru ? 'Кабель' : 'Cable'} ${metres(circuit.cableLength)} ${ru ? 'м' : 'm'}: ${ru ? 'по плану' : 'plan'} ${metres(circuit.planLength)}, ${ru ? 'подъёмы' : 'rises'} ${metres(circuit.riseLength)}, ${ru ? 'в траншею' : 'trench'} ${metres(circuit.depthLength)}, ${ru ? 'запас' : 'reserve'} ${metres(circuit.tailLength + circuit.slackLength)}`}>
                <span className="annotations-row__value">
                    <b style={{ color: COLORS[index % COLORS.length] }}>{names.get(circuit.id) ?? circuit.id}</b>
                    <small>{circuit.fixtures.length} × · {Math.round(circuit.loadW)} {ru ? 'Вт' : 'W'} · {circuit.volts} {ru ? 'В' : 'V'}</small>
                    <span className="lighting-row-meta" style={circuit.dropPct > (site.drop ?? 3) ? { color: '#e2725b' } : null}>
                        {metres(circuit.cableLength)} {ru ? 'м' : 'm'} · {circuit.section} {ru ? 'мм²' : 'mm²'} · {circuit.breaker?.curve}{circuit.breaker?.amps} · ΔU {circuit.dropPct.toFixed(1)}%{circuit.perBreaker === 'unknown' ? ' · ?' : circuit.perBreaker === 'over' ? ' · !' : ''}
                    </span>
                </span>
                <button type="button" className="annotations-row__action" onClick={() => lightingEditor?.removeCircuit(circuit.id)} title={ru ? 'Убрать цепь — её приборы станут неподключёнными' : 'Remove the circuit — its fixtures become unassigned'}><FocusIcon name="trash" /></button>
            </div>)}
        </div> : null}
        {network?.conflicts.length ? <>
            <SectionHeading label={ru ? 'Конфликты' : 'Conflicts'} />
            <div className="lighting-card" data-testid="lighting-conflicts">{network.conflicts.map((conflict, index) => <p key={index}>{ru ? conflict.ru : conflict.en}</p>)}</div>
        </> : null}
        {schedule ? <>
            <SectionHeading label={ru ? 'Итого' : 'Totals'} />
            <div className="lighting-card">
                <p>{ru ? 'Траншеи' : 'Trenches'}: {metres(network.totals.trenchLength)} {ru ? 'м' : 'm'}{schedule.trenches.length ? ` — ${schedule.trenches.map((row) => `${ru ? row.ru : row.en} ${row.length}`).join(', ')}` : ''}</p>
                {schedule.cables.map((row) => <p key={row.section}>{ru ? 'Кабель' : 'Cable'} {row.section} {ru ? 'мм²' : 'mm²'}: {row.length} {ru ? 'м' : 'm'}</p>)}
                <p>{ru ? 'Нагрузка' : 'Load'}: {Math.round(network.totals.loadW)} {ru ? 'Вт' : 'W'}</p>
            </div>
        </> : null}
        <SectionHeading label={ru ? 'Участок' : 'Site'} />
        <PlainRange label={ru ? 'Глубина траншеи' : 'Trench depth'} value={site.depth ?? 0.6} min={LIGHTING_RANGES.depth[0]} max={LIGHTING_RANGES.depth[1]} step={LIGHTING_RANGES.depth[2]} unit={ru ? ' м' : ' m'} onChange={(depth) => setSite({ depth })} />
        <PlainRange label={ru ? 'Предел ΔU' : 'ΔU limit'} value={site.drop ?? 3} min={LIGHTING_RANGES.drop[0]} max={LIGHTING_RANGES.drop[1]} step={LIGHTING_RANGES.drop[2]} unit="%" onChange={(drop) => setSite({ drop })} />
    </>;
}
