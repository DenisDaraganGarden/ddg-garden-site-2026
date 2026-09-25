// Световое поле сада (docs/garden-lighting-2026-09-25.md): все светильники —
// строки float-текстуры, участок в плане — сетка клеток, у клетки — до K
// индексов светов, которые до неё достают. Пиксель берёт клетку по мировым
// x, z и перебирает только её список: цена пикселя ограничена K и не зависит
// от числа приборов, а перенос или замена прибора — перезапись текстур, без
// пересборки шейдеров. Здесь только числа; DataTexture из них делает вызывающий.
//
// Свет (метры, Y вверх): { x, y, z, axis: [dx, dy, dz] — единичная ось луча,
// peak — сила по оси, кд (уже × dim), color — линейный цвет яркости 1, row —
// строка профиля, cutoff — рад от оси, дальше профиль 0 (π — во все стороны),
// range — м, дальше свет не достаёт, radius — м, размер излучателя }.
export const LIGHT_TEXELS = 4, GRID_SLOTS = 16, SLOT_TEXELS = 4;

// Профиль силы — 128 отсчётов по углу от оси 0…π, между ними линейно. Последний
// ненулевой отсчёт перед cutoff протекает ещё на шаг, поэтому конус клетки
// шире на этот шаг: тогда профилю достаточно нуля от первого отсчёта за cutoff.
const PROFILE_STEP = Math.PI / 127;
// Высота текстуры сетки; ширина — maxCols · SLOT_TEXELS (256 · 4 = 1024).
const MAX_ROWS = 1024;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Строка света i — 4 текселя: (x, y, z, range), (ось, row), (цвет · peak,
// radius), (cos cutoff, плитка теней или −1, 0 — спот / 64 + грани куба,
// тангенс половины угла плитки) — тени по gardenShadows.js. Высота текстуры — степень двойки не меньше
// 16, чтобы добавление приборов редко меняло её размер. Свет с NaN или ∞ в
// числах (сломанный паспорт даёт peak NaN, а rangeFor — дальность NaN) или
// без дальности остаётся нулевой строкой: дальность 0 не светит, в рамку и
// сетку такой свет не входит — иначе рамка из NaN и подбор клетки без конца.
function packLights(lights) {
    let capacity = 16;
    while (capacity < lights.length) capacity *= 2;
    const data = new Float32Array(capacity * LIGHT_TEXELS * 4), stride = LIGHT_TEXELS * 4;
    lights.forEach(({ x, y, z, axis, peak, color, row, cutoff, range, radius, shadow }, i) => {
        const texels = data.subarray(i * stride, (i + 1) * stride);
        texels.set([x, y, z, range, axis[0], axis[1], axis[2], row, color[0] * peak, color[1] * peak, color[2] * peak, radius, Math.cos(cutoff),
            shadow ? shadow.base : -1, shadow ? (shadow.mask ? 64 + shadow.mask : 0) : 0, shadow ? shadow.tan : 0]);
        if (!(texels[3] > 0 && texels.every(Number.isFinite))) texels.fill(0);
    });
    return { capacity, data };
}

// Рамка сетки — объединение квадратов x ± range, z ± range. Клетка — чтобы
// клеток было не больше maxCells, сетка влезла в maxCols × MAX_ROWS, кратно
// 0,25 м и не меньше minCell; цикл лишь добирает округление деления.
function gridFrame(count, data, { maxCells, minCell, maxCols }) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let o = 0; o < count * LIGHT_TEXELS * 4; o += LIGHT_TEXELS * 4) {
        const r = data[o + 3];
        if (!(r > 0)) continue;
        x0 = Math.min(x0, data[o] - r); x1 = Math.max(x1, data[o] + r);
        z0 = Math.min(z0, data[o + 2] - r); z1 = Math.max(z1, data[o + 2] + r);
    }
    if (!(x0 <= x1)) return { minX: 0, minZ: 0, cell: minCell, cols: 1, rows: 1 };
    const w = x1 - x0, h = z1 - z0, span = (length, cell) => Math.max(1, Math.ceil(length / cell));
    let cell = Math.ceil(Math.max(minCell, Math.sqrt((w * h) / maxCells), w / maxCols, h / MAX_ROWS) / 0.25) * 0.25;
    while (!(span(w, cell) <= maxCols && span(h, cell) <= MAX_ROWS)) cell += 0.25;
    return { minX: x0, minZ: z0, cell, cols: span(w, cell), rows: span(h, cell) };
}

