// Цветник по правилу: контур, рецепт (растение и его доля площади), размер
// пятна, густота и сид → список растений. Одинаковый при каждом открытии:
// ведомость считает ровно то, что нарисовано.
//
// Как в немецких смешанных посадках и у Уудольфа: цветник делится на пятна
// (ячейки Вороного вокруг точек на сетке с шагом «размер пятна», вытянутые
// вдоль длинной оси цветника), пятна раздаются видам в пропорции долей —
// точным числом, вперемешку, — и каждое пятно засаживается своим видом в
// шахматном порядке с его шагом: 1.155 / шаг² = шт/м² из записи растения.
// Крайний ряд — на трети шага от края, как на посадочном чертеже.
import { PLANTING_LIMITS } from './settings.js';
import { vineLength } from './vines.js';

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const polygonArea = (points) => Math.abs(points.reduce((sum, [x, z], i) => {
    const [x2, z2] = points[(i + 1) % points.length];
    return sum + x * z2 - x2 * z;
}, 0)) / 2;

export function insidePolygon(points, x, z) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, zi] = points[i], [xj, zj] = points[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
}

function edgeDistance(points, x, z) {
    let best = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, az] = points[j], [bx, bz] = points[i];
        const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
        const t = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
        best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return best;
}

// Цветник с дырками (поверхность модели: приствольные круги, дорожки внутри).
// У коры «Ростова» дырок за тридцать — каждую проверяют, только если точка
// рядом с её рамкой.
export const bedArea = (bed) => polygonArea(bed.points) - (bed.holes ?? []).reduce((sum, hole) => sum + polygonArea(hole), 0);
const frames = new WeakMap();
const holeFrames = (bed) => {
    if (!frames.has(bed)) frames.set(bed, (bed.holes ?? []).map((hole) => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [x, z] of hole) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
        return { hole, x0, z0, x1, z1 };
    }));
    return frames.get(bed);
};
const near = (frame, x, z, reach) => x >= frame.x0 - reach && x <= frame.x1 + reach && z >= frame.z0 - reach && z <= frame.z1 + reach;
export const insideBed = (bed, x, z) => insidePolygon(bed.points, x, z) && !holeFrames(bed).some((frame) => near(frame, x, z, 0) && insidePolygon(frame.hole, x, z));
const bedEdgeDistance = (bed, x, z, reach = Infinity) => Math.min(edgeDistance(bed.points, x, z), ...holeFrames(bed).filter((frame) => near(frame, x, z, reach)).map((frame) => edgeDistance(frame.hole, x, z)));

// Высота земли под точкой: по сетке высот участка (билинейно, пустые узлы —
// по соседним), без сетки — высота цветника.
export function groundAt(bed, x, z) {
    const g = bed.ground;
    if (!g) return bed.y;
    const fx = Math.min(g.cols - 1, Math.max(0, (x - g.x0) / g.step)), fz = Math.min(g.rows - 1, Math.max(0, (z - g.z0) / g.step));
    const i = Math.min(g.cols - 2, Math.floor(fx)), j = Math.min(g.rows - 2, Math.floor(fz)), u = fx - i, v = fz - j;
    const corners = [[i, j, (1 - u) * (1 - v)], [i + 1, j, u * (1 - v)], [i, j + 1, (1 - u) * v], [i + 1, j + 1, u * v]];
    let sum = 0, weight = 0;
    for (const [ci, cj, w] of corners) {
        const h = g.h[cj * g.cols + ci];
        if (h !== null && h !== undefined) { sum += h * w; weight += w; }
    }
    return weight > 1e-6 ? sum / weight : bed.y;
}

// Шахматная посадка: n = 2/√3 / шаг² ≈ 1.155 / шаг².
export const spacingFor = (density) => Math.sqrt(2 / Math.sqrt(3) / Math.max(1e-4, density));

// Длинная ось цветника — по разбросу точек контура.
function longAxis(points) {
    let cx = 0, cz = 0;
    for (const [x, z] of points) { cx += x; cz += z; }
    cx /= points.length; cz /= points.length;
    let xx = 0, xz = 0, zz = 0;
    for (const [x, z] of points) { xx += (x - cx) ** 2; xz += (x - cx) * (z - cz); zz += (z - cz) ** 2; }
    return 0.5 * Math.atan2(2 * xz, xx - zz);
}

// Точные количества по долям: наибольший остаток, и у каждой доли — хотя бы
// одно, пока хватает.
export function quotas(weights, total) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => (w / sum) * total);
    const out = raw.map(Math.floor);
    let rest = total - out.reduce((a, b) => a + b, 0);
    raw.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0]).forEach(([, index]) => { if (rest > 0) { out[index] += 1; rest -= 1; } });
    if (total >= weights.length) {
        for (let i = 0; i < out.length; i += 1) {
            if (out[i] > 0) continue;
            const donor = out.indexOf(Math.max(...out));
            if (out[donor] <= 1) break;
            out[donor] -= 1; out[i] += 1;
        }
    }
    return out;
}

