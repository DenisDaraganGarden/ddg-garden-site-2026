import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Корпуса светильников (docs/garden-lighting-2026-09-25.md): параметрические,
// из примитивов three.js, размеры в метрах. Ближний и дальний LOD — из одних
// деталей, у дальнего меньше граней по кругу (правило ассетов: настраиваемые
// и с LOD). Бюджет: ближний ≤ 700 треугольников, дальний ≤ 90.
//
// Рамки. Рамка крепления: начало — точка на поверхности, +Y — нормаль
// (земля — вверх, стена — из стены); у стены +Z — вверх по стене, у земли
// рамку поворачивает yaw светильника. В ней лежит base. Голова (head, lens)
// — в своей рамке: начало в pivot (дан в рамке крепления), +Y — ось луча,
// +Z — нормаль крепления поперёк оси (ось вдоль нормали — +Z крепления),
// X = Y × Z; так голову ставит fixturePose (fixtures.js). emitter.offset — в
// рамке головы: откуда выходит свет (позиция источника), radius — размер
// светящей части.
//
// Наводимые (спот, грунтовый) соосны оси и поворачиваются в пределах tilt —
// угла, градусы, между осью и нормалью крепления, дальше которого корпус
// ломается: ось зажимает вызывающий. Ненаводимые (боллард, стена, ступень,
// фонарь) строятся как стоят, в рамке крепления, и переводятся в рамку
// головы под pitch типа (третий аргумент; без него — pitch формы); их tilt 0.

// Граней по кругу: ближний, дальний.
const SEGMENTS = [24, 6];
const UP = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad, deg = THREE.MathUtils.radToDeg;
// Умолчания формы; pitch — ось ненаводимых без pitch типа, wall — на стене.
const DEFAULTS = {
    bollard: { h: 0.8, d: 0.16, pitch: -90 },
    spike: { h: 0.12, d: 0.07 },                                  // h — длина головы
    inground: { h: 0.1, d: 0.16 },                                // h — глубина корпуса в земле, не рисуется
    wall: { w: 0.12, h: 0.2, d: 0.1, pitch: -90, wall: true },    // d — вынос от стены
    step: { w: 0.16, h: 0.08, d: 0.004, pitch: -35, wall: true }, // d — выступ накладки с линзой
    post: { h: 3, d: 0.08, pitch: -90 },
};

// Цилиндр вдоль Y от y0 до y1, радиусы снизу и сверху; open — без торцов.
const tube = (r0, r1, y0, y1, s, open = false) => new THREE.CylinderGeometry(r1, r0, y1 - y0, s, 1, open).translate(0, (y0 + y1) / 2, 0);
// Диск лицом к +Y.
const disc = (r, y, s) => new THREE.CircleGeometry(r, s).rotateX(-Math.PI / 2).translate(0, y, 0);
const box = (x, y, z, cy = 0) => new THREE.BoxGeometry(x, y, z).translate(0, cy, 0);
// Тело вращения по профилю [[r, y]]: обход снаружи внутрь даёт нормали наружу.
// Нормаль последней точки профиля three r183 отдаёт ненормированной.
const lathe = (profile, s) => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), s);
    g.normalizeNormals();
    return g;
};
// Гранёное тело вращения — по lathe на отрезок профиля: одна LatheGeometry
// усредняет нормали на изломах, и фаска с плоским верхом кольца блестят
// скруглённым валиком. Треугольников столько же.
const facets = (profile, s) => profile.slice(1).map((p, i) => lathe([profile[i], p], s));
const merge = (parts) => { const g = mergeGeometries(parts); for (const part of parts) part.dispose(); return g; };
const positive = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);

// Ось луча в рамке крепления: у стены +Z — вверх по стене, у земли yaw уже
// повернул рамку, и ось лежит в её плоскости YZ.
const axisOf = (pitch, wall) => { const p = rad(pitch); return wall ? [0, Math.cos(p), Math.sin(p)] : [0, Math.sin(p), Math.cos(p)]; };
// Из рамки крепления (от pivot) в рамку головы с осью a — базис головы как у
// fixtures.js, обратный ему у поворота — транспонированный.
function toHead(axis) {
    const y = new THREE.Vector3(...axis), z = UP.clone().addScaledVector(y, -y.y);
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    return new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z).transpose();
}

