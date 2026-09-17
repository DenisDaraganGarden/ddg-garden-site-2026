import assert from 'node:assert/strict';
import { DEFAULT_FIRE_SETTINGS, FIRE_POINTS_MAX, FIRE_PUBLISHED_KEYS, FIRE_RANGES, normalizeFireSettings } from './settings.js';
import {
  TRAIL_LIFT, TRAIL_TEXELS, birthBand, buildTrackGeometry, buildTrail, fireFront, localToWorld, localTrailPoints, sampleTrail,
  trailBoundingBox, trailBoundingSphere, trailKey, trailTexture, worldToLocal, worldTrailPoints,
} from './trail.js';
import {
  FIRE_TIERS, FLAME_CYCLE, burntBand, createFireUniforms, fireInstanceCount, flameFragmentShader, particleVertexShader,
  smokeFragmentShader, trackFragmentShader, trackVertexShader,
} from './fireShaders.js';
import { createTerrainDefinition, sampleTerrainHeight } from '../terrain/terrainModel.js';
import { publishedHomeSceneSettings } from '../features/home-scene/data/publishedHomeSceneSettings.js';

// Настройки: каждый ключ с префиксом fire, числа в пределах, целые — целые,
// цвета — только hex, а точка редактора на сайт не уходит.
for (const key of Object.keys(DEFAULT_FIRE_SETTINGS)) assert.ok(key.startsWith('fire'), `ключ ${key} без префикса fire`);
assert.ok(!FIRE_PUBLISHED_KEYS.includes('fireEditPoint'));
assert.equal(FIRE_PUBLISHED_KEYS.length, Object.keys(DEFAULT_FIRE_SETTINGS).length - 1);
const wild = normalizeFireSettings({ fireSpeed: 999, fireBurn: -3, firePointCount: 4.6, fireColorHot: 'red', fireLoop: 'yes', fireP1X: 'x' });
assert.equal(wild.fireSpeed, FIRE_RANGES.fireSpeed[1]);
assert.equal(wild.fireBurn, 0);
assert.equal(wild.firePointCount, 5, 'число точек — целое');
assert.equal(wild.fireColorHot, DEFAULT_FIRE_SETTINGS.fireColorHot);
assert.equal(wild.fireLoop, DEFAULT_FIRE_SETTINGS.fireLoop);
assert.equal(wild.fireP1X, DEFAULT_FIRE_SETTINGS.fireP1X);
assert.deepEqual(normalizeFireSettings(normalizeFireSettings({})), { ...DEFAULT_FIRE_SETTINGS }, 'нормализация идемпотентна');
assert.equal(localTrailPoints({ firePointCount: 99, fireP1X: 1, fireP1Z: 2 }).length, FIRE_POINTS_MAX);
assert.equal(normalizeFireSettings({ firePointCount: 4, fireEditPoint: 6 }).fireEditPoint, 4, 'ручка не стоит на точке, которой нет');

// Рама следа: местные точки → мир → обратно, с поворотом и масштабом.
const frame = { x: 25, z: -4, yaw: 37 * Math.PI / 180, scale: 1.7 };
for (const point of [{ x: 3, z: -8 }, { x: -2.5, z: 12 }, { x: 0, z: 0 }]) {
  const back = worldToLocal(localToWorld(point, frame), frame);
  assert.ok(Math.abs(back.x - point.x) < 1e-9 && Math.abs(back.z - point.z) < 1e-9, 'рама обратима');
}
// Поворот — тот же, что у three вокруг Y: при 90° местный +X смотрит в мировой −Z.
const turned = localToWorld({ x: 1, z: 0 }, { x: 0, z: 0, yaw: Math.PI / 2, scale: 1 });
assert.ok(Math.abs(turned.x) < 1e-9 && Math.abs(turned.z + 1) < 1e-9);

