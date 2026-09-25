// Run: node src/lighting/photometry.check.js
import assert from 'node:assert/strict';
import {
    cctToLinear, fromPhotometricFile, illuminance, parseIES, parseLDT, peakCandela, profileSamples,
    PROFILE_SAMPLES, rangeFor, shapeFunction,
} from './photometry.js';

const DEG = Math.PI / 180;
const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} vs ${b} (±${tolerance})`);
// Независимый поток: средние точки, 200 000 шагов, без Симпсона модуля.
const flux = (fn, peak) => {
    const n = 200000, h = Math.PI / n;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += fn((i + 0.5) * h) * Math.sin((i + 0.5) * h);
    return 2 * Math.PI * peak * sum * h;
};

// Прожектор 24°/40°: 50 % на 12°, 10 % на 20°, в ноль до π.
const spot = shapeFunction({ profile: 'spot', beam: 24, field: 40 });
near(spot(12 * DEG), 0.5, 0.01, 'spot 24° at 12°');
near(spot(20 * DEG), 0.1, 0.01, 'spot 40° field at 20°');
assert.equal(spot(0), 1, 'spot peak on the axis');
assert.equal(spot(90 * DEG), 0, 'spot is dark sideways');
const spotCd = peakCandela(spot, 500);
near(flux(spot, spotCd), 500, 5, 'spot 500 lm integrates back');
// Узкий 8° — точность интеграла, ради которой он идёт по функции.
const narrow = shapeFunction({ profile: 'spot', beam: 8 });
const narrowCd = peakCandela(narrow, 300);
near(flux(narrow, narrowCd), 300, 3, 'narrow 8° 300 lm integrates back');
// Равномерный шар: I = Φ/4π.
near(peakCandela(() => 1, 10), 10 / (4 * Math.PI), 1e-9, 'isotropic 10 lm');
// Поток строки так, как её читает шейдер: u = θ·127/π, texelFetch и lerp.
// Луч уже 6° держится на 6°, иначе строка несёт на 17 % (2°) больше люменов.
const rowFlux = (fn, peak) => {
    const row = profileSamples(fn), n = 200000, h = Math.PI / n;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) * h, u = (t * (PROFILE_SAMPLES - 1)) / Math.PI, i0 = Math.min(Math.floor(u), PROFILE_SAMPLES - 2);
        sum += (row[i0] + (row[i0 + 1] - row[i0]) * (u - i0)) * Math.sin(t);
    }
    return 2 * Math.PI * peak * sum * h;
};
const pin = shapeFunction({ profile: 'spot', beam: 2 }), pinRow = rowFlux(pin, peakCandela(pin, 1000));
near(pinRow, 1000, 30, 'spot 2° drawn by the row keeps its lumens');
const dot = shapeFunction({ profile: 'lambert', beam: 2 });
near(rowFlux(dot, peakCandela(dot, 1000)), 1000, 30, 'lambert 2° drawn by the row keeps its lumens');
// Не число в угле — как пропуск; чужие ключи объекта — не формы.
near(peakCandela(shapeFunction({ profile: 'spot', beam: NaN, field: NaN }), 500), peakCandela(shapeFunction({ profile: 'spot' }), 500), 1e-9, 'NaN beam falls back');
near(shapeFunction({ profile: 'spot', beam: 24, field: NaN })(12 * DEG), 0.5, 0.01, 'NaN field falls back');
for (const profile of ['toString', 'constructor']) assert.throws(() => shapeFunction({ profile }), /неизвестная форма/, profile);

// Ламберт 120°: m = 1, I₀ = Φ/π.
const lambert = shapeFunction({ profile: 'lambert', beam: 120 });
near(lambert(60 * DEG), 0.5, 1e-9, 'lambert half at 60°');
const lambertCd = peakCandela(lambert, 1000);
near(lambertCd, 1000 / Math.PI, 0.005 * 1000 / Math.PI, 'lambert peak = lm/π');

// Столбик: выше 92° — ничего, на 60° светит, пик = 1.
const bollard = shapeFunction({ profile: 'bollard' });
for (let a = 92; a <= 180; a += 2) assert.equal(bollard(a * DEG), 0, `bollard dark at ${a}°`);
assert.ok(bollard(60 * DEG) > 0.5, `bollard lit at 60° (${bollard(60 * DEG).toFixed(3)})`);
const bollardRow = profileSamples(bollard);
assert.ok(bollardRow.length === PROFILE_SAMPLES && Math.max(...bollardRow) === 1, 'bollard profile peaks at 1');

// Вверх-вниз и шар: пик 1 на оси, у шара — 0,5 у цоколя.
const updown = shapeFunction({ profile: 'updown', beam: 30 });
near(updown(0), 1, 1e-9, 'updown down lobe');
near(updown(Math.PI), 1, 1e-9, 'updown up lobe');
assert.equal(updown(90 * DEG), 0, 'updown dark sideways');
const omni = shapeFunction({ profile: 'omni' });
near(omni(Math.PI), 0.5, 1e-9, 'omni socket dip');
assert.throws(() => shapeFunction({ profile: 'laser' }), /неизвестная форма/);

// Цвет: 6504 K — белый D65, 2700 K — тёплый, яркость всегда 1.
const d65 = cctToLinear(6504);
d65.forEach((v, i) => near(v, 1, 0.03, `6504 K channel ${i}`));
const warm = cctToLinear(2700);
assert.ok(warm[0] > warm[1] && warm[1] > warm[2], `2700 K is r > g > b (${warm.map((v) => v.toFixed(3))})`);
for (let k = 1700; k <= 12000; k += 50) {
    const [r, g, b] = cctToLinear(k);
    near(0.2126 * r + 0.7152 * g + 0.0722 * b, 1, 1e-6, `luminance at ${k} K`);
    assert.ok(r >= 0 && g >= 0 && b >= 0, `no negative channel at ${k} K`);
}
// На стыке Планка и дневного света — без скачка.
const [a4499, a4501] = [cctToLinear(4499), cctToLinear(4501)];
a4499.forEach((v, i) => near(v, a4501[i], 0.002, `no jump at 4500 K channel ${i}`));

// IES LM-63-2002: ламбертовский даунлайт 1000 лм, I = 318,3·cos γ, числа
// вразброс по строкам, ключевые слова с [MORE], запятая как разделитель.
const iesText = `IESNA:LM-63-2002
[TEST] photometry.check
[MANUFAC] Ouroboros
[LUMINAIRE] Downlight
[MORE] lambertian
TILT=NONE
1 1000 1 7 1 1 2 0.1 0.1
0.05
1.0 1.0 10
0 15 30
45, 60, 75 90
0
318.3 307.5 275.7 225.1
159.2
82.4 0.0
`;
const ies = parseIES(iesText);
assert.equal(ies.keywords.LUMINAIRE, 'Downlight lambertian', 'IES [MORE] continues the keyword');
const iesLight = fromPhotometricFile(ies);
near(iesLight.lumens, ies.lamps * ies.lumensPerLamp, 30, 'IES lumens');
near(iesLight.peak, 318.3, 1e-9, 'IES peak');
near(iesLight.fn(30 * DEG), 275.7 / 318.3, 1e-9, 'IES profile at 30°');
assert.equal(iesLight.fn(100 * DEG), 0, 'IES dark past its last angle');
// Голый CR вместо LF (старые маковские выгрузки) — тот же файл.
near(fromPhotometricFile(parseIES(iesText.replace(/\n/g, '\r'))).lumens, iesLight.lumens, 1e-9, 'IES with CR line ends');
// Без симметрии, но плоскости 0…350 (без 360): C0 ×10, остальные ×1 —
// среднее по кругу ×1,25; открытый интервал дал бы ×1,13.
const iesPlanes = (boost) => {
    const planes = Array.from({ length: 36 }, (_, j) => j * 10), gs = [0, 15, 30, 45, 60, 75, 90];
    const row = (k) => gs.map((g) => (318.31 * k * Math.cos(g * DEG)).toFixed(2)).join(' ');
    return parseIES(['IESNA:LM-63-2002', 'TILT=NONE', `1 1000 1 ${gs.length} 36 1 2 0 0 0`, '1 1 10', gs.join(' '), planes.join(' '),
        ...planes.map((_, j) => row(j === 0 ? boost : 1))].join('\n'));
};
const openIes = iesPlanes(10), openLumens = fromPhotometricFile(openIes).lumens, flatLumens = fromPhotometricFile(iesPlanes(1)).lumens;
assert.equal(openIes.horizontalAngles.at(-1), 360, 'IES 0…350 closes the circle at 360°');
near(openLumens / flatLumens, 1.25, 0.005, 'IES 0…350 averages the whole circle');
assert.throws(() => parseIES('IESNA:LM-63-2002\nTILT=NONE\n1 1000 1 7 1 1 2 0 0 0\n1 1 10\n0 15'), /оборван/);
assert.throws(() => parseIES('just text'), /TILT/);

// EULUMDAT: тот же даунлайт в кд/клм. Isym 1 — одна плоскость; Isym 2 — три
// плоскости C0/C90/C180 с силами ×2, ×1, ×0: среднее по азимуту = ×1.
const gammas = Array.from({ length: 13 }, (_, i) => i * 15);
const perKlm = gammas.map((g) => (g <= 90 ? 318.31 * Math.cos(g * DEG) : 0));
// sets — комплекты ламп [число, поток]; по строке на поле каждого комплекта.
const ldt = (isym, planes, { mc = 4, dc = 90, sets = [[1, 1000]], nl = '\r\n' } = {}) => [
    'Ouroboros check', '1', String(isym), String(mc), String(dc), '13', '15', 'report', 'Downlight', 'DL-1', 'dl.ldt', '2026-09-25',
    '100', '0', '50', '80', '0', '0', '0', '0', '0', '100', '100', '1,0', '0', String(sets.length),
    ...sets.map(([n]) => String(n)), ...sets.map(() => 'LED'), ...sets.map(([, lm]) => String(lm)),
    ...sets.map(() => '3000'), ...sets.map(() => '90'), ...sets.map(() => '10'), ...Array(10).fill('0.5'),
    ...Array.from({ length: mc }, (_, i) => String(i * dc)), ...gammas.map(String),
    ...planes.flatMap((k) => perKlm.map((v) => (v * k).toFixed(2).replace('.', ','))),
].join(nl);
const ldt1 = parseLDT(ldt(1, [1]));
const ldtLight = fromPhotometricFile(ldt1);
near(ldtLight.lumens, ldt1.lamps * ldt1.lumensPerLamp, 30, 'LDT Isym 1 lumens');
near(ldtLight.peak, 318.31, 0.01, 'LDT peak');
near(fromPhotometricFile(parseLDT(ldt(1, [1], { nl: '\r' }))).lumens, ldtLight.lumens, 1e-9, 'LDT with CR line ends');
const ldt2 = parseLDT(ldt(2, [2, 1, 0]));
assert.deepEqual(ldt2.horizontalAngles, [0, 90, 180], 'LDT Isym 2 keeps C0…C180');
near(fromPhotometricFile(ldt2).lumens, ldtLight.lumens, 0.5, 'LDT Isym 2 averages the half');
assert.throws(() => parseLDT(ldt(7, [1])), /симметрии/);
// Isym 3: в файле C270, C315, C0, C45, C90 (Mc 8, шаг 45°) — метки идут
// так же, C0 (×3) стоит на 360°, а не на 180°.
const ldt3 = parseLDT(ldt(3, [1, 2, 3, 2, 1], { mc: 8, dc: 45 }));
assert.deepEqual(ldt3.horizontalAngles, [270, 315, 360, 405, 450], 'LDT Isym 3 runs C270…C0…C90');
near(ldt3.candela[2][0], 3 * 318.31, 0.01, 'LDT Isym 3 C0 plane is the brightest');
assert.throws(() => parseLDT(ldt(3, [1, 1, 1, 1], { mc: 6, dc: 60 })), /не делятся/);
// Два комплекта ламп — варианты оснащения: силы по первому (1200 лм), а не
// по сумме 3000 лм (было бы в 2,5 раза ярче).
const ldtSets = fromPhotometricFile(parseLDT(ldt(1, [1], { sets: [[1, 1200], [1, 1800]] })));
near(ldtSets.peak, 318.31 * 1.2, 0.01, 'LDT scales by the first lamp set');

// Освещённость и дальность.
const down = { x: 0, y: 2, z: 0, axis: [0, -1, 0], peak: 1000, fn: spot };
near(illuminance(down, [0, 0, 0], [0, 1, 0]), 250, 1e-9, '1000 cd at 2 m');
near(illuminance(down, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), 250, 1e-9, 'vectors as objects');
assert.equal(illuminance(down, [0, 0, 0], [0, -1, 0]), 0, 'the back of a surface is dark');
near(rangeFor(1000), Math.sqrt(1000 / 0.3), 1e-9, 'range of 1000 cd');
assert.equal(rangeFor(0.01), 0.5, 'range floor');
assert.equal(rangeFor(1e6), 80, 'range ceiling');

console.log([
    `photometry: spot 24/40 ${spot(12 * DEG).toFixed(3)} at 12°, ${spot(20 * DEG).toFixed(3)} at 20°, 500 lm → ${spotCd.toFixed(1)} cd (independent ${flux(spot, spotCd).toFixed(2)} lm)`,
    `narrow 8° 300 lm → ${narrowCd.toFixed(0)} cd (${flux(narrow, narrowCd).toFixed(2)} lm); 2° asked → row carries ${pinRow.toFixed(1)} of 1000 lm`,
    `lambert 1000 lm → ${lambertCd.toFixed(2)} cd (lm/π ${(1000 / Math.PI).toFixed(2)})`,
    `6504 K → [${d65.map((v) => v.toFixed(3))}], 2700 K → [${warm.map((v) => v.toFixed(3))}]`,
    `IES 1000 lm → ${iesLight.lumens.toFixed(1)} lm, peak ${iesLight.peak.toFixed(1)} cd; 0…350 with C0 ×10 → ×${(openLumens / flatLumens).toFixed(3)}`,
    `LDT → ${ldtLight.lumens.toFixed(1)} lm, Isym 2 → ${fromPhotometricFile(ldt2).lumens.toFixed(1)} lm, Isym 3 → C[${ldt3.horizontalAngles}], sets 1200+1800 lm → peak ${ldtSets.peak.toFixed(1)} cd, ${ldtSets.lumens.toFixed(0)} lm`,
    `1000 cd at 2 m → ${illuminance(down, [0, 0, 0], [0, 1, 0])} lx, reach ${rangeFor(1000).toFixed(1)} m`,
].join('\n  '));
