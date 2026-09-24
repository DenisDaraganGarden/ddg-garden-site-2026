// Материалы модели, заменённые материалами библиотеки
// (~/Ouroboros/library/materials, scripts/materials.mjs): по объекту
// расстановки и имени материала SketchUp — какой материал библиотеки, какой
// размер плитки и насколько сильны рельеф и матовость. Одно на все камеры
// (ключа нет в publishedHomeSceneKeys): модели на сайт не уезжают, а
// библиотека живёт на этом компьютере.
//
//   modelMaterials: { <placedId>: { <имя материала>: { material, tile, normal, roughness } } }
//
// tile — метров на одну плитку; null — как лежала текстура в SketchUp
// (карты к текущей текстуре, без ИИ). projection — раскладка: 'uv' — как в
// SketchUp (его поворот и сдвиг текстуры), 'box' — прямо по граням модели:
// волокно досок вертикально на стенах, как бы ни была развёрнута текстура.
export const MATERIAL_RANGES = Object.freeze({ tile: [0.05, 50, 0.01], normal: [0, 3, 0.05], roughness: [0, 2, 0.05] });
export const DEFAULT_MATERIAL_SETTINGS = Object.freeze({ modelMaterials: {} });
export const MATERIAL_LIMITS = Object.freeze({ models: 64, materials: 256 });

const PLACED_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const LIBRARY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const within = (value, [min, max], fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.min(max, Math.max(min, number)) * 1000) / 1000 : fallback;
};

export function normalizeMaterialOverride(value) {
    if (!value || !LIBRARY_ID.test(String(value.material ?? ''))) return null;
    return {
        material: value.material,
        tile: value.tile === null || value.tile === undefined ? null : within(value.tile, MATERIAL_RANGES.tile, 1),
        normal: within(value.normal, MATERIAL_RANGES.normal, 1),
        roughness: within(value.roughness, MATERIAL_RANGES.roughness, 1),
        ...(value.projection === 'box' ? { projection: 'box' } : {}),
    };
}

export function normalizeMaterialSettings(settings = {}) {
    const source = settings.modelMaterials && typeof settings.modelMaterials === 'object' && !Array.isArray(settings.modelMaterials) ? settings.modelMaterials : {};
    const modelMaterials = {};
    for (const [placedId, materials] of Object.entries(source).slice(0, MATERIAL_LIMITS.models)) {
        if (!PLACED_ID.test(placedId) || !materials || typeof materials !== 'object') continue;
        const kept = Object.entries(materials).slice(0, MATERIAL_LIMITS.materials)
            .map(([name, value]) => [String(name).slice(0, 160), normalizeMaterialOverride(value)])
            .filter(([name, value]) => name && value);
        if (kept.length) modelMaterials[placedId] = Object.fromEntries(kept);
    }
    return { modelMaterials };
}
