import * as THREE from 'three';
import { buildHousing } from './housings.js';
import { cctToLinear, peakCandela, PROFILE_SAMPLES, profileSamples, rangeFor, shapeFunction } from './photometry.js';
import { aimAt, beamAxis } from './settings.js';

// Светильник в мире: из записи проекта и типа — где корпус, куда смотрит
// голова, откуда и куда выходит свет. Одно и то же для корпусов (слой), для
// светового поля (шейдеры) и для расчётов (освещённость, электрика).
//
// Рамка крепления: начало в точке на поверхности, +Y — нормаль поверхности;
// у стены +Z — вверх по стене, у земли — по yaw. Голова — в своей точке
// поворота (pivot), её +Y — ось луча: наводимые светят по yaw/pitch или на
// target, остальные — по pitch своего типа.
const UP = new THREE.Vector3(0, 1, 0);
const housings = new Map();

// Корпус типа — один на тип и уровень детализации, общий для всех экземпляров.
// Голова не наводимого корпуса собрана под наклон своего типа.
export function housingOf(type, lod = 0) {
    const key = `${type.id}|${lod}|${type.pitch}|${JSON.stringify(type.housing)}`;
    if (!housings.has(key)) housings.set(key, buildHousing(type.housing, lod, type.pitch));
    return housings.get(key);
}

// Наклон от нормали прижимается к конусу. Луч — до поворота оптики прибора
// (optics.tilt; у грунтовых оптика ходит внутри корпуса, ~20°), видимая
// голова — до того, что держит её геометрия (housing.tilt; у грунтового
// ~7°, дальше линза вышла бы из кольца).
// Ось ровно против нормали — к пределу в сторону fallback (куда повёрнут прибор).
function clampTilt(axis, normal, tilt, fallback) {
    const limit = (tilt * Math.PI) / 180, angle = axis.angleTo(normal);
    if (!(angle > limit) || tilt >= 180) return axis;
    const side = axis.clone().addScaledVector(normal, -axis.dot(normal));
    if (side.lengthSq() < 1e-12) side.copy(fallback).addScaledVector(normal, -fallback.dot(normal));
    return normal.clone().multiplyScalar(Math.cos(limit)).addScaledVector(side.normalize(), Math.sin(limit));
}

const basis = (y, ref, fallback) => {
    const z = ref.clone().addScaledVector(y, -ref.dot(y));
    if (z.lengthSq() < 1e-4) z.copy(fallback).addScaledVector(y, -fallback.dot(y));
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Matrix4().makeBasis(x, y, z);
};

export function fixturePose(fixture, type, housing = housingOf(type)) {
    // Стоящее на земле стоит отвесно и на склоне; вровень с поверхностью
    // ложится только грунтовый. Стена — стена.
    const surface = new THREE.Vector3(fixture.nx ?? 0, fixture.ny ?? 1, fixture.nz ?? 0).normalize();
    const normal = surface.y >= 0.6 && type.housing?.shape !== 'inground' ? UP.clone() : surface;
    const heading = new THREE.Vector3(...beamAxis(fixture.yaw ?? 0, 0));
    const mount = basis(normal, Math.abs(normal.y) > 0.9 ? heading : UP, new THREE.Vector3(1, 0, 0)).setPosition(fixture.x, fixture.y, fixture.z);
    const pivot = new THREE.Vector3(...housing.pivot).applyMatrix4(mount);
    const aimed = housing.aimable && fixture.target ? aimAt(pivot.toArray(), fixture.target) : null;
    const wanted = new THREE.Vector3(...(aimed ? beamAxis(aimed.yaw, aimed.pitch)
        : beamAxis(fixture.yaw ?? 0, housing.aimable ? fixture.pitch ?? type.pitch ?? -90 : type.pitch ?? -90)));
    const tilt = type.optics?.tilt;
    const optics = Number.isFinite(tilt) && tilt >= 0 ? tilt : type.housing?.shape === 'inground' ? 20 : 180;
    const mountZ = new THREE.Vector3().setFromMatrixColumn(mount, 2);
    const axis = housing.aimable ? clampTilt(wanted, normal, optics, mountZ) : wanted;
    const look = housing.aimable && Number.isFinite(housing.tilt) ? clampTilt(axis, normal, housing.tilt, mountZ) : axis;
    const head = basis(look, normal, mountZ).setPosition(pivot);
    const emitter = new THREE.Vector3(...housing.emitter.offset).applyMatrix4(head);
    return { mount, head, emitter, axis, radius: housing.emitter.radius };
}

