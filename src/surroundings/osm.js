// Окружение участка: OpenStreetMap и рельеф вокруг точки на карте → метры
// сцены. Чистые функции без сети, файлов и three: их зовут сервер
// (scripts/surroundings.mjs), редактор и проверка (surroundings.check.js).
//
// Оси — как у всей сцены (terrainModel WORLD_AXES): +X восток, +Z юг (−Z
// север), метры от выбранной точки. Файл окружения — данные, а не модель:
// агент правит высоту дома или дорисовывает соседский сарай прямо в нём, и
// такая запись (edited / custom / hidden) переживает повторную загрузку.

export const EARTH_RADIUS = 6378137;
// Данные берутся с запасом за радиус: край круга не режет дом пополам, а
// радиус можно чуть прибавить без новой загрузки.
export const SURROUNDINGS_MARGIN = 1.05;
export const SURROUNDINGS_LIMITS = Object.freeze({ radius: [100, 1500], items: 30000 });
const DEG = Math.PI / 180;

// Равнопромежуточная проекция вокруг точки. На 1.5 км от неё расхождение с
// расстоянием по сфере — сантиметры, меньше точности самих данных OSM.
export function projector(lat0, lon0) {
  const kz = EARTH_RADIUS * DEG, kx = kz * Math.cos(lat0 * DEG);
  return {
    toLocal: (lat, lon) => [(lon - lon0) * kx, (lat0 - lat) * kz],
    toGeo: (x, z) => [lat0 - z / kz, lon0 + x / kx],
  };
}

export function bboxAround(lat, lon, radius) {
  const dLat = radius / (EARTH_RADIUS * DEG), dLon = dLat / Math.cos(lat * DEG);
  return { s: lat - dLat, w: lon - dLon, n: lat + dLat, e: lon + dLon };
}

// Пиксель мировой карты Web Mercator (тайлы 256 px) — для тайлов рельефа.
export function pixelOf(lat, lon, zoom) {
  const scale = 256 * 2 ** zoom, sin = Math.sin(lat * DEG);
  return [(lon + 180) / 360 * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
}

// Только то, что окружение рисует: жилые и промышленные зоны остаются цветом
// земли, поэтому их огромные мультиполигоны не скачиваются.
export function overpassQuery({ s, w, n, e }) {
  const bbox = [s, w, n, e].map((value) => value.toFixed(6)).join(',');
  return `[out:json][timeout:120][bbox:${bbox}];(
way[building];relation[building][type=multipolygon];way["building:part"];
way[highway];
way[railway~"^(rail|light_rail|tram|narrow_gauge|subway|monorail|funicular)$"];
way[waterway~"^(river|stream|canal|ditch|drain|riverbank)$"];
way[natural~"^(water|wood|scrub|grassland|heath|wetland|beach|sand|bare_rock|tree_row)$"];
relation[natural~"^(water|wood|scrub|wetland)$"][type=multipolygon];
way[landuse~"^(forest|grass|meadow|village_green|recreation_ground|cemetery|farmland|orchard|vineyard|allotments|plant_nursery|greenhouse_horticulture|flowerbed|reservoir|basin)$"];
relation[landuse~"^(forest|grass|meadow|recreation_ground|cemetery|farmland|orchard|allotments|reservoir)$"][type=multipolygon];
way[leisure~"^(park|garden|pitch|playground|stadium|track|dog_park|sports_centre)$"];
relation[leisure~"^(park|garden)$"][type=multipolygon];
way[amenity=parking];way[place=square];
way[barrier~"^(fence|wall|hedge|retaining_wall|city_wall)$"];
node[natural=tree];
);out geom qt;`;
}

// Ответ API OpenStreetMap (map.json, relation/full.json): точки отдельно,
// линии — номерами точек. Запасной путь, когда Overpass не отвечает;
// приводится к виду `out geom` у Overpass, дальше разбор общий.
export function withGeometry(elements) {
  const nodes = new Map(), ways = new Map();
  for (const element of elements) {
    if (element.type === 'node') nodes.set(element.id, element);
    if (element.type === 'way') ways.set(element.id, element);
  }
  const geometryOf = (way) => (way?.nodes ?? []).map((id) => nodes.get(id)).map((node) => (node ? { lat: node.lat, lon: node.lon } : null));
  return elements.map((element) => {
    if (element.type === 'way') return { ...element, geometry: geometryOf(element) };
    if (element.type === 'relation') {
      return { ...element, members: (element.members ?? []).map((member) => (member.type === 'way' ? { ...member, geometry: ways.has(member.ref) ? geometryOf(ways.get(member.ref)) : undefined } : member)) };
    }
    return element;
  });
}

const round = (value) => Math.round(value * 10) / 10;
const roundPoint = ([x, z]) => [round(x), round(z)];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// Число из тега OSM: «12», «12 m», «12,5 м». Футы и прочее — не число.
export function tagNumber(value) {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:m|м|meters?|метр\w*)?\s*$/i.exec(String(value ?? ''));
  return match ? Number(match[1].replace(',', '.')) : NaN;
}

