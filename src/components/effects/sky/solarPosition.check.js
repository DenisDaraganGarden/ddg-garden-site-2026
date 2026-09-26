// Run: node src/components/effects/sky/solarPosition.check.js
import assert from 'node:assert/strict';
import { dayOfYearLabel, dayOfYearOf, defaultUtcOffset, sceneSunAzimuth, solarNoonHours, solarPosition, sunTimes } from './solarPosition.js';
import { buildHomeSceneLightDirection, solveSunElevationAzimuth } from './skyModel.js';
import { hasRealSun, resolveSceneSun } from './sceneSun.js';

// Опорные значения — библиотека astral 3.2 (NOAA, с рефракцией), 2026 год,
// местные часы: высота и азимут от севера, градусы. Совпадение до 0,01°.
const REFERENCE = [
    ['Ростов-на-Дону', 47.2225, 39.7188, 3, 6, 21, 9, 43.365, 102.402],
    ['Ростов-на-Дону', 47.2225, 39.7188, 3, 6, 21, 12, 65.784, 167.098],
    ['Ростов-на-Дону', 47.2225, 39.7188, 3, 12, 21, 15.25, 9.111, 220.144],
    ['Ростов-на-Дону', 47.2225, 39.7188, 3, 4, 22, 12, 54.802, 171.652],
    ['Мурманск', 68.97, 33.07, 3, 6, 21, 15.25, 39.543, 224.848],
    ['Мурманск', 68.97, 33.07, 3, 12, 21, 12, -2.663, 169.508],
    ['Кейптаун', -33.92, 18.42, 2, 6, 21, 12, 31.537, 12.964],
    ['Кейптаун', -33.92, 18.42, 2, 12, 21, 15.25, 55.58, 277.658],
];
for (const [name, lat, lon, utcOffset, month, day, clockHours, elevation, azimuth] of REFERENCE) {
    const sun = solarPosition({ lat, lon, dayOfYear: dayOfYearOf(month, day), clockHours, utcOffset });
    assert.ok(Math.abs(sun.elevationDeg - elevation) < 0.01, `${name} ${day}.${month} ${clockHours} h: elevation ${sun.elevationDeg} vs ${elevation}`);
    assert.ok(Math.abs(sun.azimuthDeg - azimuth) < 0.01, `${name} ${day}.${month} ${clockHours} h: azimuth ${sun.azimuthDeg} vs ${azimuth}`);
}

// Восход, полдень и закат — тот же astral, часы; совпадение до минуты.
const TIMES = [
    [47.2225, 39.7188, 3, 6, 21, 4.4219, 12.3806, 20.3419],
    [47.2225, 39.7188, 3, 12, 21, 8.085, 12.3158, 16.5528],
    [47.2225, 39.7188, 3, 3, 20, 6.4133, 12.4783, 18.5536],
    [68.97, 33.07, 3, 3, 1, 8.1953, 13.0019, 17.8342],
    [-33.92, 18.42, 2, 6, 21, 7.8594, 12.8006, 17.745],
];
for (const [lat, lon, utcOffset, month, day, sunrise, noon, sunset] of TIMES) {
    const times = sunTimes({ lat, lon, dayOfYear: dayOfYearOf(month, day), utcOffset });
    for (const [key, value] of Object.entries({ sunrise, noon, sunset })) {
        assert.ok(Math.abs(times[key] - value) < 1 / 60, `${lat} ${day}.${month} ${key}: ${times[key]} vs ${value}`);
    }
}
assert.equal(sunTimes({ lat: 68.97, lon: 33.07, dayOfYear: dayOfYearOf(6, 21), utcOffset: 3 }).polar, 'day', 'Murmansk in June: the sun never sets');
assert.equal(sunTimes({ lat: 68.97, lon: 33.07, dayOfYear: dayOfYearOf(12, 21), utcOffset: 3 }).polar, 'night', 'Murmansk in December: it never rises');

// Физика: в солнечный полдень солнце на юге (в северном полушарии), в
// равноденствие на высоте 90° − широта, в солнцестояние — плюс 23,44°.
const rostov = { lat: 47.2225, lon: 39.7188, utcOffset: 3 };
for (const [month, day, tilt] of [[3, 20, 0], [6, 21, 23.44], [12, 21, -23.44]]) {
    const dayOfYear = dayOfYearOf(month, day);
    const noon = solarNoonHours({ ...rostov, dayOfYear });
    const sun = solarPosition({ ...rostov, dayOfYear, clockHours: noon });
    assert.ok(Math.abs(sun.azimuthDeg - 180) < 0.05, `noon is due south (${sun.azimuthDeg})`);
    assert.ok(Math.abs(sun.elevationDeg - (90 - rostov.lat + tilt)) < 0.5, `noon elevation ${sun.elevationDeg} on ${day}.${month}`);
    assert.ok(noon > 12.1 && noon < 12.7, `Rostov's solar noon is about 12:20 by the clock (${noon})`);
}
assert.ok(solarPosition({ ...rostov, dayOfYear: dayOfYearOf(6, 21), clockHours: 5 }).azimuthDeg < 70, 'a June sunrise is in the north-east');

