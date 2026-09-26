// Run: node src/planting/planting.check.js
import assert from 'node:assert/strict';
import { coverSchedule, fillBed, insidePolygon, plantingSchedule, PLANTING_RESERVE, polygonArea, quotas, scheduleCsv, simplifyContour, spacingFor } from './fillBed.js';
import { fenceLayout, fenceSchedule, POST_SPAN } from '../topiary/fenceLayout.js';
import { seasonImage, seasonLook, seasonPhases } from './season.js';
import { bedGroundGeometry, GROUND_LIFT, groundLitter, groundSeason, plantGroundMaps } from './bedGround.js';
import { normalizePlantingSettings, PLANTING_LIMITS } from './settings.js';
import { PLANTING_PALETTES } from './palettes.js';
import { paletteRecipe } from './usePlantingEditor.js';
import { bloomCurve, scopeRows } from './insights.js';
import * as THREE from 'three';
import { regionOutline, regionTriangles, surfaceRegions } from './surfacePick.js';
import { clipToSurface } from './clipSurface.js';
import { bedArea, groundAt, insideBed } from './fillBed.js';
import { gardenWind, plantFlex, updateGardenWind } from './wind.js';
import { normalizePlantingBed } from './settings.js';
import { bearingOf, planPose, siteNorth, viewBearing } from './north.js';
import { growVine, shootRuns, vineLength, vineRoot } from './vines.js';
import { normalizePlantingVine } from './settings.js';
import { LEAF_KINDS, leafShape } from './vineLeaves.js';

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

// Нарисовано — ровно то, что на плане.
const schedule = plantingSchedule([bed], [first], [{ plant: 'cornus', x: 0, y: 0, z: 0 }], library);
assert.equal(schedule.reduce((sum, row) => sum + row.count, 0), first.length + 1);
assert.ok(Math.abs(schedule.find((row) => row.plant.id === 'grass').area - 24) < 1e-9, 'a species’ area is its share of the bed');
assert.equal(scheduleCsv(schedule).split('\r\n').filter(Boolean).length, schedule.length + 1);
assert.equal(polygonArea(bed.points), 60);

// К заказу — по площади и норме, не по нарисованному: 60 м² × доля × шт/м² ×
// густота + 5 %, вверх до штуки; одиночное новое — штука.
const orderOf = (rows, id) => rows.find((row) => row.plant.id === id)?.order;
assert.equal(PLANTING_RESERVE, 0.05);
assert.equal(orderOf(schedule, 'grass'), Math.ceil(24 * 3.2 * 1.05), 'grass: 24 m² × 3.2 /m² + 5 %');
assert.equal(orderOf(schedule, 'rudbeckia'), Math.ceil(18 * 5 * 1.05));
assert.equal(orderOf(schedule, 'perovskia'), Math.ceil(18 * 2.5 * 1.05));
assert.equal(orderOf(schedule, 'cornus'), 1, 'a single plant is one to order');
assert.ok(scheduleCsv(schedule).includes('К заказу, шт (+5 %)'), 'the CSV says what the order includes');
const denseBed = { ...bed, id: 'dense', name: 'Густой', density: 1.5 };
const twoBeds = plantingSchedule([bed, denseBed], [first, fillBed(denseBed, library)], [], library);
assert.equal(orderOf(twoBeds, 'grass'), Math.ceil((24 * 3.2 + 24 * 3.2 * 1.5) * 1.05), 'beds add up before rounding, density scales the norm');
const existingOnly = plantingSchedule([], [], [{ plant: 'cornus', x: 0, y: 0, z: 0, status: 'existing' }, { plant: 'cornus', x: 1, y: 0, z: 0 }], library);
assert.deepEqual([existingOnly[0].count, existingOnly[0].existing, existingOnly[0].order], [2, 1, 1], 'a tree already on the site is drawn but not ordered');
const noNorm = new Map([['mystery', { id: 'mystery' }]]);
const mysteryBed = { ...bed, id: 'm', recipe: [{ plant: 'mystery', share: 100 }] };
const mysteryRows = plantingSchedule([mysteryBed], [[{ plant: 'mystery' }, { plant: 'mystery' }]], [], noNorm);
assert.equal(orderOf(mysteryRows, 'mystery'), 2, 'without a norm the order is what is drawn');
assert.deepEqual(plantingSchedule([{ ...bed, kind: 'lawn', recipe: [] }], [[]], [], library), [], 'a lawn orders no plants');

