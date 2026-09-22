import { useCallback, useRef, useState } from 'react';
import { createPlacedObject, normalizePlacedObject, placedSpeciesDefaults, PLACED_LIMITS } from './settings.js';
import { createTerrainDefinition, createTerrainQuery } from '../terrain/terrainModel.js';

const KIND_NAMES = { tree: ['Дерево', 'Tree'], shrub: ['Куст', 'Shrub'], rock: ['Камень', 'Rock'] };

// The editor's hands on the placed objects: select, add at the camera's
// target, change a knob, seat on the ground, duplicate, remove. Every change
// goes through the history the sliders use, so undo covers a placement too.
export function usePlacedEditor({ settings, history, setActiveTab, setTool, language, layoutEditor }) {
    const [selectedId, setSelectedId] = useState(null);
    const live = useRef(); live.current = { settings, history, language, layoutEditor };
    const select = useCallback((id) => { setSelectedId(id); setActiveTab('objects/placed'); setTool('select'); }, [setActiveTab, setTool]);
    const groundAt = (x, z) => {
        const { settings } = live.current;
        if (settings.terrainEnabled === false) return 0;
        try { return createTerrainQuery(createTerrainDefinition(settings)).heightAt(x, z); } catch { return 0; }
    };
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
        const { settings, history, language, layoutEditor } = live.current;
        if (settings.placedObjects.length >= PLACED_LIMITS.objects) return;
        const used = new Set(settings.placedObjects.map((o) => o.name)); let n = 1, name;
        do { name = `${KIND_NAMES[kind][language === 'ru' ? 0 : 1]} ${n++}`; } while (used.has(name));
        const target = layoutEditor?.capturePose?.()?.cameraTarget ?? { x: 0, z: 0 };
        let x = Number(target.x.toFixed(2)), z = Number(target.z.toFixed(2));
        // Two objects put down without moving the camera would stand in one
        // spot; the second steps aside so both can be seen and grabbed.
        for (let tries = 0; tries < 12 && settings.placedObjects.some((o) => Math.hypot(o.x - x, o.z - z) < 1.5); tries += 1) {
            const angle = tries * 2.4; x = Number((x + Math.cos(angle) * 2.5).toFixed(2)); z = Number((z + Math.sin(angle) * 2.5).toFixed(2));
        }
        const object = createPlacedObject(kind, { x, z, y: Number(groundAt(x, z).toFixed(3)), name });
        history.applySettings({ placedEnabled: true, placedObjects: [...settings.placedObjects, object] });
        setSelectedId(object.id); setActiveTab('objects/placed');
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
        if (object) update(id, { y: Number(groundAt(object.x, object.z).toFixed(3)) });
    }, [update]);
    const remove = useCallback((id) => {
        const { settings, history } = live.current;
        history.applySettings({ placedObjects: settings.placedObjects.filter((o) => o.id !== id) });
        setSelectedId(null);
    }, []);
    return { selectedId: settings.placedObjects.some((o) => o.id === selectedId) ? selectedId : null, select, update, setSpecies, add, duplicate, seat, remove };
}