// Сплайн: равномерно по дуге, на земле с подъёмом, без NaN на совпавших точках.
const ground = (x, z) => 0.3 + 0.1 * Math.sin(x * 0.4) + 0.05 * z;
const trail = buildTrail(worldTrailPoints(DEFAULT_FIRE_SETTINGS), ground);
assert.ok(trail.length > 35 && trail.length < 60, `длина заводского следа ${trail.length.toFixed(1)} м`);
let previous = null;
const steps = [];
for (let i = 0; i < trail.count; i += 1) {
  const s = trail.samples.subarray(i * 4, i * 4 + 4);
  assert.ok(s.every(Number.isFinite), 'нет NaN');
  assert.ok(Math.abs(s[1] - ground(s[0], s[2]) - TRAIL_LIFT) < 1e-5, 'высота — земля плюс подъём');
  if (previous) steps.push(Math.hypot(s[0] - previous[0], s[2] - previous[2]));
  previous = s;
}
const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
assert.ok(steps.every((step) => Math.abs(step - mean) < mean * 0.03), 'шаг по дуге равномерный');
// Неровная раскладка точек: равномерность по параметру здесь дала бы разброс в разы.
const uneven = buildTrail([{ x: 0, z: 0 }, { x: 0.4, z: 0.3 }, { x: 1, z: 0 }, { x: 30, z: 4 }, { x: 31, z: 5 }, { x: 60, z: -10 }], () => 0);
const unevenSteps = [];
for (let i = 1; i < uneven.count; i += 1) unevenSteps.push(Math.hypot(uneven.samples[i * 4] - uneven.samples[i * 4 - 4], uneven.samples[i * 4 + 2] - uneven.samples[i * 4 - 2]));
const unevenMean = unevenSteps.reduce((a, b) => a + b, 0) / unevenSteps.length;
assert.ok(unevenSteps.every((step) => Math.abs(step - unevenMean) < unevenMean * 0.05), 'шаг по дуге равномерный и на неровных точках');
assert.ok(Math.abs(trail.samples[(trail.count - 1) * 4 + 3] - trail.length) < 1e-6);
const twin = buildTrail([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 5, z: 0 }], () => 0);
assert.ok(Number.isFinite(twin.length) && twin.length > 4);
const end = sampleTrail(trail, trail.length + 100);
assert.ok(Math.abs(end.x - trail.samples[(trail.count - 1) * 4]) < 1e-6, 'за концом — конец');
const mid = sampleTrail(trail, trail.length / 2);
assert.ok(Math.abs(Math.hypot(mid.tx, mid.tz) - 1) < 1e-6 && Math.abs(mid.tx * mid.sx + mid.tz * mid.sz) < 1e-9, 'касательная единичная, поперечник перпендикулярен');
assert.notEqual(trailKey(DEFAULT_FIRE_SETTINGS), trailKey({ ...DEFAULT_FIRE_SETTINGS, fireP3Z: 1 }));
assert.equal(trailKey(DEFAULT_FIRE_SETTINGS), trailKey({ ...DEFAULT_FIRE_SETTINGS, fireHeight: 3 }), 'высота пламени след не пересобирает');

// Фронт: тишина до поджига, бег со скоростью, хвост через fireBurn, повтор.
const s = { fireDelay: 1, fireSpeed: 4, fireBurn: 5, fireLoop: true, fireLoopPause: 2 };
const L = 40;
assert.deepEqual(fireFront(0.5, s, L), { front: 0, tail: 0, burning: false, cycle: 0, t: -1 });
assert.ok(Math.abs(fireFront(3, s, L).front - 8) < 1e-9 && fireFront(3, s, L).tail === 0 && fireFront(3, s, L).burning);
assert.ok(Math.abs(fireFront(8, s, L).tail - 8) < 1e-9, 'хвост отстаёт на fireBurn секунд');
assert.equal(fireFront(12, s, L).front, L, 'фронт останавливается на конце');
assert.equal(fireFront(16.5, s, L).burning, false, 'через run + burn всё выгорело');
const period = L / 4 + 5 + 2;
assert.ok(Math.abs(fireFront(1 + period + 2, s, L).front - 8) < 1e-9, 'повтор через период');
assert.equal(fireFront(1 + period + 2, s, L).cycle, 1);
const once = fireFront(1 + period + 2, { ...s, fireLoop: false }, L);
assert.equal(once.burning, false, 'без повтора — выгорел навсегда');
const steady = fireFront(300, { ...s, fireBurn: 0 }, L);
assert.deepEqual(steady, { front: L, tail: 0, burning: true, cycle: 0, t: 299 }, 'fireBurn = 0 — горит весь след');
let lastFront = -1;
for (let t = 1; t < 1 + L / 4; t += 0.25) { const f = fireFront(t, s, L).front; assert.ok(f >= lastFront); lastFront = f; }