// Почвопокров — метрами по составу; ограда — п.м., секции и столбы той же
// раскладкой, что рисует сцена (fenceLayout.js).
const covers = coverSchedule([
    { ...bed, id: 'c', name: 'Покров', kind: 'cover', recipe: [], cover: { enabled: true, leaf: 0.55, thyme: 0.15 } },
    { ...bed, id: 'under', cover: { enabled: true, leaf: 0, thyme: 1 } },
    { ...bed, id: 'off', cover: { enabled: false, leaf: 0.5, thyme: 0 } },
    { ...bed, id: 'l', kind: 'lawn', recipe: [] },
    bed,
]);
assert.deepEqual(covers.map((r) => r.id), ['c', 'under'], 'covers and bed under-layers, not lawns or plain beds');
assert.deepEqual(['area', 'ginger', 'thyme', 'moss'].map((key) => Math.round(covers[0][key] * 1000) / 1000), [60, 33, 9, 18]);
assert.equal(covers[1].layer, true);
const fenceRows = fenceSchedule([
    { id: 'f', name: 'Ограда', points: [[0, 0], [5, 0], [5, 3.1]], height: 1.8, width: 1, scale: 2, foliageVisible: false, fenceStyle: 'mesh-2d' },
    { id: 'h', name: 'Изгородь', points: [[0, 0], [3, 4]], height: 1.2, width: 0.6, scale: 1, foliageVisible: true, fenceStyle: 'none' },
    { id: 'x', name: 'Пусто', points: [[0, 0], [3, 4]], height: 1, width: 1, scale: 1, foliageVisible: false, fenceStyle: 'none' },
]);
assert.deepEqual(fenceRows.map((r) => r.id), ['f', 'h'], 'a line with neither hedge nor fence is not in the schedule');
assert.deepEqual([fenceRows[0].sections, fenceRows[0].posts], [5, 6], '5 m + 3.1 m: 3 + 2 sections up to 2.4 m, 6 posts');
assert.ok(Math.abs(fenceRows[0].length - 16.2) < 1e-9 && fenceRows[0].height === 3.6, 'length and height take the object scale');
assert.equal(fenceRows[1].length, 5);
assert.equal(fenceRows[1].sections, undefined);
// По каталогу: изгородь с растением и нормой — п.м. × шт/п.м.; покров —
// площадь × доля × шт/м² растения, которое стоит за копытником или тимьяном.
const catalog = new Map([...library, ['buxus', { id: 'buxus', density: 4 }], ['vinca', { id: 'vinca', density: 12 }]]);
const hedgeRows = plantingSchedule([], [], [], catalog, [], [
    { id: 'h1', name: 'Самшит у входа', points: [[0, 0], [8, 0]], scale: 1.25, plant: 'buxus', perMetre: 3.5 },
    { id: 'h2', name: 'Без нормы', points: [[0, 0], [2, 0]], scale: 1, plant: 'buxus' },
    { id: 'h3', name: 'Только ограда', points: [[0, 0], [9, 0]], scale: 1, plant: 'buxus', perMetre: 4, foliageVisible: false },
]);
const buxus = hedgeRows.find((r) => r.plant.id === 'buxus');
assert.equal(buxus.order, Math.ceil(10 * 3.5 * 1.05), '10 m of hedge (8 m × scale 1.25) × 3.5 per m + 5 %');
assert.equal(buxus.hedgeLength, 12, 'a hedge without a norm still adds its length');
assert.equal(buxus.count, 0, 'hedge plants are not drawn one by one');
const coverRows = plantingSchedule([{ ...bed, id: 'cv', name: 'Покров', kind: 'cover', recipe: [], cover: { enabled: true, leaf: 0.5, thyme: 0.2, plants: { leaf: 'vinca' } } }], [[]], [], catalog);
assert.deepEqual(coverRows.map((r) => [r.plant.id, r.area, r.order]), [['vinca', 30, Math.ceil(30 * 12 * 1.05)]], 'the ginger part of 60 m² at 12 per m²; thyme without a plant stays in metres');
const closed = fenceLayout({ points: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], fenceSmooth: false });
assert.equal(closed.posts.length, closed.panels.length, 'a closed fence has as many posts as sections');
assert.equal(POST_SPAN, 2.4);

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

