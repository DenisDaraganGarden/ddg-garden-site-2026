import { useCallback, useRef, useState } from 'react';
import { normalizePlantingBed, normalizePlantingPoint, PLANTING_BED_DEFAULT, PLANTING_LIMITS } from './settings.js';
import { PLANTING_PALETTES } from './palettes.js';

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
    const live = useRef();
    live.current = { settings, history, language, library, plantChoice, plantStatus };

    const beds = settings.plantingBeds ?? [];
    const applyBeds = useCallback((next) => live.current.history.applySettings({ plantingEnabled: true, plantingBeds: next }), []);
    const select = useCallback((id) => { setSelectedId(id); setActiveTab(PLANTING_NODE); setTool('select'); }, [setActiveTab, setTool]);

    const updateBed = useCallback((id, patch) => {
        const { settings } = live.current;
        applyBeds(settings.plantingBeds.map((bed, index) => (bed.id === id ? normalizePlantingBed({ ...bed, ...patch }, index) : bed)));
    }, [applyBeds]);

    // Новый цветник — контур от руки или поверхность модели (holes, ground,
    // surface — surfacePick.js); засаживается первой палитрой.
    const addBed = useCallback((shape) => {
        const { settings, language, library } = live.current;
        if (settings.plantingBeds.length >= PLANTING_LIMITS.beds) return;
        const used = new Set(settings.plantingBeds.map((bed) => bed.name));
        let n = 1, name;
        do { name = `${language === 'ru' ? 'Цветник' : 'Bed'} ${n++}`; } while (used.has(name));
        const palette = PLANTING_PALETTES[0];
        const bed = normalizePlantingBed({ id: newId('bed'), name, ...shape, recipe: paletteRecipe(palette, library), drift: palette.drift ?? PLANTING_BED_DEFAULT.drift, density: 1, seed: newSeed() }, settings.plantingBeds.length);
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
        mode: tool === 'bed' || tool === 'plant' ? tool : null,
        begin: (next) => { setActiveTab(PLANTING_NODE); setTool(next); },
        stop: () => setTool('select'),
    };
}
