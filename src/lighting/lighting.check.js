// Освещение сада целиком, без браузера: настройки, светильник в мире, свет
// поля из типов, сетка участка из треугольников модели, её файл и электрика
// из данных проекта. Модули по отдельности — в своих проверках
// (photometry, lightField, electric, housings).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILTIN_LUMINAIRES } from './types.js';
import { aimAt, beamAxis, normalizeLightingSettings } from './settings.js';
import { fixtureLabels, fixturePose, gardenLights } from './fixtures.js';
import { packLightField, shadeReference } from './lightField.js';
import { illuminance } from './photometry.js';
import { typePhotometry } from './fixtures.js';
import { buildSiteGrid } from './siteGrid.js';
import { cellOf, KIND } from './electric.js';
import { decodeGrid, encodeGrid } from './gridCodec.js';
import { electricInputs, lightingNetwork } from './network.js';

const types = new Map(BUILTIN_LUMINAIRES.map((type) => [type.id, type]));
const near = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} ≠ ${b} ±${eps}`);

// Настройки: мусор отсеян, повторная нормализация ничего не меняет.
const raw = {
    lightingFixtures: [
        { id: 'a', type: 'bollard-80', x: 0, y: 0, z: 0 },
        { id: 'b', type: 'uplight-15', x: 4, y: 0, z: 0, target: [4, 5, 1], dim: 0.5, circuit: 'c1', locked: true },
        { id: 'c', type: 'wall-down', x: 0, y: 2.2, z: -3, nx: 0, ny: 0, nz: 1, circuit: 'c1' },
        { id: 'a', type: 'bollard-80', x: 9, y: 0, z: 9, circuit: 'c1' },
        { type: 'Bad Type', x: 0, y: 0, z: 0 },
        { type: 'bollard-80', x: 'x', y: 0, z: 0 },
    ],
    lightingPanels: [{ id: 'p1', x: -3, y: 0, z: 0 }],
    lightingCircuits: [{ id: 'c1', panel: 'p1', volts: 230 }, { id: 'c2', panel: 'p1', volts: 24 }, { panel: 'no such/panel' }],
    lightingSurfaces: { Lawn: 'lawn', Bad: 'lava' },
    lightingMode: 'party', lightingExposure: 99,
};
const settings = normalizeLightingSettings(raw);
assert.equal(settings.lightingFixtures.length, 4, 'два без типа и без координат — отброшены');
assert.notEqual(settings.lightingFixtures[3].id, 'a', 'одинаковые id разведены');
assert.deepEqual(settings.lightingFixtures[1].target, [4, 5, 1]);
assert.equal(settings.lightingFixtures[1].locked, true);
assert.equal(settings.lightingCircuits[1].current, 'dc', '24 В — постоянный ток');
assert.equal(settings.lightingCircuits.length, 2, 'цепь без щитка — отброшена');
assert.deepEqual(settings.lightingSurfaces, { Lawn: 'lawn' });
assert.equal(settings.lightingMode, 'auto');
assert.equal(settings.lightingExposure, 4);
assert.deepEqual(normalizeLightingSettings(settings), settings, 'нормализация идемпотентна');

// Наведение: yaw 0 — к +Z, pitch 90 — вверх; aimAt обратен beamAxis.
near(beamAxis(0, 0)[2], 1, 1e-9, 'yaw 0 к +Z');
near(beamAxis(90, 0)[0], 1, 1e-9, 'yaw 90 к +X');
near(beamAxis(0, 90)[1], 1, 1e-9, 'pitch 90 вверх');
const aim = aimAt([0, 0, 0], [3, 4, 0]);
beamAxis(aim.yaw, aim.pitch).forEach((v, i) => near(v, [0.6, 0.8, 0][i], 2e-3, 'aimAt ↔ beamAxis'));

// Светильник в мире.
const [bollard, uplight, wall] = settings.lightingFixtures;
const bollardPose = fixturePose(bollard, types.get('bollard-80'));
near(bollardPose.axis.y, -1, 1e-6, 'боллард светит вниз');
assert.ok(bollardPose.emitter.y > 0.5 && bollardPose.emitter.y < 0.85, `свет боллардa 0,8 м выходит у верха: ${bollardPose.emitter.y}`);
const upPose = fixturePose(uplight, types.get('uplight-15'));
const toTarget = new THREE.Vector3(4, 5, 1).sub(upPose.emitter).normalize();
assert.ok(upPose.axis.dot(toTarget) > 0.999, 'грунтовый смотрит на цель');
assert.ok(Math.abs(upPose.emitter.y) < 0.1, 'грунтовый — у самой земли');
// Цель под 45° от вертикали: луч грунтового — до 20° (поворот оптики), голова — до 7,5°.
const steep = fixturePose({ ...uplight, target: [9, 5, 0] }, types.get('uplight-15'));
near(steep.axis.angleTo(new THREE.Vector3(0, 1, 0)) * 180 / Math.PI, 20, 0.01, 'луч грунтового прижат к 20°');
assert.ok(new THREE.Vector3().setFromMatrixColumn(steep.head, 1).angleTo(new THREE.Vector3(0, 1, 0)) * 180 / Math.PI < 7.6, 'голова — не больше 7,5°');
const wallPose = fixturePose(wall, types.get('wall-down'));
near(wallPose.axis.y, -1, 1e-6, 'настенный светит вниз');
assert.ok(wallPose.emitter.z > -3 && wallPose.emitter.z < -2.6, `настенный — у стены, перед ней: ${wallPose.emitter.z}`);
assert.ok(new THREE.Vector3().setFromMatrixColumn(wallPose.mount, 1).z > 0.99, 'основание настенного — +Y из стены');

// Светы поля: строка профиля на тип, яркость — множителем силы.
const built = gardenLights(settings.lightingFixtures, types);
assert.equal(built.rows, 3);
assert.equal(built.lights.length, 4);
const upLight = built.lights.find((light) => light.id === 'b');
near(upLight.peak, typePhotometry(types.get('uplight-15')).peak * 0.5, 1e-6, 'яркость 50 % — половина силы');
// Поле и прямой расчёт по паспорту дают одно и то же на стене под настенным.
const field = packLightField(built.lights);
const profiles = [...Array(built.rows)].map((_, row) => built.profiles.subarray(row * 128, row * 128 + 128));
const point = [0, 0, -2.5];
const rgb = shadeReference(field, profiles, point, [0, 1, 0], 1);
const fieldLux = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const direct = built.lights.reduce((sum, light) => {
    const type = types.get(settings.lightingFixtures.find((f) => f.id === light.id).type);
    return sum + illuminance({ ...light, peak: light.peak, fn: typePhotometry(type).fn }, point, [0, 1, 0]);
}, 0);
assert.ok(Math.abs(fieldLux - direct) / direct < 0.12, `поле ≈ паспорту: ${fieldLux.toFixed(2)} лк против ${direct.toFixed(2)} (окно дальности и размер излучателя)`);

const labels = fixtureLabels(settings.lightingFixtures, types);
assert.deepEqual([...labels.values()], ['Б-1', 'Г-1', 'Н-1', 'Б-2']);

// Сетка участка из модели: пол газоном и мощением, стена здания, низкая
// стенка, цветник, корни у дерева.
const material = (name) => Object.assign(new THREE.MeshStandardMaterial(), { name });
const root = new THREE.Group();
const floor = (name, x0, x1, z0, z1, y = 0, flip = false) => {
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(flip ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    root.add(new THREE.Mesh(geometry, material(name)));
};
floor('Lawn', -10, 0, -10, 10);
floor('Paving', 0, 10, -7, 10, 0, true); // вывернутая грань — всё равно земля
floor('Paving', 0, 7, -10, -7, 0);
floor('Roof', 4, 10, -10, 10, 3.2); // крыша над мощением — не земля
const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 20).translate(4, 1.5, 0), material('Brick'));
const lowWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 6).translate(-6, 0.25, 0), material('Brick'));
const curb = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.2).translate(-3, 0.075, -4), material('Brick'));
const house = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(8.5, 0.15, -8.5), material('Floor'));
root.add(wallMesh, lowWall, curb, house);
const grid = buildSiteGrid({
    roots: [root], bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    beds: [{ points: [[-9, -9], [-7, -9], [-7, -7], [-9, -7]] }], trees: [{ x: -3, z: 6, spread: 4 }],
    surfaces: { Lawn: 'lawn', Paving: 'paving', Floor: 'building' },
});
const kindAt = (x, z) => grid.kind[cellOf(grid, x, z)];
assert.equal(kindAt(-2, -2), KIND.lawn);
assert.equal(kindAt(2, -2), KIND.paving, 'вывернутая плитка — мощение');
near(grid.ground[cellOf(grid, 7, 0)], 0, 1e-6, 'под крышей земля — пол, а не крыша');
assert.equal(kindAt(4, 3), KIND.wall, 'стена в 3 м — насквозь гильзой');
assert.equal(kindAt(-6, 1), KIND.wall, 'стенка в полметра — тоже');
assert.equal(kindAt(-3, -4), KIND.lawn, 'бордюр в 15 см — не помеха');
assert.equal(kindAt(8.5, -8.5), KIND.building, 'пол, названный зданием, — не копают');
assert.equal(kindAt(-8, -8), KIND.bed);
assert.equal(kindAt(-3, 6), KIND.roots);
assert.equal(kindAt(12, 12), KIND.outside, 'за моделью — чужая земля');

// Файл сетки: туда и обратно — те же клетки, земля до сантиметра.
const back = decodeGrid(JSON.parse(JSON.stringify(encodeGrid(grid))));
assert.deepEqual([...back.kind], [...grid.kind]);
assert.ok(back.ground.every((y, i) => Math.abs(y - grid.ground[i]) < 0.006));
assert.equal(decodeGrid({ x0: 0 }), null);

// Электрика из проекта: подъём настенного — от земли клетки; бетонная стена
// между щитком и боллардом справа — в обход.
const plan = { ...settings, lightingFixtures: settings.lightingFixtures.map((f) => ({ ...f, circuit: 'c1' })), lightingCircuits: [settings.lightingCircuits[0]] };
const inputs = electricInputs(plan, types, grid);
near(inputs.fixtures.find((f) => f.id === 'c').rise, 2.2, 0.01, 'подъём настенного');
near(inputs.fixtures.find((f) => f.id === 'a').rise, 0, 0.01, 'боллард — от земли');
const network = lightingNetwork(plan, types, grid);
assert.equal(network.circuits.length, 1);
assert.equal(network.circuits[0].fixtures.length, 4);
assert.ok(network.circuits[0].cableLength > network.circuits[0].planLength, 'кабель длиннее трассы: подъёмы, глубина, запас');
assert.ok(network.totals.trenchLength > 0);
assert.ok(!network.conflicts.some((c) => c.kind === 'unreachable'), JSON.stringify(network.conflicts));
assert.equal(lightingNetwork(plan, types, null), null, 'без сетки — не считается');

console.log(`lighting: настройки, светильник в мире, поле = паспорт (${fieldLux.toFixed(1)} лк), сетка ${grid.cols}×${grid.rows}, файл сетки, цепь ${network.circuits[0].cableLength.toFixed(1)} м кабеля — ок`);
