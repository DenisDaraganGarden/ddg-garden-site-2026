import { polygonArea, simplifyContour } from './fillBed.js';

// Контур от руки, обрезанный по поверхности модели: цветник ложится только
// на эту поверхность внутри контура. В «Ростове» вся кора — одна грань на
// 460 м² с газоном и дорожками в дырках; полоса у изгороди — её кусок, и
// отдельно её не выбрать ни здесь, ни в SketchUp. Грубо обвёл полосу —
// дорожка и газон, попавшие в обводку, остаются пустыми.
//
// Пересечение считается растром: контур и поверхность (с её дырками)
// заливаются построчно в сетку, из общей маски квадратами Марширующих
// квадратов снова собираются контуры — наружные и дырки. Кусков может быть
// несколько (обвёл две полосы разом) — каждый станет цветником.
const MAX_CELLS = 400000;

function fillRing(ring, mask, grid) {
    const { x0, z0, cell, cols, rows } = grid;
    const xs = [];
    for (let j = 0; j < rows; j += 1) {
        const z = z0 + (j + 0.5) * cell;
        xs.length = 0;
        for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
            const [ax, az] = ring[k], [bx, bz] = ring[i];
            if ((az > z) !== (bz > z)) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
        }
        xs.sort((a, b) => a - b);
        for (let p = 0; p + 1 < xs.length; p += 2) {
            const from = Math.max(0, Math.ceil((xs[p] - x0) / cell - 0.5)), to = Math.min(cols - 1, Math.floor((xs[p + 1] - x0) / cell - 0.5));
            for (let i = from; i <= to; i += 1) mask[j * cols + i] ^= 1;
        }
    }
}

// Марширующие квадраты по бинарной маске: отрезки между серединами рёбер,
// сцепленные в петли. Седло (5, 10) — всегда «раздельно».
const CASES = {
    1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['R', 'T']], 5: [['L', 'B'], ['R', 'T']], 6: [['B', 'T']], 7: [['L', 'T']],
    8: [['T', 'L']], 9: [['B', 'T']], 10: [['B', 'R'], ['T', 'L']], 11: [['R', 'T']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']],
};
function contours(mask, grid) {
    const { x0, z0, cell, cols, rows } = grid;
    const at = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? mask[j * cols + i] : 0);
    const links = new Map();
    const link = (p, q) => {
        if (!links.has(p)) links.set(p, []);
        if (!links.has(q)) links.set(q, []);
        links.get(p).push(q); links.get(q).push(p);
    };
    const edgeKey = (i, j, side) => (side === 'B' ? `h${i},${j}` : side === 'T' ? `h${i},${j + 1}` : side === 'L' ? `v${i},${j}` : `v${i + 1},${j}`);
    for (let j = -1; j < rows; j += 1) for (let i = -1; i < cols; i += 1) {
        const code = at(i, j) | (at(i + 1, j) << 1) | (at(i + 1, j + 1) << 2) | (at(i, j + 1) << 3);
        for (const [p, q] of CASES[code] ?? []) link(edgeKey(i, j, p), edgeKey(i, j, q));
    }
    // Середина ребра между центрами ячеек (i, j)–(i+1, j) или (i, j)–(i, j+1).
    const point = (key) => {
        const [i, j] = key.slice(1).split(',').map(Number);
        return key[0] === 'h' ? [x0 + (i + 1) * cell, z0 + (j + 0.5) * cell] : [x0 + (i + 0.5) * cell, z0 + (j + 1) * cell];
    };
    const used = new Set(), loops = [];
    for (const start of links.keys()) {
        if (used.has(start)) continue;
        const loop = [];
        let previous = null, current = start;
        while (current && !used.has(current)) {
            used.add(current);
            loop.push(point(current));
            const next = links.get(current).find((q) => q !== previous && !used.has(q));
            previous = current; current = next;
        }
        if (loop.length >= 4) loops.push(loop);
    }
    return loops;
}

const inside = (ring, [x, z]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i], [xj, zj] = ring[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
};

export function clipToSurface(lasso, surface, { minArea = 0.3 } = {}) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of lasso) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    let sx0 = Infinity, sz0 = Infinity, sx1 = -Infinity, sz1 = -Infinity;
    for (const [x, z] of surface.outer) { sx0 = Math.min(sx0, x); sz0 = Math.min(sz0, z); sx1 = Math.max(sx1, x); sz1 = Math.max(sz1, z); }
    x0 = Math.max(x0, sx0); z0 = Math.max(z0, sz0); x1 = Math.min(x1, sx1); z1 = Math.min(z1, sz1);
    if (!(x1 > x0 && z1 > z0)) return [];
    const cell = Math.max(0.05, Math.sqrt(((x1 - x0) * (z1 - z0)) / MAX_CELLS));
    const grid = { x0, z0, cell, cols: Math.ceil((x1 - x0) / cell), rows: Math.ceil((z1 - z0) / cell) };
    const hand = new Uint8Array(grid.cols * grid.rows), ground = new Uint8Array(grid.cols * grid.rows);
    fillRing(lasso, hand, grid);
    for (const ring of [surface.outer, ...(surface.holes ?? [])]) fillRing(ring, ground, grid);
    for (let k = 0; k < hand.length; k += 1) hand[k] &= ground[k];

    const loops = contours(hand, grid).map((loop) => simplifyContour(loop, 256, cell * 0.6)).filter((loop) => loop.length >= 3);
    loops.sort((a, b) => polygonArea(b) - polygonArea(a));
    // Глубина вложенности: чётная — наружный край, нечётная — дырка ближайшего.
    const pieces = [];
    loops.forEach((loop, index) => {
        const around = loops.slice(0, index).filter((other) => inside(other, loop[0]));
        if (around.length % 2 === 0) { pieces.push({ outer: loop, holes: [] }); return; }
        const parent = pieces.filter((piece) => inside(piece.outer, loop[0])).sort((a, b) => polygonArea(a.outer) - polygonArea(b.outer))[0];
        parent?.holes.push(loop);
    });
    return pieces
        .map((piece) => ({ ...piece, holes: piece.holes.slice(0, 64), area: polygonArea(piece.outer) - piece.holes.reduce((sum, hole) => sum + polygonArea(hole), 0) }))
        .filter((piece) => piece.area >= minArea);
}
