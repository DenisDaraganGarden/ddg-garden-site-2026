import { useCallback, useEffect, useRef, useState } from 'react';
import { LAWN_DEFAULT, normalizePlantingBed, normalizePlantingPoint, normalizePlantingVine, PLANTING_BED_DEFAULT, PLANTING_LIMITS } from './settings.js';
import { lawnAngleFor } from './lawnGround.js';
import { PLANTING_PALETTES } from './palettes.js';
import { vineRoot } from './vines.js';
import { bedAnchor, moveBed as shiftBed, spacingFor } from './fillBed.js';
import { bedFill } from './plantLibrary.js';

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
        const lawn = kind === 'lawn', cover = kind === 'cover', ru = language === 'ru';
        const used = new Set(settings.plantingBeds.map((bed) => bed.name));
        let n = 1, name;
        do { name = `${lawn ? (ru ? 'Газон' : 'Lawn') : cover ? (ru ? 'Почвопокров' : 'Groundcover') : (ru ? 'Цветник' : 'Bed')} ${n++}`; } while (used.has(name));
        const palette = PLANTING_PALETTES[0];
        const bed = normalizePlantingBed(lawn
            ? { id: newId('lawn'), name, ...shape, kind: 'lawn', lawn: { ...LAWN_DEFAULT, angle: lawnAngleFor(shape.points) }, seed: newSeed() }
            : cover ? { id: newId('cover'), name, ...shape, kind: 'cover', cover: {}, seed: newSeed() }
            : { id: newId('bed'), name, ...shape, recipe: paletteRecipe(palette, library), drift: palette.drift ?? PLANTING_BED_DEFAULT.drift, density: 1, seed: newSeed() }, settings.plantingBeds.length);
        if (!bed) return;
        applyBeds([...settings.plantingBeds, bed]);
        setSelectedId(bed.id);
    }, [applyBeds]);
    const onBed = useCallback((points, y, coverSurface) => addBed({ points, y, coverSurface }), [addBed]);
    const onBedSurface = useCallback(({ outer, holes, y, ground, coverSurface }) => addBed({ points: outer, holes, y, ground, coverSurface, surface: true }), [addBed]);

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

    // Внутри цветника (двойной щелчок по нему): щелчок выбирает растение,
    // Delete убирает, «Перенос» двигает, Esc выходит — как части модели
    // SketchUp. Правки пишутся в bed.edits от опорной точки (fillBed.js).
    const [inside, setInside] = useState(null);
    const [plantKey, setPlantKey] = useState(null);
    live.current.inside = inside;
    live.current.plantKey = plantKey;
    const insideBed = beds.find((bed) => bed.id === inside && bed.id === selectedId && (!bed.kind || bed.kind === 'bed')) ?? null;
    const enterBed = useCallback((id) => { setSelectedId(id); setVineId(null); setInside(id); setPlantKey(null); setActiveTab(PLANTING_NODE); setTool('select'); }, [setActiveTab, setTool]);
    const exitBed = useCallback(() => { setPlantKey(null); setInside(null); }, []);
    // Щелчок мимо и пробел: ни цветника, ни лианы, из цветника — наружу.
    const deselect = useCallback(() => { setSelectedId(null); setVineId(null); setPlantKey(null); setInside(null); }, []);
    const plantAt = (bed, key) => (key ? bedFill(bed, live.current.library).find((plant) => plant.key === key) ?? null : null);
    const pickPlant = useCallback(([x, , z]) => {
        const { settings, library, inside: id } = live.current;
        const bed = settings.plantingBeds.find((item) => item.id === id);
        if (!bed) return;
        let best = null, distance = Infinity;
        for (const plant of bedFill(bed, library)) {
            const d = Math.hypot(plant.x - x, plant.z - z);
            if (d < distance) { distance = d; best = plant; }
        }
        // Дальше половины шага от растения — щелчок по земле, выбор снимается.
        const reach = best ? Math.max(0.12, spacingFor((library.get(best.plant)?.density ?? 4) * bed.density) * 0.6) : 0;
        setPlantKey(best && distance <= reach ? best.key : null);
    }, []);
    const editBed = (change) => {
        const { settings, inside: id, plantKey: key } = live.current;
        const bed = settings.plantingBeds.find((item) => item.id === id), plant = bed && plantAt(bed, key);
        if (!plant) return;
        const [ax, az] = bedAnchor(bed), [ox, oz] = plant.origin ?? [plant.x, plant.z];
        const from = { k: plant.key, x: Math.round((ox - ax) * 1000) / 1000, z: Math.round((oz - az) * 1000) / 1000 };
        const edits = bed.edits ?? {}, others = (list) => (list ?? []).filter((item) => item.k !== plant.key);
        updateBed(bed.id, { edits: change(edits, others, from, [ax, az]) });
    };
    const removePlant = useCallback(() => {
        editBed((edits, others, from) => ({ removed: [...others(edits.removed), from], moved: others(edits.moved) }));
        setPlantKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editBed читает live
    }, [updateBed]);
    const movePlant = useCallback((x, z) => {
        editBed((edits, others, from, [ax, az]) => ({ removed: edits.removed ?? [], moved: [...others(edits.moved), { ...from, to: [x - ax, z - az] }] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editBed читает live
    }, [updateBed]);
    // Весь цветник: опорная точка — в новое место (цветник на поверхности
    // модели не переносится, moveBed его не трогает).
    const moveBedTo = useCallback((id, x, z) => {
        const { settings } = live.current;
        const bed = settings.plantingBeds.find((item) => item.id === id);
        if (!bed || bed.surface) return;
        const [ax, az] = bedAnchor(bed);
        applyBeds(settings.plantingBeds.map((item) => (item.id === id ? shiftBed(item, x - ax, z - az) : item)));
    }, [applyBeds]);
    const selectedPlant = insideBed && plantKey ? plantAt(insideBed, plantKey) : null;
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
        select, deselect, updateBed, removeBed, applyPalette, onBed, onBedSurface, onPlant, removeLastPoint,
        inside: insideBed?.id ?? null, plantKey: selectedPlant ? plantKey : null, selectedPlant, enterBed, exitBed, pickPlant, removePlant, movePlant, moveBedTo,
        // Новая раскладка — ручным правкам не к чему приложиться: они уходят.
        reseed: (id) => updateBed(id, { seed: newSeed(), edits: null }),
        plantChoice, setPlantChoice, plantStatus, setPlantStatus,
        vineId: vines.some((vine) => vine.id === vineId) ? vineId : null,
        vineChoice, setVineChoice, onVine, selectVine, updateVine, removeVine,
        reseedVine: (id) => updateVine(id, { seed: newSeed() }),
        mode: tool === 'bed' || tool === 'plant' || tool === 'vine' ? tool : null,
        bedKind,
        begin: (next) => { setActiveTab(PLANTING_NODE); setBedKind('bed'); setTool(next); },
        beginCover: () => { setActiveTab(PLANTING_NODE); setBedKind('cover'); setTool('bed'); },
        beginLawn: () => { setActiveTab(PLANTING_NODE); setBedKind('lawn'); setTool('bed'); },
        stop: () => setTool('select'),
    };
}