// Картинки сезона: какие нужны и какая в каком месяце.
const phase = (id, month) => seasonImage(library.get(id), month);
const coloured = (id, fields) => ({ ...library.get(id), bloomColor: '#caa', ...fields });
assert.deepEqual(seasonPhases(library.get('cornus')), ['spring', 'autumn', 'winter'], 'dogwood: leaf-out, autumn, bare');
assert.deepEqual(seasonPhases(coloured('iris')), ['leaf', 'spring', 'autumn'], 'iris goes under the ground: no winter picture');
assert.deepEqual(seasonPhases(coloured('lavender')), ['leaf'], 'an evergreen only loses its flowers');
assert.deepEqual(seasonPhases({ ...library.get('cornus'), bloom: [4, 5], bloomColor: '#fee' }), ['leaf', 'autumn', 'winter'], 'an apple in blossom at leaf-out: the card is its spring');
assert.equal(phase('cornus', 1).phase, 'winter');
assert.equal(phase('cornus', 4).phase, 'spring');
assert.equal(phase('cornus', 7).phase, 'card', 'in summer leaf the card is right');
assert.equal(phase('cornus', 10).phase, 'autumn');
assert.deepEqual([phase('cornus', 11).phase, phase('cornus', 11).next], ['autumn', 'winter'], 'November: the leaves are falling');
assert.equal(seasonImage(coloured('iris'), 5).phase, 'card', 'iris in bloom');
assert.equal(seasonImage(coloured('iris'), 8).phase, 'leaf', 'iris out of bloom');
assert.equal(seasonImage(coloured('iris'), 4).phase, 'spring');
assert.equal(seasonImage(coloured('iris'), 1).visible, false);
assert.equal(seasonImage(coloured('rudbeckia'), 10).phase, 'autumn', 'seed heads after bloom');
assert.equal(seasonImage(coloured('rudbeckia'), 1).phase, 'winter', 'rudbeckia stands dry');
assert.deepEqual(seasonImage(coloured('rudbeckia'), 3).grow, [0.6, 0.12], 'cut back in March');
assert.equal(seasonImage(coloured('grass'), 9).phase, 'card', 'grass plumes stand after bloom');
assert.equal(seasonImage(coloured('grass'), 6).phase, 'leaf', 'no plumes before August');
assert.equal(seasonImage(coloured('lavender'), 7).phase, 'card');
assert.equal(seasonImage(coloured('lavender'), 1).tintAmount, 0.2, 'evergreens keep their winter tone');
for (const [id, fields] of [['cornus'], ['iris', { bloomColor: '#caa' }], ['rudbeckia', { bloomColor: '#caa' }], ['grass', { bloomColor: '#caa' }], ['sedum', { bloomColor: '#caa' }]]) {
    const record = { ...library.get(id), ...fields };
    const needed = new Set(seasonPhases(record));
    for (let month = 1; month <= 12; month += 1) {
        const image = seasonImage(record, month);
        for (const used of [image.phase, image.next].filter((p) => p && p !== 'card')) assert.ok(needed.has(used), `${id} in month ${month} uses ${used}, which it never gets`);
    }
}

// Грунт цветника: сезон, опад растений, карта под цветником, сетка по рельефу.
assert.ok(groundSeason(1).frost > 0.5 && groundSeason(7).frost === 0, 'иней зимой, летом его нет');
assert.ok(groundSeason(4).moisture > groundSeason(7).moisture, 'весной земля влажнее, чем в июле');
assert.equal(groundSeason(4).aged, 0, 'в апреле кора свежая');
assert.equal(groundLitter(library.get('cornus'), 11).color, '#b0433a', 'в ноябре под дёреном — листья его осеннего цвета');
assert.ok(groundLitter(library.get('cornus'), 11).amount > groundLitter(library.get('cornus'), 10).amount, 'к ноябрю листьев больше');
assert.deepEqual(groundLitter(library.get('grass'), 3).kind, [0, 0, 1], 'после срезки злака — солома');
assert.equal(groundLitter({ ...library.get('rudbeckia'), bloomColor: '#dbb71c' }, 8).color, '#dbb71c', 'в цветение — лепестки');
assert.equal(groundLitter(library.get('iris'), 1).canopy, 0, 'ушедший под землю не даёт тени');
const groundBed = { points: [[0, 0], [4, 0], [4, 3], [0, 3]], y: 0 };
const groundMaps = plantGroundMaps(groundBed, [{ plant: 'cornus', x: 1, z: 1, scale: 1 }], library, 11);
const texelAt = (x, z) => {
    const i = Math.floor((x - groundMaps.frame[0]) * groundMaps.frame[2] * groundMaps.width), j = Math.floor((z - groundMaps.frame[1]) * groundMaps.frame[3] * groundMaps.height);
    const k = (j * groundMaps.width + i) * 4;
    return { rgb: [...groundMaps.litter.slice(k, k + 3)], amount: groundMaps.litter[k + 3], leaf: groundMaps.kinds[k], canopy: groundMaps.kinds[k + 3] };
};
assert.deepEqual(texelAt(1, 1).rgb, [0xb0, 0x43, 0x3a], 'под дёреном — его листья');
assert.ok(texelAt(1, 1).amount > 150 && texelAt(1, 1).leaf === 255 && texelAt(1, 1).canopy > 200, 'много, листьями, в тени кроны');
assert.equal(texelAt(3.5, 2.5).amount, 0, 'вдали от растения чисто');
const groundSlope = { points: [[0, 0], [2, 0], [2, 2], [0, 2]], y: 0, ground: { x0: 0, z0: 0, step: 1, cols: 3, rows: 3, h: [0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1] } };
const groundGeometry = bedGroundGeometry(groundSlope);
const groundPositions = groundGeometry.attributes.position, groundNormals = groundGeometry.attributes.normal;
assert.ok(groundPositions.count > 6, 'на рельефе сетка дробится');
for (let i = 0; i < groundPositions.count; i += 1) {
    assert.ok(Math.abs(groundPositions.getY(i) - (groundPositions.getX(i) * 0.5 + GROUND_LIFT)) < 1e-6, 'грунт лежит по сетке высот цветника');
    assert.ok(groundNormals.getY(i) > 0.8, 'и смотрит вверх');
}

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

