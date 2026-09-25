import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope, useFocusControls } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import { LIGHTING_LIMITS, LIGHTING_RANGES } from '../../../../../lighting/settings.js';
import { fixtureLabels, luminaireSchedule } from '../../../../../lighting/fixtures.js';
import { makerLabel, makerOf, specLine, useLuminaireTypes } from '../../../../../lighting/luminaireLibrary.js';
import { LuminaireChoice } from '../../../../../lighting/ui/LuminairePicker.jsx';
import { LuminaireLibraryView } from '../../../../../lighting/ui/LuminaireLibraryView.jsx';
import { LightingOverview, LightingSpecTable } from '../../../../../lighting/ui/LightingSpec.jsx';
import { activeProjectId } from '../../../../engine/projectApi.js';
import { flushProjectSave } from '../../../hooks/useHomeSceneSettings';
import '../../../../../planting/ui/planting-ui.css';
import '../../../../../lighting/ui/lighting-ui.css';
import './lighting.css';

// Рабочее место «Освещение» (src/lighting, docs/garden-lighting-2026-09-25.md),
// устроено как «Растения»: инструменты — «Светильник» (O: щелчок ставит,
// протяжка наводит), «Навести», «Щиток», «Сверху»; карточка выбранного
// светильника; вкладки — обзор (состав и расставленные), библиотека (изделия
// по видам, с картинками и паспортом) и спецификация (считается при каждой
// расстановке, та же, что в отчёте).
const FIXTURES_KEY = 'lightingFixtures';
const MODES = [['auto', 'По темноте', 'At dusk'], ['on', 'Включены', 'On'], ['off', 'Выключены', 'Off']];
const TAB_KEY = 'ddg_lighting_tab_v1';
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'library'; } catch { return 'library'; } };

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

function FixtureCard({ fixture, label, types, lightingEditor, ru, onOpenType }) {
    const type = types.get(fixture.type);
    const aimable = ['spike', 'inground'].includes(type?.housing?.shape);
    const set = (patch) => lightingEditor.update(fixture.id, patch);
    return <div className="lighting-card" data-testid="lighting-card">
        <header><b>{label}</b><span>{ru ? 'выбран' : 'selected'}</span><small>{fixture.by === 'agent' ? (ru ? 'поставил агент' : 'placed by the agent') : (ru ? 'поставил Денис' : 'placed by Denis')}</small></header>
        <LuminaireChoice types={types} value={fixture.type} ru={ru} onChoose={(id) => lightingEditor.replaceType(fixture.id, id)} title={ru ? 'Заменить на…' : 'Replace with…'} testId="lighting-replace" />
        {type ? <p>{specLine(type, ru)}{type.generic ? '' : ` · ${makerLabel(makerOf(type), ru)}`} · <button type="button" className="lighting-link" onClick={() => onOpenType(type.id)}>{ru ? 'карточка изделия' : 'product card'}</button></p>
            : <p>{ru ? 'Типа нет в библиотеке — светильник не светит.' : 'The type is missing from the library — the luminaire is dark.'}</p>}
        <LightingRange label={ru ? 'Яркость' : 'Output'} value={fixture.dim} min={LIGHTING_RANGES.dim[0]} max={LIGHTING_RANGES.dim[1]} step={LIGHTING_RANGES.dim[2]} format={(v) => Math.round(v * 100)} unit="%" onChange={(dim) => set({ dim })} testId="lighting-dim" />
        {aimable && !fixture.target ? <LightingRange label={ru ? 'Наклон' : 'Tilt'} value={fixture.pitch} min={LIGHTING_RANGES.pitch[0]} max={LIGHTING_RANGES.pitch[1]} step={1} unit="°" onChange={(pitch) => set({ pitch })} testId="lighting-pitch" /> : null}
        {aimable && !fixture.target ? <LightingRange label={ru ? 'Поворот' : 'Heading'} value={fixture.yaw} min={-180} max={180} step={1} unit="°" onChange={(yaw) => set({ yaw })} testId="lighting-yaw" /> : null}
        <div className="lighting-actions">
            {fixture.target ? <button type="button" className={lightingEditor.handle === 'aim' ? 'is-active' : ''} onClick={() => lightingEditor.setHandle(lightingEditor.handle === 'aim' ? 'body' : 'aim')}>{lightingEditor.handle === 'aim' ? (ru ? 'Ручка: цель' : 'Handle: target') : (ru ? 'Ручка: корпус' : 'Handle: body')}</button> : null}
            {fixture.target ? <button type="button" onClick={() => set({ target: null })}>{ru ? 'Снять наводку' : 'Clear the aim'}</button> : null}
            <button type="button" className={fixture.locked ? 'is-active' : ''} onClick={() => set({ locked: !fixture.locked })} title={ru ? 'Утверждённый светильник агент не двигает молча' : 'An approved luminaire is never moved silently by the agent'}>{fixture.locked ? (ru ? 'Утверждён' : 'Approved') : (ru ? 'Утвердить' : 'Approve')}</button>
            <button type="button" className="is-danger" onClick={() => lightingEditor.remove(fixture.id)} title={ru ? 'Убрать из сцены (⌘Z вернёт) · Delete' : 'Remove from the scene (⌘Z brings it back) · Delete'} data-testid="lighting-delete"><FocusIcon name="trash" />{ru ? 'Удалить' : 'Delete'}</button>
        </div>
        {fixture.note ? <p>{fixture.note}</p> : null}
    </div>;
}

