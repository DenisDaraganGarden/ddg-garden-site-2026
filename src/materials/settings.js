// Материалы модели, заменённые материалами библиотеки
// (~/Ouroboros/library/materials, scripts/materials.mjs): по объекту
// расстановки и имени материала SketchUp — какой материал библиотеки, какой
// размер плитки и насколько сильны рельеф и матовость. Одно на все камеры
// (ключа нет в publishedHomeSceneKeys): модели на сайт не уезжают, а
// библиотека живёт на этом компьютере.
//
//   modelMaterials: { <placedId>: { <имя материала>: { material, tile, normal, roughness, projection?, glass? } } }
//
// tile — метров на одну плитку; null — как лежала текстура в SketchUp
// (карты к текущей текстуре, без ИИ). projection — раскладка: 'uv' — как в
// SketchUp (его поворот и сдвиг текстуры), 'box' — прямо по граням модели:
// волокно досок вертикально на стенах, как бы ни была развёрнута текстура.
// glass — своё слово о стекле (glass.js): on — стекло или нет (без записи
// стекло узнаётся само), прозрачность, матовость, отражение, оттенок (null —
// цвет SketchUp). Запись может быть только про стекло, без материала библиотеки.
// faces — подмены по граням (modelMaterials.js): [{ faces: ['up'|'down'|'side'],
// y?: [от, до] (метры модели), skip?: [начала имён частей], material, tile,
// normal, roughness }] — первое подходящее правило красит грань своим
// материалом прямо по граням; запись может быть только из правил.
export const MATERIAL_RANGES = Object.freeze({
    tile: [0.05, 50, 0.01], normal: [0, 3, 0.05], roughness: [0, 2, 0.05],
    clarity: [0, 1, 0.01], frost: [0, 1, 0.01], reflect: [0, 3, 0.05],
});
export const DEFAULT_MATERIAL_SETTINGS = Object.freeze({ modelMaterials: {} });
export const MATERIAL_LIMITS = Object.freeze({ models: 64, materials: 256, faces: 8 });
const FACE_SIDES = ['up', 'down', 'side'];

const PLACED_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const LIBRARY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const within = (value, [min, max], fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.min(max, Math.max(min, number)) * 1000) / 1000 : fallback;
};

export function normalizeGlass(value) {
    if (!value || typeof value !== 'object') return null;
    return {
        on: value.on !== false,
        clarity: within(value.clarity, MATERIAL_RANGES.clarity, 0.6),
        frost: within(value.frost, MATERIAL_RANGES.frost, 0.03),
        reflect: within(value.reflect, MATERIAL_RANGES.reflect, 2),
        tint: /^#[0-9a-f]{6}$/i.test(String(value.tint ?? '')) ? String(value.tint).toLowerCase() : null,
    };
}

export function normalizeFaceRule(rule) {
    if (!rule || typeof rule !== 'object' || !LIBRARY_ID.test(String(rule.material ?? ''))) return null;
    const faces = FACE_SIDES.filter((side) => [rule.faces].flat().includes(side));
    if (!faces.length) return null;
    const y = Array.isArray(rule.y) && rule.y.length === 2 && rule.y.every((value) => Number.isFinite(Number(value)))
        ? [Math.min(Number(rule.y[0]), Number(rule.y[1])), Math.max(Number(rule.y[0]), Number(rule.y[1]))] : null;
    const skip = (Array.isArray(rule.skip) ? rule.skip : []).map((name) => String(name).slice(0, 80)).filter(Boolean).slice(0, 8);
    return {
        faces, material: rule.material,
        tile: within(rule.tile, MATERIAL_RANGES.tile, 1), normal: within(rule.normal, MATERIAL_RANGES.normal, 1), roughness: within(rule.roughness, MATERIAL_RANGES.roughness, 1),
        ...(y ? { y } : {}), ...(skip.length ? { skip } : {}),
    };
}

export function normalizeMaterialOverride(value) {
    if (!value || typeof value !== 'object') return null;
    const glass = normalizeGlass(value.glass);
    const faces = (Array.isArray(value.faces) ? value.faces : []).slice(0, MATERIAL_LIMITS.faces).map(normalizeFaceRule).filter(Boolean);
    const library = LIBRARY_ID.test(String(value.material ?? '')) ? {
        material: value.material,
        tile: value.tile === null || value.tile === undefined ? null : within(value.tile, MATERIAL_RANGES.tile, 1),
        normal: within(value.normal, MATERIAL_RANGES.normal, 1),
        roughness: within(value.roughness, MATERIAL_RANGES.roughness, 1),
        ...(value.projection === 'box' ? { projection: 'box' } : {}),
    } : null;
    if (!library && !glass && !faces.length) return null;
    return { ...(library ?? {}), ...(glass ? { glass } : {}), ...(faces.length ? { faces } : {}) };
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
