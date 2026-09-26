// Metres. Distribution belongs to the bed; month remains owned by the camera.
export const COVER_DEFAULT = Object.freeze({ enabled: true, leaf: .55, thyme: .15, density: 1, leafSize: .14, height: .12, patches: 1.2, edge: .16, moisture: .65, shade: .7, climate: 'temperate' });
export const COVER_RANGES = Object.freeze({ leaf: [0, 1, .05], thyme: [0, 1, .05], density: [.4, 1.6, .05], leafSize: [.07, .24, .01], height: [.04, .24, .01], patches: [.3, 4, .1], edge: [0, .5, .01], moisture: [0, 1, .05], shade: [0, 1, .05] });
export const COVER_PRESETS = Object.freeze({
    woodland: { ru: 'Лесной · копытник и мох', en: 'Woodland · ginger and moss', values: { leaf: .72, thyme: 0, moisture: .8, shade: .85 } },
    moss: { ru: 'Мох', en: 'Moss', values: { leaf: 0, thyme: 0, moisture: .85, shade: .8 } },
    flowering: { ru: 'Цветущий · тимьян', en: 'Flowering · thyme', values: { leaf: 0, thyme: .92, moisture: .35, shade: .15 } },
    mixed: { ru: 'Смешанный', en: 'Mixed', values: { leaf: .5, thyme: .25, moisture: .6, shade: .55 } },
});
export function normalizeCover(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const out = { enabled: value.enabled !== false, climate: ['temperate', 'cold', 'mild'].includes(value.climate) ? value.climate : 'temperate' };
    for (const [key, [min, max]] of Object.entries(COVER_RANGES)) {
        const n = Number(value[key]); out[key] = Math.round(Math.min(max, Math.max(min, Number.isFinite(n) ? n : COVER_DEFAULT[key])) * 1000) / 1000;
    }
    if (out.leaf + out.thyme > 1) { const sum = out.leaf + out.thyme; out.leaf /= sum; out.thyme /= sum; }
    return out;
}
export function coverSeason(month, cover) {
    month = Math.min(12, Math.max(1, Number(month) || 6));
    const shift = cover.climate === 'cold' ? 1 : cover.climate === 'mild' ? -1 : 0;
    const m = ((month - shift - 1 + 12) % 12) + 1;
    const bloom = Math.max(0, 1 - Math.abs(m - 6.5) / 1.8);
    const winter = (m <= 2 || m >= 11 ? 1 : m === 3 || m === 10 ? .4 : 0) * (cover.climate === 'mild' ? .15 : 1);
    const drought = Math.max(0, 1 - Math.abs(m - 8) / 2) * (1 - cover.moisture);
    return { bloom, winter, drought, fresh: m >= 4 && m <= 5 ? 1 : 0 };
}

// A reference to one receiver, not a raycast against everything above the bed.
export function normalizeCoverSurface(value) {
    if (value?.root === 'terrain') return { root: 'terrain' };
    if (!value || typeof value.root !== 'string' || !/^placed-/.test(value.root) || !Array.isArray(value.path) || value.path.length > 64) return null;
    const path = value.path.filter((v) => Number.isInteger(v) && v >= 0 && v < 100000);
    return path.length === value.path.length && Number.isInteger(value.face) && value.face >= 0
        ? { root: value.root.slice(0, 160), path, face: value.face } : null;
}
