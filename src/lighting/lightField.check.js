// Run: node src/lighting/lightField.check.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { mulberry32 } from '../planting/fillBed.js';
import { bruteForceReference, GRID_SLOTS, LIGHT_TEXELS, packLightField, shadeReference } from './lightField.js';
import { rangeFor } from './photometry.js';

const DEG = Math.PI / 180, STRIDE = LIGHT_TEXELS * 4;
// Профили: отсчёт i — угол i/127·π; за cutoff нули (протечку интерполяции
// на шаг за cutoff покрывает запас конуса в lightField.js).
const profile = (cutoff, shape) => Float32Array.from({ length: 128 }, (_, i) => ((i / 127) * Math.PI < cutoff ? shape((i / 127) * Math.PI) : 0));
const TYPES = [
    { cutoff: 92 * DEG, shape: (t) => 0.4 + 0.6 * Math.sin(t) },                  // столбик: вниз и вбок
    { cutoff: 20 * DEG, shape: (t) => Math.cos((t / (20 * DEG)) * Math.PI / 2) ** 2 }, // узкая подсветка вверх
    { cutoff: 45 * DEG, shape: (t) => Math.cos((t / (45 * DEG)) * Math.PI / 2) },     // широкий прожектор вбок
    { cutoff: Math.PI, shape: () => 1 },                                               // во все стороны
    { cutoff: 5 * DEG, shape: () => 1 },                                               // иголка — для угла клетки
    { cutoff: 60 * DEG, shape: (t) => Math.cos((t / (60 * DEG)) * Math.PI / 2) },     // свет вниз с навеса
];
const profiles = TYPES.map(({ cutoff, shape }) => profile(cutoff, shape));

const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
function garden(count, seed) {
    const random = mulberry32(seed), between = (a, b) => a + (b - a) * random();
    return Array.from({ length: count }, () => {
        const row = Math.floor(random() * 4), yaw = between(-Math.PI, Math.PI), tilt = between(0, 15 * DEG), pitch = between(-20, 10) * DEG;
        const axis = [[0, -1, 0], unit([Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt)]), [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], [0, -1, 0]][row];
        const y = [0.8, 0.05, between(0.3, 3), between(0.5, 3)][row];
        return { x: between(0, 120), y, z: between(0, 80), axis, peak: between(50, 2000), color: [1, between(0.7, 1), between(0.4, 1)], row, cutoff: TYPES[row].cutoff, range: between(3, 25), radius: between(0.02, 0.1) };
    });
}
const cellOf = ({ grid }, x, z) => {
    const col = Math.floor((x - grid.minX) / grid.cell), row = Math.floor((z - grid.minZ) / grid.cell);
    return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ? null : { col, row, list: [...grid.data.subarray((row * grid.cols + col) * GRID_SLOTS, (row * grid.cols + col + 1) * GRID_SLOTS)].filter((i) => i >= 0) };
};
// Оценка переполнения — как в lightField.js: пик на квадрат расстояния в плане до центра клетки, не ближе метра.
const score = (field, lights, i, { col, row }) => lights[i].peak / Math.max((field.lightData[i * STRIDE] - (field.grid.minX + (col + 0.5) * field.grid.cell)) ** 2 + (field.lightData[i * STRIDE + 2] - (field.grid.minZ + (row + 0.5) * field.grid.cell)) ** 2, 1);
const stronger = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] < b[1]);
const close = (a, b) => a.every((v, c) => Math.abs(v - b[c]) <= 1e-6 * Math.max(Math.abs(b[c]), 1e-12));

// 1. Сад 120 × 80 м, 300 приборов: сетка не теряет ни одного света, который
// что-то освещает. Где свет всё же не попал в список — клетка переполнена, и
// он слабее каждого оставшегося.
const lights = garden(300, 7);
let t0 = performance.now();
const field = packLightField(lights);
const ms300 = performance.now() - t0;
t0 = performance.now();
const big = packLightField(garden(1000, 11));
const ms1000 = performance.now() - t0;