// Фотометрия типа на полную яркость: профиль (128 отсчётов), сила на оси
// (кд), угол, за которым света нет, цвет. Кривая — та же строка, что читает
// шейдер (линейно между отсчётами), и сила на оси посчитана по ней: у узкого
// луча строка иначе несла бы больше люменов, чем паспорт, а люксы агента
// (scripts/lighting.mjs) разошлись бы с картинкой.
const photometries = new Map();
const rowFunction = (samples) => (theta) => {
    const u = Math.min(Math.max(theta, 0), Math.PI) * ((samples.length - 1) / Math.PI), i = Math.min(Math.floor(u), samples.length - 2);
    return samples[i] + (samples[i + 1] - samples[i]) * (u - i);
};
export function typePhotometry(type) {
    const optics = type.optics ?? {};
    const key = JSON.stringify(optics);
    if (!photometries.has(key)) {
        const samples = profileSamples(shapeFunction(optics));
        const fn = rowFunction(samples);
        let last = samples.length - 1;
        while (last > 0 && samples[last] <= 1e-5) last -= 1;
        photometries.set(key, {
            fn, samples, peak: peakCandela(fn, Number(optics.lumens) || 0),
            cutoff: Math.min(Math.PI, ((last + 1) / (PROFILE_SAMPLES - 1)) * Math.PI),
            color: cctToLinear(Number(optics.cct) || 3000),
        });
    }
    return photometries.get(key);
}

// Все светильники проекта — светы поля и строки профилей по типам.
// Неизвестный тип (запись библиотеки пропала) не светит, но и не падает.
export function gardenLights(fixtures, types) {
    const rows = new Map(), lights = [], poses = new Map();
    for (const fixture of fixtures) {
        const type = types.get(fixture.type);
        if (!type) continue;
        // Второй рубеж после проверки библиотеки: тип, который не строится,
        // не светит и не рисуется — поза только у тех, у кого вышло всё.
        let pose, photometry;
        try { pose = fixturePose(fixture, type); photometry = typePhotometry(type); } catch { continue; }
        poses.set(fixture.id, pose);
        if (!rows.has(type.id)) rows.set(type.id, rows.size);
        const peak = photometry.peak * (fixture.dim ?? 1);
        if (peak <= 0) continue;
        lights.push({
            x: pose.emitter.x, y: pose.emitter.y, z: pose.emitter.z, axis: pose.axis.toArray(),
            peak, color: photometry.color, row: rows.get(type.id), cutoff: photometry.cutoff,
            range: rangeFor(peak), radius: pose.radius, id: fixture.id,
        });
    }
    const profiles = new Float32Array(Math.max(1, rows.size) * PROFILE_SAMPLES);
    for (const [id, row] of rows) profiles.set(typePhotometry(types.get(id)).samples, row * PROFILE_SAMPLES);
    return { lights, profiles, rows: Math.max(1, rows.size), poses };
}

// Номера на плане и в ведомости: буква вида и порядковый номер внутри вида
// (Б-1, Б-2, Г-1…), по порядку расстановки.
const LETTERS = { bollard: ['Б', 'B'], spike: ['П', 'S'], inground: ['Г', 'G'], wall: ['Н', 'W'], step: ['С', 'T'], post: ['Ф', 'P'] };
export function fixtureLabels(fixtures, types, ru = true) {
    const counts = new Map(), labels = new Map();
    for (const fixture of fixtures) {
        const shape = types.get(fixture.type)?.housing?.shape;
        const letter = (LETTERS[shape] ?? ['Л', 'L'])[ru ? 0 : 1];
        counts.set(letter, (counts.get(letter) ?? 0) + 1);
        labels.set(fixture.id, `${letter}-${counts.get(letter)}`);
    }
    return labels;
}
