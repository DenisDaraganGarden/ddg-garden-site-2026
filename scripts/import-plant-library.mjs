// Растения из библиотеки SketchUp Дениса → библиотека движка (plantLibrary.mjs).
//
//   node scripts/import-plant-library.mjs [библиотека.glb] [--force] [--sheet лист.png]
//
// Из компонента берётся его 2D-картинка: грани карточки растеризуются в
// плоскости картинки с их собственной развёрткой. Так одним ходом получаются и
// PNG с прозрачностью, и JPEG, где силуэт вырезан гранями, а не альфой; поля
// картинки обрезаются, точка вставки компонента становится корнем растения.
// Размеры в SketchUp — масштаб рисунка (можжевельник 'Compressa' нарисован
// 4.5 м), поэтому высота, ширина, плотность и календарь — из таблицы ниже:
// общие справочные данные, уверенность средняя, «проверено» ставит Денис.
// Существующие записи не трогаются без --force: их правят руками.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { readGlb, transform, walkScene } from './sketchupGlb.mjs';
import { PLANTS_DIR } from './plantLibrary.mjs';

const LIBRARY = path.join(os.homedir(), 'Desktop', 'Библиотека_растений_и_деревьев.glb');
const MAX_CARD = 1024;
const MAX_RASTER = 2048;

// Шапки — легенда библиотеки Дениса (docs/planting/landscape-design-plan).
const CAPS = { perennial: '#bf6d3f', grass: '#bfb83f', shrub: '#84b03a', conifer: '#414c19', groundcover: '#414c19', topiary: '#414c19' };
const capOf = (seed) => (seed.category === 'tree' ? (seed.fruit ? '#d88d2b' : seed.foliage === 'evergreen' ? '#526c41' : '#98bf71') : CAPS[seed.category]);

