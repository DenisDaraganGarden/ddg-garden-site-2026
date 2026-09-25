import { useCallback, useEffect, useRef, useState } from 'react';
import { LAWN_DEFAULT, normalizePlantingBed, normalizePlantingPoint, normalizePlantingVine, PLANTING_BED_DEFAULT, PLANTING_LIMITS } from './settings.js';
import { lawnAngleFor } from './lawnGround.js';
import { PLANTING_PALETTES } from './palettes.js';
import { vineRoot } from './vines.js';

// Мазок, начатый у корня лианы того же вида (ближе JOIN м), — ещё один её
// побег, а не новое растение.
const JOIN = 0.35;

export const PLANTING_NODE = 'greenery/planting';
const newSeed = () => Math.floor(Math.random() * 1e7) + 1;
const newId = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

// Рецепт палитры — из тех растений, что есть в библиотеке. Пока библиотека
// не пришла (сервер без неё, первая загрузка), рецепт берётся целиком: это
// данные цветника, а растения появятся вместе с библиотекой — пустой рецепт
// оставил бы голую землю.
export const paletteRecipe = (palette, library) => palette.recipe
    .filter(([plant]) => !library.size || library.has(plant))
    .map(([plant, share]) => ({ plant, share }));

// Правки посадок идут через историю редактора: цветник от руки, растение
// кликом, палитра, доля — каждая отменяется ⌘Z.
export function usePlantingEditor({ settings, history, setActiveTab, setTool, tool, language, library }) {
    const [selectedId, setSelectedId] = useState(null);
    const [plantChoice, setPlantChoice] = useState('acer-tataricum');
    // Что сажает клик: новое растение по проекту или существующее на участке.
    const [plantStatus, setPlantStatus] = useState('new');
    const [vineChoice, setVineChoice] = useState('parthenocissus-quinquefolia');
    const [vineId, setVineId] = useState(null);
    // Что рисует инструмент «Цветник»: цветник или газон (тот же контур, та же
    // поверхность модели). Ушёл с инструмента — дальше снова цветник: L — цветник.
    const [bedKind, setBedKind] = useState('bed');
    useEffect(() => { if (tool !== 'bed') setBedKind('bed'); }, [tool]);
    const live = useRef();
    live.current = { settings, history, language, library, plantChoice, plantStatus, vineChoice, bedKind };

    const beds = settings.plantingBeds ?? [];
    const applyBeds = useCallback((next) => live.current.history.applySettings({ plantingEnabled: true, plantingBeds: next }), []);
    const select = useCallback((id) => { setSelectedId(id); setVineId(null); setActiveTab(PLANTING_NODE); setTool('select'); }, [setActiveTab, setTool]);

    const updateBed = useCallback((id, patch) => {
        const { settings } = live.current;
        applyBeds(settings.plantingBeds.map((bed, index) => (bed.id === id ? normalizePlantingBed({ ...bed, ...patch }, index) : bed)));
    }, [applyBeds]);

    // Новый цветник — контур от руки или поверхность модели (holes, ground,
    // surface — surfacePick.js); засаживается первой палитрой. Газон — тот же
    // контур без растений, проходы косилки вдоль его длинной стороны.
    const addBed = useCallback((shape) => {
        const { settings, language, library, bedKind: kind } = live.current;
        if (settings.plantingBeds.length >= PLANTING_LIMITS.beds) return;
        const lawn = kind === 'lawn', ru = language === 'ru';
        const used = new Set(settings.plantingBeds.map((bed) => bed.name));
        let n = 1, name;
        do { name = `${lawn ? (ru ? 'Газон' : 'Lawn') : (ru ? 'Цветник' : 'Bed')} ${n++}`; } while (used.has(name));
        const palette = PLANTING_PALETTES[0];
        const bed = normalizePlantingBed(lawn
            ? { id: newId('lawn'), name, ...shape, kind: 'lawn', lawn: { ...LAWN_DEFAULT, angle: lawnAngleFor(shape.points) }, seed: newSeed() }
            : { id: newId('bed'), name, ...shape, recipe: paletteRecipe(palette, library), drift: palette.drift ?? PLANTING_BED_DEFAULT.drift, density: 1, seed: newSeed() }, settings.plantingBeds.length);
        if (!bed) return;
        applyBeds([...settings.plantingBeds, bed]);
        setSelectedId(bed.id);
    }, [applyBeds]);
    const onBed = useCallback((points, y) => addBed({ points, y }), [addBed]);
    const onBedSurface = useCallback(({ outer, holes, y, ground }) => addBed({ points: outer, holes, y, ground, surface: true }), [addBed]);

    const onPlant = useCallback(([x, y, z]) => {
        const { settings, history, plantChoice, plantStatus, library } = live.current;
        if (settings.plantingPoints.length >= PLANTING_LIMITS.points || !library.has(plantChoice)) return;
        const point = normalizePlantingPoint({ id: newId('plant'), plant: plantChoice, x, y, z, seed: newSeed(), status: plantStatus }, settings.plantingPoints.length);
        history.applySettings({ plantingEnabled: true, plantingPoints: [...settings.plantingPoints, point] });
    }, []);

    // Лиана — мазок кистью (PlantingBrush, vine): новое растение или побег
    // той, у чьего корня мазок начат.
    const vines = settings.plantingVines ?? [];
    const applyVines = useCallback((next) => live.current.history.applySettings({ plantingEnabled: true, plantingVines: next }), []);
    const onVine = useCallback((samples) => {
        const { settings, vineChoice, library } = live.current;
        if (library.size && !library.has(vineChoice)) return;
        const list = settings.plantingVines ?? [];
        const start = samples[0];
        const near = list.find((vine) => vine.plant === vineChoice && vine.shoots.length < PLANTING_LIMITS.shoots
            && Math.hypot(...vineRoot(vine).map((value, i) => value - start[i])) < JOIN);
        if (near) {
            applyVines(list.map((vine, index) => (vine === near ? normalizePlantingVine({ ...vine, shoots: [...vine.shoots, samples] }, index) : vine)));
            setVineId(near.id);
        } else {
            if (list.length >= PLANTING_LIMITS.vines) return;
            const vine = normalizePlantingVine({ id: newId('vine'), plant: vineChoice, shoots: [samples], seed: newSeed() }, list.length);
            if (!vine) return;
            applyVines([...list, vine]);
            setVineId(vine.id);
        }
        setSelectedId(null);
    }, [applyVines]);
    const selectVine = useCallback((id) => { setVineId(id); setSelectedId(null); setActiveTab(PLANTING_NODE); setTool('select'); }, [setActiveTab, setTool]);
    const updateVine = useCallback((id, patch) => {
        applyVines((live.current.settings.plantingVines ?? []).map((vine, index) => (vine.id === id ? normalizePlantingVine({ ...vine, ...patch }, index) : vine)));
    }, [applyVines]);
    const removeVine = useCallback((id) => { applyVines((live.current.settings.plantingVines ?? []).filter((vine) => vine.id !== id)); setVineId(null); }, [applyVines]);

    const removeBed = useCallback((id) => { applyBeds(live.current.settings.plantingBeds.filter((bed) => bed.id !== id)); setSelectedId(null); }, [applyBeds]);
    const removeLastPoint = useCallback(() => {
        const { settings, history } = live.current;
        history.applySettings({ plantingPoints: settings.plantingPoints.slice(0, -1) });
    }, []);
    const applyPalette = useCallback((id, paletteId) => {
        const palette = PLANTING_PALETTES.find((item) => item.id === paletteId);
        if (palette) updateBed(id, { recipe: paletteRecipe(palette, live.current.library), drift: palette.drift ?? PLANTING_BED_DEFAULT.drift });
    }, [updateBed]);

    return {
        selectedId: beds.some((bed) => bed.id === selectedId) ? selectedId : null,
        select, updateBed, removeBed, applyPalette, onBed, onBedSurface, onPlant, removeLastPoint,
        reseed: (id) => updateBed(id, { seed: newSeed() }),
        plantChoice, setPlantChoice, plantStatus, setPlantStatus,
        vineId: vines.some((vine) => vine.id === vineId) ? vineId : null,
        vineChoice, setVineChoice, onVine, selectVine, updateVine, removeVine,
        reseedVine: (id) => updateVine(id, { seed: newSeed() }),
        mode: tool === 'bed' || tool === 'plant' || tool === 'vine' ? tool : null,
        bedKind,
        begin: (next) => { setActiveTab(PLANTING_NODE); setBedKind('bed'); setTool(next); },
        beginLawn: () => { setActiveTab(PLANTING_NODE); setBedKind('lawn'); setTool('bed'); },
        stop: () => setTool('select'),
    };
}