// Этаж — 3 м: жилой дом в России от пола до пола 2.8–3.0. Плюс метр на
// крышу или парапет: коробка без крыши, но с её средней высотой.
export const LEVEL_HEIGHT = 3;
const GUESSED_LEVELS = {
  apartments: 5, residential: 5, dormitory: 5, hotel: 5, hospital: 5, office: 4, university: 4, college: 3,
  school: 3, public: 3, civic: 3, government: 3, kindergarten: 2, commercial: 2, retail: 2, industrial: 2,
  train_station: 2, mosque: 2, cathedral: 5, church: 3,
};
const LOW = /^(garage|garages|shed|carport|kiosk|hut|cabin|toilets|service|transformer_tower|greenhouse|sty|stable|barn|farm_auxiliary|container|roof)$/;

export function buildingHeight(tags) {
  const height = tagNumber(tags.height);
  const minHeight = tagNumber(tags.min_height);
  const minLevel = tagNumber(tags['building:min_level']);
  const min = minHeight > 0 ? minHeight : minLevel > 0 ? minLevel * LEVEL_HEIGHT : 0;
  const levels = tagNumber(tags['building:levels']);
  const roofLevels = tagNumber(tags['roof:levels']);
  const kind = tags.building && tags.building !== 'yes' ? tags.building : tags['building:part'];
  let result;
  if (height > 0) result = { height, from: 'height' };
  else if (levels > 0) result = { height: levels * LEVEL_HEIGHT + (roofLevels > 0 ? roofLevels * LEVEL_HEIGHT * 0.6 : 1), levels, from: 'levels' };
  else if (LOW.test(kind ?? '')) result = { height: kind === 'roof' ? 3.5 : 3, from: 'guess' };
  else result = { height: (GUESSED_LEVELS[kind] ?? 1) * LEVEL_HEIGHT + 1, from: 'guess' };
  // Навес на столбах (building=roof) висит над землёй: у него нет стен до земли.
  const floor = kind === 'roof' && !(min > 0) ? 2.4 : min;
  result.height = Math.round(Math.min(600, Math.max(floor + 0.5, result.height)) * 10) / 10;
  return floor > 0 ? { ...result, min: Math.round(floor * 10) / 10 } : result;
}

// Ширина проезжей части. Полоса — 3.5 м (СП 42.13330); у тротуаров и троп — свои.
const ROAD_WIDTH = {
  motorway: 15, trunk: 14, primary: 12, secondary: 10, tertiary: 8, unclassified: 6, residential: 6, road: 6,
  living_street: 5, busway: 7, service: 4, pedestrian: 5, track: 3, footway: 2, path: 1.5, cycleway: 2,
  bridleway: 2, steps: 2, raceway: 8,
};
const MOTOR = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|road|living_street|busway|service)(_link)?$/;
const SKIP_HIGHWAY = /^(proposed|construction|abandoned|razed|disused|platform|elevator|corridor|via_ferrata|bus_stop|emergency_bay|rest_area|services)$/;
export const roadClass = (highway) => (/^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(highway) ? 'major'
  : MOTOR.test(highway) ? 'minor' : 'path');