const STRETCH = 1.8;

export function fillBed(bed, library) {
    // Газон — покрытие, а не посадка: растений в нём нет (lawnGround.js).
    if (bed.kind === 'lawn') return [];
    const recipe = bed.recipe.map((row) => ({ share: row.share, plant: library.get(row.plant) })).filter((row) => row.plant && row.share > 0);
    const points = bed.points;
    const area = bedArea(bed);
    if (!recipe.length || area < 0.05) return [];
    const random = mulberry32(bed.seed);

    // Пятна: сетка в системе цветника, сжатой вдоль длинной оси — ячейки
    // вытягиваются по ней, как полосы в миксбордере.
    const angle = longAxis(points), ca = Math.cos(angle), sa = Math.sin(angle);
    const frame = (x, z) => [(x * ca + z * sa) / STRETCH, -x * sa + z * ca];
    const size = Math.min(bed.drift, Math.sqrt(area / STRETCH / recipe.length));
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [x, z] of points) { const [u, v] = frame(x, z); u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const columns = Math.ceil((u1 - u0) / size) + 2, rows = Math.ceil((v1 - v0) / size) + 2;
    const seeds = [];
    for (let j = 0; j < rows; j += 1) for (let i = 0; i < columns; i += 1) {
        const u = u0 + (i - 0.5 + 0.15 + 0.7 * random()) * size, v = v0 + (j - 0.5 + 0.15 + 0.7 * random()) * size;
        const x = u * STRETCH * ca - v * sa, z = u * STRETCH * sa + v * ca;
        seeds.push({ u, v, inside: insideBed(bed, x, z), species: -1 });
    }
    const inside = seeds.filter((seed) => seed.inside);
    const counts = quotas(recipe.map((row) => row.share), inside.length);
    const deck = counts.flatMap((count, index) => Array(count).fill(index));
    for (let i = deck.length - 1; i > 0; i -= 1) { const k = Math.floor(random() * (i + 1)); [deck[i], deck[k]] = [deck[k], deck[i]]; }
    inside.forEach((seed, index) => { seed.species = deck[index]; });
    const total = recipe.reduce((sum, row) => sum + row.share, 0);
    for (const seed of seeds) {
        if (seed.species >= 0) continue;
        let pick = random() * total, index = 0;
        while (index < recipe.length - 1 && (pick -= recipe[index].share) > 0) index += 1;
        seed.species = index;
    }
    const speciesAt = (x, z) => {
        const [u, v] = frame(x, z);
        const ci = Math.floor((u - u0) / size + 0.5), cj = Math.floor((v - v0) / size + 0.5);
        let best = Infinity, species = 0;
        for (let j = cj - 1; j <= cj + 1; j += 1) for (let i = ci - 1; i <= ci + 1; i += 1) {
            const seed = seeds[j * columns + i];
            if (!seed || i < 0 || i >= columns) continue;
            const d = (seed.u - u) ** 2 + (seed.v - v) ** 2;
            if (d < best) { best = d; species = seed.species; }
        }
        return species;
    };

    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, reach = Math.hypot(x1 - x0, z1 - z0) / 2 + 1;
    const plants = [];
    recipe.forEach((row, species) => {
        const step = spacingFor(row.plant.density * bed.density), rowStep = step * Math.sqrt(3) / 2;
        const turn = random() * Math.PI, ct = Math.cos(turn), st = Math.sin(turn), shift = random() * step;
        for (let r = -Math.ceil(reach / rowStep); r <= Math.ceil(reach / rowStep); r += 1) {
            for (let c = -Math.ceil(reach / step) - 1; c <= Math.ceil(reach / step) + 1; c += 1) {
                if (plants.length >= PLANTING_LIMITS.plants) return;
                const a = c * step + (r % 2 ? step / 2 : 0) + shift + (random() - 0.5) * 0.3 * step;
                const b = r * rowStep + (random() - 0.5) * 0.3 * step;
                const x = cx + a * ct - b * st, z = cz + a * st + b * ct;
                const scale = 0.88 + 0.24 * random(), flip = random() < 0.5 ? -1 : 1;
                if (!insideBed(bed, x, z) || speciesAt(x, z) !== species || bedEdgeDistance(bed, x, z, step / 3) < step / 3) continue;
                plants.push({ plant: row.plant.id, x: Math.round(x * 1000) / 1000, y: Math.round(groundAt(bed, x, z) * 1000) / 1000, z: Math.round(z * 1000) / 1000, scale, flip });
            }
        }
    });
    return plants;
}

