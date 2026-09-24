// Run: node src/planting/planting.check.js
import assert from 'node:assert/strict';
import { fillBed, insidePolygon, plantingSchedule, polygonArea, quotas, scheduleCsv, simplifyContour, spacingFor } from './fillBed.js';
import { seasonLook } from './season.js';
import { normalizePlantingSettings, PLANTING_LIMITS } from './settings.js';
import { PLANTING_PALETTES } from './palettes.js';
import { paletteRecipe } from './usePlantingEditor.js';
import { bloomCurve, scopeRows } from './insights.js';
import * as THREE from 'three';
import { regionOutline, regionTriangles, surfaceRegions } from './surfacePick.js';
import { clipToSurface } from './clipSurface.js';
import { bedArea, groundAt, insideBed } from './fillBed.js';
import { normalizePlantingBed } from './settings.js';

const plant = (id, fields) => ({ id, ru: id, latin: id, category: 'perennial', height: 0.6, spread: 0.5, density: 5, foliage: 'herbaceous', ...fields });
const library = new Map([
    plant('grass', { category: 'grass', foliage: 'grass', density: 3.2, bloom: [8, 9], winter: 'stands', cutBack: 3 }),
    plant('rudbeckia', { bloom: [7, 9], winter: 'stands', cutBack: 3 }),
    plant('iris', { bloom: [5, 6], winter: 'gone' }),
    plant('perovskia', { bloom: [7, 9], winter: 'stands', cutBack: 4, cutHeight: 0.25, density: 2.5 }),
    plant('lavender', { foliage: 'evergreen', bloom: [6, 7], density: 5 }),
    plant('cornus', { category: 'shrub', foliage: 'deciduous', density: 0.5, autumnColor: '#b0433a', twigColor: '#a3322a', winter: 'bare' }),
    plant('festuca', { category: 'grass', foliage: 'evergreen', density: 9 }),
    plant('sedum', { bloom: [8, 10], winter: 'stands' }),
].map((p) => [p.id, p]));

// Настройки: мусор отсекается, контур меньше трёх точек — не цветник.
const clean = normalizePlantingSettings({
    plantingBeds: [
        { id: 'a', points: [[0, 0], [10, 0], [10, 6], [0, 6]], recipe: [{ plant: 'grass', share: 30 }, { plant: 'grass', share: 5 }, { plant: 'BAD id', share: 9 }], drift: 99 },
        { id: 'b', points: [[0, 0], [1, 1]] },
    ],
    plantingPoints: [{ plant: 'cornus', x: 1, y: 0, z: 2 }, { plant: 'x', x: 'no' }],
    plantingMonth: 13,
});
assert.equal(clean.plantingBeds.length, 1, 'a two-point contour is not a bed');
assert.deepEqual(clean.plantingBeds[0].recipe, [{ plant: 'grass', share: 30 }], 'a recipe keeps one row per plant and valid ids only');
assert.equal(clean.plantingBeds[0].drift, 6, 'drift is clamped');
assert.equal(clean.plantingPoints.length, 1);
assert.equal(clean.plantingMonth, 12);
assert.deepEqual(normalizePlantingSettings(clean), clean, 'normalized settings normalize to themselves');

// Точные доли.
assert.deepEqual(quotas([20, 15, 15], 10), [4, 3, 3]);
assert.equal(quotas([1, 1, 1, 97], 5).filter((n) => n > 0).length, 4, 'every share gets at least one while there is enough');
assert.equal(quotas([3, 1], 17).reduce((a, b) => a + b), 17);

// Цветник 10 × 6 м: заполнение одинаковое, внутри контура, по плотности.
const bed = { id: 'demo', points: [[0, 0], [10, 0], [10, 6], [0, 6]], y: 0, drift: 1.6, density: 1, seed: 42,
    recipe: [{ plant: 'grass', share: 40 }, { plant: 'rudbeckia', share: 30 }, { plant: 'perovskia', share: 30 }] };
const first = fillBed(bed, library), again = fillBed(bed, library);
assert.deepEqual(first, again, 'the same bed fills the same way');
assert.ok(first.every((p) => insidePolygon(bed.points, p.x, p.z)), 'every plant stands inside the outline');
const expected = bed.recipe.reduce((sum, row) => sum + 60 * (row.share / 100) * library.get(row.plant).density, 0);
assert.ok(Math.abs(first.length - expected) / expected < 0.3, `count follows area × density (${first.length} vs ${Math.round(expected)})`);
for (const row of bed.recipe) assert.ok(first.some((p) => p.plant === row.plant), `${row.plant} is in the bed`);
assert.notDeepEqual(fillBed({ ...bed, seed: 43 }, library), first, 'another seed, another arrangement');
const denser = fillBed({ ...bed, density: 1.5 }, library).length;
assert.ok(denser > first.length * 1.3, `density ×1.5 plants more (${denser} vs ${first.length})`);
assert.ok(Math.abs(spacingFor(12.8) - 0.3) < 0.002, '30 cm spacing is 12.8 plants/m²');

