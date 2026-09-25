// Run: node src/lighting/housings.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fixturePose } from './fixtures.js';
import { buildHousing } from './housings.js';
import { BUILTIN_LUMINAIRES, luminaireById } from './types.js';

// Корпус ставит fixturePose (fixtures.js) — как в сцене: крепление в начале
// координат, у земли yaw 0 (к +Z), стена смотрит в +Z. Габариты считаются в
// рамке крепления. Для каждой формы — показательный pitch и ожидаемые
// габариты [x, y, z] из size = [w, h, d]. Спот — стволом вверх: высота —
// шарнир плюс голова. Кольцо грунтового выступает на 15 мм при любой h.
const CASES = {
    bollard: { pitch: -90, box: ([, h, d]) => [d, h, d] },
    spike: { pitch: 90, box: ([, h, d], pivot) => [d, pivot[1] + h, d] },
    inground: { pitch: 88, box: ([, , d]) => [d, 0.015, d] },
    wall: { pitch: -90, wall: true, box: ([w, h, d]) => [w, d, h] },
    step: { pitch: -35, wall: true, box: ([w, h, d]) => [w, d, h] },
    post: { pitch: -90, box: ([, h, d]) => [d, h, d] },
};
const BUDGET = [700, 90];
const rad = THREE.MathUtils.degToRad;

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const bounds = (g) => new THREE.Box3().setFromBufferAttribute(g.attributes.position);
const summary = {};

// Голова в рамке крепления: fixturePose даёт мир, возвращаемся в крепление.
function placed(out, shape, pitch) {
    const pose = fixturePose({ x: 0, y: 0, z: 0, ...(CASES[shape].wall ? { nx: 0, ny: 0, nz: 1 } : {}), yaw: 0, pitch }, { pitch }, out);
    const m = pose.mount.clone().invert().multiply(pose.head);
    return { base: bounds(out.base), head: bounds(out.head.clone().applyMatrix4(m)), lens: bounds(out.lens.clone().applyMatrix4(m)) };
}
function fits(out, shape, pitch, label) {
    const { base, head, lens } = placed(out, shape, pitch);
    const extent = base.clone().union(head).union(lens).getSize(new THREE.Vector3()).toArray();
    CASES[shape].box(out.size, out.pivot).forEach((want, axis) => {
        assert.ok(Math.abs(extent[axis] - want) <= 0.15 * want, `${label}: ${'xyz'[axis]} ${extent[axis].toFixed(4)} m, want ${want} m ±15%`);
    });
    // Линза настенного и ступени — на грани корпуса снаружи, не в воздухе и не внутри.
    if (CASES[shape].wall) {
        const gap = base.distanceToPoint(lens.getCenter(new THREE.Vector3()));
        assert.ok(gap > 0 && gap <= 0.005, `${label}: lens ${gap.toFixed(4)} m off the body`);
    }
    return extent;
}