function LightingWorkspace({ settings, lightingEditor, layoutEditor, gizmo, types, fixtures, labels, look, ru }) {
    const [tab, setTab] = useState(readTab);
    const [openType, setOpenType] = useState(null);
    useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* local UI only */ } }, [tab]);
    const schedule = useMemo(() => luminaireSchedule(fixtures, types, labels), [fixtures, types, labels]);
    const usage = useMemo(() => {
        const map = new Map();
        for (const fixture of fixtures) map.set(fixture.type, [...(map.get(fixture.type) ?? []), labels.get(fixture.id)]);
        return map;
    }, [fixtures, labels]);
    const circuits = useMemo(() => new Map((settings.lightingCircuits ?? []).map((circuit) => [circuit.id, circuit.name])), [settings.lightingCircuits]);
    const placing = gizmo?.tool === 'luminaire' && lightingEditor?.placeKind !== 'panel';
    const selected = fixtures.find((fixture) => fixture.id === lightingEditor?.selectedId);
    const aimable = ['spike', 'inground'].includes(types.get(selected?.type)?.housing?.shape);
    const frame = (fixture) => layoutEditor?.previewPose?.({ cameraPosition: { x: fixture.x + 4, y: fixture.y + 2.6, z: fixture.z + 5.5 }, cameraTarget: { x: fixture.x, y: fixture.y + 0.5, z: fixture.z }, cameraFov: 45 });
    const topView = () => {
        const all = fixtures.length ? fixtures : [{ x: 0, y: settings.planeHeight ?? 0, z: 0 }];
        const xs = all.map((f) => f.x), zs = all.map((f) => f.z), y = Math.max(...all.map((f) => f.y));
        const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
        const reach = Math.max(10, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.15;
        layoutEditor?.previewPose?.({ cameraPosition: { x, y: y + reach, z: z + 0.01 }, cameraTarget: { x, y, z }, cameraFov: 50 });
    };
    const openCard = (id) => { setOpenType(id); setTab('library'); };
    const project = activeProjectId();
    const report = async () => { await flushProjectSave(); window.location.href = `/engine/report?project=${encodeURIComponent(project)}`; };

    return <div className="planting-workspace lighting-workspace" data-testid="lighting-workspace">
        <div className="planting-tools" role="toolbar" aria-label={ru ? 'Инструменты освещения' : 'Lighting tools'}>
            <button type="button" className={placing ? 'is-active' : ''} onClick={() => (placing ? gizmo?.setTool?.('select') : lightingEditor?.begin())} disabled={fixtures.length >= LIGHTING_LIMITS.fixtures} data-testid="lighting-place"><FocusIcon name="light" />{ru ? 'Светильник' : 'Luminaire'}<kbd>O</kbd></button>
            <button type="button" className={lightingEditor?.aiming ? 'is-active' : ''} onClick={() => lightingEditor?.setAiming(!lightingEditor.aiming)} disabled={!aimable} title={ru ? 'Выбранный спот или грунтовый: щелчок — на что он светит' : 'The selected spot or in-ground light: click what it lights'} data-testid="lighting-aim"><FocusIcon name="target" />{ru ? 'Навести' : 'Aim'}</button>
            <button type="button" onClick={() => lightingEditor?.beginPanel()} title={ru ? 'Поставить щиток — дальше в «Питании»' : 'Place a panel — then Power'} data-testid="lighting-panel-tool"><FocusIcon name="panel" />{ru ? 'Щиток' : 'Panel'}</button>
            <button type="button" onClick={topView} title={ru ? 'Камера сверху над всеми светильниками' : 'Camera from above over all luminaires'} data-testid="lighting-top-view"><FocusIcon name="eye" />{ru ? 'Сверху' : 'Top'}</button>
        </div>
        {placing ? <div className="planting-plantrow">
            <LuminaireChoice types={types} value={lightingEditor.placeType} ru={ru} onChoose={(id) => lightingEditor.begin(id)} title={ru ? 'Что ставить' : 'What to place'} testId="lighting-place-type" />
            <p className="planting-hint">{ru
                ? 'Щелчок по земле или стене — светильник там; не отпуская, протянуть к дереву или стене — на это он и светит. Настенные встают на стену. Esc — выйти.'
                : 'Click the ground or a wall to place it there; drag to a tree or a wall before letting go to aim it at that. Wall types go on the wall. Esc to leave.'}</p>
        </div> : null}
        {lightingEditor?.aiming ? <p className="planting-hint">{ru ? 'Щелчок — на что светит выбранный светильник. Esc — выйти.' : 'Click what the selected luminaire lights. Esc to leave.'}</p> : null}
        {selected ? <FixtureCard fixture={selected} label={labels.get(selected.id)} types={types} lightingEditor={lightingEditor} ru={ru} onOpenType={openCard} /> : null}

        <nav className="planting-tabs" role="tablist">
            {[['overview', ru ? 'Обзор' : 'Overview', fixtures.length], ['library', ru ? 'Библиотека' : 'Library', types.size], ['spec', ru ? 'Спецификация' : 'Schedule', schedule.totals.count]].map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); if (id === 'library') setOpenType(null); }} data-testid={`lighting-tab-${id}`}>{label}<small className="lighting-tab-count">{count}</small></button>)}
        </nav>
        {tab === 'overview' ? <>
            <LightingOverview schedule={schedule} fixtures={fixtures} types={types} labels={labels} circuits={circuits} ru={ru} selectedId={selected?.id}
                onOpenType={openCard} onSelect={(fixture) => { lightingEditor?.select(fixture.id); frame(fixture); }} onRemove={(id) => lightingEditor?.remove(id)} />
            <div className="lighting-look">{look}</div>
        </> : null}
        {tab === 'library' ? <LuminaireLibraryView types={types} ru={ru} openId={openType} setOpenId={setOpenType} usage={usage}
            onPlace={(id) => lightingEditor?.begin(id)} onReplace={(id) => selected && lightingEditor.replaceType(selected.id, id)}
            selectedLabel={selected ? labels.get(selected.id) : null} selectedType={selected?.type} /> : null}
        {tab === 'spec' ? <LightingSpecTable schedule={schedule} ru={ru} onOpenType={openCard} onReport={report} reportReady={Boolean(project)} /> : null}
    </div>;
}