// Север: −Z сцены, поворот модели уносит его с собой, поправка — по часовой.
assert.equal(bearingOf(0, -1), 0); assert.equal(bearingOf(1, 0), 90); assert.equal(bearingOf(0, 1), 180);
assert.equal(siteNorth({}), 0);
assert.equal(siteNorth({ northAngle: 15, placedObjects: [{ id: 'm', kind: 'model', rotation: 40 }], sketchupModels: { m: {} } }), -25, 'the model turned 40° to the left takes north with it');
assert.equal(normalizePlantingSettings({ northAngle: 190 }).northAngle, -170, 'north is kept within ±180°');
// Генплан: камера над серединой, взгляд прямо вниз, верх кадра — север, участок в кадре.
for (const north of [0, 30, -120]) {
    const pose = planPose({ min: { x: -10, y: 1, z: -4 }, max: { x: 30, y: 5, z: 16 } }, north, 1.5);
    const camera = new THREE.PerspectiveCamera(pose.cameraFov, 1.5, 0.1, 5000);
    camera.position.set(pose.cameraPosition.x, pose.cameraPosition.y, pose.cameraPosition.z);
    camera.lookAt(pose.cameraTarget.x, pose.cameraTarget.y, pose.cameraTarget.z);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    assert.ok(Math.abs(((viewBearing(camera.matrixWorld) - north + 540) % 360) - 180) < 0.05, `north ${north}°: the top of the frame is north (${viewBearing(camera.matrixWorld).toFixed(3)})`);
    for (const [x, z] of [[-10, -4], [30, -4], [30, 16], [-10, 16]]) {
        const p = new THREE.Vector3(x, 1, z).project(camera);
        assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, `north ${north}°: corner ${x}, ${z} is in the frame (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
}

// Лиана: мазок по стене (нормаль −Z) снизу вверх, 2.4 м, и разрыв — второй кусок.
const wallShoot = Array.from({ length: 61 }, (_, i) => [Math.sin(i * 0.2) * 0.2, i * 0.04, 0, 0, 0, -1]);
const vine = normalizePlantingVine({ id: 'v1', plant: 'ivy', shoots: [[...wallShoot, [3, 1, 0, 0, 0, -1], [3, 1.5, 0, 0, 0, -1], [3, 2, 0, 0, 0, -1]]], seed: 7 });
assert.equal(shootRuns(vine.shoots[0]).length, 2, 'a gap of more than 0.6 m starts a new piece');
const wallLength = wallShoot.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - wallShoot[i][0], p[1] - wallShoot[i][1]), 0) + 1;
assert.ok(Math.abs(vineLength(vine) - wallLength) < 0.1, `the length follows the stroke (${vineLength(vine).toFixed(2)} of ${wallLength.toFixed(2)} m)`);
assert.deepEqual(vineRoot(vine), [0, 0, 0]);
const ivyPlant = { id: 'ivy', vine: { leaf: 'ivy', leafSize: 0.1, spread: 0.8, fruit: 'bunch' } };
const grown = growVine(vine, ivyPlant), regrown = growVine(vine, ivyPlant);
assert.deepEqual(grown.leaves.slice(0, 20), regrown.leaves.slice(0, 20), 'the same vine grows the same leaves every time');
assert.ok(grown.leaves.length > 150 && grown.stems.length > 8, `a 3 m climber is a mat of shoots and leaves (${grown.leaves.length} leaves, ${grown.stems.length} stems)`);
assert.ok(grown.leaves.every((leaf) => leaf.p[2] < 0.1 && leaf.p[2] > -0.1 && leaf.n[2] < -0.3), 'the leaves lie on the wall, facing out of it');
assert.ok(grown.leaves.every((leaf) => Math.abs(leaf.t[0] * leaf.n[0] + leaf.t[1] * leaf.n[1] + leaf.t[2] * leaf.n[2]) < 1e-6), 'each leaf tip lies in its leaf plane');
assert.equal(normalizePlantingSettings({ plantingVines: [vine, { plant: 'ivy', shoots: [[[0, 0, 0]]] }] }).plantingVines.length, 1, 'a shoot without normals is dropped');
const withVines = plantingSchedule([], [], [], new Map([['ivy', { id: 'ivy' }]]), [vine, { ...vine, id: 'v2' }]);
assert.equal(withVines[0].count, 2, 'a climber is one plant in the schedule');
assert.ok(withVines[0].length > 6, 'and carries the length of its shoots');
assert.equal(scopeRows({ kind: 'vines' }, [], [], [], new Map([['ivy', { id: 'ivy' }]]), [vine]).count, 1);
for (const kind of Object.keys(LEAF_KINDS)) {
    const shape = leafShape(kind, 1);
    assert.ok(shape.fills.every((polygon) => polygon.every(([x, y]) => x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02)), `${kind}: the leaf stays in its cell`);
}

// Ветер сада: 90° — на восток (+X), 0° — на север (−Z); шторм +8 м/с; злаки
// гибче деревьев, стриженое почти стоит; качание сада — от 0 до 2.
updateGardenWind({ terrainWindBearing: 90, terrainWindSpeed: 4, terrainStorm: 0 }, 1, 3);
assert.ok(Math.abs(gardenWind.uWind.value.x - 4) < 1e-9 && Math.abs(gardenWind.uWind.value.y) < 1e-9 && gardenWind.uWindTime.value === 3, 'the wind blows east at 90°');
updateGardenWind({ terrainWindBearing: 0, terrainWindSpeed: 4, terrainStorm: 1 }, 1, 3);
assert.ok(Math.abs(gardenWind.uWind.value.y + 12) < 1e-9, 'north at 0°, a storm adds 8 m/s');
assert.ok(plantFlex('grass')[0] > plantFlex('perennial')[0] && plantFlex('perennial')[0] > plantFlex('tree')[0] && plantFlex('topiary')[0] < 0.01, 'grasses bend most, clipped forms hardly');
assert.equal(normalizePlantingSettings({}).plantingSway, 1);
assert.equal(normalizePlantingSettings({ plantingSway: 5 }).plantingSway, 2);

// Газон: цветник без растений, со стрижкой; мусор в стрижке — по умолчанию.
{
    const raw = { id: 'l', kind: 'lawn', points: [[0, 0], [4, 0], [4, 3], [0, 3]], recipe: [{ plant: 'x', share: 5 }], lawn: { mowing: 'zigzag', stripe: 9, angle: 270, cut: 1, contrast: 0.3, irrigated: false } };
    const lawn = normalizePlantingSettings({ plantingBeds: [raw] }).plantingBeds[0];
    assert.equal(lawn.kind, 'lawn');
    assert.deepEqual(lawn.recipe, [], 'a lawn holds no plants');
    assert.deepEqual(lawn.lawn, { mowing: 'stripes', stripe: 3, angle: -90, cut: 2, contrast: 0.3, patches: 0.3, blades: 1, variety: 0.5, tint: 0, irrigated: false }, '270° is −90°');
    assert.equal(lawn.name, 'Газон 1');
    assert.deepEqual(fillBed(lawn, new Map()), []);
    assert.equal(bedArea(lawn), 12);
    assert.deepEqual(normalizePlantingSettings({ plantingBeds: [lawn] }).plantingBeds[0], lawn, 'a lawn normalizes to itself');
    assert.ok(!('kind' in normalizePlantingSettings({ plantingBeds: [{ ...raw, kind: 'bed' }] }).plantingBeds[0]), 'a bed stays a bed');
}

console.log(`planting: settings, fill (${first.length} plants in 60 m², ${smallFill.length} in 20 m² with ${small.recipe.length} species), schedule and seasons hold, season pictures by month, bed ground by plants and month, garden wind blows the right way`);