export function roadWidth(tags) {
  const width = tagNumber(tags.width);
  if (width > 0.5 && width < 60) return width;
  const base = String(tags.highway ?? '').replace(/_link$/, '');
  const lanes = tagNumber(tags.lanes);
  if (MOTOR.test(tags.highway) && lanes >= 1 && lanes <= 12) return lanes * 3.5;
  if (tags.service === 'driveway') return 3;
  if (tags.service === 'parking_aisle') return 4;
  return ROAD_WIDTH[base] ?? 3;
}

// Площадь — какого она цвета на земле. Жилые и прочие зоны — просто земля.
export function areaKind(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || /^(reservoir|basin)$/.test(tags.landuse ?? '')) return 'water';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'forest';
  if (/^(beach|sand|bare_rock)$/.test(tags.natural ?? '')) return 'sand';
  if (/^(pitch|playground|stadium|track|sports_centre)$/.test(tags.leisure ?? '')) return 'sport';
  if (/^(farmland|orchard|vineyard|allotments|plant_nursery|greenhouse_horticulture)$/.test(tags.landuse ?? '')) return 'farm';
  if (/^(park|garden|dog_park)$/.test(tags.leisure ?? '') || /^(grass|meadow|village_green|recreation_ground|cemetery|flowerbed)$/.test(tags.landuse ?? '')
    || /^(grassland|scrub|heath|wetland)$/.test(tags.natural ?? '')) return 'green';
  if (tags.amenity === 'parking' || tags.place === 'square' || (tags.highway && tags.area === 'yes')) return 'paved';
  return null;
}

// Линии, которые не дороги: реки и ручьи — вода на земле, рельсы, заборы —
// стенки в сцене.
const WATERWAY_WIDTH = { river: 12, canal: 8, stream: 2.5, ditch: 1.5, drain: 1.5 };
const RAIL_WIDTH = { rail: 3, light_rail: 2.6, subway: 2.6, narrow_gauge: 2.2, tram: 2.2, monorail: 1.5, funicular: 2.2 };
export const BARRIER_HEIGHT = Object.freeze({ fence: 1.6, wall: 2.2, retaining_wall: 1, city_wall: 4, hedge: 1.4 });

// Кольца мультиполигона из кусков-линий: концы сходятся в общих точках OSM.
export function joinRings(chains) {
  const open = chains.filter((chain) => chain.length >= 2).map((chain) => chain.slice());
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    let grown = true;
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false;
      for (let index = 0; index < open.length; index += 1) {
        const chain = open[index], end = ring[ring.length - 1];
        if (same(chain[0], end)) ring = ring.concat(chain.slice(1));
        else if (same(chain[chain.length - 1], end)) ring = ring.concat(chain.slice(0, -1).reverse());
        else if (same(chain[chain.length - 1], ring[0])) ring = chain.concat(ring.slice(1));
        else if (same(chain[0], ring[0])) ring = chain.slice().reverse().concat(ring.slice(1));
        else continue;
        open.splice(index, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring.slice(0, -1));
  }
  return rings;
}

// Площадь со знаком: > 0 — против часовой стрелки в осях (x вправо, z вверх).
export function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return area / 2;
}

export function insideRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cz += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-9) return ring.reduce((sum, [x, z]) => [sum[0] + x / ring.length, sum[1] + z / ring.length], [0, 0]);
  return [cx / (3 * a), cz / (3 * a)];
}

// Площадь, обрезанная квадратом [−half, half]² (Сазерленд — Ходжмен). У
// вогнутой площади на краю остаются нулевые перемычки — заливке они не мешают.
export function clipRing(ring, half) {
  let out = ring;
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const input = out;
    out = [];
    if (!input.length) break;
    const inside = (point) => sign * point[axis] <= half;
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i], previous = input[(i + input.length - 1) % input.length];
      if (inside(current) !== inside(previous)) {
        const t = (sign * half - previous[axis]) / (current[axis] - previous[axis]);
        out.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
      }
      if (inside(current)) out.push(current);
    }
  }
  return out;
}

function clipSegment(p, q, half) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dz = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] + half], [dx, half - p[0]], [-dz, p[1] + half], [dz, half - p[1]]]) {
    if (pp === 0) {
      if (qq < 0) return null;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dz], [p[0] + t1 * dx, p[1] + t1 * dz]];
}

