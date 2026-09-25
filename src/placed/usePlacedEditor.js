import { useCallback, useMemo, useRef, useState } from 'react';
import { createPlacedObject, normalizePlacedObject, placedSpeciesDefaults, PLACED_LIMITS } from './settings.js';
import { createTerrainDefinition, createTerrainQuery } from '../terrain/terrainModel.js';
import { activeProjectId, uploadProjectModel } from '../features/engine/projectApi.js';
import { solidHeightAt } from './solidSurface.js';
import { copiesOf, findPart, nextPart, outerPart, partChain, partName, sketchupModelEntry, togglePart } from './sketchupModel.js';

const KIND_NAMES = { tree: ['Дерево', 'Tree'], shrub: ['Куст', 'Shrub'], rock: ['Камень', 'Rock'], model: ['Модель', 'Model'] };

// Where a new object lands: where the camera looks, on the ground, and a step
// aside from one already standing there — two objects put down without
// moving the camera would stand in one spot.
function freeSpot({ settings, layoutEditor }) {
    const target = layoutEditor?.capturePose?.()?.cameraTarget ?? { x: 0, z: 0 };
    let x = Number(target.x.toFixed(2)), z = Number(target.z.toFixed(2));
    for (let tries = 0; tries < 12 && settings.placedObjects.some((o) => Math.hypot(o.x - x, o.z - z) < 1.5); tries += 1) {
        const angle = tries * 2.4; x = Number((x + Math.cos(angle) * 2.5).toFixed(2)); z = Number((z + Math.sin(angle) * 2.5).toFixed(2));
    }
    return { x, z, y: Number(groundHeight(settings, x, z).toFixed(3)) };
}
// The ground an object sits on: the terrain, or the top of a solid model
// standing there — a tree planted on a rock — but never the object itself.
function groundHeight(settings, x, z, self = null) {
    let terrain = 0;
    if (settings.terrainEnabled !== false) {
        try { terrain = createTerrainQuery(createTerrainDefinition(settings)).heightAt(x, z); } catch { terrain = 0; }
    }
    return Math.max(terrain, solidHeightAt(x, z, self));
}
function freeName(settings, base) {
    const used = new Set(settings.placedObjects.map((o) => o.name));
    if (!used.has(base)) return base;
    let n = 2; while (used.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
}

// The editor's hands on the placed objects: select, add at the camera's
// target, change a knob, seat on the ground, duplicate, remove. Every change
// goes through the history the sliders use, so undo covers a placement too.
//
// In a SketchUp model a click also picks a part, as SketchUp selects: the
// component it hit at the model's top level; a double click opens it and
// picks its part under the cursor, Esc steps back out (nextPart, outerPart).
// The chain down to what was hit is kept for the panel's breadcrumbs
// (`trail`, glTF node indices). Shift adds a part at the same level to the
// selection (togglePart). A part is hidden (comes back with «show hidden») or
// deleted (gone until restored one by one or by undo). Q inside an open group
// leaves it alone on the screen (`part.isolated`, PlacedObjects → Isolate).
export function usePlacedEditor({ settings, history, setActiveTab, setTool, language, layoutEditor }) {
    const [selectedId, setSelectedId] = useState(null);
    const [part, setPart] = useState(null);
    const [isolated, setIsolated] = useState(false);
    const live = useRef(); live.current = { settings, history, language, layoutEditor };
    const partRef = useRef(null); partRef.current = part;
    const trailOf = (id, hit) => {
        const root = id && hit ? sketchupModelEntry(id)?.root : null;
        return root ? partChain(root, hit).map((object) => object.userData.gltfNode) : [];
    };
    const select = useCallback((id, hit = null, double = false, shift = false) => {
        const trail = trailOf(id, hit);
        setSelectedId(id);
        setPart((current) => (shift ? togglePart(current, id, trail) : nextPart(current, id, trail, double)));
        setActiveTab('objects/placed'); setTool('select');
    }, [setActiveTab, setTool]);
    const selectPart = useCallback((node) => setPart((current) => (current?.trail.includes(node) ? { id: current.id, trail: current.trail, node } : current)), []);
    // Из «Состава модели»: часть по номеру узла, с цепочкой групп над ней;
    // с Shift строка того же уровня той же группы — в выбор или из него.
    const selectNode = useCallback((id, node, shift = false) => {
        const root = sketchupModelEntry(id)?.root, object = root ? findPart(root, node) : null;
        const trail = object ? partChain(root, object).map((item) => item.userData.gltfNode) : [];
        setSelectedId(id);
        setPart((current) => (!trail.length ? null
            : shift && current?.id === id && current.trail.indexOf(current.node) === trail.length - 1 ? togglePart(current, id, trail) : { id, trail, node }));
        setActiveTab('objects/placed');
    }, [setActiveTab]);
    const exitPart = useCallback(() => setPart((current) => outerPart(current)), []);
    // Q: только открытая группа на экране и обратно. Вне группы выключается сам.
    const inside = part ? part.trail.indexOf(part.node) > 0 : false;
    if (isolated && !inside) setIsolated(false);
    const toggleIsolate = useCallback(() => setIsolated((value) => !value), []);
    // Что выберет щелчок в этой точке — для меню правой кнопки: имя и копии.
    const partAt = useCallback((id, hit) => {
        const chosen = nextPart(partRef.current, id, trailOf(id, hit));
        const root = sketchupModelEntry(id)?.root, object = chosen && root ? findPart(root, chosen.node) : null;
        return object ? { node: chosen.node, name: partName(object, live.current.language === 'ru'), copies: copiesOf(root, object).map((copy) => copy.userData.gltfNode) } : null;
    }, []);
    // A SketchUp model's own switches, outside the camera snapshots.
    const setSketchup = useCallback((id, patch) => {
        const { settings, history } = live.current;
        const current = settings.sketchupModels?.[id] ?? { faceCamera: true, crowns: false, hidden: [] };
        history.applySettings({ sketchupModels: { ...settings.sketchupModels, [id]: { ...current, ...patch } } });
    }, []);
    const lists = (id) => { const entry = live.current.settings.sketchupModels?.[id]; return { hidden: entry?.hidden ?? [], removed: entry?.removed ?? [] }; };
    const hideParts = useCallback((id, nodes) => {
        const { hidden, removed } = lists(id), gone = new Set(nodes);
        setSketchup(id, { hidden: [...new Set([...hidden, ...nodes])], removed: removed.filter((node) => !gone.has(node)) });
        setPart(null);
    }, [setSketchup]);
    // Без списка — все скрытые; удалённые остаются удалёнными.
    const showParts = useCallback((id, nodes = null) => {
        const back = nodes && new Set(nodes);
        setSketchup(id, { hidden: back ? lists(id).hidden.filter((node) => !back.has(node)) : [] });
    }, [setSketchup]);
    const removeParts = useCallback((id, nodes) => {
        const { hidden, removed } = lists(id), gone = new Set(nodes);
        setSketchup(id, { removed: [...new Set([...removed, ...nodes])], hidden: hidden.filter((node) => !gone.has(node)) });
        setPart(null);
    }, [setSketchup]);
    const restoreParts = useCallback((id, nodes = null) => {
        const back = nodes && new Set(nodes);
        setSketchup(id, { removed: back ? lists(id).removed.filter((node) => !back.has(node)) : [] });
    }, [setSketchup]);
    const update = useCallback((id, patch) => {
        const { settings, history } = live.current;
        history.applySettings({ placedObjects: settings.placedObjects.map((o, i) => (o.id === id ? normalizePlacedObject({ ...o, ...patch }, i) : o)) });
    }, []);
    // A new species is a new form: its table knobs replace the old ones.
    const setSpecies = useCallback((id, species) => {
        const { settings } = live.current;
        const object = settings.placedObjects.find((o) => o.id === id);
        if (object) update(id, { species, ...placedSpeciesDefaults(object.kind, species) });
    }, [update]);
    const add = useCallback((kind) => {
        const { settings, history, language } = live.current;
        if (settings.placedObjects.length >= PLACED_LIMITS.objects) return;
        const used = new Set(settings.placedObjects.map((o) => o.name)); let n = 1, name;
        do { name = `${KIND_NAMES[kind][language === 'ru' ? 0 : 1]} ${n++}`; } while (used.has(name));
        const object = createPlacedObject(kind, { ...freeSpot(live.current), name });
        history.applySettings({ placedEnabled: true, placedObjects: [...settings.placedObjects, object] });
        setSelectedId(object.id); setActiveTab('objects/placed');
    }, [setActiveTab]);
    // A .glb from the author's disk: into this project's own folder, then onto
    // the scene where the camera looks, named after its file. Throws with a
    // message for the panel to show: no project, the list is full, not a .glb.
    // From SketchUp the server prepares the file first (scripts/sketchupGlb.mjs)
    // and says what it did; the model gets its own switches and stays dry.
    const importModel = useCallback(async (file, { sketchup = false } = {}) => {
        const ru = live.current.language === 'ru';
        const project = activeProjectId();
        if (!project) throw new Error(ru ? 'Модели живут в проектах движка: откройте проект.' : 'Models live in engine projects: open one.');
        if (live.current.settings.placedObjects.length >= PLACED_LIMITS.objects) throw new Error(ru ? 'Объектов уже 48 — больше нет места.' : 'There are 48 objects already.');
        const { model, report, origin } = await uploadProjectModel(project, file, sketchup ? { source: 'sketchup' } : undefined);
        const name = freeName(live.current.settings, String(file.name ?? '').replace(/\.glb$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || KIND_NAMES.model[ru ? 0 : 1]);
        const created = createPlacedObject('model', { ...freeSpot(live.current), name, model });
        const object = normalizePlacedObject({ ...created, origin, ...(sketchup ? { wet: false } : {}) });
        const { settings, history } = live.current;
        history.applySettings({
            placedEnabled: true,
            placedObjects: [...settings.placedObjects, object],
            ...(sketchup ? { sketchupModels: { ...settings.sketchupModels, [object.id]: { faceCamera: true, crowns: false, hidden: [] } } } : {}),
        });
        setSelectedId(object.id); setPart(null); setActiveTab('objects/placed');
        return { object, report };
    }, [setActiveTab]);
    // A new version of a model's file: the same object, place and switches, the
    // file stands where the old one stood (its kept origin, or the old file's
    // own), and hidden SketchUp parts move to the parts with the same path.
    const replaceModel = useCallback(async (id, file) => {
        const project = activeProjectId();
        const { settings } = live.current;
        const object = settings.placedObjects.find((o) => o.id === id);
        if (!project || object?.kind !== 'model') return null;
        const sketchup = settings.sketchupModels?.[id];
        const { model, report, origin, replaced } = await uploadProjectModel(project, file, { source: sketchup ? 'sketchup' : undefined, replaces: object.model });
        const map = replaced?.nodeMap ?? [];
        const moved = (list) => (list ?? []).map((node) => map[node]).filter((node) => Number.isInteger(node) && node >= 0);
        const hidden = sketchup ? moved(sketchup.hidden) : [], removed = sketchup ? moved(sketchup.removed) : [];
        const { settings: now, history } = live.current;
        history.applySettings({
            placedObjects: now.placedObjects.map((o, i) => (o.id === id ? normalizePlacedObject({ ...o, model, origin: object.origin ?? replaced?.origin ?? origin }, i) : o)),
            ...(sketchup ? { sketchupModels: { ...now.sketchupModels, [id]: { ...sketchup, hidden, removed } } } : {}),
        });
        setPart(null);
        return { report, kept: hidden.length + removed.length, hidden: (sketchup?.hidden.length ?? 0) + (sketchup?.removed?.length ?? 0) };
    }, []);
    const duplicate = useCallback((id) => {
        const { settings, history } = live.current;
        const source = settings.placedObjects.find((o) => o.id === id);
        if (!source || settings.placedObjects.length >= PLACED_LIMITS.objects) return;
        const copy = normalizePlacedObject({ ...source, id: `placed-${crypto.randomUUID()}`, name: `${source.name} ·`, x: source.x + 2, z: source.z + 2, seed: Math.floor(Math.random() * 199) + 1 });
        const sketchup = settings.sketchupModels?.[id];
        history.applySettings({ placedObjects: [...settings.placedObjects, copy], ...(sketchup ? { sketchupModels: { ...settings.sketchupModels, [copy.id]: sketchup } } : {}) });
        setSelectedId(copy.id); setPart(null);
    }, []);
    const seat = useCallback((id) => {
        const object = live.current.settings.placedObjects.find((o) => o.id === id);
        if (object) update(id, { y: Number(groundHeight(live.current.settings, object.x, object.z, object.id).toFixed(3)) });
    }, [update]);
    const remove = useCallback((id) => {
        const { settings, history } = live.current;
        // Its SketchUp switches go with it, unless another camera still shows it.
        const elsewhere = [...(settings.sceneCameras ?? []), ...(settings.workCameras ?? [])]
            .some((camera) => camera.id !== settings.activeWorkCameraId && camera.id !== (settings.activeWorkCameraId ? null : settings.activeCameraId)
                && camera.scene?.placedObjects?.some((o) => o.id === id));
        const { [id]: dropped, ...sketchupModels } = settings.sketchupModels ?? {};
        history.applySettings({ placedObjects: settings.placedObjects.filter((o) => o.id !== id), ...(dropped && !elsewhere ? { sketchupModels } : {}) });
        setSelectedId(null); setPart(null);
    }, []);
    const shown = settings.placedObjects.some((o) => o.id === selectedId) ? selectedId : null;
    const shownPart = useMemo(() => (part && part.id === shown ? (isolated && inside ? { ...part, isolated: true } : part) : null), [part, shown, isolated, inside]);
    return {
        selectedId: shown, part: shownPart, select, selectPart, selectNode, exitPart, partAt, update, setSpecies, add, importModel, replaceModel, duplicate, seat, remove,
        setSketchup, hideParts, showParts, removeParts, restoreParts, toggleIsolate,
    };
}
