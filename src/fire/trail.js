import * as THREE from 'three';
import { FIRE_POINTS_MAX } from './settings.js';

// След — сплайн Катмулла-Рома через авторские точки, натянутый по дуге и
// положенный на землю. Всё, что от него нужно огню, дыму и колее, считается
// отсюда: длина, точка по длине дуги, касательная, высота. Фронт пламени —
// одно число, метры от начала следа; за ним второе — хвост, где горючее
// уже выгорело. Оба — чистые функции времени и настроек: ничего не копится,
// пауза и перемотка ничего не ломают, проверка идёт в node без GPU.

export const TRAIL_TEXELS = 512;
// Сантиметры над песком: колея лежит на нём, а не в нём.
export const TRAIL_LIFT = 0.03;

export const trailFrame = (settings) => ({
  x: Number(settings.fireX) || 0,
  z: Number(settings.fireZ) || 0,
  yaw: (Number(settings.fireYaw) || 0) * Math.PI / 180,
  scale: Math.max(0.1, Number(settings.fireScale) || 1),
});

// Та же формула, что у поворота three вокруг Y: (x, z) → (x·cos + z·sin, −x·sin + z·cos).
export const localToWorld = ({ x, z }, frame) => ({
  x: frame.x + (x * Math.cos(frame.yaw) + z * Math.sin(frame.yaw)) * frame.scale,
  z: frame.z + (-x * Math.sin(frame.yaw) + z * Math.cos(frame.yaw)) * frame.scale,
});

export const worldToLocal = ({ x, z }, frame) => {
  const dx = (x - frame.x) / frame.scale, dz = (z - frame.z) / frame.scale;
  return {
    x: dx * Math.cos(frame.yaw) - dz * Math.sin(frame.yaw),
    z: dx * Math.sin(frame.yaw) + dz * Math.cos(frame.yaw),
  };
};

export const trailPointCount = (settings) => Math.max(2, Math.min(FIRE_POINTS_MAX, Math.round(Number(settings.firePointCount) || 2)));

export const localTrailPoints = (settings) => Array.from({ length: trailPointCount(settings) }, (_, index) => ({
  x: Number(settings[`fireP${index + 1}X`]) || 0,
  z: Number(settings[`fireP${index + 1}Z`]) || 0,
}));

export const worldTrailPoints = (settings) => {
  const frame = trailFrame(settings);
  return localTrailPoints(settings).map((point) => localToWorld(point, frame));
};

// Ключ пересборки: след меняется только от этих чисел, не от каждого ползунка.
export const trailKey = (settings) => JSON.stringify([
  settings.fireX, settings.fireZ, settings.fireYaw, settings.fireScale, trailPointCount(settings),
  ...localTrailPoints(settings).flatMap(({ x, z }) => [x, z]),
]);

// Сплайн, равномерно разбитый по длине дуги. `heightAt(x, z)` — земля под
// точкой: в сцене это рельеф берега, в лаборатории — плоскость.
export function buildTrail(points, heightAt = () => 0, { step = 0.25, lift = TRAIL_LIFT } = {}) {
  const vectors = points.map(({ x, z }) => new THREE.Vector3(x, 0, z));
  // Две совпавшие точки дают сплайну нулевую длину и NaN в касательных.
  for (let i = 1; i < vectors.length; i += 1) {
    if (vectors[i].distanceTo(vectors[i - 1]) < 1e-3) vectors[i].x += 1e-3 * i;
  }
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
  const length = Math.max(curve.getLength(), 0.5);
  const count = Math.max(8, Math.ceil(length / step)) + 1;
  const spaced = curve.getSpacedPoints(count - 1);
  const samples = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const { x, z } = spaced[i];
    samples[i * 4] = x;
    samples[i * 4 + 1] = heightAt(x, z) + lift;
    samples[i * 4 + 2] = z;
    samples[i * 4 + 3] = (i / (count - 1)) * length;
  }
  return { samples, count, length, curve };
}

// Точка следа по длине дуги: положение, касательная (по XZ, единичная) и
// поперечник. Линейно между соседними образцами — они через четверть метра.
export function sampleTrail(trail, u) {
  const { samples, count, length } = trail;
  const t = THREE.MathUtils.clamp(u / length, 0, 1) * (count - 1);
  const i = Math.min(Math.floor(t), count - 2);
  const f = t - i;
  const a = i * 4, b = (i + 1) * 4;
  const x = samples[a] + (samples[b] - samples[a]) * f;
  const y = samples[a + 1] + (samples[b + 1] - samples[a + 1]) * f;
  const z = samples[a + 2] + (samples[b + 2] - samples[a + 2]) * f;
  let tx = samples[b] - samples[a], tz = samples[b + 2] - samples[a + 2];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl; tz /= tl;
  return { x, y, z, tx, tz, sx: -tz, sz: tx };
}

