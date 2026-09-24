// Посадки: цветники (контур на земле и рецепт — какие растения и в какой
// доле) и одиночные растения. Растения — записи библиотеки
// (~/Ouroboros/library/plants, scripts/plantLibrary.mjs), здесь только их id.
// Цветник хранит не растения, а правило: сколько и где — считает fillBed.js,
// одинаково при каждом открытии. Метры; y — высота земли, на которой контур
// нарисован. Цветники и одиночные растения общие для всех камер, как
// расстановка (sceneCameras.js их не снимает); месяц и план — у камеры свои,
// как время суток: «июнь» и «январь» — две камеры.
export const PLANTING_LIMITS = Object.freeze({ beds: 64, points: 400, recipe: 12, contour: 256, holes: 64, hole: 128, ground: 4400, plants: 30000 });
export const PLANTING_RANGES = Object.freeze({ drift: [0.3, 6, 0.1], density: [0.4, 2, 0.05], share: [1, 100, 1], month: [1, 12, 1] });
// northAngle — север участка (north.js): градусы по часовой от зелёной оси
// SketchUp; как и цветники, один на все камеры.
export const DEFAULT_PLANTING_SETTINGS = Object.freeze({ plantingEnabled: true, plantingBeds: [], plantingPoints: [], plantingMonth: 6, plantingPlan: false, northAngle: 0 });
export const PLANTING_BED_DEFAULT = Object.freeze({ drift: 1.6, density: 1 });

// Градусы в пределах −180…180.
export const wrapDegrees = (value) => ((((value + 180) % 360) + 360) % 360) - 180;

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const PLANT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SPAN = 1200;
const metres = (value) => Math.round(Math.min(SPAN, Math.max(-SPAN, value)) * 1000) / 1000;
const number = (value, fallback, [min, max, step]) => {
    const parsed = Number(value);
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    return step >= 1 ? Math.round(clamped) : Math.round(clamped * 1000) / 1000;
};
const finitePair = (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
const seedOf = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 1e7 ? Number(value) : fallback);

const ring = (list, limit) => (Array.isArray(list) ? list : []).filter(finitePair).slice(0, limit).map(([x, z]) => [metres(Number(x)), metres(Number(z))]);
const height = (value) => Math.round(Math.min(60, Math.max(-20, Number(value))) * 100) / 100;
// Сетка высот участка (цветник с поверхности модели на неровной земле):
// узлы через step метров от x0, z0; null — вне участка.
function normalizeGround(value) {
    if (!value || typeof value !== 'object') return null;
    const cols = Math.round(Number(value.cols)), rows = Math.round(Number(value.rows)), step = Number(value.step);
    if (!(cols >= 2 && rows >= 2 && cols * rows <= PLANTING_LIMITS.ground && step > 0.01 && step < 100) || !Array.isArray(value.h) || value.h.length !== cols * rows) return null;
    if (![value.x0, value.z0].every((v) => Number.isFinite(Number(v)))) return null;
    return { x0: metres(Number(value.x0)), z0: metres(Number(value.z0)), step: Math.round(step * 1000) / 1000, cols, rows, h: value.h.map((v) => (v === null || !Number.isFinite(Number(v)) ? null : height(v))) };
}

export function normalizePlantingBed(value, index = 0) {
    if (!value || !Array.isArray(value.points)) return null;
    const points = ring(value.points, PLANTING_LIMITS.contour);
    if (points.length < 3) return null;
    const holes = (Array.isArray(value.holes) ? value.holes : []).map((hole) => ring(hole, PLANTING_LIMITS.hole)).filter((hole) => hole.length >= 3).slice(0, PLANTING_LIMITS.holes);
    const ground = normalizeGround(value.ground);
    const seen = new Set();
    const recipe = (Array.isArray(value.recipe) ? value.recipe : [])
        .filter((row) => row && PLANT.test(String(row.plant ?? '')) && !seen.has(row.plant) && seen.add(row.plant))
        .slice(0, PLANTING_LIMITS.recipe)
        .map((row) => ({ plant: row.plant, share: number(row.share, 10, PLANTING_RANGES.share) }));
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `bed-${index}`,
        name: String(value.name || `Цветник ${index + 1}`).slice(0, 64),
        points,
        y: Number.isFinite(Number(value.y)) ? Math.round(Math.min(60, Math.max(-20, Number(value.y))) * 1000) / 1000 : 0,
        recipe,
        drift: number(value.drift, PLANTING_BED_DEFAULT.drift, PLANTING_RANGES.drift),
        density: number(value.density, PLANTING_BED_DEFAULT.density, PLANTING_RANGES.density),
        seed: seedOf(value.seed, index + 11),
        // С поверхности модели: земля уже есть в модели, своей мульчи не рисуется.
        ...(value.surface === true ? { surface: true } : {}),
        ...(holes.length ? { holes } : {}),
        ...(ground ? { ground } : {}),
    };
}

// Одиночное растение — новое (посадка по проекту) или существующее (растёт
// на участке, сохраняется): у существующего белая шапка с тёмным центром, как
// в легенде Дениса, и своя строка в обзоре. Новое — без поля.
export function normalizePlantingPoint(value, index = 0) {
    if (!value || !PLANT.test(String(value.plant ?? '')) || ![value.x, value.z].every((v) => Number.isFinite(Number(v)))) return null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `plant-${index}`,
        plant: value.plant,
        x: metres(Number(value.x)),
        y: Number.isFinite(Number(value.y)) ? Math.round(Math.min(60, Math.max(-20, Number(value.y))) * 1000) / 1000 : 0,
        z: metres(Number(value.z)),
        seed: seedOf(value.seed, index + 3),
        ...(value.status === 'existing' ? { status: 'existing' } : {}),
    };
}

const unique = (list, limit, normalize) => {
    const ids = new Set();
    return (Array.isArray(list) ? list : []).slice(0, limit).map(normalize).filter(Boolean).map((item, index) => {
        const base = item.id;
        let suffix = index;
        while (ids.has(item.id)) item.id = `${base.slice(0, 54)}-${suffix++}`;
        ids.add(item.id);
        return item;
    });
};

export function normalizePlantingSettings(settings = {}) {
    return {
        plantingEnabled: settings.plantingEnabled !== false,
        plantingBeds: unique(settings.plantingBeds, PLANTING_LIMITS.beds, normalizePlantingBed),
        plantingPoints: unique(settings.plantingPoints, PLANTING_LIMITS.points, normalizePlantingPoint),
        plantingMonth: number(settings.plantingMonth, DEFAULT_PLANTING_SETTINGS.plantingMonth, PLANTING_RANGES.month),
        plantingPlan: settings.plantingPlan === true,
        northAngle: wrapDegrees(number(settings.northAngle, 0, [-360, 360, 0.5])),
    };
}