// Линия, обрезанная тем же квадратом: вышла и вернулась — два куска.
export function clipLine(line, half) {
  const chains = [];
  let chain = null;
  for (let i = 1; i < line.length; i += 1) {
    const segment = clipSegment(line[i - 1], line[i], half);
    if (!segment) {
      chain = null;
      continue;
    }
    if (!chain || !same(chain[chain.length - 1], segment[0])) {
      chain = [segment[0]];
      chains.push(chain);
    }
    chain.push(segment[1]);
  }
  return chains.filter((item) => item.length >= 2);
}

// Точки вдоль линии через step метров — ряд деревьев.
function alongLine(line, step) {
  const points = [line[0]];
  let carried = 0;
  for (let i = 1; i < line.length; i += 1) {
    const [x0, z0] = line[i - 1], [x1, z1] = line[i];
    const length = Math.hypot(x1 - x0, z1 - z0);
    let at = step - carried;
    while (at <= length) {
      points.push([x0 + ((x1 - x0) * at) / length, z0 + ((z1 - z0) * at) / length]);
      at += step;
    }
    carried = length - (at - step);
  }
  return points;
}

const labelOf = (tags) => String(tags.name || [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ')).slice(0, 80);
const tunnel = (tags) => tags.tunnel && tags.tunnel !== 'no' && tags.tunnel !== 'building_passage';

// Разбор ответа Overpass (`out geom`) в окружение: здания с высотами, дороги
// с шириной, площади, линии и деревья — в метрах вокруг точки. Здания — целиком
// по центру в круге, остальное — обрезано квадратом с запасом.
export function buildSurroundings(elements, { lat, lon, radius }) {
  const { toLocal } = projector(lat, lon);
  const half = radius * SURROUNDINGS_MARGIN;
  const chainOf = (geometry) => {
    const list = [];
    for (const point of geometry ?? []) if (point) list.push(toLocal(point.lat, point.lon));
    return list;
  };
  const buildings = [], parts = [], roads = [], areas = [], lines = [], trees = [];
  let incomplete = 0;

  // Площади элемента: замкнутая линия — одна, мультиполигон — по внешнему
  // кольцу с его дырами. Незамкнутое кольцо (часть отношения не пришла) не рисуется.
  const polygonsOf = (element) => {
    if (element.type === 'way') {
      const ring = chainOf(element.geometry);
      if (ring.length < 4 || !same(ring[0], ring[ring.length - 1])) return [];
      return [{ ring: ring.slice(0, -1), holes: [] }];
    }
    const members = (element.members ?? []).filter((member) => member.type === 'way');
    if (members.some((member) => !member.geometry || member.geometry.some((point) => !point))) incomplete += 1;
    const outer = joinRings(members.filter((member) => member.role !== 'inner').map((member) => chainOf(member.geometry)));
    const inner = joinRings(members.filter((member) => member.role === 'inner').map((member) => chainOf(member.geometry)));
    return outer.map((ring) => ({ ring, holes: inner.filter((hole) => insideRing(hole[0], ring)) }));
  };
  const idOf = (element, index) => `${element.type[0]}${element.id}${index ? `.${index}` : ''}`;

  for (const element of elements) {
    const tags = element.tags ?? {};
    if (element.type === 'node') {
      if (tags.natural === 'tree' && Number.isFinite(element.lat)) {
        const [x, z] = toLocal(element.lat, element.lon);
        const height = tagNumber(tags.height);
        if (Math.hypot(x, z) <= half) trees.push(height > 1 && height < 60 ? [round(x), round(z), height] : [round(x), round(z)]);
      }
      continue;
    }

    const building = tags.building && tags.building !== 'no';
    const part = !building && tags['building:part'] && tags['building:part'] !== 'no';
    if (building || part) {
      if (tagNumber(tags.layer) < 0 || tags.location === 'underground') continue;
      polygonsOf(element).forEach(({ ring, holes }, index) => {
        const center = ringCentroid(ring);
        if (Math.hypot(center[0], center[1]) > half) return;
        const label = labelOf(tags);
        (part ? parts : buildings).push({
          id: idOf(element, index),
          kind: String(building ? tags.building : 'part').slice(0, 24),
          ring: ring.map(roundPoint),
          ...(holes.length ? { holes: holes.map((hole) => hole.map(roundPoint)) } : {}),
          ...buildingHeight(tags),
          ...(label ? { label } : {}),
        });
      });
      continue;
    }

    if (element.type === 'way' && tags.highway && !areaKind(tags)) {
      if (SKIP_HIGHWAY.test(tags.highway) || tunnel(tags)) continue;
      const width = Math.round(roadWidth(tags) * 10) / 10;
      clipLine(chainOf(element.geometry), half).forEach((line, index) => roads.push({
        id: idOf(element, index), kind: tags.highway, width, line: line.map(roundPoint), ...(tags.bridge && tags.bridge !== 'no' ? { bridge: true } : {}),
      }));
      continue;
    }

    if (element.type === 'way' && tags.natural === 'tree_row') {
      for (const [x, z] of alongLine(chainOf(element.geometry), 6)) if (Math.abs(x) <= half && Math.abs(z) <= half) trees.push([round(x), round(z)]);
      continue;
    }

    const line = element.type !== 'way' ? null
      : tags.waterway && WATERWAY_WIDTH[tags.waterway] && !tunnel(tags) ? { kind: 'water', width: tagNumber(tags.width) > 0 ? tagNumber(tags.width) : WATERWAY_WIDTH[tags.waterway] }
        : tags.railway && RAIL_WIDTH[tags.railway] && !tunnel(tags) ? { kind: 'rail', width: RAIL_WIDTH[tags.railway] }
          : tags.barrier && BARRIER_HEIGHT[tags.barrier] ? { kind: tags.barrier, height: tagNumber(tags.height) > 0 && tagNumber(tags.height) < 12 ? tagNumber(tags.height) : BARRIER_HEIGHT[tags.barrier] }
            : null;
    if (line) {
      clipLine(chainOf(element.geometry), half).forEach((points, index) => lines.push({ id: idOf(element, index), ...line, line: points.map(roundPoint) }));
      continue;
    }

    const kind = areaKind(tags);
    if (!kind) continue;
    polygonsOf(element).forEach(({ ring, holes }, index) => {
      const clipped = clipRing(ring, half);
      if (clipped.length < 3 || Math.abs(ringArea(clipped)) < 1) return;
      const cut = holes.map((hole) => clipRing(hole, half)).filter((hole) => hole.length >= 3);
      areas.push({ id: idOf(element, index), kind, ring: clipped.map(roundPoint), ...(cut.length ? { holes: cut.map((hole) => hole.map(roundPoint)) } : {}) });
    });
  }

  // Здание, у которого есть части (Simple 3D Buildings), рисуется частями:
  // контур целиком стоял бы коробкой поверх башен и куполов.
  const partCenters = parts.map((item) => ringCentroid(item.ring));
  const kept = buildings.filter((item) => !partCenters.some((center) => insideRing(center, item.ring)));
  const cap = (list) => list.slice(0, SURROUNDINGS_LIMITS.items);
  return {
    version: 1,
    center: { lat, lon },
    radius,
    half: Math.round(half * 10) / 10,
    buildings: cap([...kept, ...parts]),
    roads: cap(roads),
    areas: cap(areas),
    lines: cap(lines),
    trees: cap(trees),
    ...(incomplete ? { incomplete } : {}),
  };
}

// Рельеф: сетка n×n высот на квадрате окружения, относительно высоты самой
// точки (она — ноль сцены). elevationAt(lat, lon) — метры над морем или NaN.
// Один проход сглаживания: 30-метровая съёмка SRTM в городе цепляет крыши.
export function buildTerrainGrid({ lat, lon, radius, elevationAt, size = 129 }) {
  const half = radius * SURROUNDINGS_MARGIN, step = (2 * half) / (size - 1);
  const { toGeo } = projector(lat, lon);
  const origin = elevationAt(lat, lon);
  if (!Number.isFinite(origin)) return null;
  const raw = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const [la, lo] = toGeo(-half + col * step, -half + row * step);
      const value = elevationAt(la, lo);
      raw[row * size + col] = Number.isFinite(value) ? value - origin : 0;
    }
  }
  const h = new Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let sum = 0, count = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const r = row + dr, c = col + dc;
          if (r >= 0 && r < size && c >= 0 && c < size) { sum += raw[r * size + c]; count += 1; }
        }
      }
      h[row * size + col] = Math.round((sum / count) * 10) / 10;
    }
  }
  return { elevation: Math.round(origin * 10) / 10, grid: { half: Math.round(half * 10) / 10, size, h } };
}