// Полоса рождения частицы: шейдер считает её по birthBand от «времени с
// поджига» — и это должна быть та же полоса, что fireFront давал в момент
// рождения. Иначе у стоящего на конце фронта языки ползут назад.
for (const time of [3, 8, 12, 14.8, 16, 18.9, 20]) {
  for (const age of [0.2, 1, 3, 6, 8]) {
    const now = fireFront(time, s, L);
    if (now.t - age < 0) continue;
    const born = birthBand(now.t - age, 4, 5, L);
    const then = fireFront(time - age, s, L);
    assert.ok(Math.abs(born.front - then.front) < 1e-9 && Math.abs(born.tail - then.tail) < 1e-9, `полоса рождения t=${time} age=${age}`);
  }
}
assert.equal(birthBand(14 - 1, 4, 5, L).front, L, 'фронт стоит на конце — не сдвигается назад на скорость × возраст');
assert.ok(birthBand(20 - 8, 4, 5, L).front - birthBand(20 - 8, 4, 5, L).tail > 10, 'после выгорания дым ещё над последними метрами');
assert.deepEqual(birthBand(30 - 1, 40, 0, L), { front: L, tail: 0 }, 'fireBurn = 0: весь след, а не хвост скорости');
assert.deepEqual(birthBand(-0.5, 4, 5, L), { front: 0, tail: 0 });
assert.ok(particleVertexShader.includes('clamp(tb * uSpeed, 0.0, uLength)') && particleVertexShader.includes('clamp((tb - uBurn) * uSpeed, 0.0, uLength)'), 'шейдер считает полосу рождения как birthBand');
assert.ok(particleVertexShader.includes('float fuelAge = uT - u / uSpeed;') && trackFragmentShader.includes('float fuelAge = uT - vU / uSpeed;'), 'возраст горючего — от времени поджига, не от текущего фронта');

// Текстура следа: 512 текселей, концы совпадают со следом.
const texture = trailTexture(trail);
assert.equal(texture.image.width, TRAIL_TEXELS);
assert.ok(Math.abs(texture.image.data[0] - trail.samples[0]) < 1e-6);
assert.ok(Math.abs(texture.image.data[(TRAIL_TEXELS - 1) * 4 + 3] - trail.length) < 1e-6);
assert.ok(particleVertexShader.includes(`${TRAIL_TEXELS.toFixed(1)}`), 'шейдер знает ширину текстуры');

// Колея: две вершины на образец, дуга растёт, края ±1.
const track = buildTrackGeometry(trail, 0.7, ground);
assert.equal(track.getAttribute('position').count, trail.count * 2);
assert.equal(track.getIndex().count, (trail.count - 1) * 6);
const us = track.getAttribute('aU').array, vs = track.getAttribute('aV').array;
for (let i = 2; i < us.length; i += 2) assert.ok(us[i] > us[i - 2]);
assert.ok(vs.every((v) => v === 1 || v === -1));
// Лента лежит поперёк следа шириной width, а не вдоль касательной.
const pos = track.getAttribute('position').array;
for (const i of [0, 40, Math.floor(trail.count / 2), trail.count - 1]) {
  const a = pos.subarray(i * 6, i * 6 + 3), b = pos.subarray(i * 6 + 3, i * 6 + 6);
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const at = sampleTrail(trail, us[i * 2]);
  // Позиции хранятся в float32: на 25 м это ~1e-5 точности.
  assert.ok(Math.abs(Math.hypot(dx, dz) - 0.7) < 1e-4, `ширина ленты в образце ${i}`);
  assert.ok(Math.abs(dx * at.tx + dz * at.tz) < 1e-4, `лента поперёк касательной в образце ${i}`);
}
const sphere = trailBoundingSphere(trail, 5);
assert.ok(sphere.radius > 20 && sphere.radius < 40);
const box = trailBoundingBox(trail);
assert.ok(box.min.x >= 22 && box.max.x <= 28 && box.min.z >= -21 && box.max.z <= 21, 'коробка следа — сам след, а не начало координат');