// Боллард и фонарь: столб, на нём голова — полоса линзы с сердечником, у
// фонаря воротник, сверху колпак; pivot — верх по центру. Доли — от диаметра
// столба; у низкого корпуса голова ужимается до 0,8 h, иначе столбу
// досталась бы отрицательная высота и он вывернулся бы под землю. Столб
// фонаря открыт с концов: низ в земле, верх под воротником.
const COLUMNS = {
    bollard: { cap: 0.2, band: 0.5, collar: 0, lens: 0.94, open: false },
    post: { cap: 0.35, band: 2, collar: 0.5, lens: 1, open: true },
};
function column({ h, d }, s, k) {
    const r = d / 2, R = 1.08 * r, f = Math.min(1, (0.8 * h) / ((k.cap + k.band + k.collar) * d));
    const cap = f * k.cap * d, band = cap + f * k.band * d, top = band + f * k.collar * d;
    const head = [tube(R, R, -cap, 0, s), tube(0.35 * r, 0.35 * r, -band, -cap, s, true)];
    if (k.collar) head.push(tube(R, R, -top, -band, s));
    return {
        base: [tube(r, r, 0, h - top, s, k.open)], head, lens: [tube(k.lens * r, k.lens * r, -band, -cap, s, true)],
        pivot: [0, h, 0], emitter: { offset: [0, -(cap + band) / 2, 0], radius: k.lens * r },
    };
}

// Спот на колышке: колышек 0,22 м в земле не рисуется; над землёй пенёк 8 см,
// стержень и шарнир в pivot на 10 см. Шарнир — шар, а не вилка: голова
// наводится куда угодно, и base не надо поворачивать вслед за ней. Голова —
// цилиндр от шарнира по +Y (у ближнего — скос к тылу), линза на торце. tilt —
// пока край торца не коснётся земли: P + h·cos θ − r·sin θ = 0.
const SPIKE_STUB = 0.08, SPIKE_PIVOT = 0.1;
function spike({ h, d }, s, near) {
    const r = d / 2, lens = 0.85 * r, reach = Math.hypot(h, r);
    return {
        base: near
            ? [tube(0.011, 0.011, 0, SPIKE_STUB, s), tube(0.006, 0.006, SPIKE_STUB, SPIKE_PIVOT, s, true), new THREE.SphereGeometry(0.014, 12, 6).translate(0, SPIKE_PIVOT, 0)]
            : [tube(0.011, 0.011, 0, SPIKE_PIVOT, s)],
        head: near ? [tube(0.75 * r, r, 0, 0.2 * h, s), tube(r, r, 0.2 * h, h, s)] : [tube(r, r, 0, h, s)],
        lens: [disc(lens, h + 0.0005, s)],
        pivot: [0, SPIKE_PIVOT, 0], aimable: true, emitter: { offset: [0, h, 0], radius: lens },
        tilt: SPIKE_PIVOT >= reach ? 180 : deg(Math.acos(-SPIKE_PIVOT / reach) - Math.atan2(r, h)),
    };
}

// Грунтовый: кольцо с фаской выступает над покрытием на LIP при любой h —
// корпус глубиной h в земле не рисуется. В голове — чашка оптики внутри
// кольца, линза утоплена на LIP/2; pivot — на поверхности. tilt — пока обод
// чашки (rc, y) не выйдет над кольцом, y·cos θ + rc·sin θ = LIP, и пока край
// линзы не уйдёт под покрытие, tg θ = y′/rл; у Ø160 — 7,5°.
const LIP = 0.015;
function inground({ d }, s) {
    const R = d / 2, ri = R - 0.125 * d, rc = ri - 0.002, lens = 0.85 * rc, y = LIP / 2, bevel = (R - ri) / 4;
    return {
        base: facets([[R, 0], [R, 0.6 * LIP], [R - bevel, LIP], [ri, LIP], [ri, 0]], s),
        head: facets([[rc, 0.2 * LIP], [rc, y], [lens, y]], s),
        lens: [disc(lens, y + 0.0005, s)],
        pivot: [0, 0, 0], aimable: true, emitter: { offset: [0, y, 0], radius: lens },
        tilt: deg(Math.min(Math.asin(Math.min(1, LIP / Math.hypot(y, rc))) - Math.atan2(y, rc), Math.atan2(y + 0.0005, lens))),
    };
}