// Правки поверх OSM переживают новую загрузку: запись с пометкой edited
// (поправлена), custom (дорисована) или hidden (спрятана) заменяет свежую с тем
// же id или добавляется. Точка карты сдвинулась — правки едут вместе с землёй.
export function mergeAuthored(fresh, previous) {
  if (!previous) return fresh;
  const shift = previous.center && (previous.center.lat !== fresh.center.lat || previous.center.lon !== fresh.center.lon)
    ? projector(fresh.center.lat, fresh.center.lon).toLocal(previous.center.lat, previous.center.lon) : [0, 0];
  const move = (points) => points.map(([x, z, ...rest]) => [round(x + shift[0]), round(z + shift[1]), ...rest]);
  const moved = (item) => (shift[0] || shift[1] ? {
    ...item,
    ...(item.ring ? { ring: move(item.ring) } : {}),
    ...(item.holes ? { holes: item.holes.map(move) } : {}),
    ...(item.line ? { line: move(item.line) } : {}),
  } : item);
  const next = { ...fresh };
  for (const layer of ['buildings', 'roads', 'areas', 'lines']) {
    const authored = new Map((previous[layer] ?? []).filter((item) => item?.edited || item?.custom || item?.hidden).map((item) => [item.id, moved(item)]));
    if (!authored.size) continue;
    const list = (fresh[layer] ?? []).map((item) => authored.get(item.id) ?? item);
    const present = new Set(list.map((item) => item.id));
    next[layer] = [...list, ...[...authored.values()].filter((item) => !present.has(item.id))];
  }
  return next;
}