// В сцене −Z — север чертежа, +X — восток; небо считает азимут от +Z к +X.
// north — на сколько истинный север повёрнут по часовой от −Z.
const direction = (azimuth, north) => buildHomeSceneLightDirection(sceneSunAzimuth(azimuth, north), 0).map((v) => Math.round(v * 1e6) / 1e6 + 0);
assert.deepEqual(direction(180, 0), [0, 0, 1], 'the southern sun lights from +Z');
assert.deepEqual(direction(90, 0), [1, 0, 0], 'the eastern sun lights from +X');
assert.deepEqual(direction(0, 0), [0, 0, -1], 'the northern sun lights from −Z');
assert.deepEqual(direction(0, 90), [1, 0, 0], 'north turned 90° clockwise puts it at +X');

// Солнце сцены. Без адреса или с выключенным настоящим — художественная дуга,
// ровно как раньше; луна и звёзды идут по ней же.
assert.deepEqual(resolveSceneSun({}), { real: false, ...solveSunElevationAzimuth(12, 42, 18), arcTime: 12, arcBearing: 42, arcNoonElevation: 18 });
assert.equal(resolveSceneSun({ sunReal: true, timeOfDay: 9 }).real, false, 'no coordinates, no real sun');
assert.equal(hasRealSun({ sunReal: true, geoLatitude: null, geoLongitude: 39 }), false, 'null is not the equator');
assert.equal(resolveSceneSun({ sunReal: false, geoLatitude: 47.2, geoLongitude: 39.7, timeOfDay: 9 }).real, false);
// Настоящее: над Ростовом 21 июня в 9:00 — как у astral; по северу проекта.
const site = { sunReal: true, geoLatitude: 47.2225, geoLongitude: 39.7188, sunDayOfYear: dayOfYearOf(6, 21), timeOfDay: 9 };
const morning = resolveSceneSun(site);
assert.ok(morning.real && Math.abs(morning.elevationDeg - 43.365) < 0.01 && Math.abs(morning.compassAzimuthDeg - 102.402) < 0.01, 'Rostov, June 21, 9:00');
assert.equal(morning.utcOffset, 3, 'the zone comes from the longitude');
const lightFrom = (settings) => {
    const sun = resolveSceneSun(settings);
    return buildHomeSceneLightDirection(sun.azimuthDeg, 0).map((v) => Math.round(v * 1e3) / 1e3 + 0);
};
const noonSite = { ...site, timeOfDay: morning.noonHours };
assert.deepEqual(lightFrom(noonSite), [0, 0, 1], 'noon: from the south, +Z');
assert.deepEqual(lightFrom({ ...noonSite, northAngle: 90 }), [-1, 0, 0], 'north turned to +X puts the south at −X');
assert.deepEqual(lightFrom({ ...noonSite, placedObjects: [{ id: 'site', kind: 'model', rotation: 90 }], sketchupModels: { site: {} } }), [1, 0, 0], 'a model turned 90° carries its north with it');
assert.ok(Math.abs(resolveSceneSun({ ...site, sunUtcOffset: 4 }).noonHours - morning.noonHours - 1) < 1e-6, 'the clock follows the chosen zone');
assert.ok(resolveSceneSun({ ...site, sunDayOfYear: dayOfYearOf(12, 21), timeOfDay: 12.3 }).elevationDeg < 20, 'December noon in Rostov is low');
// Луна и звёзды — по небесному экватору: кульминация на юге на 90° − широта.
assert.equal(morning.arcBearing, sceneSunAzimuth(180, 0));
assert.ok(Math.abs(morning.arcNoonElevation - (90 - 47.2225)) < 1e-9);
assert.ok(Math.abs(resolveSceneSun({ ...noonSite, timeOfDay: morning.noonHours }).arcTime - 12) < 1e-9, 'the arc culminates at the real noon');

assert.equal(defaultUtcOffset(39.72), 3, 'Rostov-on-Don: UTC+3');
assert.equal(defaultUtcOffset(82.92), 6, 'by longitude only; a border city sets its zone itself');
assert.equal(dayOfYearOf(6, 21), 172);
assert.equal(dayOfYearLabel(172), '21 июня');
assert.equal(dayOfYearLabel(1, false), 'Jan 1');

console.log('solarPosition: NOAA sun within 0.01° and sunrise/sunset within a minute of astral in three cities, polar day and night, noon due south at 90° − latitude ± 23.44°, compass to scene through north, scene sun artistic or real');
