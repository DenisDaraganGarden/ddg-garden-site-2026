import React, { useMemo, useRef } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope, useFocusControls } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { LIGHTING_LIMITS, LIGHTING_RANGES } from '../../../../../lighting/settings.js';
import { fixtureLabels } from '../../../../../lighting/fixtures.js';
import { luminaireName, useLuminaireTypes } from '../../../../../lighting/luminaireLibrary.js';
import './annotations.css';
import './lighting.css';

// Освещение сада (src/lighting, docs/garden-lighting-2026-09-25.md): типы
// светильников — заготовки и изделия библиотеки; инструмент «Светильник» (O)
// ставит выбранный тип щелчком, протяжкой наводит; список расставленных;
// карточка выбранного — заменить тип, яркость, наклон, наводка, утверждён.
// Ниже — когда свет горит и насколько ярко читается на экране.
const FIXTURES_KEY = 'lightingFixtures';
const MODES = [['auto', 'По темноте', 'At dusk'], ['on', 'Включены', 'On'], ['off', 'Выключены', 'Off']];
const spec = (type, ru) => [type.optics?.lumens ? `${type.optics.lumens} ${ru ? 'лм' : 'lm'}` : null, type.optics?.cct ? `${type.optics.cct} K` : null,
    type.power?.watts ? `${type.power.watts} ${ru ? 'Вт' : 'W'}` : null, type.power?.volts ? `${type.power.volts} ${ru ? 'В' : 'V'}` : null].filter(Boolean).join(' · ');

// Ползунок карточки: одна протяжка — один шаг отмены (как у ползунков
// редактора: жест истории от нажатия до отпускания). В каталог параметров
// не входит — он про выбранный светильник, а не про сцену.
export function LightingRange({ label, value, min, max, step, unit = '', format = (v) => Number(v.toFixed(2)), onChange, testId }) {
    const controls = useFocusControls(), start = useRef(null);
    const end = (kind, event) => {
        if (start.current === null) return;
        controls?.gesture(kind, { id: 'lighting', value: event?.currentTarget?.value ?? start.current, initial: start.current });
        start.current = null;
    };
    return <label className="lighting-range"><span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId}
            onPointerDown={(event) => { if (event.button) return; start.current = value; controls?.gesture('Start', { id: 'lighting', value, initial: value }); }}
            onPointerUp={(event) => end('Commit', event)} onLostPointerCapture={(event) => end('Commit', event)} />
        <b>{format(value)}{unit}</b></label>;
}

function FixtureCard({ fixture, label, types, lightingEditor, ru }) {
    const type = types.get(fixture.type);
    const aimable = ['spike', 'inground'].includes(type?.housing?.shape);
    const set = (patch) => lightingEditor.update(fixture.id, patch);
    return <div className="lighting-card" data-testid="lighting-card">
        <header><b>{label}</b><span>{luminaireName(type, ru) || fixture.type}</span><small>{fixture.by === 'agent' ? (ru ? 'агент' : 'agent') : (ru ? 'Денис' : 'Denis')}</small></header>
        <select value={fixture.type} onChange={(event) => lightingEditor.replaceType(fixture.id, event.target.value)} title={ru ? 'Заменить этот светильник другим типом — место и подключение останутся' : 'Replace this luminaire with another type — place and connection stay'} data-testid="lighting-replace">
            {[...types.values()].map((item) => <option key={item.id} value={item.id}>{luminaireName(item, ru)}{item.generic ? '' : ` — ${item.maker ?? ''}`}</option>)}
        </select>
        {type ? <p>{spec(type, ru)}</p> : <p>{ru ? 'Типа нет в библиотеке — светильник не светит.' : 'The type is missing from the library — the luminaire is dark.'}</p>}
        <LightingRange label={ru ? 'Яркость' : 'Output'} value={fixture.dim} min={LIGHTING_RANGES.dim[0]} max={LIGHTING_RANGES.dim[1]} step={LIGHTING_RANGES.dim[2]} format={(v) => Math.round(v * 100)} unit="%" onChange={(dim) => set({ dim })} testId="lighting-dim" />
        {aimable && !fixture.target ? <LightingRange label={ru ? 'Наклон' : 'Tilt'} value={fixture.pitch} min={LIGHTING_RANGES.pitch[0]} max={LIGHTING_RANGES.pitch[1]} step={1} unit="°" onChange={(pitch) => set({ pitch })} testId="lighting-pitch" /> : null}
        {aimable && !fixture.target ? <LightingRange label={ru ? 'Поворот' : 'Heading'} value={fixture.yaw} min={-180} max={180} step={1} unit="°" onChange={(yaw) => set({ yaw })} testId="lighting-yaw" /> : null}
        <div className="lighting-actions">
            {aimable ? <button type="button" className={lightingEditor.aiming ? 'is-active' : ''} onClick={() => lightingEditor.setAiming(!lightingEditor.aiming)} data-testid="lighting-aim">{ru ? 'Навести щелчком' : 'Aim by a click'}</button> : null}
            {fixture.target ? <button type="button" className={lightingEditor.handle === 'aim' ? 'is-active' : ''} onClick={() => lightingEditor.setHandle(lightingEditor.handle === 'aim' ? 'body' : 'aim')}>{lightingEditor.handle === 'aim' ? (ru ? 'Ручка: цель' : 'Handle: target') : (ru ? 'Ручка: корпус' : 'Handle: body')}</button> : null}
            {fixture.target ? <button type="button" onClick={() => set({ target: null })}>{ru ? 'Снять наводку' : 'Clear the aim'}</button> : null}
            <button type="button" className={fixture.locked ? 'is-active' : ''} onClick={() => set({ locked: !fixture.locked })} title={ru ? 'Утверждённый светильник агент не двигает молча' : 'An approved luminaire is never moved silently by the agent'}>{fixture.locked ? (ru ? 'Утверждён' : 'Approved') : (ru ? 'Утвердить' : 'Approve')}</button>
        </div>
        {fixture.note ? <p>{fixture.note}</p> : null}
    </div>;
}

