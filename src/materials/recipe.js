// Один каталог для генератора, библиотеки и лаборатории. Категория — материал,
// рецепт — способ получить карты; сохранённые рецепты не зависят от пресета.
export const MATERIAL_CATEGORIES = [
    ['other', 'Другое', 'Other'], ['stone', 'Камень', 'Stone'],
    ['brick', 'Кирпич', 'Brick'], ['tile', 'Плитка', 'Tile'],
    ['wood', 'Дерево', 'Wood'], ['concrete', 'Бетон', 'Concrete'],
    ['plaster', 'Штукатурка', 'Plaster'], ['metal', 'Металл', 'Metal'],
    ['ground', 'Грунт и покрытия', 'Ground & paving'], ['fabric', 'Ткань', 'Fabric'],
];
const CATEGORY_IDS = new Set(MATERIAL_CATEGORIES.map(([id]) => id));
const PRESETS = {
    other: { heightMode: 'detail', depth: 1, roughness: 0.65, variation: 0.08, ao: 0.35, metalness: 0 },
    stone: { heightMode: 'detail', depth: 4, roughness: 0.8, variation: 0.12, ao: 0.5 },
    brick: { heightMode: 'luminance', depth: 5, roughness: 0.82, variation: 0.08, ao: 0.6 },
    tile: { heightMode: 'flat', depth: 1, roughness: 0.3, variation: 0.02, ao: 0.3 },
    wood: { heightMode: 'detail', depth: 0.6, roughness: 0.55, variation: 0.1, ao: 0.3 },
    concrete: { heightMode: 'detail', depth: 0.4, roughness: 0.7, variation: 0.06, ao: 0.2 },
    plaster: { heightMode: 'detail', depth: 0.5, roughness: 0.88, variation: 0.03, ao: 0.2 },
    metal: { heightMode: 'flat', depth: 0.1, roughness: 0.35, variation: 0.02, ao: 0, metalness: 1 },
    ground: { heightMode: 'detail', depth: 6, roughness: 0.92, variation: 0.06, ao: 0.5 },
    fabric: { heightMode: 'detail', depth: 0.5, roughness: 0.9, variation: 0.04, ao: 0.2 },
};
export const categoryOf = (entry) => {
    if (CATEGORY_IDS.has(entry?.category)) return entry.category;
    const text = `${entry?.name ?? ''} ${entry?.description ?? ''}`.toLowerCase();
    for (const [id, pattern] of [
        ['tile', /плитк|керам|ceramic|porcelain|tile/], ['brick', /кирпич|brick/],
        ['wood', /дерев|дуб|ясен|листвен|планкен|wood|oak|timber|larch/],
        ['concrete', /бетон|concrete/], ['plaster', /штукатур|plaster|stucco/],
        ['metal', /металл|metal|steel|alumin/], ['stone', /камень|камен|мрамор|гранит|stone|marble|granite/],
        ['ground', /грунт|асфальт|гравий|песок|gravel|asphalt|soil|sand/], ['fabric', /ткан|fabric|textile/],
    ]) if (pattern.test(text)) return id;
    return 'other';
};
const number = (value, min, max, fallback) => value === null || value === '' || !Number.isFinite(Number(value))
    ? fallback : Math.min(max, Math.max(min, Number(value)));
export const recipeFor = (category) => ({ ...PRESETS.other, ...PRESETS[category], smoothing: 0.5, invert: false });
export function normalizeRecipe(value = {}, category = 'other') {
    value = value && typeof value === 'object' ? value : {};
    const base = recipeFor(category);
    return {
        heightMode: ['flat', 'detail', 'luminance', 'file', 'ai'].includes(value.heightMode) ? value.heightMode : base.heightMode,
        depth: number(value.depth, 0, 100, base.depth), // millimetres, white minus black
        smoothing: number(value.smoothing, 0, 4, base.smoothing),
        roughness: number(value.roughness, 0.02, 1, base.roughness),
        variation: number(value.variation, 0, 0.5, base.variation),
        ao: number(value.ao, 0, 2, base.ao),
        metalness: number(value.metalness, 0, 1, base.metalness),
        invert: value.invert === true,
    };
}
export const materialSize = (entry, fallback = [1, 1]) => [
    number(entry?.tile, 0.05, 50, number(fallback?.[0], 0.05, 50, 1)),
    number(entry?.tileY ?? entry?.tile, 0.05, 50, number(fallback?.[1], 0.05, 50, 1)),
];
export const MAP_FILES = [
    ['albedo', 'Цвет', 'Colour', 'albedo.webp'], ['normal', 'Нормали', 'Normals', 'normal.png'],
    ['height', 'Высота', 'Height', 'height.png'], ['roughness', 'Матовость', 'Roughness', 'roughness.webp'],
    ['ao', 'Затенение', 'Occlusion', 'ao.webp'],
];