// Настенный: коробка w (вдоль стены) × h (вверх) с выносом d, pivot — в её
// центре. Линза с ободком лежит на той грани, через которую ось луча выходит
// из коробки (pitch −90 — низ, 90 — верх, 0 — лицо), в точке выхода, но
// целиком на грани. «Вверх-вниз» — вторая голова: тот же корпус под −pitch.
function wall({ w, h, d }, s, near, pitch) {
    const r = 0.4 * Math.min(w, h, d), half = [w / 2, d / 2, h / 2], a = axisOf(pitch, true);
    const reach = a.map((v, i) => (Math.abs(v) > 1e-9 ? half[i] / Math.abs(v) : Infinity)), t = Math.min(...reach), k = reach.indexOf(t);
    const c = a.map((v, i) => (i === k ? Math.sign(v) * half[i] : THREE.MathUtils.clamp(v * t, r - half[i], half[i] - r)));
    const n = new THREE.Vector3().setComponent(k, Math.sign(a[k])), turn = new THREE.Quaternion().setFromUnitVectors(UP, n);
    const onFace = (g) => g.applyQuaternion(turn).translate(...c);
    return {
        base: [box(w, d, h, d / 2)],
        head: [onFace(tube(r, r, -0.002, 0.004, s))], lens: [onFace(disc(0.8 * r, 0.0045, s))],
        pivot: [0, d / 2, 0], emitter: { offset: n.multiplyScalar(0.004).add(new THREE.Vector3(...c)).toArray(), radius: 0.8 * r },
    };
}

// Для ступеней: накладка w × h, корпус в стене не рисуется. В нижней части —
// рамка окошка и линза, каждая на 0,1 d над предыдущей: d — полный выступ.
// pivot — на лице накладки за линзой.
function step({ w, h, d }) {
    const lw = 0.7 * w, lh = 0.3 * h;
    return {
        base: [box(w, 0.8 * d, h, 0.4 * d)],
        head: [box(0.8 * w, 0.2 * d, 0.45 * h)], lens: [box(lw, 0.2 * d, lh, 0.1 * d)],
        pivot: [0, 0.8 * d, -0.2 * h], emitter: { offset: [0, 0.2 * d, 0], radius: Math.sqrt((lw * lh) / Math.PI) },
    };
}

const SHAPES = {
    bollard: (size, s) => column(size, s, COLUMNS.bollard),
    post: (size, s) => column(size, s, COLUMNS.post),
    spike, inground, wall, step,
};

// housing = { shape, h, d, w? }, pitch — градусы, ось ненаводимых (pitch типа)
// → { base, head, lens, pivot, aimable, tilt, emitter, size: [w, h, d] } —
// size с подставленными умолчаниями, у круглых w = d.
export function buildHousing(housing, lod = 0, pitch) {
    const build = SHAPES[housing?.shape];
    if (!build) throw new Error(`Неизвестный корпус светильника: ${housing?.shape}`);
    const own = DEFAULTS[housing.shape];
    const h = positive(housing.h, own.h), d = positive(housing.d, own.d), w = own.w ? positive(housing.w, own.w) : d;
    const near = !lod, aim = Number.isFinite(pitch) ? pitch : own.pitch;
    const { base, head, lens, pivot, emitter, aimable = false, tilt = 0 } = build({ w, h, d }, SEGMENTS[near ? 0 : 1], near, aim);
    if (!aimable) {
        const m = toHead(axisOf(aim, own.wall));
        for (const g of [...head, ...lens]) g.applyMatrix4(m);
        emitter.offset = new THREE.Vector3(...emitter.offset).applyMatrix4(m).toArray();
    }
    return { base: merge(base), head: merge(head), lens: merge(lens), pivot, aimable, tilt, emitter, size: [w, h, d] };
}