// Дуглас — Пекер: контур от руки редеет до сути, не больше предела точек.
// Контур замкнут — рука возвращается к началу, и хорда «начало — конец»
// нулевая: он делится на две дуги в самой дальней от начала точке.
export function simplifyContour(points, limit = PLANTING_LIMITS.contour, first = 0.04) {
    const reduce = (list, tolerance) => {
        if (list.length < 3) return list;
        const [ax, az] = list[0], [bx, bz] = list[list.length - 1];
        const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz) || 1;
        let far = 0, at = 0;
        for (let i = 1; i < list.length - 1; i += 1) {
            const d = Math.abs((list[i][0] - ax) * dz - (list[i][1] - az) * dx) / length;
            if (d > far) { far = d; at = i; }
        }
        if (far <= tolerance) return [list[0], list[list.length - 1]];
        return [...reduce(list.slice(0, at + 1), tolerance).slice(0, -1), ...reduce(list.slice(at), tolerance)];
    };
    const [x0, z0] = points[0];
    const split = points.reduce((best, [x, z], i) => (Math.hypot(x - x0, z - z0) > Math.hypot(points[best][0] - x0, points[best][1] - z0) ? i : best), 0);
    const closed = (tolerance) => [...reduce(points.slice(0, split + 1), tolerance).slice(0, -1), ...reduce([...points.slice(split), points[0]], tolerance).slice(0, -1)];
    let tolerance = first, result = closed(tolerance);
    while (result.length > limit) { tolerance *= 1.5; result = closed(tolerance); }
    return result;
}

// Растения по видам: цветники (по их заполнению) и одиночные.
export function plantingInstances(beds, bedFills, points) {
    const bySpecies = new Map();
    const add = (plant, item) => {
        if (!bySpecies.has(plant)) bySpecies.set(plant, []);
        bySpecies.get(plant).push(item);
    };
    beds.forEach((bed, index) => { for (const p of bedFills[index] ?? []) add(p.plant, { plant: p.plant, x: p.x, y: p.y ?? bed.y, z: p.z, scale: p.scale, flip: p.flip }); });
    for (const point of points) {
        const hash = ((point.seed * 2654435761) >>> 0) / 4294967296;
        add(point.plant, { plant: point.plant, x: point.x, y: point.y, z: point.z, scale: 0.94 + 0.12 * hash, flip: hash < 0.5 ? -1 : 1, existing: point.status === 'existing' });
    }
    return bySpecies;
}

// Ведомость: вид → штук, по цветникам и одиночным. Площадь вида в цветнике —
// его доля от площади контура.
// Лиана в ведомости — штука (растение), и к ней длина побегов по стенам.
export function plantingSchedule(beds, fills, points, library, vines = []) {
    const rows = new Map();
    const row = (id) => {
        if (!rows.has(id)) rows.set(id, { plant: library.get(id) ?? { id }, count: 0, area: 0, beds: new Set(), length: 0 });
        return rows.get(id);
    };
    for (const vine of vines) { const r = row(vine.plant); r.count += 1; r.length += vineLength(vine); }
    beds.forEach((bed, index) => {
        const area = bedArea(bed), shares = bed.recipe.filter((r) => library.has(r.plant)), total = shares.reduce((sum, r) => sum + r.share, 0) || 1;
        for (const r of shares) { row(r.plant).area += (area * r.share) / total; row(r.plant).beds.add(bed.name); }
        for (const plant of fills[index] ?? []) row(plant.plant).count += 1;
    });
    for (const point of points) row(point.plant).count += 1;
    return [...rows.values()].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

export function scheduleCsv(schedule, ru = true) {
    const head = ru ? ['№', 'Название', 'Латинское', 'Категория', 'Кол-во, шт', 'Площадь, м²', 'Плотность, шт/м²', 'Высота, м', 'Где'] : ['#', 'Name', 'Latin', 'Category', 'Qty', 'Area, m²', 'Density, /m²', 'Height, m', 'Where'];
    const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const where = (r) => [...r.beds, ...(r.length ? [`${ru ? 'лианы' : 'climbers'}, ${r.length.toFixed(1)} ${ru ? 'м побегов' : 'm of shoots'}`] : [])].join(', ') || (ru ? 'одиночные' : 'single');
    const lines = schedule.map((r, i) => [i + 1, ru ? r.plant.ru : r.plant.en, r.plant.latin, r.plant.category, r.count, r.area ? r.area.toFixed(1) : '', r.plant.density ?? '', r.plant.height ?? '', where(r)].map(cell).join(';'));
    return `\uFEFF${[head.map(cell).join(';'), ...lines].join('\r\n')}\r\n`;
}
