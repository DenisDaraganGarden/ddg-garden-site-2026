// Placed objects: single trees, shrubs and rocks the author puts down one by
// one, each with its own generation parameters and its own place. They are
// the library's objects without the population: the same generators, one
// instance each, no scattering. Metres and degrees; only compact author data
// enters snapshots, like the hedges.
//
// A model is the one kind the engine does not generate: a .glb Denis imports
// into a project (the file lies in the project's folder, projectStore.mjs),
// placed, turned, tilted and scaled like the rest. Its own switches: lit by
// the scene or as scanned, wet where the sea reaches it, solid to the board.
import { TREE_KINDS, TREE_SPECIES } from '../plants/treeSpecies.js';
import { TREE_DEFAULTS } from '../plants/treeModel.js';

export const PLACED_KINDS = Object.freeze(['tree', 'shrub', 'rock', 'model']);
export const PLACED_ROCK_VARIANTS = 6;
export const PLACED_LIMITS = Object.freeze({ objects: 48 });

// Shared transform, then the generator's own knobs per kind. Ranges follow
// the population sliders so a placed tree can be anything a planted one can.
export const PLACED_TRANSFORM_RANGES = Object.freeze({
    x: [-1200, 1200, .1], z: [-1200, 1200, .1], y: [-20, 60, .05], rotation: [-180, 180, 1], scale: [.25, 4, .05], seed: [1, 200, 1],
});
// A model comes in whatever units it was scanned in: a pebble or a stretch of
// beach. Its scale reaches from a hundredth to fifty times.
export const PLACED_SCALE_RANGES = Object.freeze({ model: [.01, 50, .01] });
export const placedTransformRanges = (kind) => (PLACED_SCALE_RANGES[kind]
    ? { ...PLACED_TRANSFORM_RANGES, scale: PLACED_SCALE_RANGES[kind] } : PLACED_TRANSFORM_RANGES);
export const PLACED_KIND_RANGES = Object.freeze({
    tree: Object.freeze({ height: [2.5, 12, .1], spread: [1.5, 12, .1], lean: [0, 1, .01], twist: [0, 1, .01], density: [.1, 1, .01], leafSize: [.8, 2.4, .05], deadwood: [0, 1, .01], translucency: [0, 1.4, .05] }),
    shrub: Object.freeze({ height: [.45, 2.4, .05], spread: [.6, 2.5, .05], density: [.1, 1, .01], leafSize: [.5, 1.6, .05], dryness: [0, 1, .01], translucency: [0, 1.4, .05] }),
    rock: Object.freeze({ size: [.1, 6, .05], squash: [.3, 1.4, .01], stretch: [.5, 2, .01], variant: [0, PLACED_ROCK_VARIANTS - 1, 1], tilt: [-40, 40, 1] }),
    model: Object.freeze({ tiltX: [-180, 180, 1], tiltZ: [-180, 180, 1] }),
});
export const PLACED_KIND_DEFAULTS = Object.freeze({
    tree: Object.freeze({ species: 'elm', height: 6, spread: 5.5, lean: .55, twist: .4, density: .8, leafSize: 1.8, deadwood: .3, translucency: 1.1 }),
    shrub: Object.freeze({ species: 'oleaster', height: 1.35, spread: 1.75, density: .8, leafSize: 1, dryness: .3, translucency: .65 }),
    rock: Object.freeze({ species: 'limestone', size: 1.2, squash: .7, stretch: 1.2, variant: 0, tilt: 0 }),
    // species of a model: how it is lit — by the scene, or as it was scanned.
    model: Object.freeze({ species: 'lit', tiltX: 0, tiltZ: 0 }),
});
export const PLACED_SPECIES = Object.freeze({
    tree: TREE_KINDS,
    shrub: Object.freeze(['oleaster']),
    rock: Object.freeze(['limestone', 'coquina', 'worn']),
    model: Object.freeze(['lit', 'scan']),
});
const MODEL_FILE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PLACED_TRANSFORM_DEFAULT = Object.freeze({ x: 0, y: 0, z: 0, rotation: 0, scale: 1, seed: 7 });
// A model imported from SketchUp has its own entry here, by the placed
// object's id: its 2D plants turned to the camera or not, their crown discs
// drawn for the plan shown or not, and the parts (glTF node indices) hidden. Kept beside the objects, not in them: the
// objects are in every camera's snapshot, and a part hidden in one camera
// must stay hidden in all of them (sceneCameras.js leaves this key out).
export const DEFAULT_PLACED_SETTINGS = Object.freeze({ placedEnabled: true, placedObjects: [], sketchupModels: {} });
export const SKETCHUP_LIMITS = Object.freeze({ models: 256, hidden: 20000 });
const PLACED_ID = /^[a-zA-Z0-9_-]{1,64}$/;

// Sorted and unique, so a list normalizes to itself; never pruned against
// the objects, which differ from camera to camera. Past the limit the entries
// of objects on the stage (`live`) are the ones kept.
export function normalizeSketchupModels(value, live = new Set()) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    const ids = Object.keys(value).filter((key) => PLACED_ID.test(key)).sort();
    const kept = new Set([...ids.filter((id) => live.has(id)), ...ids.filter((id) => !live.has(id))].slice(0, SKETCHUP_LIMITS.models));
    for (const id of ids.filter((key) => kept.has(key))) {
        const entry = value[id] && typeof value[id] === 'object' ? value[id] : {};
        const hidden = [...new Set((Array.isArray(entry.hidden) ? entry.hidden : []).filter((node) => Number.isInteger(node) && node >= 0 && node < 1e7))]
            .sort((a, b) => a - b).slice(0, SKETCHUP_LIMITS.hidden);
        out[id] = { faceCamera: entry.faceCamera !== false, crowns: entry.crowns === true, hidden };
    }
    return out;
}