// Фронт и хвост горения в метрах от начала следа. Горючее вспыхивает через
// fireDelay, фронт бежит со скоростью fireSpeed, каждое место горит fireBurn
// секунд (0 — горит весь след, пока сцена жива), потом след выгорает,
// и с fireLoop через fireLoopPause вспыхивает снова.
//
// `t` — время с поджига внутри текущего цикла (отрицательное до поджига). Его
// же получает шейдер: частица восстанавливает полосу горения на момент своего
// рождения по этим же формулам (birthBand), а не сдвигом текущего фронта назад —
// иначе у остановившегося на конце следа фронта языки ползли бы назад.
export function fireFront(time, settings, length) {
  const delay = Math.max(0, Number(settings.fireDelay) || 0);
  const speed = Math.max(0.01, Number(settings.fireSpeed) || 1);
  const burn = Math.max(0, Number(settings.fireBurn) || 0);
  const pause = Math.max(0, Number(settings.fireLoopPause) || 0);
  let t = time - delay;
  if (!(t >= 0)) return { front: 0, tail: 0, burning: false, cycle: 0, t: -1 };
  let cycle = 0;
  if (burn > 0 && settings.fireLoop !== false) {
    const period = length / speed + burn + pause;
    cycle = Math.floor(t / period);
    t -= cycle * period;
  }
  const { front, tail } = birthBand(t, speed, burn, length);
  return { front, tail, burning: tail < front, cycle, t };
}

// Полоса горения через `t` секунд после поджига — зеркало формулы вершинного
// шейдера (fireShaders.js, bornFront/bornTail). fire.check.js держит их вместе.
export function birthBand(t, speed, burn, length) {
  if (!(t >= 0)) return { front: 0, tail: 0 };
  const front = Math.min(length, Math.max(0, t * speed));
  const tail = burn > 0 ? Math.min(length, Math.max(0, (t - burn) * speed)) : 0;
  return { front, tail };
}

// Тот же след — в текстуру для шейдера: RGBA32F, (x, y, z, u), равномерно
// по длине дуги. Фильтр — ближайший, интерполирует сам шейдер: линейная
// фильтрация 32-битных текстур в WebGL2 — расширение, а половинной точности
// на 400 м не хватает.
export function trailTexture(trail, texels = TRAIL_TEXELS) {
  const data = new Float32Array(texels * 4);
  for (let i = 0; i < texels; i += 1) {
    const { x, y, z } = sampleTrail(trail, (i / (texels - 1)) * trail.length);
    data.set([x, y, z, (i / (texels - 1)) * trail.length], i * 4);
  }
  const texture = new THREE.DataTexture(data, texels, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// Колея: лента шириной `width` вдоль следа, каждая вершина на своей высоте
// земли. aU — метры по дуге, aV — поперёк от −1 до 1.
export function buildTrackGeometry(trail, width, heightAt = () => 0, lift = TRAIL_LIFT) {
  const { count, length } = trail;
  const positions = new Float32Array(count * 2 * 3);
  const us = new Float32Array(count * 2);
  const vs = new Float32Array(count * 2);
  const index = new Uint32Array((count - 1) * 6);
  for (let i = 0; i < count; i += 1) {
    const u = (i / (count - 1)) * length;
    const p = sampleTrail(trail, u);
    [-1, 1].forEach((side, k) => {
      const x = p.x + p.sx * side * width * 0.5;
      const z = p.z + p.sz * side * width * 0.5;
      const v = i * 2 + k;
      positions.set([x, heightAt(x, z) + lift, z], v * 3);
      us[v] = u;
      vs[v] = side;
    });
    if (i < count - 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.set([a, b, c, b, d, c], i * 6);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  geometry.setAttribute('aV', new THREE.BufferAttribute(vs, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

// Сфера вокруг следа с запасом на высоту пламени и подъём дыма — для
// сортировки прозрачных слоёв; сами частицы отсечению не подлежат.
export function trailBoundingBox(trail, margin = 0) {
  const box = new THREE.Box3();
  for (let i = 0; i < trail.count; i += 1) {
    box.expandByPoint(new THREE.Vector3(trail.samples[i * 4], trail.samples[i * 4 + 1], trail.samples[i * 4 + 2]));
  }
  return box.expandByScalar(margin);
}

export function trailBoundingSphere(trail, margin = 12) {
  const sphere = new THREE.Sphere();
  trailBoundingBox(trail).getBoundingSphere(sphere);
  sphere.radius += margin;
  return sphere;
}
