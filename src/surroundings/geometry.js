import { ShapeUtils, Vector2 } from 'three';
import { BARRIER_HEIGHT, insideRing, ringArea, ringCentroid } from './osm.js';

// Геометрия окружения из файла данных (osm.js): земля кругом с рельефом,
// коробки домов, стенки заборов, точки деревьев. Массивы, а не объекты three:
// проверка считает нормали и высоты в node, сцена (Surroundings.jsx) только
// кладёт их в буферы.

// Земля участка — чуть ниже нуля модели: пол модели SketchUp лежит на нуле,
// прежняя «Плоскость» — на −0.05; земля окружения не спорит ни с тем, ни с другим.
export const FLAT_Y = -0.1;
const DEG = Math.PI / 180;

// Рельеф из сетки файла: билинейно, за краем — край.
export function terrainHeight(grid) {
  if (!grid?.h?.length) return () => 0;
  const { half, size, h } = grid;
  const step = (2 * half) / (size - 1);
  return (x, z) => {
    const fx = Math.min(size - 1, Math.max(0, (x + half) / step)), fz = Math.min(size - 1, Math.max(0, (z + half) / step));
    const c0 = Math.min(size - 2, Math.floor(fx)), r0 = Math.min(size - 2, Math.floor(fz));
    const tx = fx - c0, tz = fz - r0;
    const at = (r, c) => h[r * size + c];
    return (at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx) * (1 - tz) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx) * tz;
  };
}

// Высота земли окружения: рельеф × сила рельефа, а вокруг участка ровно —
// на радиусе clear и плавный подъём к настоящему рельефу на полосе за ним.
export function groundSampler(grid, { relief = 1, clear = 0 } = {}) {
  const raw = terrainHeight(grid);
  const band = Math.max(30, clear);
  return (x, z) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(x, z) - clear) / band));
    const blend = t * t * (3 - 2 * t);
    return FLAT_Y + blend * (relief * raw(x, z) - FLAT_Y);
  };
}

// Земля — круг радиуса radius: кольца и лучи, развёртка по квадрату данных
// (half) — та же, что у картинки дорог (raster.js).
export function terrainDisc(ground, radius, half, { rings = 96, segments = 192 } = {}) {
  const count = 1 + rings * segments;
  const position = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const put = (index, x, z) => {
    position.set([x, ground(x, z), z], index * 3);
    uv.set([(x + half) / (2 * half), 1 - (z + half) / (2 * half)], index * 2);
  };
  put(0, 0, 0);
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = (radius * ring) / rings;
    for (let s = 0; s < segments; s += 1) {
      const angle = (2 * Math.PI * s) / segments;
      put(1 + (ring - 1) * segments + s, r * Math.cos(angle), r * Math.sin(angle));
    }
  }
  const index = [];
  const vertex = (ring, s) => (ring === 0 ? 0 : 1 + (ring - 1) * segments + (s % segments));
  for (let s = 0; s < segments; s += 1) index.push(0, vertex(1, s + 1), vertex(1, s));
  for (let ring = 1; ring < rings; ring += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a0 = vertex(ring, s), a1 = vertex(ring, s + 1), b0 = vertex(ring + 1, s), b1 = vertex(ring + 1, s + 1);
      index.push(a0, b1, b0, a0, a1, b1);
    }
  }
  return { position, uv, index: new Uint32Array(index) };
}

// Треугольники с плоскими нормалями: нормаль по обходу вершин.
function mesh() {
  const position = [], normal = [];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) return;
    nx /= length; ny /= length; nz /= length;
    position.push(...a, ...b, ...c);
    normal.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  return {
    tri,
    quad: (a, b, c, d) => { tri(a, b, c); tri(a, c, d); },
    done: () => ({ position: new Float32Array(position), normal: new Float32Array(normal) }),
  };
}

// Внешний контур — по часовой стрелке, дыры — против (в осях x вправо, z
// вверх): тогда стенка по обходу ребра смотрит наружу, из дома.
const oriented = (ring, clockwise) => ((ringArea(ring) < 0) === clockwise ? ring : ring.slice().reverse());

// Дома — коробки: стены по контуру (и по дворам-колодцам), плоская крыша.
// Низ — самая низкая земля под домом (на склоне дом врастает, а не висит),
// верх — высота над средней землёй. Дом в круге участка не строится: там
// модель SketchUp.
export function buildingsGeometry(buildings, ground, { radius, clear = 0 }) {
  const out = mesh();
  let count = 0;
  for (const building of buildings ?? []) {
    if (building.hidden || !(building.ring?.length >= 3) || !(building.height > 0)) continue;
    const [cx, cz] = ringCentroid(building.ring);
    const distance = Math.hypot(cx, cz);
    if (distance > radius || distance < clear) continue;
    const rings = [oriented(building.ring, true), ...(building.holes ?? []).filter((hole) => hole.length >= 3).map((hole) => oriented(hole, false))];
    let low = Infinity, sum = 0;
    for (const [x, z] of building.ring) {
      const y = ground(x, z);
      low = Math.min(low, y);
      sum += y;
    }
    const mid = sum / building.ring.length;
    const bottom = building.min > 0 ? mid + building.min : low - 0.3;
    const top = mid + building.height;
    if (top <= bottom + 0.1) continue;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [px, pz] = ring[i], [qx, qz] = ring[(i + 1) % ring.length];
        out.quad([px, bottom, pz], [qx, bottom, qz], [qx, top, qz], [px, top, pz]);
      }
    }
    const [contour, ...holes] = rings.map((ring) => ring.map(([x, z]) => new Vector2(x, z)));
    const flat = [contour, ...holes].flat();
    for (const [a, b, c] of ShapeUtils.triangulateShape(contour, holes)) {
      const [pa, pb, pc] = [flat[a], flat[b], flat[c]];
      // Крыша смотрит вверх при любом обходе, который вернул триангулятор.
      const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y) > 0;
      const [second, third] = up ? [pb, pc] : [pc, pb];
      out.tri([pa.x, top, pa.y], [second.x, top, second.y], [third.x, top, third.y]);
    }
    if (building.min > 0) {
      for (const [a, b, c] of ShapeUtils.triangulateShape(contour, holes)) {
        const [pa, pb, pc] = [flat[a], flat[b], flat[c]];
        const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y) > 0;
        const [second, third] = up ? [pc, pb] : [pb, pc];
        out.tri([pa.x, bottom, pa.y], [second.x, bottom, second.y], [third.x, bottom, third.y]);
      }
    }
    count += 1;
  }
  return { ...out.done(), count };
}

