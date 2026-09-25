// Освещение сада целиком, без браузера: настройки, светильник в мире, свет
// поля из типов, сетка участка из треугольников модели, её файл и электрика
// из данных проекта. Модули по отдельности — в своих проверках
// (photometry, lightField, electric, housings).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILTIN_LUMINAIRES } from './types.js';
import { aimAt, beamAxis, normalizeLightingSettings } from './settings.js';
import { fixtureLabels, fixturePose, gardenLights, luminaireSchedule } from './fixtures.js';
import { packLightField, shadeReference } from './lightField.js';
import { illuminance } from './photometry.js';
import { typePhotometry } from './fixtures.js';
import { buildSiteGrid } from './siteGrid.js';
import { allocateShadows, CUBE_FACES, tileCamera, tileProject } from './gardenShadows.js';
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
for (const yaw of [179.95, 179.97, 180, -180.04, 12.34, -0.04]) {
    const once = normalizeLightingSettings({ lightingFixtures: [{ type: 'spike-24', x: 0, y: 0, z: 0, yaw }] }).lightingFixtures[0];
    assert.deepEqual(normalizeLightingSettings({ lightingFixtures: [once] }).lightingFixtures[0], once, `yaw ${yaw} — нормализация идемпотентна`);
}
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

// Спот на колышке вниз (−90°) — голова у предела наклона в сторону поворота,
// а не вверх; боллард на склоне — отвесно; поворот оптики 0 — не наводится.
const down = fixturePose({ ...normalizeLightingSettings({ lightingFixtures: [{ type: 'spike-24', x: 0, y: 0, z: 0, pitch: -90 }] }).lightingFixtures[0] }, types.get('spike-24'));
assert.ok(new THREE.Vector3().setFromMatrixColumn(down.head, 1).y < 0, 'голова спота смотрит вниз, а не вверх');
const slope = fixturePose({ ...bollard, nx: 0.3, ny: 0.95, nz: 0 }, types.get('bollard-80'));
near(new THREE.Vector3().setFromMatrixColumn(slope.mount, 1).y, 1, 1e-9, 'боллард на склоне — отвесно');
const fixed = { ...types.get('uplight-15'), optics: { ...types.get('uplight-15').optics, tilt: 0 } };
near(fixturePose(uplight, fixed).axis.y, 1, 1e-9, 'оптика без поворота — строго вверх');

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