// height, spread — метры (многолетники и злаки — взрослые, деревья — через
// `size`); density — шт/м² в шахматной посадке (1.155 / шаг²); bloom — месяцы
// с…по; winter: stands — стоит сухим, gone — уходит под землю, bare — голые
// ветки, evergreen — как летом; cutBack — месяц весенней срезки.
const SEEDS = [
  { id: 'miscanthus-sinensis', node: 231, latin: 'Miscanthus sinensis', ru: 'Мискантус китайский', en: 'Chinese silver grass', category: 'grass', height: 1.6, spread: 1, density: 1.4, foliage: 'grass', bloom: [8, 10], bloomColor: '#d9c3a5', winter: 'stands', cutBack: 3, zone: '5a', light: 'солнце', water: 'умеренно', rostov: 'Надёжен; в августовскую засуху — полив.' },
  { id: 'pennisetum-hameln', node: 119, latin: "Pennisetum alopecuroides 'Hameln'", ru: "Пеннисетум лисохвостовидный 'Хамельн'", en: "Fountain grass 'Hameln'", category: 'grass', height: 0.6, spread: 0.6, density: 3.2, foliage: 'grass', bloom: [8, 9], bloomColor: '#d8ccb0', winter: 'stands', cutBack: 4, zone: '5b', light: 'солнце', water: 'умеренно', rostov: 'Зимует; стоит до весны, срезать в начале апреля.' },
  { id: 'deschampsia-cespitosa', node: 236, latin: 'Deschampsia cespitosa', ru: 'Щучка дернистая', en: 'Tufted hair grass', category: 'grass', height: 0.8, spread: 0.5, density: 5, foliage: 'grass', bloom: [6, 8], bloomColor: '#cbb98a', winter: 'stands', cutBack: 3, zone: '4', light: 'солнце — полутень', water: 'влажно', rostov: 'Любит влагу: в Ростове — с поливом или в полутени.' },
  { id: 'festuca-glauca', node: 196, latin: 'Festuca glauca', ru: 'Овсяница сизая', en: 'Blue fescue', category: 'grass', height: 0.3, spread: 0.3, density: 9, foliage: 'evergreen', bloom: [6, 7], bloomColor: '#cfc39a', winter: 'evergreen', zone: '4', light: 'солнце', water: 'сухо', rostov: 'Засухоустойчива; нужен дренаж, на тяжёлом чернозёме — щебень.' },
  { id: 'nassella-tenuissima', node: 265, latin: 'Nassella tenuissima (Stipa tenuifolia)', ru: 'Ковыль тончайший', en: 'Mexican feather grass', category: 'grass', height: 0.6, spread: 0.45, density: 5, foliage: 'grass', bloom: [6, 8], bloomColor: '#e0d2a4', winter: 'stands', cutBack: 3, zone: '7', light: 'солнце', water: 'сухо', risk: 'Зона 7: в холодную зиму Ростова может выпасть, держится самосевом.' },
  { id: 'perovskia-atriplicifolia', node: 327, latin: 'Salvia yangii (Perovskia atriplicifolia)', ru: 'Перовския лебедолистная', en: 'Russian sage', category: 'perennial', height: 1, spread: 0.7, density: 2.5, foliage: 'herbaceous', bloom: [7, 9], bloomColor: '#8e8fd8', winter: 'stands', cutBack: 4, cutHeight: 0.25, zone: '5', light: 'солнце', water: 'сухо', rostov: 'Одна из лучших для Ростова: жара, засуха, известь. Срезать в апреле до 20–30 см.' },
  { id: 'rudbeckia-goldsturm', node: 182, latin: "Rudbeckia fulgida var. sullivantii 'Goldsturm'", ru: "Рудбекия блестящая 'Гольдштурм'", en: "Black-eyed Susan 'Goldsturm'", category: 'perennial', height: 0.65, spread: 0.5, density: 6, foliage: 'herbaceous', bloom: [7, 9], bloomColor: '#f2b21e', winter: 'stands', cutBack: 3, zone: '4', light: 'солнце', water: 'умеренно', rostov: 'Чёрные головки стоят зимой.' },
  { id: 'sedum-herbstfreude', node: 388, latin: "Hylotelephium 'Herbstfreude'", ru: "Очиток 'Хербстфройде'", en: "Sedum 'Autumn Joy'", category: 'perennial', height: 0.5, spread: 0.45, density: 6, foliage: 'herbaceous', bloom: [8, 10], bloomColor: '#b4555c', winter: 'stands', cutBack: 3, zone: '4', light: 'солнце', water: 'сухо', rostov: 'Засуха ему нипочём; соцветия стоят зимой.' },
  { id: 'lavandula-angustifolia', node: 56, latin: 'Lavandula angustifolia', ru: 'Лаванда узколистная', en: 'English lavender', category: 'perennial', height: 0.5, spread: 0.5, density: 5, foliage: 'evergreen', bloom: [6, 7], bloomColor: '#8b78c7', winter: 'evergreen', zone: '5', light: 'солнце', water: 'сухо', rostov: 'На тяжёлом чернозёме — дренаж; стрижка после цветения.' },
  { id: 'iris-germanica', node: 307, latin: "Iris germanica 'Accent'", ru: "Ирис бородатый 'Аксент'", en: "Bearded iris 'Accent'", category: 'perennial', height: 0.8, spread: 0.4, density: 6, foliage: 'herbaceous', bloom: [5, 6], bloomColor: '#e2b22c', bloomColor2: '#7a2433', winter: 'gone', zone: '3', light: 'солнце', water: 'сухо', rostov: 'Классика Ростова; корневища не заглублять.' },
  { id: 'gaillardia-grandiflora', node: 320, latin: 'Gaillardia × grandiflora', ru: 'Гайлардия крупноцветковая', en: 'Blanket flower', category: 'perennial', height: 0.6, spread: 0.45, density: 6, foliage: 'herbaceous', bloom: [6, 9], bloomColor: '#d9542b', bloomColor2: '#efc23a', winter: 'gone', zone: '3', light: 'солнце', water: 'сухо', rostov: 'Жаро- и засухоустойчива; живёт 3–4 года.' },
  { id: 'leucanthemum-superbum', node: 91, latin: 'Leucanthemum × superbum', ru: 'Нивяник наибольший', en: 'Shasta daisy', category: 'perennial', height: 0.8, spread: 0.5, density: 5, foliage: 'herbaceous', bloom: [6, 8], bloomColor: '#f4f2ea', winter: 'gone', zone: '5', light: 'солнце', water: 'умеренно' },
  { id: 'liatris-spicata', node: 352, latin: 'Liatris spicata', ru: 'Лиатрис колосковый', en: 'Blazing star', category: 'perennial', height: 0.8, spread: 0.35, density: 9, foliage: 'herbaceous', bloom: [7, 8], bloomColor: '#a2489c', winter: 'stands', cutBack: 3, zone: '3', light: 'солнце', water: 'умеренно' },
  { id: 'alchemilla-mollis', node: 277, latin: 'Alchemilla mollis', ru: 'Манжетка мягкая', en: "Lady's mantle", category: 'perennial', height: 0.4, spread: 0.5, density: 5, foliage: 'herbaceous', bloom: [6, 7], bloomColor: '#cfd35a', winter: 'gone', zone: '3', light: 'полутень', water: 'умеренно', rostov: 'В Ростове — в полутени и с поливом.' },
  { id: 'vinca-minor', node: 188, latin: 'Vinca minor', ru: 'Барвинок малый', en: 'Lesser periwinkle', category: 'groundcover', height: 0.15, spread: 0.4, density: 9, foliage: 'evergreen', bloom: [4, 5], bloomColor: '#6f77c8', winter: 'evergreen', zone: '4', light: 'тень — полутень', water: 'умеренно', rostov: 'Под деревьями, в тени.' },
  { id: 'cornus-alba-elegantissima', node: 225, latin: "Cornus alba 'Elegantissima'", ru: "Дёрен белый 'Элегантиссима'", en: "Tatarian dogwood 'Elegantissima'", category: 'shrub', height: 2, spread: 2, density: 0.5, foliage: 'deciduous', autumnColor: '#b0433a', twigColor: '#a3322a', winter: 'bare', zone: '3', light: 'солнце — полутень', water: 'умеренно', rostov: 'Красные побеги зимой; омолаживать раз в 3–4 года.' },
  { id: 'spiraea-tor-gold', node: 348, latin: "Spiraea betulifolia 'Tor Gold'", ru: "Спирея березолистная 'Тор Голд'", en: "Birchleaf spiraea 'Tor Gold'", category: 'shrub', height: 0.7, spread: 0.8, density: 2, foliage: 'deciduous', bloom: [6, 6], bloomColor: '#f1eee4', autumnColor: '#d4652c', twigColor: '#6b5a4a', winter: 'bare', zone: '4', light: 'солнце — полутень', water: 'умеренно' },
  { id: 'berberis-golden-rocket', node: 343, latin: "Berberis thunbergii 'Golden Rocket'", ru: "Барбарис Тунберга 'Голден Рокет'", en: "Japanese barberry 'Golden Rocket'", category: 'shrub', height: 1.2, spread: 0.5, density: 3, foliage: 'deciduous', autumnColor: '#d98a2e', twigColor: '#7a3b2a', winter: 'bare', zone: '4', light: 'солнце', water: 'сухо' },
  { id: 'picea-alberta-globe', node: 248, latin: "Picea glauca 'Alberta Globe'", ru: "Ель канадская 'Альберта Глоб'", en: "White spruce 'Alberta Globe'", category: 'conifer', height: 0.9, spread: 0.9, density: 1.2, foliage: 'evergreen', winter: 'evergreen', zone: '3', light: 'солнце — полутень', water: 'умеренно', risk: 'Весенние ожоги: в феврале–марте притенять; в жару — дождевание.' },
  { id: 'juniperus-sabina-mas', node: 150, latin: "Juniperus sabina 'Mas'", ru: "Можжевельник казацкий 'Мас'", en: "Savin juniper 'Mas'", category: 'conifer', height: 1, spread: 2.5, density: 0.25, foliage: 'evergreen', winter: 'evergreen', zone: '4', light: 'солнце', water: 'сухо', rostov: 'Местный вид степей и меловых склонов: засуха и известь.' },
  { id: 'buxus-sempervirens-ball', node: 598, latin: 'Buxus sempervirens (шар)', ru: 'Самшит вечнозелёный, шар', en: 'Boxwood ball', category: 'topiary', height: 0.8, spread: 0.8, density: 1.5, foliage: 'evergreen', winter: 'evergreen', zone: '6a', light: 'полутень', water: 'умеренно', risk: 'Самшитовая огнёвка в Ростове: обработки весной и летом; зимой притенять.' },
  { id: 'thuja-smaragd', node: 605, latin: "Thuja occidentalis 'Smaragd'", ru: "Туя западная 'Смарагд'", en: "Arborvitae 'Smaragd'", category: 'tree', height: 4, spread: 1.2, density: 1, foliage: 'evergreen', winter: 'evergreen', zone: '3', light: 'солнце — полутень', water: 'влажно', rostov: 'В жару страдает от сухого воздуха — дождевание.', size: 'в 10–15 лет' },
  { id: 'acer-tataricum', node: 535, latin: 'Acer tataricum', ru: 'Клён татарский (черноклён)', en: 'Tatar maple', category: 'tree', height: 6, spread: 5, density: 0.05, foliage: 'deciduous', autumnColor: '#c2382b', twigColor: '#5b4f45', winter: 'bare', zone: '3', light: 'солнце — полутень', water: 'сухо', rostov: 'Местный вид донских байрачных лесов.', size: 'в 15–20 лет' },
  { id: 'malus-evereste', node: 70, latin: "Malus 'Evereste'", ru: "Яблоня декоративная 'Эверест'", en: "Crab apple 'Evereste'", category: 'tree', fruit: true, height: 5, spread: 4, density: 0.07, foliage: 'deciduous', bloom: [4, 5], bloomColor: '#f6e8ea', leafColor: '#5b7a3a', autumnColor: '#d7a53a', twigColor: '#5d4b3d', winter: 'bare', zone: '4', light: 'солнце', water: 'умеренно', rostov: 'Цветёт в конце апреля; плоды держатся до зимы.', size: 'в 10–15 лет' },
  { id: 'pinus-nigra', node: 244, latin: 'Pinus nigra', ru: 'Сосна чёрная', en: 'Austrian pine', category: 'tree', height: 8, spread: 5, density: 0.04, foliage: 'evergreen', winter: 'evergreen', zone: '4', light: 'солнце', water: 'сухо', rostov: 'Одна из лучших хвойных для Ростова: засуха, известь, ветер.', size: 'в 15–20 лет' },
  { id: 'quercus-robur-fastigiata', node: 601, latin: "Quercus robur 'Fastigiata'", ru: "Дуб черешчатый 'Фастигиата'", en: "English oak 'Fastigiata'", category: 'tree', height: 8, spread: 2.5, density: 0.15, foliage: 'deciduous', autumnColor: '#a9793a', twigColor: '#5a4d40', winter: 'bare', zone: '4', light: 'солнце', water: 'умеренно', size: 'в 15–20 лет' },
];