// Бюджет: пусто без полосы, потолок — пул, дым живёт после последнего языка.
assert.equal(fireInstanceCount({ band: 0, rate: 100, life: 1, pool: 500 }), 0);
assert.equal(fireInstanceCount({ band: 1000, rate: 100, life: 1, pool: 500 }), 500);
assert.equal(fireInstanceCount({ band: 10, rate: 150, life: 1, pool: 6144, width: 0.55 }), 1500);
assert.equal(burntBand({ front: 40, tail: 40, speed: 4, life: 8 }), 32, 'выгорел — дым ещё над последними метрами');
assert.equal(burntBand({ front: 0, tail: 0, speed: 4, life: 8 }), 0);
for (const tier of Object.values(FIRE_TIERS)) assert.ok(tier.flamePool >= 1024 && tier.smokePool >= 384 && tier.flameRate > 0);
assert.ok(FLAME_CYCLE > 0.5 && FLAME_CYCLE < 3);

// GLSL: обратный smoothstep запрещён (на Metal даёт 0); каждый uniform шейдера
// объявлен в createFireUniforms или в собственном наборе материала.
const shaders = { particleVertexShader, flameFragmentShader, smokeFragmentShader, trackVertexShader, trackFragmentShader };
const own = new Set(['uCycle', 'uRise', 'uSize', 'uOpacity']);
const known = new Set(Object.keys(createFireUniforms()));
for (const [name, source] of Object.entries(shaders)) {
  for (const match of source.matchAll(/smoothstep\(\s*(-?[\d.]+),\s*(-?[\d.]+),/g)) {
    assert.ok(Number(match[1]) < Number(match[2]), `${name}: обратный smoothstep ${match[0]}`);
  }
  for (const match of source.matchAll(/uniform\s+\w+\s+(\w+);/g)) {
    assert.ok(known.has(match[1]) || own.has(match[1]), `${name}: uniform ${match[1]} никем не задаётся`);
  }
  if (name.endsWith('FragmentShader')) {
    assert.ok(source.includes('#include <tonemapping_fragment>') && source.includes('#include <colorspace_fragment>'), `${name}: без тонмаппинга`);
    assert.ok(source.includes('#include <fog_pars_fragment>'), `${name}: без тумана`);
  } else {
    assert.ok(source.includes('#include <fog_vertex>') && source.includes('vec4 mvPosition'), `${name}: туману нужен mvPosition`);
  }
}
assert.ok(flameFragmentShader.includes('1.0 - fogFactor'), 'пламя сквозь туман гаснет, а не сереет');

// Заводской след лежит на сухом песке опубликованного берега, не в воде.
const coast = createTerrainDefinition(publishedHomeSceneSettings);
const onCoast = buildTrail(worldTrailPoints(DEFAULT_FIRE_SETTINGS), (x, z) => sampleTerrainHeight(x, z, coast));
let dry = 0;
for (let i = 0; i < onCoast.count; i += 1) if (onCoast.samples[i * 4 + 1] > 0.05 + TRAIL_LIFT) dry += 1;
assert.ok(dry / onCoast.count > 0.9, `заводской след в воде: сухих ${dry} из ${onCoast.count}`);

console.log(`fire: настройки, рама, сплайн ${trail.length.toFixed(1)} м, фронт, текстура, колея, бюджет, GLSL, берег — ок`);