// Точка p с нормалью: сетка = перебор всех, если из клетки не выпал ни один
// свет, который тут светит; иначе клетка полна и выпавшие слабее оставшихся.
const tally = { compared: 0, lit: 0, outside: 0, crowded: 0 };
function compare(field, lights, p, normal) {
    const grid = shadeReference(field, profiles, p, normal), all = bruteForceReference(lights, profiles, p, normal);
    if (all.some((v) => v > 0)) tally.lit += 1;
    const cell = cellOf(field, p[0], p[2]);
    if (!cell) { tally.outside += 1; assert.deepEqual(all, [0, 0, 0], `beyond the grid nothing shines (${p.map((v) => v.toFixed(2))})`); return { grid, all }; }
    const missing = lights.map((_, i) => i).filter((i) => !cell.list.includes(i) && bruteForceReference([lights[i]], profiles, p, normal).some((v) => v > 0));
    if (!missing.length) { tally.compared += 1; assert.ok(close(grid, all), `grid = brute at ${p.map((v) => v.toFixed(3))}: ${grid} vs ${all}`); return { grid, all }; }
    tally.crowded += 1;
    assert.equal(cell.list.length, GRID_SLOTS, `a light is missing only from a full cell (${missing})`);
    const weakest = cell.list.map((i) => [score(field, lights, i, cell), i]).reduce((a, b) => (stronger(a, b) ? b : a));
    for (const i of missing) assert.ok(stronger(weakest, [score(field, lights, i, cell), i]), `dropped light ${i} is weaker than every kept one`);
    assert.ok(grid.every((v, c) => v <= all[c] * (1 + 1e-6)), 'dropping only takes light away');
    return { grid, all };
}
const random = mulberry32(99);
for (let n = 0; n < 5000; n += 1) {
    const far = n % 5 === 0;
    const p = far ? [-200 + 520 * random(), 8 * random(), -200 + 480 * random()] : [-10 + 140 * random(), 8 * random(), -10 + 100 * random()];
    const s = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
    compare(field, lights, p, n % 2 ? [0, 1, 0] : unit(s.map((c, i) => c + (i === 1 ? 0.3 : 0))));
}
const { compared, lit, outside, crowded } = tally;
assert.ok(compared > 3000 && lit > 2000, `enough lit points compared (${compared}, lit ${lit})`);
const { stats } = field;
assert.equal(stats.cells, field.grid.cols * field.grid.rows);
assert.ok(field.grid.cols <= 256 && field.grid.rows <= 1024 && Number.isInteger(field.grid.cell / 0.25) && field.grid.cols * field.grid.rows <= 65536, 'the grid fits');

// 1а. Дальности, как их даёт приложение (rangeFor: до 0,3 лк, 10–80 м), на
// 40 × 30 м: столбики, подсветки вверх, свет вниз с навеса. С бесконечным
// столбом подсветка вверх «достаёт» до точек в десятках метров над садом, свет
// вниз — под землёй: клетки полны нулями, а земля теряет треть света швами.
// Полоса высот сцены −1…15 м оставляет в клетке тех, кто светит в ней.
const appRandom = mulberry32(3), appBetween = (a, b) => a + (b - a) * appRandom();
const app = Array.from({ length: 60 }, (_, i) => {
    const kind = i % 3, row = [0, 1, 5][kind], peak = [appBetween(30, 300), appBetween(500, 3000), appBetween(100, 800)][kind];
    return { x: appBetween(0, 40), y: [0.8, 0.05, 2.5][kind], z: appBetween(0, 30), axis: [[0, -1, 0], [0, 1, 0], [0, -1, 0]][kind], peak, color: [1, 1, 1], row, cutoff: TYPES[row].cutoff, range: rangeFor(peak), radius: 0.05 };
});
const banded = packLightField(app, { band: [-1, 15] }), column = packLightField(app);
const loss = (fieldOf) => { let sum = 0, n = 0; for (const { grid, all } of fieldOf) if (all[0] > 0) { sum += 1 - grid[0] / all[0]; n += 1; } return sum / n; };
const ground = [], groundColumn = [];
for (let n = 0; n < 2000; n += 1) {
    const p = [appBetween(0, 40), n % 2 ? 0 : appBetween(-1, 15), appBetween(0, 30)], s = [appBetween(-1, 1), appBetween(-1, 1), appBetween(-1, 1)];
    const got = compare(banded, app, p, n % 2 ? [0, 1, 0] : unit(s));
    if (n % 2) { ground.push(got); groundColumn.push({ grid: shadeReference(column, profiles, p, [0, 1, 0]), all: got.all }); }
}
const bandLoss = loss(ground), columnLoss = loss(groundColumn);
assert.ok(bandLoss < 0.02 && banded.stats.overflowCells * 4 < column.stats.overflowCells, `the band keeps the ground's light (loss ${(bandLoss * 100).toFixed(2)}%, ${banded.stats.overflowCells} of ${column.stats.overflowCells} cells overflow)`);