function accessor(json, bin, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
  const read = { 5126: (o) => bin.readFloatLE(o), 5125: (o) => bin.readUInt32LE(o), 5123: (o) => bin.readUInt16LE(o), 5121: (o) => bin[o] }[a.componentType];
  const stride = view.byteStride ?? width * size;
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const scale = a.normalized && a.componentType !== 5126 ? 1 / ({ 5121: 255, 5123: 65535 }[a.componentType]) : 1;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) => read(base + i * stride + c * size) * scale));
}

function textureOf(json, materialIndex) {
  const material = json.materials?.[materialIndex];
  const specGloss = material?.extensions?.KHR_materials_pbrSpecularGlossiness;
  const slot = material?.pbrMetallicRoughness?.baseColorTexture ?? specGloss?.diffuseTexture;
  if (!slot) return null;
  return {
    image: json.textures[slot.index].source,
    texCoord: slot.texCoord ?? 0,
    factor: material.pbrMetallicRoughness?.baseColorFactor ?? specGloss?.diffuseFactor ?? [1, 1, 1, 1],
    uvTransform: slot.extensions?.KHR_texture_transform ?? null,
  };
}

const applyUvTransform = ([u, v], t) => {
  if (!t) return [u, v];
  const [sx, sy] = t.scale ?? [1, 1], r = t.rotation ?? 0, [ox, oy] = t.offset ?? [0, 0];
  const x = u * sx, y = v * sy;
  return [Math.cos(r) * x + Math.sin(r) * y + ox, -Math.sin(r) * x + Math.cos(r) * y + oy];
};

