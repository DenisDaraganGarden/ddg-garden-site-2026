// Метры; Y вверх. Узлы и рёбра имеют постоянные id: разрыв не меняет
// соседние участки, выбор и ведомость не зависят от порядка в массиве.
export const FENCE_NODE = 'objects/fences';
export const FENCE_TYPES = {
    mesh: ['Сетка', 'Mesh'], timber: ['Дерево · вертикально', 'Timber · vertical'],
    boards: ['Дерево · горизонтально', 'Timber · horizontal'], metal: ['Металлические профили', 'Metal profiles'],
    concrete: ['Бетонная стена', 'Concrete wall'], brick: ['Кирпичная стена', 'Brick wall'], posts: ['Только столбы', 'Posts only'],
};
export const FENCE_DEFAULT = Object.freeze({
    type: 'mesh', height: 2, spacing: 2.5, alignment: 'axis', offset: 0, grade: 'slope', up: 'vertical',
    clearance: 0.05, thickness: 0.2, postWidth: 0.06, postDepth: 0.04, postWall: 0.002,
    postKind: 'metal', postExtra: 0.08, postEnabled: true, caps: true, capHeight: 0.03, capOverhang: 0.01,
    memberWidth: 0.1, memberDepth: 0.025, memberGap: 0.04, memberWall: 0.002,
    railWidth: 0.04, railDepth: 0.02, railWall: 0.002, railCount: 2, wire: 0.004, cellWidth: 0.05, cellHeight: 0.15,
    panelMaterial: '', postMaterial: '', capMaterial: '', railMaterial: '', tile: 1,
});
export const TYPE_DEFAULTS = {
    mesh: { postKind: 'metal', postWidth: .06, postDepth: .04, postWall: .002 },
    timber: { postKind: 'timber', postWidth: .1, postDepth: .1, memberWidth: .1, memberDepth: .025 },
    boards: { postKind: 'timber', postWidth: .1, postDepth: .1, memberWidth: .15, memberDepth: .025 },
    metal: { postKind: 'metal', postWidth: .06, postDepth: .06, memberWidth: .04, memberDepth: .02 },
    concrete: { postKind: 'concrete', postWidth: .3, postDepth: .3, thickness: .2, clearance: 0 },
    brick: { postKind: 'brick', postWidth: .38, postDepth: .38, thickness: .25, clearance: 0 },
    posts: { postKind: 'metal', postWidth: .06, postDepth: .06 },
};
// Каталог типоразмеров — отправная точка, а не проверка несущей способности.
// Любое поле остаётся числом со свободным вводом, включая высоту 10+ м.
export const STOCK_SECTIONS = [
    { id: 'steel-60-40', name: '60 × 40 × 2', kind: 'metal', width: .06, depth: .04, wall: .002 },
    { id: 'steel-60-60', name: '60 × 60 × 2', kind: 'metal', width: .06, depth: .06, wall: .002 },
    { id: 'steel-80-80', name: '80 × 80 × 3', kind: 'metal', width: .08, depth: .08, wall: .003 },
    { id: 'steel-100-100', name: '100 × 100 × 4', kind: 'metal', width: .1, depth: .1, wall: .004 },
    { id: 'wood-100', name: '100 × 100', kind: 'timber', width: .1, depth: .1, wall: 0 },
    { id: 'wood-150', name: '150 × 150', kind: 'timber', width: .15, depth: .15, wall: 0 },
];
export const STOCK_MEMBERS = [
    { id: 'tube-40-20', name: '40 × 20 × 2', width: .04, depth: .02, wall: .002 },
    { id: 'board-100-25', name: '100 × 25', width: .1, depth: .025, wall: 0 },
    { id: 'board-150-25', name: '150 × 25', width: .15, depth: .025, wall: 0 },
    { id: 'board-100-50', name: '100 × 50', width: .1, depth: .05, wall: 0 },
];
export const DEFAULT_FENCE_SETTINGS = Object.freeze({ fencesEnabled: true, fenceObjects: [] });
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const positive = (v, fallback, min = .0001) => Math.max(min, finite(v, fallback));
const oneOf = (v, values, fallback) => values.includes(v) ? v : fallback;
const point = (p) => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite) ? p.slice(0, 3) : null;
export const newFenceId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export function normalizeFenceStyle(value = {}) {
    const result = { ...value, ...FENCE_DEFAULT };
    for (const [key, fallback] of Object.entries(FENCE_DEFAULT)) {
        if (typeof fallback === 'number') result[key] = finite(value[key], fallback);
        if (key.endsWith('Material')) result[key] = typeof value[key] === 'string' && /^[a-zA-Z0-9_-]*$/.test(value[key]) ? value[key] : '';
    }
    for (const key of ['height', 'spacing', 'thickness', 'postWidth', 'postDepth', 'memberWidth', 'memberDepth', 'railWidth', 'railDepth', 'wire', 'cellWidth', 'cellHeight', 'tile']) result[key] = positive(result[key], FENCE_DEFAULT[key]);
    for (const key of ['postWall', 'memberWall', 'railWall', 'clearance', 'postExtra', 'capHeight', 'capOverhang', 'memberGap']) result[key] = Math.max(0, result[key]);
    result.railCount = Math.max(0, Math.round(result.railCount));
    result.type = Object.hasOwn(FENCE_TYPES, value.type) ? value.type : FENCE_DEFAULT.type;
    result.alignment = oneOf(value.alignment, ['axis', 'inside', 'outside'], 'axis');
    result.grade = oneOf(value.grade, ['slope', 'step', 'level'], 'slope');
    result.up = oneOf(value.up, ['vertical', 'normal'], 'vertical');
    result.postKind = oneOf(value.postKind, ['metal', 'timber', 'concrete', 'brick'], 'metal');
    result.caps = value.caps !== false;
    result.postEnabled = value.postEnabled !== false;
    return result;
}