function checkHousing(housing, lod, label, pitch = CASES[housing.shape].pitch) {
    const out = buildHousing(housing, lod, pitch), parts = [out.base, out.head, out.lens];
    const total = parts.reduce((sum, g) => sum + tris(g), 0);
    assert.ok(total <= BUDGET[lod], `${label}: ${total} triangles over ${BUDGET[lod]}`);
    for (const g of parts) {
        const { position, normal, uv } = g.attributes;
        assert.ok(position && normal && uv && g.index, `${label}: position, normal, uv and index`);
        assert.equal(normal.count, position.count, `${label}: a normal per vertex`);
        for (let i = 0; i < position.count; i += 1) {
            assert.ok([position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite), `${label}: NaN at vertex ${i}`);
            const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
            assert.ok(Math.abs(length - 1) < 1e-4, `${label}: normal ${i} is ${length}`);
        }
        assert.ok(tris(g) > 0, `${label}: an empty part`);
        // Грани смотрят туда же, куда нормали (профиль тела вращения обойдён верно).
        const [a, b, c, n] = [0, 1, 2, 3].map(() => new THREE.Vector3());
        for (let t = 0; t < g.index.count; t += 3) {
            const [i, j, k] = [0, 1, 2].map((o) => g.index.getX(t + o));
            a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, j); c.fromBufferAttribute(position, k);
            const face = b.sub(a).cross(c.sub(a));
            n.fromBufferAttribute(normal, i).add(a.fromBufferAttribute(normal, j)).add(c.fromBufferAttribute(normal, k));
            assert.ok(face.lengthSq() < 1e-14 || face.dot(n) > 0, `${label}: triangle ${t / 3} faces away from its normals`);
        }
    }
    assert.equal(typeof out.aimable, 'boolean');
    assert.ok(out.aimable ? out.tilt > 0 : out.tilt === 0, `${label}: tilt ${out.tilt}`);
    assert.ok(out.emitter.radius > 0 && out.pivot.every(Number.isFinite), `${label}: emitter and pivot`);
    // Корпус не уходит под поверхность крепления (низкий столб не выворачивается).
    assert.ok(bounds(out.base).min.y >= -1e-6, `${label}: base down to ${bounds(out.base).min.y.toFixed(4)} m`);
    // Свет выходит из головы: точка emitter — в её рамке, внутри её коробки (±1 мм),
    // и вместе с линзой по +Y головы — туда, куда смотрит ось.
    const emitter = new THREE.Vector3(...out.emitter.offset);
    assert.ok(bounds(out.head).expandByScalar(1e-3).containsPoint(emitter), `${label}: emitter ${out.emitter.offset} outside the head`);
    assert.ok(emitter.y > 0 && bounds(out.lens).getCenter(new THREE.Vector3()).y > 0, `${label}: light leaves along head +Y`);
    // Габариты наводимых — при показательном наведении (pitch строить им не нужен).
    const extent = fits(out, housing.shape, out.aimable ? CASES[housing.shape].pitch : pitch, label);
    for (const g of parts) g.dispose();
    return { total, extent };
}

for (const shape of Object.keys(CASES)) {
    const [near, far] = [0, 1].map((lod) => checkHousing({ shape }, lod, `${shape} lod ${lod}`));
    summary[shape] = `${near.total}/${far.total} tris, ${near.extent.map((v) => v.toFixed(3)).join('×')} m`;
}
assert.throws(() => buildHousing({ shape: 'lantern' }), /Неизвестный корпус/, 'an unknown shape is an error');
// Низкий толстый столб и паспортная глубина грунтового (0,11 м) — не повод
// выворачивать столб под землю или ставить над покрытием трубу.
for (const housing of [{ shape: 'bollard', h: 0.2, d: 0.3 }, { shape: 'post', h: 0.5, d: 0.2 }, { shape: 'inground', h: 0.11, d: 0.16 }]) {
    for (const lod of [0, 1]) checkHousing(housing, lod, `${JSON.stringify(housing)} lod ${lod}`);
}

// Ненаводимые строятся под pitch типа: при любом наклоне корпус собирается в
// свои габариты — колпак на столбе, линза на грани коробки, окошко в накладке.
const PITCHES = [-90, -60, -35, 0, 30, 60, 90];
for (const shape of ['bollard', 'post', 'wall', 'step']) {
    for (const pitch of PITCHES) for (const lod of [0, 1]) fits(buildHousing({ shape }, lod, pitch), shape, pitch, `${shape} at pitch ${pitch} lod ${lod}`);
}

// Наводимые держат свой tilt: наклонённая на него у pivot голова грунтового не
// выходит над кольцом, и линза не уходит краем под покрытие; спот не втыкается
// в землю. На градус дальше — уже ломается: предел точный, а не с запасом.
function holds(shape, out, tilt) {
    const at = new THREE.Matrix4().makeRotationX(rad(tilt)).setPosition(...out.pivot);
    const head = bounds(out.head.clone().applyMatrix4(at)), lens = bounds(out.lens.clone().applyMatrix4(at));
    return lens.min.y >= 0 && (shape === 'inground' ? Math.max(head.max.y, lens.max.y) <= bounds(out.base).max.y + 1e-6 : head.min.y >= -1e-6);
}
const tilts = {};
for (const shape of ['spike', 'inground']) {
    for (const lod of [0, 1]) {
        const out = buildHousing({ shape }, lod);
        assert.ok(holds(shape, out, out.tilt) && !holds(shape, out, out.tilt + 1), `${shape} lod ${lod}: tilt ${out.tilt.toFixed(2)}° is not its limit`);
        tilts[shape] = out.tilt;
    }
}