// Что пришло — одной строкой для редактора и командной строки.
export function summarizeSurroundings(data) {
  const buildings = (data?.buildings ?? []).filter((item) => !item.hidden);
  const metres = (data?.roads ?? []).reduce((sum, road) => sum + road.line.reduce((length, point, i, line) => (i ? length + Math.hypot(point[0] - line[i - 1][0], point[1] - line[i - 1][1]) : 0), 0), 0);
  return {
    buildings: buildings.length,
    measured: buildings.filter((item) => item.from === 'height').length,
    levels: buildings.filter((item) => item.from === 'levels').length,
    guessed: buildings.filter((item) => item.from === 'guess').length,
    roadsKm: Math.round(metres / 100) / 10,
    areas: (data?.areas ?? []).length,
    trees: (data?.trees ?? []).length,
    fences: (data?.lines ?? []).filter((item) => BARRIER_HEIGHT[item.kind]).length,
  };
}

// Файл окружения: одна запись — одна строка, чтобы агент находил дом по id
// или адресу поиском и правил его, не разворачивая мегабайт JSON.
export function stringifySurroundings(data) {
  const { buildings = [], roads = [], areas = [], lines = [], trees = [], terrain = null, ...head } = data;
  const list = (items) => (items.length ? `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]` : '[]');
  const top = Object.entries(head).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${[...top, `"buildings": ${list(buildings)}`, `"roads": ${list(roads)}`, `"areas": ${list(areas)}`, `"lines": ${list(lines)}`, `"trees": ${JSON.stringify(trees)}`, `"terrain": ${JSON.stringify(terrain)}`].join(',\n')}\n}\n`;
}

// «47.2225, 39.7188» — широта и долгота, как их копируют из Яндекс.Карт и
// Google: точка без поиска по адресу.
export function parseCoordinates(text) {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(text ?? '').replace(/°/g, ''));
  if (!match) return null;
  const lat = Number(match[1]), lon = Number(match[2]);
  return Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