export function normalizeFence(value, index = 0) {
    if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.segments)) return null;
    const seen = new Set();
    const nodes = value.nodes.flatMap((node, i) => {
        const p = point(node?.point), id = String(node?.id ?? `n${i}`);
        if (!p || seen.has(id)) return [];
        seen.add(id);
        const raw = point(node.normal) ?? [0, 1, 0], length = Math.hypot(...raw);
        return [{ ...node, id, point: p, normal: length > 1e-8 ? raw.map(v => v / length) : [0, 1, 0] }];
    });
    const edges = new Set();
    const segments = value.segments.flatMap((edge, i) => {
        const id = String(edge?.id ?? `s${i}`);
        if (!seen.has(edge?.a) || !seen.has(edge?.b) || edge.a === edge.b || edges.has(id)) return [];
        edges.add(id);
        const next = { ...edge, id, a: edge.a, b: edge.b, enabled: edge.enabled !== false, style: normalizeFenceStyle(edge.style) };
        delete next.controls;
        delete next.surface;
        if (Array.isArray(edge.controls) && edge.controls.length === 2 && edge.controls.every(point)) next.controls = edge.controls.map(point);
        if (Array.isArray(edge.surface)) {
            const samples = edge.surface.filter(p => Array.isArray(p) && p.length === 7 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 1).sort((a, b) => a[0] - b[0]);
            if (samples.length > 1) next.surface = samples;
        }
        return [next];
    });
    if (!segments.length) return null;
    return { ...value, id: String(value.id ?? `fence-${index}`), name: String(value.name ?? `Ограждение ${index + 1}`).slice(0, 120), nodes, segments };
}
export function normalizeFenceSettings(settings = {}) {
    const seen = new Set();
    return { fencesEnabled: settings.fencesEnabled !== false, fenceObjects: (Array.isArray(settings.fenceObjects) ? settings.fenceObjects : []).map(normalizeFence).filter(fence => {
        if (!fence || seen.has(fence.id)) return false;
        seen.add(fence.id); return true;
    }) };
}
export function createFence(samples, style = FENCE_DEFAULT, name = 'Ограждение', closed = false) {
    const nodes = samples.map(sample => ({ id: newFenceId('node'), point: sample.point, normal: sample.normal ?? [0, 1, 0] }));
    const segments = nodes.slice(0, closed ? undefined : -1).map((node, i) => ({ id: newFenceId('edge'), a: node.id, b: nodes[(i + 1) % nodes.length].id, enabled: true, style: { ...style } }));
    return normalizeFence({ id: newFenceId('fence'), name, nodes, segments });
}