// Тени: боллард (вниз, до 92°) — пять граней куба без верхней; узкий спот —
// одна плитка по оси; атлас кончился — без тени. Камера плитки и зеркало
// шейдера (tileProject) видят точку одинаково: ndc и глубина взгляда.
{
    const plans = allocateShadows([
        { axis: [0, -1, 0], cutoff: (92 * Math.PI) / 180, range: 10, peak: 100 },
        { axis: [0, 1, 0], cutoff: (26 * Math.PI) / 180, range: 20, peak: 5000 },
        { axis: [1, 0, 0], cutoff: Math.PI, range: 5, peak: 10 },
    ], 7);
    assert.equal(plans[1].base, 0, 'сильный первым');
    assert.equal(plans[1].tiles.length, 1);
    assert.equal(plans[0].tiles.length, 5, 'боллард — пять граней');
    assert.equal(plans[0].mask & (1 << 2), 0, 'верхней грани нет');
    assert.equal(plans[2], null, 'шесть граней не влезли в семь плиток после шести занятых');
    const camera = tileCamera(new THREE.PerspectiveCamera(), [1, 2, 3], plans[1].tiles[0].dir, plans[1].tan, 20);
    for (const point of [[1.3, 6, 3.2], [0.2, 9, 2.5], [2, 4, 3.9]]) {
        const clip = new THREE.Vector4(...point, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        const mirror = tileProject([1, 2, 3], plans[1].tiles[0].dir, plans[1].tan, point);
        near(clip.x / clip.w, mirror.x, 1e-6, 'ndc x плитки');
        near(clip.y / clip.w, mirror.y, 1e-6, 'ndc y плитки');
        near(clip.w, mirror.w, 1e-6, 'глубина взгляда');
    }
    for (const face of CUBE_FACES) {
        const cube = tileCamera(new THREE.PerspectiveCamera(), [0, 0, 0], face, 1, 10);
        const ahead = new THREE.Vector3(...face).multiplyScalar(3).applyMatrix4(cube.matrixWorldInverse);
        near(ahead.z, -3, 1e-9, `грань ${face} смотрит по своей оси`);
    }
}

const labels = fixtureLabels(settings.lightingFixtures, types);
assert.deepEqual([...labels.values()], ['Б-1', 'Г-1', 'Н-1', 'Б-2']);

// Спецификация: виды в порядке библиотеки, штуки и мощность по типу, цена —
// только известная; тип, которого нет в библиотеке, — в конце, без вида.
const priced = new Map([...types, ['cs-test', { ...types.get('bollard-80'), id: 'cs-test', price: { rub: 1000 } }]]);
const schedule = luminaireSchedule([...settings.lightingFixtures, { id: 'x', type: 'cs-test' }, { id: 'y', type: 'gone' }], priced, new Map([...labels, ['x', 'Б-3'], ['y', 'Л-1']]));
assert.deepEqual(schedule.groups.map((group) => group.kind?.id ?? null), ['bollard', 'inground', 'wall', null]);
assert.deepEqual(schedule.groups[0].rows.map((row) => [row.id, row.count, row.labels.join()]), [['bollard-80', 2, 'Б-1,Б-2'], ['cs-test', 1, 'Б-3']]);
assert.equal(schedule.groups[0].count, 3);
assert.deepEqual(schedule.totals, { count: 6, types: 5, watts: 8 * 2 + 12 + 7 + 8, lumens: 450 * 2 + 900 + 450 + 450, sum: 1000, unpriced: 5 });

// Сетка участка из модели: пол газоном и мощением, стена здания, низкая
// стенка, цветник, корни у дерева.
const material = (name) => Object.assign(new THREE.MeshStandardMaterial(), { name });
const root = new THREE.Group();
const floor = (name, x0, x1, z0, z1, y = 0, flip = false) => {
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(flip ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    root.add(new THREE.Mesh(geometry, material(name)));
};
floor('Lawn', -10, 0, -10, 10);
floor('Lawn', 0, 3, -2, 2, -0.2); // газон под плиткой — плитка сверху решает
floor('SlabBottom', 5, 6, 5, 6, -0.25, true); // низ плиты под мощением
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
    beds: [
        { points: [[-9, -9], [-7, -9], [-7, -7], [-9, -7]] },
        // Газон поверх плитки и цветник в нём; газон вокруг дерева.
        { kind: 'lawn', points: [[1, 7], [3, 7], [3, 9], [1, 9]] }, { points: [[2.2, 8.2], [2.8, 8.2], [2.8, 8.8], [2.2, 8.8]] },
        { kind: 'lawn', points: [[-5, 4], [-1, 4], [-1, 8], [-5, 8]] },
    ], trees: [{ x: -3, z: 6, spread: 4 }],
    surfaces: { Lawn: 'lawn', Paving: 'paving', Floor: 'building' },
});
const kindAt = (x, z) => grid.kind[cellOf(grid, x, z)];
assert.equal(kindAt(-2, -2), KIND.lawn);
assert.equal(kindAt(2, -2), KIND.paving, 'вывернутая плитка — мощение');
assert.equal(kindAt(1, 0), KIND.paving, 'плитка на газоне — мощение, не газон под ней');
assert.equal(kindAt(5.5, 5.5), KIND.paving, 'верх плиты, а не её низ');
near(grid.ground[cellOf(grid, 5.5, 5.5)], 0, 1e-6, 'земля — верх плиты');
near(grid.ground[cellOf(grid, 7, 0)], 0, 1e-6, 'под крышей земля — пол, а не крыша');
assert.equal(kindAt(4, 3), KIND.wall, 'стена в 3 м — насквозь гильзой');
assert.equal(kindAt(-6, 1), KIND.wall, 'стенка в полметра — тоже');
assert.equal(kindAt(-3, -4), KIND.lawn, 'бордюр в 15 см — не помеха');
assert.equal(kindAt(8.5, -8.5), KIND.building, 'пол, названный зданием, — не копают');
assert.equal(kindAt(-8, -8), KIND.bed);
assert.equal(kindAt(-3, 6), KIND.roots, 'корни дерева на газоне — корни');
assert.equal(kindAt(1.5, 7.5), KIND.lawn, 'нарисованный газон — газон, хоть под ним плитка модели');
assert.equal(kindAt(2.5, 8.5), KIND.bed, 'цветник в газоне — цветник');
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