// Маленький цветник на восемь видов — все восемь в нём есть.
const small = { ...bed, id: 'small', points: [[0, 0], [5, 0], [5, 4], [0, 4]], recipe: [...library.keys()].filter((id) => id !== 'cornus').map((id) => ({ plant: id, share: 10 })), drift: 3 };
const smallFill = fillBed(small, library);
assert.equal(new Set(smallFill.map((p) => p.plant)).size, small.recipe.length, 'a small bed still holds every species of its recipe');

// Ведомость — ровно нарисованное.
const schedule = plantingSchedule([bed], [first], [{ plant: 'cornus', x: 0, y: 0, z: 0 }], library);
assert.equal(schedule.reduce((sum, row) => sum + row.count, 0), first.length + 1);
assert.ok(Math.abs(schedule.find((row) => row.plant.id === 'grass').area - 24) < 1e-9, 'a species’ area is its share of the bed');
assert.equal(scheduleCsv(schedule).split('\r\n').filter(Boolean).length, schedule.length + 1);
assert.equal(polygonArea(bed.points), 60);

// Сезоны.
const at = (id, month) => seasonLook(library.get(id), month);
assert.equal(at('iris', 1).visible, false, 'iris is under the ground in January');
assert.equal(at('iris', 5).bloom, 1);
assert.equal(at('iris', 8).bloom, 0, 'iris out of bloom shows leaves');
assert.equal(at('rudbeckia', 1).seed, 1, 'rudbeckia stands dry in winter');
assert.equal(at('rudbeckia', 3).grow[1], 0.12, 'cut back in March');
assert.equal(at('rudbeckia', 4).grow[1], 0.3, 'regrows in April');
assert.equal(at('rudbeckia', 7).bloom, 1);
assert.deepEqual(at('rudbeckia', 7).grow, [1, 1], 'full height in bloom');
assert.equal(at('rudbeckia', 10).seed, 1, 'seed heads after bloom');
assert.equal(at('perovskia', 4).grow[1], 0.25, 'perovskia is cut to a quarter in April');
assert.equal(at('grass', 1).bloom, 1, 'grass plumes stand in winter');
assert.ok(at('grass', 1).tintAmount > 0.5, 'as straw');
assert.equal(at('grass', 6).bloom, 0, 'no plumes before August');
assert.equal(at('cornus', 1).bare, 1, 'dogwood is bare in January');
assert.equal(at('cornus', 1).twig, '#a3322a', 'with red twigs');
assert.equal(at('cornus', 7).bare, 0);
assert.equal(at('cornus', 10).tint, '#b0433a', 'autumn colour in October');
assert.equal(at('lavender', 1).visible, true, 'evergreen stays');
assert.equal(at('sedum', 12).visible, true);

// Контур от руки редеет до предела точек.
const circle = Array.from({ length: 2000 }, (_, i) => [Math.cos(i / 2000 * Math.PI * 2) * 20, Math.sin(i / 2000 * Math.PI * 2) * 20]);
const simple = simplifyContour(circle);
assert.ok(simple.length <= PLANTING_LIMITS.contour && simple.length > 30, `a hand-drawn circle keeps its shape in ${simple.length} points`);
// Рука вернулась точно в начало: контур не схлопывается.
const loop = [...circle.filter((_, i) => i % 50 === 0), circle[0]];
const kept = simplifyContour(loop);
assert.ok(kept.length >= 20 && Math.abs(polygonArea(kept) - Math.PI * 400) / (Math.PI * 400) < 0.05, `a loop closed on its first point stays a bed (${kept.length} points)`);

// Палитра без библиотеки — целиком (цветник не остаётся голым), с
// библиотекой — только её растения.
assert.equal(paletteRecipe(PLANTING_PALETTES[0], new Map()).length, PLANTING_PALETTES[0].recipe.length);
assert.deepEqual(paletteRecipe(PLANTING_PALETTES[0], new Map([['festuca-glauca', {}]])), [{ plant: 'festuca-glauca', share: 5 }]);

// Обзор: часть сада — один цветник, все цветники, деревья новые и существующие.
const points = [{ plant: 'cornus', status: 'existing' }, { plant: 'cornus' }, { plant: 'lavender' }];
const all = scopeRows({ kind: 'beds', bed: null }, [bed, small], [first, smallFill], points, library);
assert.equal(all.count, first.length + smallFill.length, 'all beds hold every drawn plant');
assert.equal(scopeRows({ kind: 'beds', bed: bed.id }, [bed, small], [first, smallFill], points, library).count, first.length, 'one bed holds its own');
assert.equal(scopeRows({ kind: 'trees', status: 'existing' }, [], [], points, library).count, 1);
assert.equal(scopeRows({ kind: 'trees', status: 'new' }, [], [], points, library).count, 2);
assert.equal(Math.round(all.area), 80, 'the area is the outlines’');
assert.deepEqual(bloomCurve(all.rows).slice(6, 9), [3, 4, 4], 'July to September: species in bloom');