// Достаёт ли свет o до столба клетки [left, +cell) × [top, +cell) в полосе
// высот [yMin, yMax]. Точка столба, до которой свет достаёт, лежит в плане на
// ρ ∈ [near, far] от света (near — до прямоугольника, far = dc + half) и по
// высоте на v от него: |v| < √(range² − near²) (шар дальности) и в полосе.
// Значит угол места луча в неё φ = atan2(v, ρ) лежит в [lo, hi] — по краям v
// и ρ, atan2 монотонен по обоим. Без полосы столб бесконечен, и подсветка
// вверх или свет вниз «достают» до всех клеток дальности (точки в 70 м над
// садом и под землёй) — клетки переполняются нулями, настоящий свет земли
// выпадает. По азимуту: столб внутри круга half вокруг центра, направления в
// него не дальше asin(half/dc) от направления h на центр (asin, а не atan:
// угол к касательной, atan терял угол клетки); поворот вокруг вертикали
// сдвигает направление не больше своего угла. Лучший косинус оси a в
// вертикальной полуплоскости h при φ ∈ [lo, hi]: a·dir = R·cos(φ − ψ), ψ =
// atan2(a_y, a·h), R = √((a·h)² + a_y²) — максимум в ψ, если она в отрезке,
// иначе на краю. Свет в самом столбе (dc < half) — всегда, если по высоте да.
function reaches(data, o, cutoff, left, top, cell, yMin, yMax) {
    const x = data[o], y = data[o + 1], z = data[o + 2], range = data[o + 3];
    const near = Math.hypot(Math.max(left - x, 0, x - left - cell), Math.max(top - z, 0, z - top - cell));
    if (near > range) return false;
    const reach = Math.sqrt(range * range - near * near), v0 = Math.max(yMin - y, -reach), v1 = Math.min(yMax - y, reach);
    if (v0 > v1) return false;
    const hx = left + cell / 2 - x, hz = top + cell / 2 - z, dc = Math.hypot(hx, hz), half = cell * Math.SQRT1_2;
    if (dc < half || cutoff + PROFILE_STEP >= Math.PI) return true;
    const lo = Math.min(Math.atan2(v0, near), Math.atan2(v0, dc + half)), hi = Math.max(Math.atan2(v1, near), Math.atan2(v1, dc + half));
    const ah = (data[o + 4] * hx + data[o + 6] * hz) / dc, ay = data[o + 5], psi = Math.atan2(ay, ah);
    const best = Math.hypot(ah, ay) * Math.max(Math.cos(clamp(psi, lo, hi) - psi), Math.cos(lo - psi), Math.cos(hi - psi));
    return Math.acos(clamp(best, -1, 1)) <= cutoff + PROFILE_STEP + Math.asin(half / dc);
}

// band — высоты сцены [yMin, yMax], м (земля и всё, что можно осветить):
// вне неё сетка точек не обещает. По умолчанию столб бесконечен, как в
// исходном контракте; пустой Box3 или NaN — тоже бесконечность, а не тьма.
export function packLightField(lights, { maxCells = 65536, minCell = 0.5, maxCols = 256, band = [-Infinity, Infinity] } = {}) {
    const { capacity, data: lightData } = packLights(lights);
    const { minX, minZ, cell, cols, rows } = gridFrame(lights.length, lightData, { maxCells, minCell, maxCols });
    const [yMin, yMax] = band[0] <= band[1] ? band : [-Infinity, Infinity], stride = LIGHT_TEXELS * 4;
    // Кто достаёт до клетки — по порядку номеров. Дальность и конус — по
    // упакованным float32, теми же числами, что читает шейдер.
    const lists = new Array(cols * rows);
    let skipped = 0;
    lights.forEach((light, i) => {
        const o = i * stride, x = lightData[o], z = lightData[o + 2], range = lightData[o + 3];
        if (!(range > 0)) { skipped += 1; return; }
        const c0 = clamp(Math.floor((x - range - minX) / cell), 0, cols - 1), c1 = clamp(Math.floor((x + range - minX) / cell), 0, cols - 1);
        const r0 = clamp(Math.floor((z - range - minZ) / cell), 0, rows - 1), r1 = clamp(Math.floor((z + range - minZ) / cell), 0, rows - 1);
        for (let row = r0; row <= r1; row += 1) for (let col = c0; col <= c1; col += 1) {
            if (reaches(lightData, o, light.cutoff, minX + col * cell, minZ + row * cell, cell, yMin, yMax)) (lists[row * cols + col] ??= []).push(i);
        }
    });
    // Клетка — GRID_SLOTS текселей подряд: слот k клетки (col, row) — float
    // ((row·width + col·SLOT_TEXELS + (k>>2))·4 + (k&3)) = (row·cols + col)·16 + k.
    // Список плотный, дальше −1: шейдер выходит на первом −1.
    const width = cols * SLOT_TEXELS, data = new Float32Array(width * rows * 4).fill(-1);
    const stats = { cells: cols * rows, maxPerCell: 0, overflowCells: 0, dropped: 0, skipped };
    lists.forEach((list, c) => {
        stats.maxPerCell = Math.max(stats.maxPerCell, list.length);
        if (list.length > GRID_SLOTS) {
            stats.overflowCells += 1; stats.dropped += list.length - GRID_SLOTS;
            list = strongest(lights, lightData, list, minX + ((c % cols) + 0.5) * cell, minZ + (Math.floor(c / cols) + 0.5) * cell);
        }
        data.set(list, c * GRID_SLOTS);
    });
    return { count: lights.length, capacity, lightData, grid: { minX, minZ, cell, cols, rows, width, data }, stats };
}

