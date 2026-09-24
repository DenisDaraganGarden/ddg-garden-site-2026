// Окружение участка: проекция, разбор OSM, рельеф, геометрия, привязка к
// модели. Числа — настоящие: Ростов-на-Дону, 47.2225° с. ш.
// Run: npm run check:surroundings
import assert from 'node:assert/strict';
import {
    buildSurroundings, buildTerrainGrid, buildingHeight, clipLine, clipRing, joinRings, mergeAuthored, parseCoordinates, projector,
    ringArea, roadWidth, stringifySurroundings, summarizeSurroundings, tagNumber, withGeometry, EARTH_RADIUS,
} from './osm.js';
import { barriersGeometry, buildingsGeometry, FLAT_Y, groundSampler, surroundingsAnchor, terrainDisc, treeInstances } from './geometry.js';
import { DEFAULT_SURROUNDINGS_SETTINGS, normalizeSurroundingsSettings } from './settings.js';

const LAT = 47.2225, LON = 39.7188, DEG = Math.PI / 180;
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected} ± ${tolerance}`);
const haversine = (a, b) => {
    const dLat = (b[0] - a[0]) * DEG, dLon = (b[1] - a[1]) * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
};

// Проекция: восток +X, север −Z, на 1.5 км по диагонали — сантиметры от сферы.
{
    const { toLocal, toGeo } = projector(LAT, LON);
    const east = toLocal(LAT, LON + 0.01), north = toLocal(LAT + 0.01, LON);
    assert.ok(east[0] > 0 && Math.abs(east[1]) < 1e-9, 'восток — это +X');
    assert.ok(north[1] < 0 && Math.abs(north[0]) < 1e-9, 'север — это −Z');
    const [x, z] = toLocal(LAT + 0.0095, LON + 0.014);
    near(Math.hypot(x, z), haversine([LAT, LON], [LAT + 0.0095, LON + 0.014]), 0.3, 'диагональ 1.5 км');
    const back = toGeo(x, z);
    near(back[0], LAT + 0.0095, 1e-9, 'обратно: широта');
    near(back[1], LON + 0.014, 1e-9, 'обратно: долгота');
}

// Теги: числа, высоты, ширины.
assert.equal(tagNumber('12'), 12);
assert.equal(tagNumber('12 m'), 12);
assert.equal(tagNumber('12,5 м'), 12.5);
assert.ok(Number.isNaN(tagNumber("30'")), 'футы — не метры');
assert.deepEqual(buildingHeight({ building: 'yes', height: '15' }), { height: 15, from: 'height' });
assert.deepEqual(buildingHeight({ building: 'yes', 'building:levels': '5' }), { height: 16, levels: 5, from: 'levels' });
assert.equal(buildingHeight({ building: 'house', 'building:levels': '2', 'roof:levels': '1' }).height, 7.8);
assert.deepEqual(buildingHeight({ building: 'garage' }), { height: 3, from: 'guess' });
assert.deepEqual(buildingHeight({ building: 'apartments' }), { height: 16, from: 'guess' });
assert.deepEqual(buildingHeight({ building: 'yes' }), { height: 4, from: 'guess' });
assert.deepEqual(buildingHeight({ building: 'roof' }), { height: 3.5, from: 'guess', min: 2.4 }, 'навес висит над землёй');
assert.equal(buildingHeight({ 'building:part': 'yes', min_height: '10', height: '25' }).min, 10);
assert.equal(roadWidth({ highway: 'residential' }), 6);
assert.equal(roadWidth({ highway: 'primary', lanes: '4' }), 14);
assert.equal(roadWidth({ highway: 'secondary', width: '7.5' }), 7.5);
assert.equal(roadWidth({ highway: 'footway' }), 2);
assert.equal(roadWidth({ highway: 'service', service: 'driveway' }), 3);

// Кольца из кусков, обрезка квадратом.
{
    const rings = joinRings([[[0, 0], [10, 0], [10, 10]], [[0, 0], [0, 10]], [[0, 10], [10, 10]]]);
    assert.equal(rings.length, 1, 'три куска — одно кольцо');
    assert.equal(rings[0].length, 4);
    near(Math.abs(ringArea(rings[0])), 100, 1e-9, 'площадь кольца');
    const clipped = clipRing([[5, -10], [25, -10], [25, 10], [5, 10]], 10);
    near(Math.abs(ringArea(clipped)), 100, 1e-9, 'квадрат 20×20 у края: внутри 5×20');
    const [line] = clipLine([[-20, 0], [20, 0]], 10);
    assert.deepEqual(line, [[-10, 0], [10, 0]]);
    assert.equal(clipLine([[-5, 0], [-5, 20], [5, 20], [5, 0]], 10).length, 2, 'вышла и вернулась — два куска');
}

// Разбор ответа Overpass: дом с этажами, двор-колодец, дом из частей, дорога,
// парк, дерево, изгородь. Точки — в метрах от центра, переведённые в градусы.
const { toGeo } = projector(LAT, LON);
const geo = (points) => points.map(([x, z]) => { const [lat, lon] = toGeo(x, z); return { lat, lon }; });
const square = (cx, cz, side) => [[cx - side / 2, cz - side / 2], [cx + side / 2, cz - side / 2], [cx + side / 2, cz + side / 2], [cx - side / 2, cz + side / 2], [cx - side / 2, cz - side / 2]];
const overpass = [
    { type: 'way', id: 1, tags: { building: 'house', 'building:levels': '2', 'addr:street': 'Пушкинская улица', 'addr:housenumber': '12' }, geometry: geo(square(30, 0, 10)) },
    {
        type: 'relation', id: 2, tags: { type: 'multipolygon', building: 'apartments', 'building:levels': '9' },
        members: [{ type: 'way', role: 'outer', geometry: geo(square(-60, 0, 40)) }, { type: 'way', role: 'inner', geometry: geo(square(-60, 0, 16)) }],
    },
    { type: 'way', id: 3, tags: { building: 'church' }, geometry: geo(square(0, 80, 20)) },
    { type: 'way', id: 4, tags: { 'building:part': 'yes', height: '30' }, geometry: geo(square(0, 80, 6)) },
    { type: 'way', id: 5, tags: { highway: 'residential' }, geometry: geo([[-400, 20], [400, 20]]) },
    { type: 'way', id: 6, tags: { leisure: 'park' }, geometry: geo(square(0, -80, 60)) },
    { type: 'node', id: 7, tags: { natural: 'tree' }, ...geo([[5, -60]])[0] },
    { type: 'way', id: 8, tags: { barrier: 'hedge' }, geometry: geo([[20, 10], [40, 10]]) },
    { type: 'way', id: 9, tags: { highway: 'service', tunnel: 'yes' }, geometry: geo([[0, 0], [10, 0]]) },
    { type: 'way', id: 10, tags: { building: 'yes', layer: '-1' }, geometry: geo(square(50, 50, 10)) },
];
const data = buildSurroundings(overpass, { lat: LAT, lon: LON, radius: 200 });
{
    assert.equal(data.half, 210, 'данные с запасом 5 % за радиус');
    const ids = data.buildings.map((item) => item.id).sort();
    assert.deepEqual(ids, ['r2', 'w1', 'w4'], 'подземное не строится, контур с частью заменён частью');
    const house = data.buildings.find((item) => item.id === 'w1');
    assert.equal(house.height, 7, '2 этажа × 3 м + метр на крышу');
    assert.equal(house.label, 'Пушкинская улица, 12');
    near(Math.abs(ringArea(house.ring)), 100, 1, 'дом 10×10 м остался 10×10');
    near(house.ring.reduce((sum, [x]) => sum + x, 0) / 4, 30, 0.1, 'и стоит в 30 м к востоку');
    assert.equal(data.buildings.find((item) => item.id === 'r2').holes.length, 1, 'двор-колодец');
    assert.equal(data.roads.length, 1, 'тоннель под землёй не рисуется');
    near(data.roads[0].line[0][0], -210, 0.1, 'дорога обрезана краем данных');
    assert.equal(data.roads[0].width, 6);
    assert.deepEqual(data.areas.map((item) => item.kind), ['green']);
    assert.equal(data.trees.length, 1);
    assert.equal(data.lines[0].kind, 'hedge');
    assert.equal(data.lines[0].height, 1.4);
    const summary = summarizeSurroundings(data);
    assert.equal(summary.buildings, 3);
    assert.equal(summary.levels, 2);
    assert.equal(summary.measured, 1);
    near(summary.roadsKm, 0.4, 0.05, 'километры дорог');
}

// Запасной путь: ответ API OSM (точки отдельно) даёт то же, что Overpass.
{
    const nodes = geo(square(30, 0, 10)).slice(0, 4).map((point, index) => ({ type: 'node', id: 100 + index, ...point }));
    const way = { type: 'way', id: 1, tags: { building: 'house', 'building:levels': '2' }, nodes: [100, 101, 102, 103, 100] };
    const [house] = buildSurroundings(withGeometry([...nodes, way]), { lat: LAT, lon: LON, radius: 200 }).buildings;
    assert.equal(house.height, 7);
    near(Math.abs(ringArea(house.ring)), 100, 1, 'дом из API такой же');
}

// Правки агента переживают новую загрузку; точка сдвинулась — правки едут с землёй.
{
    const previous = {
        center: { lat: LAT, lon: LON },
        buildings: [{ ...data.buildings.find((item) => item.id === 'w1'), height: 9, edited: true }, { id: 'custom-1', custom: true, ring: [[0, 0], [5, 0], [5, 5]], height: 3 }],
    };
    const merged = mergeAuthored(data, previous);
    assert.equal(merged.buildings.find((item) => item.id === 'w1').height, 9, 'поправленная высота осталась');
    assert.ok(merged.buildings.some((item) => item.id === 'custom-1'), 'дорисованный дом остался');
    assert.equal(merged.buildings.length, data.buildings.length + 1);
    const [lat, lon] = toGeo(10, 0);
    const moved = mergeAuthored({ ...data, center: { lat, lon } }, previous);
    near(moved.buildings.find((item) => item.id === 'custom-1').ring[0][0], -10, 0.1, 'точка на 10 м восточнее — правка на 10 м западнее');
    assert.deepEqual(JSON.parse(stringifySurroundings(merged)), { ...merged, terrain: null }, 'файл читается обратно тем же');
}

// Рельеф: наклонная плоскость (+1 м на 100 м к востоку) остаётся наклонной,
// центр — ноль, высота точки над морем — в отчёте.
{
    const { toLocal } = projector(LAT, LON);
    const relief = buildTerrainGrid({ lat: LAT, lon: LON, radius: 200, size: 33, elevationAt: (la, lo) => 50 + toLocal(la, lo)[0] * 0.01 });
    assert.equal(relief.elevation, 50);
    const { half, size, h } = relief.grid;
    const mid = (size - 1) / 2;
    near(h[mid * size + mid], 0, 0.05, 'центр — ноль');
    near(h[mid * size + size - 2], (half - (2 * half) / (size - 1)) * 0.01, 0.05, 'восток выше');
    const ground = groundSampler(relief.grid, { relief: 1, clear: 20 });
    near(ground(5, 5), FLAT_Y, 1e-9, 'участок ровный');
    near(ground(150, 0), 1.5, 0.05, 'за полосой — настоящий рельеф');
    near(groundSampler(relief.grid, { relief: 0, clear: 20 })(150, 0), 0, 1e-9, 'рельеф 0 — ровно');
}

const normals = ({ normal }) => Array.from({ length: normal.length / 9 }, (_, i) => [normal[i * 9], normal[i * 9 + 1], normal[i * 9 + 2]]);
const flat = () => 0;

// Земля — круг, все треугольники смотрят вверх.
{
    const disc = terrainDisc(flat, 100, 105, { rings: 8, segments: 24 });
    assert.equal(disc.position.length / 3, 1 + 8 * 24);
    for (let i = 0; i < disc.index.length; i += 3) {
        const [a, b, c] = [disc.index[i], disc.index[i + 1], disc.index[i + 2]].map((v) => [disc.position[v * 3], disc.position[v * 3 + 2]]);
        const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        assert.ok(up > 0, `треугольник земли ${i / 3} смотрит вниз`);
    }
}

// Дом 10×10×6: стены наружу, крыша вверх площадью 100; двор — стены во двор.
{
    const box = buildingsGeometry([{ id: 'a', ring: square(30, 0, 10).slice(0, 4).reverse(), height: 6 }], flat, { radius: 200 });
    assert.equal(box.count, 1);
    let roof = 0;
    for (let i = 0; i < box.position.length / 9; i += 1) {
        const p = box.position.subarray(i * 9, i * 9 + 9), n = normals(box)[i];
        const cx = (p[0] + p[3] + p[6]) / 3, cz = (p[2] + p[5] + p[8]) / 3;
        if (n[1] > 0.99) roof += Math.abs(((p[3] - p[0]) * (p[8] - p[2]) - (p[6] - p[0]) * (p[5] - p[2])) / 2);
        else assert.ok(n[0] * (cx - 30) + n[2] * cz > 0, 'стена смотрит из дома');
    }
    near(roof, 100, 1e-6, 'крыша 10×10');
    const yard = buildingsGeometry([{ id: 'b', ring: square(0, 0, 40).slice(0, 4), holes: [square(0, 0, 16).slice(0, 4)], height: 27 }], flat, { radius: 200 });
    let inward = 0;
    for (let i = 0; i < yard.position.length / 9; i += 1) {
        const p = yard.position.subarray(i * 9, i * 9 + 9), n = normals(yard)[i];
        const cx = (p[0] + p[3] + p[6]) / 3, cz = (p[2] + p[5] + p[8]) / 3;
        if (Math.abs(n[1]) > 0.5 || Math.max(Math.abs(cx), Math.abs(cz)) > 9) continue;
        assert.ok(n[0] * cx + n[2] * cz < 0, 'стена двора смотрит во двор');
        inward += 1;
    }
    assert.equal(inward, 8, 'четыре стены двора по два треугольника');
    assert.equal(buildingsGeometry([{ id: 'c', ring: square(5, 0, 6).slice(0, 4), height: 6 }], flat, { radius: 200, clear: 15 }).count, 0, 'дом на участке — это модель SketchUp');
}

// Забор — стенки с двух сторон, изгородь — брус с верхом.
{
    const fence = barriersGeometry([{ kind: 'fence', line: [[20, 0], [30, 0]] }], flat, { radius: 200 });
    const [front, , back] = normals(fence);
    near(front[2] + back[2], 0, 1e-6, 'две стороны забора смотрят врозь');
    near(fence.position[1], -0.2, 1e-6, 'забор уходит в землю');
    near(Math.max(...fence.position.filter((_, i) => i % 3 === 1)), 1.6, 1e-6, 'высота забора');
    const hedge = barriersGeometry([{ kind: 'hedge', line: [[20, 0], [30, 0]] }], flat, { radius: 200, hedges: true });
    assert.equal(normals(hedge).filter((n) => n[1] > 0.99).length, 2, 'у изгороди есть верх');
    assert.equal(barriersGeometry([{ kind: 'hedge', line: [[20, 0], [30, 0]] }], flat, { radius: 200 }).position.length, 0, 'изгородь не забор');
}

// Лес засеян через 7 м, дерево из OSM — своё.
{
    const trees = treeInstances({ trees: [[50, 0, 12]], areas: [{ kind: 'forest', ring: square(-100, 0, 49).slice(0, 4) }] }, flat, { radius: 200 });
    const count = trees.length / 4;
    assert.ok(count > 40 && count < 64, `в лесу 49×49 м около 49 деревьев, а не ${count}`);
    assert.ok(Array.from({ length: count }, (_, i) => trees[i * 4 + 3]).includes(12), 'высота из OSM');
    assert.equal(treeInstances({ trees: [[3, 3]] }, flat, { radius: 200, clear: 15 }).length, 0, 'на участке деревья — свои');
}

// Привязка: точка карты садится на модель со сдвигом в её осях, север — по northAngle.
{
    const settings = {
        placedObjects: [{ id: 'm', kind: 'model', x: 10, y: 0.5, z: 5, rotation: 90 }], sketchupModels: { m: {} },
        surroundingsOffsetX: 2, surroundingsOffsetZ: 0, northAngle: 0,
    };
    const anchor = surroundingsAnchor(settings);
    near(anchor.x, 10, 1e-9, 'сдвиг по X модели, повёрнутой на 90°');
    near(anchor.z, 3, 1e-9, '— уходит в −Z мира');
    near(anchor.y, 0.5, 1e-9, 'по высоте — на основание модели');
    const north = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
    const [nx, nz] = north(surroundingsAnchor({ northAngle: 30 }).yaw);
    near(nx, Math.sin(30 * DEG), 1e-9, 'север в 30° по часовой от зелёной оси: восточнее −Z');
    near(nz, -Math.cos(30 * DEG), 1e-9, 'и по-прежнему к северу');
    assert.deepEqual(surroundingsAnchor({}), { x: 0, y: 0, z: 0, yaw: 0 }, 'без модели — в начале координат');
}

// Настройки: пустые координаты — пусто, мусор — заводское.
{
    const normalized = normalizeSurroundingsSettings({ geoLatitude: '47.2225', geoLongitude: 39.7188, surroundingsRadius: 5000, surroundingsRoadColor: 'red' });
    assert.equal(normalized.geoLatitude, 47.2225);
    assert.equal(normalized.surroundingsRadius, 1500);
    assert.equal(normalized.surroundingsRoadColor, DEFAULT_SURROUNDINGS_SETTINGS.surroundingsRoadColor);
    assert.equal(normalizeSurroundingsSettings({ geoLatitude: null, geoLongitude: 39 }).geoLongitude, null, 'точка — обе координаты или ни одной');
    assert.deepEqual(normalizeSurroundingsSettings(normalizeSurroundingsSettings({})), normalizeSurroundingsSettings({}), 'нормализация неподвижна');
    assert.deepEqual(parseCoordinates('47.2225, 39.7188'), { lat: 47.2225, lon: 39.7188 });
    assert.equal(parseCoordinates('Ростов-на-Дону, Пушкинская 12'), null);
}

console.log('surroundings: проекция, разбор OSM, правки, рельеф, земля, дома, заборы, лес, привязка, настройки — ok');