// Поверхность модели: сетка из квадратов 1 м (два треугольника на квадрат,
// у каждой грани свои копии вершин, как у SketchUp).
function gridMesh(cells, height = () => 0) {
    const positions = [];
    for (const [i, j] of cells) {
        const corner = (x, z) => [x, height(x, z), z];
        const [a, b, c, d] = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
        positions.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(geometry);
}
const cells = (w, h, skip = () => false) => Array.from({ length: w * h }, (_, k) => [k % w, Math.floor(k / w)]).filter(([i, j]) => !skip(i, j));
// Полоса 10 × 4 с приставленной стеной: стена — другой участок.
const strip = gridMesh(cells(10, 4));
const wallPositions = [10, 0, 0, 10, 2, 4, 10, 0, 4, 10, 0, 0, 10, 2, 0, 10, 2, 4];
const both = new THREE.BufferGeometry();
both.setAttribute('position', new THREE.Float32BufferAttribute([...strip.geometry.attributes.position.array, ...wallPositions], 3));
const labelled = surfaceRegions(both);
assert.equal(new Set(Array.from(labelled.regionOf).slice(0, 80)).size, 1, 'the strip is one surface');
assert.notEqual(labelled.regionOf[80], labelled.regionOf[0], 'the wall is not part of it');
const stripPick = regionTriangles(new THREE.Mesh(both), 5);
assert.ok(stripPick.ground && Math.abs(stripPick.area - 40) < 1e-6, `the strip is ground of 40 m² (${stripPick.area})`);
assert.equal(regionTriangles(new THREE.Mesh(both), 80).ground, false, 'a wall is not ground');
const stripOutline = regionOutline(stripPick.triangles);
assert.equal(stripOutline.holes.length, 0);
assert.ok(Math.abs(polygonArea(stripOutline.outer) - 40) < 1e-6 && stripOutline.ground === null, 'a flat strip: its outline and no height grid');
// Площадка 6 × 6 с дыркой 2 × 2 посередине — приствольный круг.
const yard = gridMesh(cells(6, 6, (i, j) => i >= 2 && i < 4 && j >= 2 && j < 4));
const yardOutline = regionOutline(regionTriangles(yard, 0).triangles);
assert.equal(yardOutline.holes.length, 1, 'the hole is found');
const yardBed = normalizePlantingBed({ id: 'yard', points: yardOutline.outer, holes: yardOutline.holes, y: yardOutline.y, recipe: [{ plant: 'festuca', share: 1 }], seed: 5, surface: true });
assert.equal(bedArea(yardBed), 32);
assert.ok(!insideBed(yardBed, 3, 3) && insideBed(yardBed, 1, 1), 'nothing is planted in the hole');
assert.ok(fillBed(yardBed, library).every((p) => !(p.x > 2 && p.x < 4 && p.z > 2 && p.z < 4)), 'the fill keeps out of the hole');
// Газон на склоне: высота растения — по сетке высот, а не одна на весь цветник.
const slope = gridMesh(cells(10, 4), (x) => 0.1 * x);
const slopeOutline = regionOutline(regionTriangles(slope, 0).triangles);
const slopeBed = normalizePlantingBed({ id: 'slope', points: slopeOutline.outer, y: slopeOutline.y, ground: slopeOutline.ground, recipe: [{ plant: 'festuca', share: 1 }], seed: 9 });
assert.ok(slopeBed.ground, 'a sloped surface keeps a height grid');
assert.ok(Math.abs(groundAt(slopeBed, 7.5, 2) - 0.75) < 0.02, `ground height follows the slope (${groundAt(slopeBed, 7.5, 2)})`);
assert.ok(fillBed(slopeBed, library).every((p) => Math.abs(p.y - 0.1 * p.x) < 0.03), 'every plant stands on the slope');

// Контур от руки по поверхности: только поверхность внутри контура.
const cut = clipToSurface([[1, 1], [5, 1], [5, 5], [1, 5]], yardOutline);
assert.equal(cut.length, 1);
assert.ok(Math.abs(cut[0].area - (16 - 4)) < 0.3 && cut[0].holes.length === 1, `the outline keeps the hole and the surface only (${cut[0].area.toFixed(2)} m², ${cut[0].holes.length} hole)`);
const twoStrips = { outer: [[0, 0], [10, 0], [10, 6], [0, 6]], holes: [[[0.5, 2], [9.5, 2], [9.5, 4], [0.5, 4]]] };
const across = clipToSurface([[2, 1], [4, 1], [4, 5], [2, 5]], twoStrips);
assert.equal(across.length, 2, 'an outline across a path makes two beds, one on each side');
assert.ok(across.every((piece) => Math.abs(piece.area - 2) < 0.2), `each is 2 m² (${across.map((piece) => piece.area.toFixed(2)).join(', ')})`);
assert.equal(clipToSurface([[20, 20], [22, 20], [22, 22]], twoStrips).length, 0, 'an outline off the surface makes nothing');

console.log(`planting: settings, fill (${first.length} plants in 60 m², ${smallFill.length} in 20 m² with ${small.recipe.length} species), schedule and seasons hold`);