// 2. Угол клетки: иголка 5° мимо центра клетки прямо в её угол. Столб клетки
// виден из света шире atan(half/dc) — до asin; с atan эту клетку сетка теряла.
const needle = [
    { x: 2.6175, y: 0.5, z: 1.6275, axis: [-0.8962605421191453, 0, 0.4435279479810667], peak: 500, color: [1, 1, 1], row: 4, cutoff: 5 * DEG, range: 5, radius: 0.02 },
    { x: -8, y: 0.5, z: -8, axis: [0, -1, 0], peak: 10, color: [1, 1, 1], row: 3, cutoff: Math.PI, range: 2, radius: 0.02 },
];
const corner = packLightField(needle);
assert.ok(corner.grid.minX === -10 && corner.grid.minZ === -10 && corner.grid.cell === 0.5, 'the grid lines pass through the corner (2, 2)');
const tip = [2.001, 0.5, 2.001], towards = unit([needle[0].x - tip[0], 0, needle[0].z - tip[2]]);
const tipLight = bruteForceReference(needle, profiles, tip, towards);
assert.ok(tipLight[0] > 0 && close(shadeReference(corner, profiles, tip, towards), tipLight), `the needle lights the corner of a cell it barely grazes (${tipLight[0].toFixed(3)})`);
// Та же иголка вдоль +x в клетках по 0,25 м: центр клетки (21,875; 2,125) —
// 5,55° от оси, дальше cutoff 5° и угла клетки (0,46°), но профиль между
// отсчётами 4,25° и 5,67° ещё не ноль — клетку держит запас на шаг профиля.
const leak = [{ ...needle[0], x: 0, z: 0, axis: [1, 0, 0], range: 25 }];
const past = [21.875, 0.5, 2.125], back = unit([-past[0], 0, -past[2]]), pastLight = bruteForceReference(leak, profiles, past, back);
assert.ok(pastLight[0] > 0 && close(shadeReference(packLightField(leak, { minCell: 0.25 }), profiles, past, back), pastLight), `a profile sample leaking past cutoff still lights its cell (${pastLight[0].toFixed(3)})`);

// 3. Переполнение: 40 приборов в метре друг от друга — в клетке ровно 16
// сильнейших; 17 одинаковых — остаются первые 16 по номеру.
const crowdRandom = mulberry32(5);
const crowd = Array.from({ length: 40 }, () => ({ x: 10 + crowdRandom(), y: 1, z: 10 + crowdRandom(), axis: [0, -1, 0], peak: 50 + 2000 * crowdRandom(), color: [1, 1, 1], row: 3, cutoff: Math.PI, range: 8, radius: 0.05 }));
const packed = packLightField(crowd), at = cellOf(packed, 10.5, 10.5);
const ranked = crowd.map((_, i) => [score(packed, crowd, i, at), i]).sort((a, b) => (stronger(a, b) ? -1 : 1));
assert.deepEqual([...at.list].sort((a, b) => a - b), ranked.slice(0, 16).map(([, i]) => i).sort((a, b) => a - b), 'the sixteen strongest stay');
assert.ok(ranked.slice(16).every(([, i]) => !at.list.includes(i)), 'the weakest twenty-four go');
assert.ok(packed.stats.maxPerCell === 40 && packed.stats.overflowCells > 0 && packed.stats.dropped >= packed.stats.overflowCells, `overflow counted (${JSON.stringify(packed.stats)})`);
const twins = packLightField(Array.from({ length: 17 }, () => ({ ...crowd[0] })));
assert.deepEqual(cellOf(twins, crowd[0].x, crowd[0].z).list, [...Array(16).keys()], 'equal lights: the first sixteen by number');

// 4. Раскладка: строки света и слоты клетки читаются обратно; пусто — 1 × 1 из −1.
assert.ok(field.count === 300 && field.capacity === 512 && field.lightData.length === 512 * STRIDE, 'capacity is a power of two');
for (const i of [0, 137, 299]) {
    const L = lights[i], o = i * STRIDE, got = [...field.lightData.subarray(o, o + STRIDE)];
    const want = [L.x, L.y, L.z, L.range, ...L.axis, L.row, L.color[0] * L.peak, L.color[1] * L.peak, L.color[2] * L.peak, L.radius, Math.cos(L.cutoff), 0, 0, 0].map(Math.fround);
    assert.deepEqual(got, want, `light ${i} reads back`);
}
assert.ok(field.lightData.subarray(300 * STRIDE).every((v) => v === 0), 'unused rows are zero');
const one = packLightField([{ ...needle[1], x: 3, z: 4 }]), { grid } = one;
const slot = (col, row, k) => grid.data[(row * grid.width + col * 4 + (k >> 2)) * 4 + (k & 3)];
const home = cellOf(one, 3, 4);
assert.ok(grid.width === grid.cols * 4 && grid.data.length === grid.width * grid.rows * 4, 'grid texture size');
assert.ok(slot(home.col, home.row, 0) === 0 && slot(home.col, home.row, 1) === -1, 'the light is in its own cell, then the list ends');
assert.ok(slot(0, 0, 0) === -1, 'the plan corner beyond the circle is empty');
const empty = packLightField([]);
assert.ok(empty.count === 0 && empty.capacity === 16 && empty.lightData.length === 16 * STRIDE && empty.lightData.every((v) => v === 0), 'empty: zero lights');
assert.ok(empty.grid.cols === 1 && empty.grid.rows === 1 && empty.grid.data.length === 16 && empty.grid.data.every((v) => v === -1), 'empty: a 1 × 1 grid of −1');
assert.deepEqual(shadeReference(empty, profiles, [0, 0, 0], [0, 1, 0]), [0, 0, 0], 'empty: dark');
const wide = packLightField([{ ...needle[1], range: 500 }]);
assert.ok(wide.grid.cols <= 256 && wide.grid.cell === 4, `a 1 km light grows the cell to fit 256 columns (${wide.grid.cell} m)`);