// Кольцо грунтового гранёное: нормали вершин каждого треугольника в своей
// плоскости профиля (от оси, вверх) — нормаль его грани: наружная стенка от
// оси, верх вверх, внутренняя к оси, фаска (0,4·15 мм вверх на 5 мм внутрь) —
// (0,768; 0,640). Одна LatheGeometry скругляла бы изломы валиком.
{
    const { base } = buildHousing({ shape: 'inground' }, 0), { position: p, normal: n } = base.attributes;
    const vertex = (i) => {
        const r = Math.hypot(p.getX(i), p.getZ(i));
        return { r, y: p.getY(i), n: [(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)) / r, n.getY(i)] };
    };
    const facet = (vs) => (vs.every((v) => v.y > 0.0149) ? [0, 1] : vs.every((v) => v.r > 0.0799) ? [1, 0] : vs.every((v) => v.r < 0.0601) ? [-1, 0] : [0.768, 0.640]);
    for (let t = 0; t < base.index.count; t += 3) {
        const vs = [0, 1, 2].map((o) => vertex(base.index.getX(t + o))), [x, y] = facet(vs);
        for (const v of vs) assert.ok(Math.hypot(v.n[0] - x, v.n[1] - y) < 2e-3, `inground: ring at r ${v.r.toFixed(3)} y ${v.y.toFixed(4)} normal ${v.n.map((c) => c.toFixed(3))}, facet ${x}, ${y}`);
    }
}

// Типы: форма записи из «Типы и библиотека» docs/garden-lighting-2026-09-25.md.
const PROFILES = ['spot', 'flood', 'lambert', 'bollard', 'updown', 'omni'];
const CONTROLS = ['switch', 'dali', 'dmx', '0-10v', 'casambi'];
const REQUIRED = ['housing.shape', 'housing.h', 'housing.d', 'housing.color', 'housing.metal', 'housing.rough', 'optics.lumens', 'optics.beam', 'optics.cct', 'optics.profile',
    'mount', 'pitch', 'power.watts', 'power.volts', 'power.current', 'power.driver', 'control'];
const at = (record, path) => path.split('.').reduce((value, key) => value?.[key], record);
const ids = new Set();
for (const type of BUILTIN_LUMINAIRES) {
    assert.match(type.id, /^[a-z0-9][a-z0-9-]{0,63}$/, `id ${type.id}`);
    assert.ok(!ids.has(type.id), `id ${type.id} twice`);
    ids.add(type.id);
    assert.ok(type.ru && type.en && type.generic === true, `${type.id}: names and generic`);
    for (const path of REQUIRED) {
        assert.ok(at(type, path) !== undefined && at(type, path) !== null, `${type.id}: no ${path}`);
        assert.equal(type.source[path], 'guess', `${type.id}: ${path} is not in source as a guess`);
    }
    assert.ok(Object.values(type.source).every((origin) => origin === 'guess'), `${type.id}: a generic type claims a sheet`);
    assert.ok(PROFILES.includes(type.optics.profile), `${type.id}: profile ${type.optics.profile}`);
    assert.ok(['ground', 'wall', 'pole'].includes(type.mount) && Math.abs(type.pitch) <= 90, `${type.id}: mount and pitch`);
    assert.ok([230, 24, 12].includes(type.power.volts) && (type.power.volts === 230) === (type.power.current === 'ac'), `${type.id}: volts and current`);
    assert.ok(type.control.length && type.control.every((c) => CONTROLS.includes(c)), `${type.id}: control`);
    assert.ok(type.optics.lumens > 0 && type.power.watts > 0 && type.optics.beam > 0, `${type.id}: numbers`);
    assert.equal(luminaireById(BUILTIN_LUMINAIRES, type.id), type);
    for (const lod of [0, 1]) checkHousing(type.housing, lod, `${type.id} lod ${lod}`, type.pitch);
}
assert.equal(ids.size, 10, 'ten built-in types');
assert.equal(luminaireById(BUILTIN_LUMINAIRES, 'nope'), null);
assert.ok(Object.isFrozen(BUILTIN_LUMINAIRES) && Object.isFrozen(BUILTIN_LUMINAIRES[0].housing), 'built-ins are frozen');

console.log(`housings (near/far triangles, near box x×y×z): ${Object.entries(summary).map(([shape, line]) => `${shape} ${line}`).join('; ')}`);
console.log(`tilt limits: spike ${tilts.spike.toFixed(1)}°, inground ${tilts.inground.toFixed(2)}°; non-aimable heads fit at pitch ${PITCHES.join(', ')}`);
console.log(`types: ${ids.size} built-ins, every field a guess, housings built at both LODs`);