export function LightingSection({ settings, handleSettingChange, lightingEditor, layoutEditor, gizmo }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    const types = useLuminaireTypes();
    const list = settings[FIXTURES_KEY];
    const fixtures = useMemo(() => list ?? [], [list]);
    const labels = useMemo(() => fixtureLabels(fixtures, types, ru), [fixtures, types, ru]);
    const look = <>
        <SectionHeading label={ru ? 'Свет' : 'Light'} />
        <SelectControl controlId="lightingMode" label={ru ? 'Горят' : 'On'} value={settings.lightingMode ?? 'auto'} options={MODES.map(([value, r, e]) => ({ value, label: ru ? r : e }))} onChange={(event) => handleSettingChange(event, 'lightingMode', 'string')} />
        <RangeControl controlId="lightingExposure" label={ru ? 'Экспозиция света' : 'Light exposure'} value={settings.lightingExposure ?? 0} min={LIGHTING_RANGES.exposure[0]} max={LIGHTING_RANGES.exposure[1]} step={LIGHTING_RANGES.exposure[2]} unit=" EV" onChange={(event) => handleSettingChange(event, 'lightingExposure')} />
        <CheckboxControl controlId="lightingShadows" label={ru ? 'Тени от светильников' : 'Luminaire shadows'} checked={settings.lightingShadows !== false} onChange={(event) => handleSettingChange(event, 'lightingShadows', 'boolean')} testId="lighting-shadows" />
        <p className="planting-hint">{ru ? 'Свет виден ночью — время суток в «Среде»; «Горят: включены» — и днём.' : 'The light shows at night — time of day is in Environment; “On” shows it by day too.'}</p>
    </>;
    if (scope?.catalogOnly) return <>
        <SelectControl controlId={FIXTURES_KEY} label={ru ? 'Светильник' : 'Luminaire'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Select…' }, ...fixtures.map((fixture) => ({ value: fixture.id, label: labels.get(fixture.id) }))]} onChange={(event) => event.target.value && lightingEditor?.select(event.target.value)} />
        {look}
    </>;
    return <LightingWorkspace settings={settings} lightingEditor={lightingEditor} layoutEditor={layoutEditor} gizmo={gizmo} types={types} fixtures={fixtures} labels={labels} look={look} ru={ru} />;
}