// Треугольники карточки в её плоскости: s — вдоль картинки от точки вставки,
// t — высота над ней; u, v — развёртка грани.
function cardTriangles(json, bin, world, nodeIndex) {
  const origin = transform(world.get(nodeIndex), [0, 0, 0]);
  const triangles = [];
  let texture = null;
  const visit = (index) => {
    const node = json.nodes[index];
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const tex = textureOf(json, primitive.material);
        if (!tex || primitive.attributes[`TEXCOORD_${tex.texCoord}`] === undefined) continue;
        if (texture && texture.image !== tex.image) continue; // одна картинка на растение
        texture ??= tex;
        const points = accessor(json, bin, primitive.attributes.POSITION).map((p) => transform(world.get(index), p));
        const uvs = accessor(json, bin, primitive.attributes[`TEXCOORD_${tex.texCoord}`]).map((uv) => applyUvTransform(uv, tex.uvTransform));
        const order = primitive.indices === undefined ? points.map((_, i) => i) : accessor(json, bin, primitive.indices).map(([i]) => i);
        for (let i = 0; i + 2 < order.length; i += 3) triangles.push([order[i], order[i + 1], order[i + 2]].map((k) => ({ p: points[k], uv: uvs[k] })));
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(nodeIndex);
  if (!triangles.length) return null;

  // Ось картинки в плане — главная ось разброса точек.
  const all = triangles.flat();
  let cx = 0, cz = 0;
  for (const { p } of all) { cx += p[0]; cz += p[2]; }
  cx /= all.length; cz /= all.length;
  let xx = 0, xz = 0, zz = 0;
  for (const { p } of all) { xx += (p[0] - cx) ** 2; xz += (p[0] - cx) * (p[2] - cz); zz += (p[2] - cz) ** 2; }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz), ax = Math.cos(angle), az = Math.sin(angle);
  const flat = triangles.map((tri) => tri.map(({ p, uv }) => ({ s: (p[0] - origin[0]) * ax + (p[2] - origin[2]) * az, t: p[1] - origin[1], u: uv[0], v: uv[1] })));
  // Картинка смотрит на зрителя правильной стороной: u растёт слева направо
  // (знак ∂u/∂s по самому большому треугольнику).
  const cross = (a, key) => (a[1][key] - a[0][key]) * (a[2].t - a[0].t) - (a[2][key] - a[0][key]) * (a[1].t - a[0].t);
  const widest = flat.reduce((best, tri) => (Math.abs(cross(tri, 's')) > Math.abs(cross(best, 's')) ? tri : best));
  if (cross(widest, 'u') * cross(widest, 's') < 0) for (const tri of flat) for (const vertex of tri) vertex.s = -vertex.s;
  return { triangles: flat, texture };
}

