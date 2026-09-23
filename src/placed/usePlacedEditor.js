import { useCallback, useRef, useState } from 'react';
import { createPlacedObject, normalizePlacedObject, placedSpeciesDefaults, PLACED_LIMITS } from './settings.js';
import { createTerrainDefinition, createTerrainQuery } from '../terrain/terrainModel.js';
import { activeProjectId, uploadProjectModel } from '../features/engine/projectApi.js';
import { solidHeightAt } from './solidSurface.js';

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
export function usePlacedEditor({ settings, history, setActiveTab, setTool, language, layoutEditor }) {
    const [selectedId, setSelectedId] = useState(null);
    const live = useRef(); live.current = { settings, history, language, layoutEditor };
    const select = useCallback((id) => { setSelectedId(id); setActiveTab('objects/placed'); setTool('select'); }, [setActiveTab, setTool]);
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
    const importModel = useCallback(async (file) => {
        const ru = live.current.language === 'ru';
        const project = activeProjectId();
        if (!project) throw new Error(ru ? 'Модели живут в проектах движка: откройте проект.' : 'Models live in engine projects: open one.');
        if (live.current.settings.placedObjects.length >= PLACED_LIMITS.objects) throw new Error(ru ? 'Объектов уже 48 — больше нет места.' : 'There are 48 objects already.');
        const { model } = await uploadProjectModel(project, file);
        const name = freeName(live.current.settings, String(file.name ?? '').replace(/\.glb$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || KIND_NAMES.model[ru ? 0 : 1]);
        const object = createPlacedObject('model', { ...freeSpot(live.current), name, model });
        const { settings, history } = live.current;
        history.applySettings({ placedEnabled: true, placedObjects: [...settings.placedObjects, object] });
        setSelectedId(object.id); setActiveTab('objects/placed');
        return object;
    }, [setActiveTab]);
    const duplicate = useCallback((id) => {
        const { settings, history } = live.current;
        const source = settings.placedObjects.find((o) => o.id === id);
        if (!source || settings.placedObjects.length >= PLACED_LIMITS.objects) return;
        const copy = normalizePlacedObject({ ...source, id: `placed-${crypto.randomUUID()}`, name: `${source.name} ·`, x: source.x + 2, z: source.z + 2, seed: Math.floor(Math.random() * 199) + 1 });
        history.applySettings({ placedObjects: [...settings.placedObjects, copy] });
        setSelectedId(copy.id);
    }, []);
    const seat = useCallback((id) => {
        const object = live.current.settings.placedObjects.find((o) => o.id === id);
        if (object) update(id, { y: Number(groundHeight(live.current.settings, object.x, object.z, object.id).toFixed(3)) });
    }, [update]);
    const remove = useCallback((id) => {
        const { settings, history } = live.current;
        history.applySettings({ placedObjects: settings.placedObjects.filter((o) => o.id !== id) });
        setSelectedId(null);
    }, []);
    return { selectedId: settings.placedObjects.some((o) => o.id === selectedId) ? selectedId : null, select, update, setSpecies, add, importModel, duplicate, seat, remove };
}