export function LightingSection({ settings, handleSettingChange, lightingEditor, layoutEditor, gizmo }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const types = useLuminaireTypes();
    const list = settings[FIXTURES_KEY];
    const fixtures = useMemo(() => list ?? [], [list]);
    const labels = useMemo(() => fixtureLabels(fixtures, types, ru), [fixtures, types, ru]);
    const catalog = Boolean(scope?.catalogOnly);
    const active = gizmo?.tool === 'luminaire';
    const frame = (fixture) => layoutEditor?.previewPose?.({ cameraPosition: { x: fixture.x + 4, y: fixture.y + 2.6, z: fixture.z + 5.5 }, cameraTarget: { x: fixture.x, y: fixture.y + 0.5, z: fixture.z }, cameraFov: 45 });
    const selected = fixtures.find((fixture) => fixture.id === lightingEditor?.selectedId);
    const look = <>
        <SectionHeading label={ru ? 'Свет' : 'Light'} />
        <SelectControl controlId="lightingMode" label={ru ? 'Горят' : 'On'} value={settings.lightingMode ?? 'auto'} options={MODES.map(([value, r, e]) => ({ value, label: ru ? r : e }))} onChange={(event) => handleSettingChange(event, 'lightingMode', 'string')} />
        <RangeControl controlId="lightingExposure" label={ru ? 'Экспозиция света' : 'Light exposure'} value={settings.lightingExposure ?? 0} min={LIGHTING_RANGES.exposure[0]} max={LIGHTING_RANGES.exposure[1]} step={LIGHTING_RANGES.exposure[2]} unit=" EV" onChange={(event) => handleSettingChange(event, 'lightingExposure')} />
        <CheckboxControl controlId="lightingShadows" label={ru ? 'Тени от светильников' : 'Luminaire shadows'} checked={settings.lightingShadows !== false} onChange={(event) => handleSettingChange(event, 'lightingShadows', 'boolean')} testId="lighting-shadows" />
    </>;
    if (catalog) return <>
        <SelectControl controlId={FIXTURES_KEY} label={ru ? 'Светильник' : 'Luminaire'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...fixtures.map((fixture) => ({ value: fixture.id, label: labels.get(fixture.id) }))]} onChange={(event) => event.target.value && lightingEditor?.select(event.target.value)} />
        {look}
    </>;
    return <>
        <button type="button" className={`annotations-tool${active ? ' is-active' : ''}`} onClick={() => (active ? gizmo?.setTool?.('select') : lightingEditor?.begin())} disabled={fixtures.length >= LIGHTING_LIMITS.fixtures} data-testid="lighting-place">
            <FocusIcon name="light" /><span>{ru ? 'Поставить светильник' : 'Place a luminaire'}</span><kbd>O</kbd>
        </button>
        <p className="annotations-hint">{lightingEditor?.aiming
            ? (ru ? 'Щелчок — на что светит выбранный светильник. Esc — выйти.' : 'Click what the selected luminaire lights. Esc to leave.')
            : active
                ? (ru ? 'Щелчок по поверхности — светильник там; не отпуская, протянуть к дереву или стене — на это он и светит. Настенные встают на стену. Esc — выйти.' : 'Click a surface to place it there; drag to a tree or a wall before letting go to aim it at that. Wall types go on the wall. Esc to leave.')
                : (ru ? 'Выберите тип и ставьте. Свет виден ночью — время суток в «Среде»; «Горят: включены» — и днём.' : 'Pick a type and place. The light shows at night — time of day is in Environment; “On” shows it by day too.')}</p>
        <div className="lighting-types" data-testid="lighting-types">
            {[...types.values()].map((type) => <button key={type.id} type="button" className={`lighting-type${lightingEditor?.placeType === type.id ? ' is-active' : ''}`} onClick={() => lightingEditor?.begin(type.id)} title={spec(type, ru)}>
                <span>{luminaireName(type, ru)}</span><small>{spec(type, ru)}</small>{type.generic ? null : <i>{[type.maker, type.article].filter(Boolean).join(' ')}</i>}
            </button>)}
        </div>
        {selected ? <FixtureCard fixture={selected} label={labels.get(selected.id)} types={types} lightingEditor={lightingEditor} ru={ru} /> : null}
        {fixtures.length ? <div className="annotations-list" data-testid="lighting-list">
            {fixtures.map((fixture) => <div key={fixture.id} className={`annotations-row${fixture.id === lightingEditor?.selectedId ? ' is-active' : ''}`}>
                <button type="button" className="annotations-row__value" onClick={() => { lightingEditor?.select(fixture.id); frame(fixture); }} title={ru ? 'Выбрать и показать' : 'Select and frame'}>
                    <b>{labels.get(fixture.id)}</b><small>{luminaireName(types.get(fixture.type), ru) || fixture.type}</small>
                    <span className="lighting-row-meta">{fixture.locked ? '✓ ' : ''}{Math.round(fixture.dim * 100)}%</span>
                </button>
                <button type="button" className="annotations-row__action" onClick={() => lightingEditor?.remove(fixture.id)} title={ru ? 'Убрать светильник' : 'Remove the luminaire'} data-testid="lighting-remove"><FocusIcon name="trash" /></button>
            </div>)}
        </div> : null}
        {look}
    </>;
}
