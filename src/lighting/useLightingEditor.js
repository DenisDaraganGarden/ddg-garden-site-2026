import { useCallback, useEffect, useRef, useState } from 'react';
import { fixturePose } from './fixtures.js';
import { proposeCircuits } from './electric.js';
import { electricInputs } from './network.js';
import { aimAt, LIGHTING_LIMITS, normalizeLightingCircuit, normalizeLightingFixture, normalizeLightingPanel } from './settings.js';

export const LIGHTING_NODE = 'lighting/luminaires';
export const POWER_NODE = 'lighting/power';
const newId = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
const heading = (nx, nz) => Math.round((Math.atan2(nx, nz) * 180) / Math.PI * 10) / 10;

// Наведённый на цель: yaw и pitch — по фактической оси луча, чтобы «Снять
// наводку» оставила луч там же, а не повернула его к камере.
function withAim(fixture, types) {
    const type = types.get(fixture.type);
    if (!fixture.target || !type) return fixture;
    try {
        const aim = aimAt([0, 0, 0], fixturePose(fixture, type).axis.toArray());
        return aim ? { ...fixture, ...aim } : fixture;
    } catch { return fixture; }
}

// Правки освещения идут через историю редактора (⌘Z): поставить
// инструментом «Светильник» (O) — щелчок ставит, протяжка от места наводит на
// то, до чего дотянулся курсор (дерево, фасад); выбрать, перенести и навести
// манипулятором, заменить тип, яркость, убрать. Заменённый прибор остаётся
// тем же светильником: номер, место, подключение — его. Тем же инструментом
// ставится щиток; «Разложить по цепям» подключает только ещё не подключённые
// приборы — уже разложенное остаётся как было.
export function useLightingEditor({ settings, history, setActiveTab, setTool, types, tool }) {
    const [selectedId, setSelectedId] = useState(null);
    const [panelId, setPanelId] = useState(null);
    const [placeType, setPlaceType] = useState('bollard-80');
    const [placeKind, setPlaceKind] = useState('fixture');
    const [handle, setHandle] = useState('body');
    const [aiming, setAiming] = useState(false);
    // Ушёл с инструмента — дальше снова ставится светильник, не щиток.
    useEffect(() => { if (tool !== 'luminaire') setPlaceKind('fixture'); }, [tool]);
    useEffect(() => {
        if (!aiming) return undefined;
        const key = (event) => { if (event.key === 'Escape') setAiming(false); };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [aiming]);
    const live = useRef();
    live.current = { settings, history, types, placeType, placeKind, selectedId };
    const read = (key) => live.current.settings[key] ?? [];
    const apply = useCallback((patch) => live.current.history.applySettings({ lightingEnabled: true, ...patch }), []);

    const onLight = useCallback(({ point: [x, y, z], normal: [nx, ny, nz] = [0, 1, 0], target = null, yaw = 0 }) => {
        if (live.current.placeKind === 'panel') {
            const panels = read('lightingPanels');
            if (panels.length >= LIGHTING_LIMITS.panels) return;
            let number = panels.length, name;
            do { name = `Щ${++number}`; } while (panels.some((panel) => panel.name === name));
            const panel = normalizeLightingPanel({ id: newId('panel'), name, x, y, z, yaw: (yaw * 180) / Math.PI + 180, by: 'denis' }, panels.length);
            apply({ lightingPanels: [...panels, panel] });
            setPanelId(panel.id); setPlaceKind('fixture'); setActiveTab(POWER_NODE); setTool('select');
            return;
        }
        const fixtures = read('lightingFixtures');
        const type = live.current.types.get(live.current.placeType);
        if (!type || fixtures.length >= LIGHTING_LIMITS.fixtures) return;
        // Настенный — лицом из стены; на земле — куда протянули, иначе от камеры.
        const wall = Math.abs(ny) < 0.6;
        const fixture = normalizeLightingFixture(withAim({
            id: newId('lum'), type: type.id, x, y, z, nx, ny, nz,
            yaw: wall ? heading(nx, nz) : (yaw * 180) / Math.PI, pitch: type.pitch ?? -90,
            ...(target ? { target } : {}), dim: 1, by: 'denis',
        }, live.current.types));
        apply({ lightingFixtures: [...fixtures, fixture] });
        setSelectedId(fixture.id);
    }, [apply, setActiveTab, setTool]);

    const update = useCallback((id, patch) => {
        const next = (fixture) => ('target' in patch && patch.target ? withAim({ ...fixture, ...patch }, live.current.types) : { ...fixture, ...patch });
        apply({ lightingFixtures: read('lightingFixtures').map((fixture, index) => (fixture.id === id ? normalizeLightingFixture(next(fixture), index) ?? fixture : fixture)) });
    }, [apply]);
    // Замена типа: тот же светильник, другое изделие; наведение — по новому типу,
    // если он сам не наводится.
    const replaceType = useCallback((id, typeId) => {
        const type = live.current.types.get(typeId);
        if (type) update(id, { type: typeId, pitch: type.pitch ?? -90 });
    }, [update]);
    const remove = useCallback((id) => { apply({ lightingFixtures: read('lightingFixtures').filter((fixture) => fixture.id !== id) }); setSelectedId(null); setAiming(false); }, [apply]);
    const onAim = useCallback((point) => {
        const id = live.current.selectedId;
        if (id) update(id, { target: point });
        setAiming(false);
    }, [update]);
    const select = useCallback((id) => { setSelectedId(id); setPanelId(null); setHandle('body'); setAiming(false); setActiveTab(LIGHTING_NODE); setTool('select'); }, [setActiveTab, setTool]);

    const updatePanel = useCallback((id, patch) => {
        apply({ lightingPanels: read('lightingPanels').map((panel, index) => (panel.id === id ? normalizeLightingPanel({ ...panel, ...patch }, index) ?? panel : panel)) });
    }, [apply]);
    // Щиток уходит вместе со своими цепями; их приборы остаются неподключёнными.
    const removePanel = useCallback((id) => {
        const gone = new Set(read('lightingCircuits').filter((circuit) => circuit.panel === id).map((circuit) => circuit.id));
        apply({
            lightingPanels: read('lightingPanels').filter((panel) => panel.id !== id),
            lightingCircuits: read('lightingCircuits').filter((circuit) => !gone.has(circuit.id)),
            lightingFixtures: read('lightingFixtures').map(({ circuit, ...fixture }) => (gone.has(circuit) ? fixture : { ...fixture, ...(circuit ? { circuit } : {}) })),
        });
        setPanelId(null);
    }, [apply]);
    // Щелчок мимо и пробел: ничего не выбрано, раздел и инструмент — те же.
    const deselect = useCallback(() => { setSelectedId(null); setPanelId(null); setHandle('body'); setAiming(false); }, []);
    const selectPanel = useCallback((id) => { setPanelId(id); setSelectedId(null); setAiming(false); setActiveTab(POWER_NODE); setTool('select'); }, [setActiveTab, setTool]);
    const updateCircuit = useCallback((id, patch) => {
        apply({ lightingCircuits: read('lightingCircuits').map((circuit, index) => (circuit.id === id ? normalizeLightingCircuit({ ...circuit, ...patch }, index) ?? circuit : circuit)) });
    }, [apply]);
    // Неподключённые приборы — по новым цепям у ближайшего щитка.
    const layCircuits = useCallback((grid) => {
        const { settings: current, types: known } = live.current;
        const circuits = read('lightingCircuits'), taken = new Set(circuits.map((circuit) => circuit.id));
        const free = electricInputs(current, known, grid).fixtures.filter((fixture) => !fixture.circuit || !taken.has(fixture.circuit));
        if (!free.length || !read('lightingPanels').length) return;
        const proposal = proposeCircuits({ fixtures: free, panels: read('lightingPanels') });
        let next = circuits.length;
        const rename = new Map(proposal.circuits.map((circuit) => { let id; do { id = `c${++next}`; } while (taken.has(id)); return [circuit.id, id]; }));
        const added = proposal.circuits.map((circuit) => normalizeLightingCircuit({ ...circuit, id: rename.get(circuit.id), name: `Гр.${rename.get(circuit.id).slice(1)}` }));
        apply({
            lightingCircuits: [...circuits, ...added],
            lightingFixtures: read('lightingFixtures').map((fixture) => (proposal.assign[fixture.id] ? { ...fixture, circuit: rename.get(proposal.assign[fixture.id]) } : fixture)),
        });
    }, [apply]);
    const removeCircuit = useCallback((id) => {
        apply({
            lightingCircuits: read('lightingCircuits').filter((circuit) => circuit.id !== id),
            lightingFixtures: read('lightingFixtures').map(({ circuit, ...fixture }) => (circuit === id || !circuit ? fixture : { ...fixture, circuit })),
        });
    }, [apply]);

    const fixtures = settings.lightingFixtures ?? [], panels = settings.lightingPanels ?? [];
    return {
        selectedId: fixtures.some((fixture) => fixture.id === selectedId) ? selectedId : null,
        panelId: panels.some((panel) => panel.id === panelId) ? panelId : null,
        placeType, setPlaceType, placeKind, handle, setHandle, aiming, setAiming,
        onLight, onAim, update, replaceType, remove, select, deselect,
        updatePanel, removePanel, selectPanel, updateCircuit, layCircuits, removeCircuit,
        begin: (typeId) => { if (typeId) setPlaceType(typeId); setPlaceKind('fixture'); setAiming(false); setActiveTab(LIGHTING_NODE); setTool('luminaire'); },
        beginPanel: () => { setPlaceKind('panel'); setAiming(false); setActiveTab(POWER_NODE); setTool('luminaire'); },
    };
}