async function decodeImage(json, bin, imageIndex) {
  const image = json.images[imageIndex];
  const view = json.bufferViews[image.bufferView];
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Грани карточки → RGBA в плоскости растения, с плотностью исходной картинки.
function rasterize({ triangles, texture }, image) {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity, uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const tri of triangles) for (const { s, t, u, v } of tri) {
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const density = Math.max((uMax - uMin) * image.width / (s1 - s0), (vMax - vMin) * image.height / (t1 - t0));
  const perMetre = Math.min(density, MAX_RASTER / Math.max(s1 - s0, t1 - t0));
  const width = Math.max(1, Math.ceil((s1 - s0) * perMetre)), height = Math.max(1, Math.ceil((t1 - t0) * perMetre));
  const tiled = uMin < -0.01 || uMax > 1.01 || vMin < -0.01 || vMax > 1.01;
  const coord = (value, size) => {
    const f = tiled ? value - Math.floor(value) : Math.min(1, Math.max(0, value));
    return Math.min(size - 1, Math.max(0, f * size - 0.5));
  };
  const texel = (x, y, c) => image.data[(y * image.width + x) * 4 + c];
  const sample = (u, v, out) => {
    const x = coord(u, image.width), y = coord(v, image.height);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1), fx = x - x0, fy = y - y0;
    for (let c = 0; c < 4; c += 1) out[c] = (texel(x0, y0, c) * (1 - fx) + texel(x1, y0, c) * fx) * (1 - fy) + (texel(x0, y1, c) * (1 - fx) + texel(x1, y1, c) * fx) * fy;
  };
  const data = Buffer.alloc(width * height * 4);
  const rgba = [0, 0, 0, 0];
  for (const [a, b, c] of triangles) {
    const pts = [a, b, c].map(({ s, t }) => [(s - s0) * perMetre, (t1 - t) * perMetre]);
    const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const xMin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), xMax = Math.min(width - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))));
    const yMin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])))), yMax = Math.min(height - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    for (let y = yMin; y <= yMax; y += 1) for (let x = xMin; x <= xMax; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      const w1 = ((pts[2][0] - pts[0][0]) * (py - pts[0][1]) - (px - pts[0][0]) * (pts[2][1] - pts[0][1])) / -area;
      const w2 = ((px - pts[0][0]) * (pts[1][1] - pts[0][1]) - (pts[1][0] - pts[0][0]) * (py - pts[0][1])) / -area;
      const w0 = 1 - w1 - w2;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      sample(a.u * w0 + b.u * w1 + c.u * w2, a.v * w0 + b.v * w1 + c.v * w2, rgba);
      const at = (y * width + x) * 4;
      const alpha = rgba[3] * texture.factor[3];
      if (alpha <= data[at + 3]) continue;
      for (let k = 0; k < 3; k += 1) data[at + k] = Math.min(255, rgba[k] * texture.factor[k]);
      data[at + 3] = Math.min(255, alpha);
    }
  }
  return { data, width, height, perMetre, s0, t1 };
}

