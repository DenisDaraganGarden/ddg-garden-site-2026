// Paths and dimensions are metres. Only compact author data enters snapshots.
export const TOPIARY_LIMITS = Object.freeze({ objects: 32, points: 256, span: 80, cards: 12000, totalCards: 80000 });
export const TOPIARY_RANGES = Object.freeze({
    width: [.3, 8, .05], height: [.3, 12, .05], density: [.1, 1, .01],
    leafSize: [.14, .55, .01], roundness: [0, 1, .01],
    roughness: [.35, 1, .01], translucency: [0, 1.4, .05],
    baseY: [-20, 40, .05], x: [-1200, 1200, .1], z: [-1200, 1200, .1],
    rotation: [-180, 180, 1], scale: [.25, 4, .05],
});
export const TOPIARY_DEFAULT = Object.freeze({ width: 1.2, height: 2.4, density: .8, leafSize: .28, roundness: .55, roughness: .73, translucency: .7, baseY: 0, x: 0, z: 0, rotation: 0, scale: 1, foliageVisible: true, fenceStyle: 'none', fenceSmooth: false });
export const TOPIARY_FENCE_STYLES = Object.freeze(['none', 'mesh-2d', 'mesh-358', 'palisade']);
// Изгородь в ведомости: растение из библиотеки (plant — id записи) и сколько
// его сажают на погонный метр (perMetre, шт/п.м.; ряды и шаг — выбор
// проектировщика, поэтому у изгороди, а не в карточке). Без них — только п.м.
export const HEDGE_PER_METRE = Object.freeze([0, 12, .5]);
// Длина линии формы в её системе, до масштаба.
export const lineLength = (points) => points.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - points[i][0], z - points[i][1]), 0);
const PLANT = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const DEFAULT_TOPIARY_SETTINGS = Object.freeze({ topiaryEnabled: true, topiaryObjects: [], topiaryBrushWidth: 1.2, topiaryBrushHeight: 2.4, topiaryPlaneY: 0 });
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function normalizeTopiaryObject(value, index = 0) {
    if (!value || !Array.isArray(value.points)) return null;
    const points = value.points.slice(0, TOPIARY_LIMITS.points).filter(p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite))
        .map(p => p.slice(0, 2).map(v => Math.round(Math.min(TOPIARY_LIMITS.span, Math.max(-TOPIARY_LIMITS.span, v)) * 1000) / 1000));
    if (!points.length) return null;
    const result = { id: String(value.id || `hedge-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `hedge-${index}`, name: String(value.name || `Topiary ${index + 1}`).slice(0, 64), points,
        seed: Math.round(number(value.seed, index + 17, 1, 1e7)) };
    for (const [key, [min, max]] of Object.entries(TOPIARY_RANGES)) result[key] = number(value[key], TOPIARY_DEFAULT[key], min, max);
    result.foliageVisible = value.foliageVisible !== false;
    result.fenceStyle = TOPIARY_FENCE_STYLES.includes(value.fenceStyle) ? value.fenceStyle : 'none';
    result.fenceSmooth = value.fenceSmooth === true;
    if (PLANT.test(String(value.plant ?? ''))) result.plant = value.plant;
    const perMetre = Math.round(number(value.perMetre, 0, HEDGE_PER_METRE[0], HEDGE_PER_METRE[1]) * 2) / 2;
    if (perMetre > 0) result.perMetre = perMetre;
    return result;
}
export function normalizeTopiarySettings(settings = {}) {
    const ids = new Set();
    const objects = (Array.isArray(settings.topiaryObjects) ? settings.topiaryObjects : []).slice(0, TOPIARY_LIMITS.objects)
        .map(normalizeTopiaryObject).filter(Boolean).map((object, index) => {
            const base = object.id; let suffix = index;
            while (ids.has(object.id)) object.id = `${base.slice(0, 54)}-${suffix++}`;
            ids.add(object.id); return object;
        });
    return { topiaryEnabled: settings.topiaryEnabled !== false, topiaryObjects: objects,
        topiaryBrushWidth: number(settings.topiaryBrushWidth, 1.2, .3, 8),
        topiaryBrushHeight: number(settings.topiaryBrushHeight, 2.4, .3, 12),
        topiaryPlaneY: number(settings.topiaryPlaneY, 0, -20, 40) };
}
export function createTopiaryStroke(worldPoints, settings, name) {
    const [x, z] = worldPoints[0];
    return normalizeTopiaryObject({ ...TOPIARY_DEFAULT, id: `hedge-${crypto.randomUUID()}`, name, seed: Math.floor(Math.random() * 1e7) + 1,
        width: settings.topiaryBrushWidth, height: settings.topiaryBrushHeight, baseY: settings.topiaryPlaneY,
        x, z, points: worldPoints.map(p => [p[0] - x, p[1] - z]) });
}