// 4а. Свет с NaN, ∞ или без дальности пропускается, а не вешает подбор клетки
// (рамка из NaN: cell += 0,25 не менялся). Зависание ловит дочерний node.
const ok = { x: 5, y: 1, z: 5, axis: [0, -1, 0], peak: 300, color: [1, 1, 1], row: 3, cutoff: Math.PI, range: 10, radius: 0.05 };
const broken = [{ range: NaN }, { x: NaN }, { range: undefined }, { range: Infinity }, { peak: NaN }, { range: -1 }, { cutoff: NaN }];
const child = spawnSync(execPath, ['--input-type=module', '-e', `import { packLightField } from ${JSON.stringify(new URL('./lightField.js', import.meta.url).href)};
const ok = ${JSON.stringify(ok)};
for (const bad of [{ range: NaN }, { x: NaN }, { range: undefined }, { range: Infinity }, { x: 1e300 }]) packLightField([ok, { ...ok, ...bad }]);`], { timeout: 10000 });
assert.ok(child.status === 0, `a broken light does not hang the pack (${child.signal ?? child.stderr})`);
const mixed = packLightField([ok, ...broken.map((bad) => ({ ...ok, ...bad }))]), okPoint = [5.3, 0, 4.6];
assert.ok(mixed.stats.skipped === broken.length && mixed.grid.minX === -5 && mixed.grid.minZ === -5, `broken lights skipped, the frame is the good one's (${JSON.stringify(mixed.stats)})`);
assert.ok(mixed.lightData.subarray(STRIDE, (broken.length + 1) * STRIDE).every((v) => v === 0) && mixed.grid.data.every((v) => v < 1), 'broken rows are zero and in no cell');
assert.deepEqual(shadeReference(mixed, profiles, okPoint, [0, 1, 0]), bruteForceReference([ok], profiles, okPoint, [0, 1, 0]), 'the good light still shines');

// 5. Одинаково при каждом открытии.
const again = packLightField(lights);
assert.deepEqual(again.lightData, field.lightData);
assert.deepEqual(again.grid.data, field.grid.data);
assert.deepEqual(again.stats, field.stats);

console.log(`lightField: 300 lights, grid ${field.grid.cols}×${field.grid.rows} of ${field.grid.cell} m, up to ${stats.maxPerCell} per cell, ${stats.overflowCells} cells overflow (${stats.dropped} pairs dropped); ${compared} of 5000 points equal to brute force (${lit} lit, ${outside} beyond the grid), ${crowded} in full cells lose only lights weaker than the kept; pack ${ms300.toFixed(1)} ms for 300, ${ms1000.toFixed(1)} ms for 1000 (${big.stats.overflowCells} of ${big.stats.cells} cells overflow, up to ${big.stats.maxPerCell}); a needle lights a cell corner and a cell its profile leaks into past cutoff; forty in a metre keep the strongest sixteen`);
console.log(`app ranges (rangeFor ${Math.min(...app.map((l) => l.range)).toFixed(0)}–${Math.max(...app.map((l) => l.range)).toFixed(0)} m), 60 lights on 40×30 m: band −1…15 m — ${banded.stats.overflowCells} of ${banded.stats.cells} cells overflow, up to ${banded.stats.maxPerCell}, ground loses ${(bandLoss * 100).toFixed(2)}%; infinite column — ${column.stats.overflowCells} overflow, up to ${column.stats.maxPerCell}, ground loses ${(columnLoss * 100).toFixed(1)}%; ${broken.length} broken lights skipped, no hang`);