// Цвет под прозрачными пикселями — от соседей: иначе мипы картинки дают кайму.
function bleed(data, width, height, passes = 12) {
  let known = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) known[i] = data[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = known.slice();
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !known[ny * width + nx]) continue;
        const j = (ny * width + nx) * 4;
        r += data[j]; g += data[j + 1]; b += data[j + 2]; n += 1;
      }
      if (!n) continue;
      data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
      next[i] = 1;
    }
    known = next;
  }
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function hsv([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
// Цветок ли пиксель — тем же правилом шейдер прячет цветки вне сезона
// (PlantingLayer): оттенок рядом с цветом цветения, насыщенность не ниже
// 0.6 от его собственной; белое — светлое и бесцветное.
function flowerTest(colors) {
  const targets = colors.filter(Boolean).map((color) => hsv(hexRgb(color)));
  return ([h, s, v]) => targets.some(([hue, sat]) => (sat < 0.18 ? s < 0.21 && v > 0.52 : hueGap(h, hue) < 28 && s > 0.6 * sat && v > 0.3));
}
// Цвет цветения — с самой картинки: средний цвет пикселей в 25° от оттенка
// из таблицы. Лиловое у лаванды и перовскии бледное (насыщенность 0.25), и
// порог «цветок» считается от него, а не от яркого цвета из справочника.
function measuredBloom(data, color) {
  if (!color || hsv(hexRgb(color))[1] < 0.18) return color ?? null;
  const [hue] = hsv(hexRgb(color));
  let opaque = 0, n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    opaque += 1;
    const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], [h, s, v] = hsv(rgb);
    if (s > 0.1 && v > 0.25 && hueGap(h, hue) < 25) { n += 1; rgb.forEach((c, k) => { sum[k] += c; }); }
  }
  return n > opaque * 0.01 ? `#${sum.map((c) => Math.round((c / n) * 255).toString(16).padStart(2, '0')).join('')}` : color;
}
// Доля цветков на картинке — сверка с тем, что нарисовано, — и цвет листвы:
// им шейдер закрашивает цветки до цветения.
function colours(data, bloomColors) {
  const isFlower = flowerTest(bloomColors);
  let opaque = 0, flowers = 0, leaf = [0, 0, 0], leaves = 0, all = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], pixel = hsv(rgb);
    opaque += 1;
    all = all.map((c, k) => c + rgb[k]);
    if (bloomColors.some(Boolean) && isFlower(pixel)) { flowers += 1; continue; }
    if (pixel[0] >= 50 && pixel[0] <= 170 && pixel[1] > 0.15) { leaf = leaf.map((c, k) => c + rgb[k]); leaves += 1; }
  }
  const hex = (rgb, n) => `#${rgb.map((c) => Math.round((c / Math.max(1, n)) * 255).toString(16).padStart(2, '0')).join('')}`;
  return { bloom: bloomColors.some(Boolean) && opaque ? Math.round((flowers / opaque) * 1000) / 10 : null, leafColor: leaves > opaque * 0.05 ? hex(leaf, leaves) : hex(all, opaque) };
}