// Заборы и стены — тонкие стенки с двух сторон, изгородь — брус с верхом.
// Каждый конец стоит на своей земле: забор идёт по склону.
export function barriersGeometry(lines, ground, { radius, clear = 0, hedges = false }) {
  const out = mesh();
  for (const item of lines ?? []) {
    if (item.hidden || !BARRIER_HEIGHT[item.kind] || (item.kind === 'hedge') !== hedges) continue;
    const height = item.height > 0 ? item.height : BARRIER_HEIGHT[item.kind];
    const thick = hedges ? 0.8 : 0;
    for (let i = 1; i < item.line.length; i += 1) {
      const [px, pz] = item.line[i - 1], [qx, qz] = item.line[i];
      const dp = Math.hypot(px, pz), dq = Math.hypot(qx, qz);
      if ((dp > radius && dq > radius) || (dp < clear && dq < clear)) continue;
      const length = Math.hypot(qx - px, qz - pz);
      if (length < 0.05) continue;
      const nx = (-(qz - pz) / length) * (thick / 2), nz = ((qx - px) / length) * (thick / 2);
      const gp = ground(px, pz), gq = ground(qx, qz);
      const side = (sign) => {
        const a = [px + sign * nx, gp - 0.2, pz + sign * nz], b = [qx + sign * nx, gq - 0.2, qz + sign * nz];
        const c = [qx + sign * nx, gq + height, qz + sign * nz], d = [px + sign * nx, gp + height, pz + sign * nz];
        if (sign > 0) out.quad(a, b, c, d);
        else out.quad(b, a, d, c);
      };
      side(1);
      side(-1);
      if (hedges) out.quad([px + nx, gp + height, pz + nz], [qx + nx, gq + height, qz + nz], [qx - nx, gq + height, qz - nz], [px - nx, gp + height, pz - nz]);
    }
  }
  return out.done();
}

// Случайное число из клетки сетки: одно и то же при каждой сборке.
const hash = (a, b) => {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// Деревья: отмеченные в OSM по одному и рядами, плюс лес — площади «лес»
// засеваются через spacing метров со сдвигом. Ближние к участку — первыми,
// если их больше предела. Каждое: x, y (земля), z, высота.
export function treeInstances(data, ground, { radius, clear = 0, spacing = 7, limit = 6000 }) {
  const points = [];
  const add = (x, z, height) => {
    const distance = Math.hypot(x, z);
    if (distance <= radius && distance >= clear) points.push([x, z, height, distance]);
  };
  for (const [x, z, height] of data.trees ?? []) add(x, z, height > 0 ? height : 7 + 5 * hash(x, z));
  for (const area of data.areas ?? []) {
    if (area.kind !== 'forest' || area.hidden) continue;
    const xs = area.ring.map((p) => p[0]), zs = area.ring.map((p) => p[1]);
    for (let gx = Math.floor(Math.min(...xs) / spacing); gx <= Math.ceil(Math.max(...xs) / spacing); gx += 1) {
      for (let gz = Math.floor(Math.min(...zs) / spacing); gz <= Math.ceil(Math.max(...zs) / spacing); gz += 1) {
        const x = (gx + hash(gx, gz)) * spacing, z = (gz + hash(gz, gx)) * spacing;
        if (!insideRing([x, z], area.ring) || (area.holes ?? []).some((hole) => insideRing([x, z], hole))) continue;
        add(x, z, 8 + 8 * hash(gx + 0.5, gz));
      }
    }
  }
  points.sort((a, b) => a[3] - b[3]);
  const kept = points.slice(0, limit);
  const out = new Float32Array(kept.length * 4);
  kept.forEach(([x, z, height], index) => out.set([x, ground(x, z), z, height], index * 4));
  return out;
}

// Где окружение стоит в сцене. Точка карты садится на модель участка —
// первую модель SketchUp в расстановке (как у компаса) — со сдвигом в её осях;
// север карты смотрит туда, где север по northAngle: градусы по часовой
// стрелке от зелёной оси SketchUp (−Z модели) до истинного севера. Повернули
// модель — окружение повернулось вместе с ней.
export function surroundingsAnchor(settings) {
  const model = (settings.placedObjects ?? []).find((object) => object.kind === 'model' && settings.sketchupModels?.[object.id]);
  const base = model ?? { x: 0, y: 0, z: 0, rotation: 0 };
  const turn = Number(base.rotation) || 0;
  const yaw = turn * DEG;
  const ox = Number(settings.surroundingsOffsetX) || 0, oz = Number(settings.surroundingsOffsetZ) || 0;
  return {
    x: (Number(base.x) || 0) + ox * Math.cos(yaw) + oz * Math.sin(yaw),
    y: Number(base.y) || 0,
    z: (Number(base.z) || 0) - ox * Math.sin(yaw) + oz * Math.cos(yaw),
    yaw: (turn - (Number(settings.northAngle) || 0)) * DEG,
  };
}