const number = (value, fallback, min, max, step) => {
    const parsed = Number(value);
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    return step >= 1 ? Math.round(clamped) : Math.round(clamped * 1000) / 1000;
};

export function normalizePlacedObject(value, index = 0) {
    if (!value || !PLACED_KINDS.includes(value.kind)) return null;
    const kind = value.kind;
    const defaults = PLACED_KIND_DEFAULTS[kind];
    const species = PLACED_SPECIES[kind].includes(value.species) ? value.species : defaults.species;
    const result = {
        id: String(value.id || `placed-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `placed-${index}`,
        name: String(value.name || `${kind} ${index + 1}`).slice(0, 64),
        kind,
        species,
    };
    for (const [key, [min, max, step]] of Object.entries(placedTransformRanges(kind))) result[key] = number(value[key], PLACED_TRANSFORM_DEFAULT[key], min, max, step);
    for (const [key, [min, max, step]] of Object.entries(PLACED_KIND_RANGES[kind])) result[key] = number(value[key], defaults[key], min, max, step);
    if (kind === 'model') {
        // The file it shows, in the project's folder: no file, no object.
        if (!MODEL_FILE.test(String(value.model ?? ''))) return null;
        result.model = value.model;
        // The point of the file standing on the place (its footprint's middle,
        // its lowest point), kept from the import: a new version of the file
        // stands where the old one stood, not on its own new middle.
        const origin = value.origin;
        if (origin && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(origin[axis])) && Math.abs(Number(origin[axis])) < 1e7)) {
            result.origin = { x: Math.round(Number(origin.x) * 1000) / 1000, y: Math.round(Number(origin.y) * 1000) / 1000, z: Math.round(Number(origin.z) * 1000) / 1000 };
        }
        result.wet = value.wet !== false;
        result.collision = value.collision === true;
    }
    if (value.hidden === true) result.hidden = true;
    return result;
}

export function normalizePlacedSettings(settings = {}) {
    const ids = new Set();
    const objects = (Array.isArray(settings.placedObjects) ? settings.placedObjects : []).slice(0, PLACED_LIMITS.objects)
        .map(normalizePlacedObject).filter(Boolean).map((object, index) => {
            const base = object.id; let suffix = index;
            while (ids.has(object.id)) object.id = `${base.slice(0, 54)}-${suffix++}`;
            ids.add(object.id); return object;
        });
    return { placedEnabled: settings.placedEnabled !== false, placedObjects: objects, sketchupModels: normalizeSketchupModels(settings.sketchupModels, new Set(objects.map((o) => o.id))) };
}

// The knobs a species brings with it: a placed willow starts as the table's
// willow. Only the keys the kind exposes; the rest of the form stays the
// species' own inside the generator.
export function placedSpeciesDefaults(kind, species) {
    if (kind !== 'tree') return {};
    const form = { ...TREE_DEFAULTS, ...(TREE_SPECIES[species]?.form ?? {}) };
    const out = {};
    for (const key of Object.keys(PLACED_KIND_RANGES.tree)) if (key in form) out[key] = form[key];
    return out;
}

// A fresh object of a kind at a place, with the kind's factory look and its
// own seed. `species` may be given; otherwise the kind's default. A model
// also takes the file it shows (`model`).
export function createPlacedObject(kind, { x = 0, y = 0, z = 0, species, name, model } = {}) {
    const defaults = PLACED_KIND_DEFAULTS[kind];
    const chosen = species ?? defaults.species;
    return normalizePlacedObject({
        ...PLACED_TRANSFORM_DEFAULT, ...defaults, ...placedSpeciesDefaults(kind, chosen),
        id: `placed-${crypto.randomUUID()}`, kind, species: chosen, name, model,
        seed: Math.floor(Math.random() * 199) + 1, x, y, z,
    });
}

// Species of a placed tree is a form; what the population would give the
// same species, the placed tree gets, with its own knobs on top.
export const placedSpeciesLabel = (kind, species, language) => {
    if (kind === 'tree') {
        const names = { oleaster: ['Лох', 'Oleaster'], tamarisk: ['Гребенщик', 'Tamarisk'], plum: ['Алыча', 'Plum'], elm: ['Вяз', 'Elm'], willow: ['Ива', 'Willow'], snag: ['Сухостой', 'Snag'] };
        return names[species]?.[language === 'ru' ? 0 : 1] ?? species;
    }
    if (kind === 'rock') {
        const names = { limestone: ['Известняк', 'Limestone'], coquina: ['Ракушечник', 'Coquina'], worn: ['Окатанный', 'Worn'] };
        return names[species]?.[language === 'ru' ? 0 : 1] ?? species;
    }
    if (kind === 'model') {
        const names = { lit: ['Свет сцены', 'Scene light'], scan: ['Как в скане', 'As scanned'] };
        return names[species]?.[language === 'ru' ? 0 : 1] ?? species;
    }
    return language === 'ru' ? 'Лох (куст)' : 'Oleaster (shrub)';
};