// Переполнение: остаются GRID_SLOTS самых сильных у центра клетки — пик на
// квадрат расстояния в плане (на высоте самого света), не ближе метра, чтобы
// свет в клетке не перевешивал всё бесконечностью. Равные — по номеру: одна
// и та же раскладка при любой сортировке.
// ponytail: оценка по центру клетки; сильный далёкий против слабого близкого
// на краю клетки может выбрать не того — лечится меньшей клеткой (maxCells).
function strongest(lights, data, list, cx, cz) {
    const score = (i) => lights[i].peak / Math.max((data[i * LIGHT_TEXELS * 4] - cx) ** 2 + (data[i * LIGHT_TEXELS * 4 + 2] - cz) ** 2, 1);
    return list.map((i) => [score(i), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, GRID_SLOTS).map(([, i]) => i);
}

// Вклад света i в освещённость точки p с нормалью n — ровно как в шейдере:
// профиль по углу от оси (линейно между отсчётами), 1/(d² + radius²) с окном
// three.js (1 − (d/range)⁴)² к нулю на дальности, косинус к нормали.
function shadeLight(out, data, i, profiles, p, n, level) {
    const o = i * LIGHT_TEXELS * 4;
    const tx = data[o] - p[0], ty = data[o + 1] - p[1], tz = data[o + 2] - p[2], range = data[o + 3];
    const d = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (d >= range) return;
    // В самой точке света направление не определено; шейдер так же делит на max(d, 1e-4).
    const inv = 1 / Math.max(d, 1e-4), lx = tx * inv, ly = ty * inv, lz = tz * inv;
    const facing = Math.max(n[0] * lx + n[1] * ly + n[2] * lz, 0);
    const theta = Math.acos(clamp(-(lx * data[o + 4] + ly * data[o + 5] + lz * data[o + 6]), -1, 1));
    const row = profiles[data[o + 7]], t = (theta / Math.PI) * 127, k = Math.min(126, Math.floor(t)), f = t - k;
    const fade = clamp(1 - (d / range) ** 4, 0, 1);
    const s = ((row[k] * (1 - f) + row[k + 1] * f) * fade * fade * facing * level) / Math.max(d * d + data[o + 11] ** 2, 1e-4);
    out[0] += data[o + 8] * s; out[1] += data[o + 9] * s; out[2] += data[o + 10] * s;
}

// Освещённость сцены [r, g, b] в мировой точке [x, y, z] с нормалью [nx, ny, nz]
// — как её посчитает шейдер: клетка точки (вне сетки — 0) и её список.
export function shadeReference(field, profiles, point, normal, level = 1) {
    const { minX, minZ, cell, cols, rows, data } = field.grid, out = [0, 0, 0];
    const col = Math.floor((point[0] - minX) / cell), row = Math.floor((point[2] - minZ) / cell);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return out;
    const base = (row * cols + col) * GRID_SLOTS;
    for (let k = 0; k < GRID_SLOTS && data[base + k] >= 0; k += 1) shadeLight(out, field.lightData, data[base + k], profiles, point, normal, level);
    return out;
}

// То же по всем светам без сетки — эталон для проверки.
export function bruteForceReference(lights, profiles, point, normal, level = 1) {
    const { data } = packLights(lights), out = [0, 0, 0];
    for (let i = 0; i < lights.length; i += 1) shadeLight(out, data, i, profiles, point, normal, level);
    return out;
}