async function importPlant(json, bin, world, seed, images) {
  const card = cardTriangles(json, bin, world, seed.node);
  if (!card) throw new Error(`узел ${seed.node}: у компонента нет картинки`);
  if (!images.has(card.texture.image)) images.set(card.texture.image, await decodeImage(json, bin, card.texture.image));
  const raster = rasterize(card, images.get(card.texture.image));

  // Поля без растения обрезаются; сдвиг пересчитывает точку вставки.
  let left = raster.width, right = -1, top = raster.height, bottom = -1;
  for (let y = 0; y < raster.height; y += 1) for (let x = 0; x < raster.width; x += 1) {
    if (raster.data[(y * raster.width + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < 0) throw new Error(`узел ${seed.node}: картинка пустая`);
  const cropW = right - left + 1, cropH = bottom - top + 1;
  const scale = Math.min(1, MAX_CARD / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * scale)), outH = Math.max(1, Math.round(cropH * scale));
  const { data } = await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH }).resize(outW, outH, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  bleed(data, outW, outH);
  const webp = await sharp(data, { raw: { width: outW, height: outH, channels: 4 } }).webp({ quality: 88, alphaQuality: 100, exact: true }).toBuffer();

  // Корень — низ картинки под точкой вставки. То, что в SketchUp утоплено в
  // землю (у злаков до 20 см), — приём рисовальщика, а не корни: растение
  // стоит на нижнем крае, высота из таблицы — вся картинка.
  const metres = (px) => px / raster.perMetre;
  const width = metres(cropW), height = metres(cropH);
  const sLeft = raster.s0 + metres(left);
  const { node, ...facts } = seed;
  // Цвет листвы — по зелёным пикселям картинки; у дерева, снятого в
  // цветении (яблоня), листвы на картинке нет — тогда он в таблице.
  const bloomColor = measuredBloom(data, seed.bloomColor), bloomColor2 = measuredBloom(data, seed.bloomColor2);
  const { bloom, leafColor: measured } = colours(data, [bloomColor, bloomColor2]);
  const leafColor = seed.leafColor ?? measured;
  const record = {
    ...facts,
    ...(bloomColor ? { bloomColor } : {}),
    ...(bloomColor2 ? { bloomColor2 } : {}),
    cap: capOf(seed),
    leafColor,
    card: {
      file: 'card.webp', px: [outW, outH],
      width: Math.round(width * 1000) / 1000, height: Math.round(height * 1000) / 1000,
      // Ствол дерева стоит там, где стоит в картинке; точка вставки у края
      // (стелющийся можжевельник) — не ствол: тогда середина.
      anchorX: Math.round((Math.abs(-sLeft / width - 0.5) <= 0.2 ? -sLeft / width : 0.5) * 1000) / 1000,
    },
    source: {
      sketchup: { file: path.basename(LIBRARY), node, drawnHeight: Math.round(height * 100) / 100 },
      data: 'Claude по общим справочникам (RHS, Missouri BG, питомники); для Ростова — план §7',
      confidence: 'средняя',
      checked: false,
    },
  };
  return { record, webp, bloom };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const sheetAt = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;
  const file = args.find((arg) => arg.endsWith('.glb')) ?? LIBRARY;
  const { json, bin } = readGlb(await fs.readFile(file));
  const { world } = walkScene(json);
  await fs.mkdir(PLANTS_DIR, { recursive: true });
  const images = new Map(), sheet = [];
  for (const seed of SEEDS) {
    const recordPath = path.join(PLANTS_DIR, `${seed.id}.json`);
    if (!force && await fs.access(recordPath).then(() => true, () => false)) { console.log(`  ${seed.id}: есть, пропущено (--force перезапишет)`); continue; }
    try {
      const { record, webp, bloom } = await importPlant(json, bin, world, seed, images);
      await fs.mkdir(path.join(PLANTS_DIR, seed.id), { recursive: true });
      await fs.writeFile(path.join(PLANTS_DIR, seed.id, 'card.webp'), webp);
      await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
      sheet.push({ id: seed.id, webp });
      console.log(`  ${seed.id}: ${record.card.px.join('×')} px, карточка ${record.card.width}×${record.card.height} м (нарисован ${record.source.sketchup.drawnHeight} м → ${seed.height} м)${bloom !== null ? `, цветков на картинке ${bloom}%` : ''}`);
    } catch (error) {
      console.log(`  ${seed.id}: НЕ ИМПОРТИРОВАНО — ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (sheetAt && sheet.length) {
    const cell = 220, columns = 7, rows = Math.ceil(sheet.length / columns);
    const tiles = await Promise.all(sheet.map(async ({ id, webp }, i) => ({
      input: await sharp(webp).resize(cell - 20, cell - 40, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      left: (i % columns) * cell + 10, top: Math.floor(i / columns) * cell + 10, id,
    })));
    const labels = Buffer.from(`<svg width="${columns * cell}" height="${rows * cell}" xmlns="http://www.w3.org/2000/svg">${tiles.map((t) => `<text x="${t.left}" y="${t.top + cell - 22}" font-family="Helvetica" font-size="12" fill="#333">${t.id}</text>`).join('')}</svg>`);
    await sharp({ create: { width: columns * cell, height: rows * cell, channels: 3, background: '#e9e7e0' } })
      .composite([...tiles.map(({ input, left, top }) => ({ input, left, top })), { input: labels, left: 0, top: 0 }]).png().toFile(sheetAt);
    console.log(`лист: ${sheetAt}`);
  }
  console.log(`библиотека: ${PLANTS_DIR}`);
}

await main();
