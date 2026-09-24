// Файл из SketchUp (плагин SimLab и похожие) → файл, который движок рисует
// так, как он выглядел в SketchUp. Геометрия, материалы, имена и вложенность
// компонентов остаются как есть; меняется только то, что ломает показ:
//   - мелкие обломки далеко от участка: движок ставит модель по её габаритам,
//     и три забытых кусочка в полукилометре уводят участок из-под курсора;
//   - материалы Specular-Glossiness: three.js этот формат больше не читает;
//     металличность 0, матовость 0.85, у полупрозрачных ползунком 0.1;
//   - грани без материала — «Default» SketchUp: белые с обеих сторон (сам
//     three.js сделал бы их металлом, видимым с одной стороны);
//   - прозрачность по картинке: вырезанная (MASK) — только если в ней есть и
//     глухие, и прозрачные места; ровно полупрозрачная — BLEND, глухая — без;
//   - картинки больше 4096 px: фото на 10 тыс. px — полгигабайта видеопамяти;
//   - 2D-растения («всегда к камере»): сам признак SimLab не выгружает, они
//     узнаются по форме — плоская вертикальная картинка с прозрачностью — и
//     помечаются extras.faceCamera на своём узле; поворачивает их сцена.
// Сцены SketchUp («Сцена №1»…) — пустые узлы, они остаются в файле: из них
// редактор делает камеры.
export const MAX_TEXTURE = 4096;
const SPEC_GLOSS = 'KHR_materials_pbrSpecularGlossiness';
const VIEW_NAME = /^(Сцена|Scene)[\s№]/;
export const isSketchupView = (name) => VIEW_NAME.test(name ?? '');

export function readGlb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Это не .glb: нужен двоичный glTF 2.0 целиком, с текстурами внутри.');
  }
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength;
  const bin = binStart + 8 <= bytes.length ? bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart)) : Buffer.alloc(0);
  if ((json.buffers ?? []).some((buffer, index) => index > 0 || buffer.uri)) {
    throw new Error('В .glb есть внешние файлы: выгрузите модель одним файлом.');
  }
  return { json, bin };
}

export function writeGlb(json, bin) {
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, 'latin1');
    return [head, data];
  };
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0), 8);
  return Buffer.concat([header, ...chunk('JSON', jsonChunk), ...(binChunk.length ? chunk('BIN\0', binChunk) : [])]);
}

// --- матрицы узлов (по столбцам, как в glTF) ---
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) for (let k = 0; k < 4; k += 1) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const transform = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);

// Мировые матрицы и родитель каждого узла сцены.
function walkScene(json) {
  const world = new Map();
  const parent = new Map();
  const walk = (index, parentMatrix, parentIndex) => {
    const matrix = multiply(parentMatrix, localMatrix(json.nodes[index]));
    world.set(index, matrix);
    if (parentIndex !== undefined) parent.set(index, parentIndex);
    for (const child of json.nodes[index].children ?? []) walk(child, matrix, index);
  };
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(root, IDENTITY);
  return { world, parent };
}

// Ящик меша в мире файла — по min/max его аксессоров, как считает сцена
// (Box3.setFromObject в PlacedObjects.prepareModel).
function meshBox(json, index, matrix) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of json.meshes[json.nodes[index].mesh].primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION];
    if (!accessor?.min || !accessor?.max) continue;
    for (let corner = 0; corner < 8; corner += 1) {
      const point = transform(matrix, [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? accessor.max : accessor.min)[axis]));
      for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
    }
  }
  return { min, max };
}

// «Низ середины» файла: середина габарита в плане и самая низкая точка. Объект
// запоминает её при импорте, и новая версия того же SketchUp встаёт на её
// место, а не на середину своих новых габаритов: камеры и посадки не съезжают.
export function modelOrigin(json) {
  const { world } = walkScene(json);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [index, matrix] of world) {
    if (json.nodes[index].mesh === undefined) continue;
    const box = meshBox(json, index, matrix);
    for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], box.min[axis]); max[axis] = Math.max(max[axis], box.max[axis]); }
  }
  if (!Number.isFinite(min[0])) return null;
  const round = (value) => Math.round(value * 1000) / 1000;
  return { x: round((min[0] + max[0]) / 2), y: round(min[1]), z: round((min[2] + max[2]) / 2) };
}

// Путь узла от корня: имя и номер среди соседей с тем же именем. По нему
// скрытые части старой версии находят себя в новой выгрузке того же файла.
function nodePaths(json) {
  const paths = new Map();
  const walk = (indices, prefix) => {
    const seen = new Map();
    for (const index of indices ?? []) {
      const name = json.nodes[index].name ?? '';
      const count = seen.get(name) ?? 0;
      seen.set(name, count + 1);
      const path = `${prefix}\u0001${name}#${count}`;
      paths.set(index, path);
      walk(json.nodes[index].children, path);
    }
  };
  walk(json.scenes?.[json.scene ?? 0]?.nodes, '');
  return paths;
}

// Для каждого узла старого файла — узел нового с тем же путём, или −1.
export function mapNodes(previous, next) {
  const byPath = new Map([...nodePaths(next)].map(([index, path]) => [path, index]));
  const map = new Array(previous.nodes?.length ?? 0).fill(-1);
  for (const [index, path] of nodePaths(previous)) map[index] = byPath.get(path) ?? -1;
  return map;
}

// JSON файла на диске без чтения всей двоичной части.
export async function readGlbJson(file) {
  const { open } = await import('node:fs/promises');
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (header.toString('ascii', 0, 4) !== 'glTF') throw new Error('Это не .glb.');
    const chunk = Buffer.alloc(header.readUInt32LE(12));
    await handle.read(chunk, 0, chunk.length, 20);
    return JSON.parse(chunk.toString('utf8'));
  } finally {
    await handle.close();
  }
}

// Вершины примитива, на которые ссылаются его треугольники. Экспортёры
// SketchUp пишут float VEC3 и целые индексы; другое сюда не попадает.
function positionsOf(json, bin, primitive) {
  const accessor = json.accessors[primitive.attributes.POSITION];
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 12;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (i) => [bin.readFloatLE(base + i * stride), bin.readFloatLE(base + i * stride + 4), bin.readFloatLE(base + i * stride + 8)];
  if (primitive.indices === undefined) return Array.from({ length: accessor.count }, (_, i) => read(i));
  const indices = json.accessors[primitive.indices];
  const indexView = json.bufferViews[indices.bufferView];
  const size = { 5121: 1, 5123: 2, 5125: 4 }[indices.componentType];
  const start = (indexView.byteOffset ?? 0) + (indices.byteOffset ?? 0);
  const used = new Set();
  for (let i = 0; i < indices.count; i += 1) used.add(size === 4 ? bin.readUInt32LE(start + i * 4) : size === 2 ? bin.readUInt16LE(start + i * 2) : bin[start + i]);
  return [...used].map(read);
}

// 2D-растение: плоская вертикальная картинка — в плане точки лежат на одной
// прямой (главная ось разброса) с отклонением меньше 2 см, высота от 20 см, —
// и ось поворота (`pivot`, точка вставки компонента) стоит в её средней части,
// как ствол. Забор или решётка с точкой вставки в углу крутились бы вокруг угла.
export function isFlatVertical(points, pivot = null) {
  if (points.length < 3) return false;
  let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0;
  for (const [x, y, z] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); cx += x; cz += z; }
  cx /= points.length; cz /= points.length;
  let xx = 0, xz = 0, zz = 0;
  for (const [x, , z] of points) { xx += (x - cx) ** 2; xz += (x - cx) * (z - cz); zz += (z - cz) ** 2; }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const nx = -Math.sin(angle), nz = Math.cos(angle);
  let off = 0, low = Infinity, high = -Infinity;
  for (const [x, , z] of points) {
    off = Math.max(off, Math.abs((x - cx) * nx + (z - cz) * nz));
    const along = (x - cx) * nz - (z - cz) * nx;
    low = Math.min(low, along); high = Math.max(high, along);
  }
  const width = high - low, height = maxY - minY;
  if (height < 0.2 || width < 0.1 || off >= 0.02) return false;
  if (!pivot) return true;
  const at = (pivot[0] - cx) * nz - (pivot[2] - cz) * nx;
  const aside = Math.abs((pivot[0] - cx) * nx + (pivot[2] - cz) * nz);
  return width <= 4 * height && aside < Math.max(0.1, 0.1 * width) && at > low + 0.15 * width && at < high - 0.15 * width;
}

const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];

export async function prepareSketchupGlb(bytes, { maxTexture = MAX_TEXTURE } = {}) {
  // sharp грузится здесь, а не наверху: модуль входит в конфиг Vite, и
  // статический импорт тянул бы нативную библиотеку в каждую сборку сайта.
  const { default: sharp } = await import('sharp');
  const { json, bin } = readGlb(bytes);
  const { world, parent } = walkScene(json);
  const report = { generator: json.asset?.generator ?? '', removed: [], texturesResized: [], billboards: 0, views: 0, defaultFaces: 0, materials: { opaque: 0, mask: 0, blend: 0 } };

  // Обломки: кусок меньше 10 м, весь дальше четырёх радиусов, в которых лежат
  // 90% кусков вокруг их медианы (и не ближе 50 м). Длинная дорога от дома или
  // соседний павильон остаются.
  const pieces = [...world].filter(([index]) => json.nodes[index].mesh !== undefined).map(([index, matrix]) => {
    const { min, max } = meshBox(json, index, matrix);
    return { index, min, max, x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2, size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) };
  });
  if (pieces.length > 2) {
    const mx = median(pieces.map((piece) => piece.x)), mz = median(pieces.map((piece) => piece.z));
    const limit = Math.max(4 * pieces.map((piece) => Math.hypot(piece.x - mx, piece.z - mz)).sort((a, b) => a - b)[Math.floor(pieces.length * 0.9)], 50);
    const nearest = (piece) => Math.hypot(Math.max(piece.min[0] - mx, 0, mx - piece.max[0]), Math.max(piece.min[2] - mz, 0, mz - piece.max[2]));
    const distances = pieces.map(nearest);
    pieces.forEach((piece, i) => {
      if (distances[i] <= limit || piece.size >= 10) return;
      const name = json.nodes[parent.get(piece.index)]?.name ?? json.nodes[piece.index].name ?? `#${piece.index}`;
      report.removed.push({ name, distance: Math.round(distances[i]) });
      delete json.nodes[piece.index].mesh;
    });
  }

  // Картинки: размер — из заголовка, прозрачность — по пикселям (PNG бывает
  // RGBA без единого прозрачного пикселя).
  const imageBytes = (image) => {
    const view = json.bufferViews[image.bufferView];
    return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  };
  const replaced = new Map();
  const alphaOf = new Map();
  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined) continue;
    const source = imageBytes(image);
    const meta = await sharp(source).metadata();
    if (meta.hasAlpha) {
      const stats = await sharp(source).stats();
      alphaOf.set(index, stats.isOpaque ? null : stats.channels[stats.channels.length - 1].max >= 230 ? 'MASK' : 'BLEND');
    }
    if (Math.max(meta.width, meta.height) <= maxTexture) continue;
    const resized = sharp(source).resize({ width: maxTexture, height: maxTexture, fit: 'inside' });
    const out = image.mimeType === 'image/png' ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    replaced.set(image.bufferView, out);
    const after = await sharp(out).metadata();
    report.texturesResized.push({ image: index, from: [meta.width, meta.height], to: [after.width, after.height] });
  }

  for (const material of json.materials ?? []) {
    const specGloss = material.extensions?.[SPEC_GLOSS];
    const pbr = material.pbrMetallicRoughness ?? (material.pbrMetallicRoughness = {});
    if (specGloss) {
      if (!pbr.baseColorFactor && specGloss.diffuseFactor) pbr.baseColorFactor = specGloss.diffuseFactor;
      if (!pbr.baseColorTexture && specGloss.diffuseTexture) pbr.baseColorTexture = specGloss.diffuseTexture;
      delete material.extensions[SPEC_GLOSS];
      if (!Object.keys(material.extensions).length) delete material.extensions;
    }
    const texture = pbr.baseColorTexture ? json.textures?.[pbr.baseColorTexture.index] : null;
    const pictureAlpha = texture && material.alphaMode !== 'OPAQUE' ? alphaOf.get(texture.source) : null;
    if ((pbr.baseColorFactor?.[3] ?? 1) < 0.999 || pictureAlpha === 'BLEND' || (pictureAlpha && material.alphaMode === 'BLEND')) {
      material.alphaMode = 'BLEND';
      delete material.alphaCutoff;
    } else if (pictureAlpha === 'MASK') {
      material.alphaMode = 'MASK';
    } else {
      delete material.alphaMode;
      delete material.alphaCutoff;
    }
    report.materials[{ BLEND: 'blend', MASK: 'mask' }[material.alphaMode] ?? 'opaque'] += 1;
    pbr.metallicFactor = 0;
    // Прозрачность ползунком SketchUp — стекло или вода, они гладкие; по
    // картинке — тюль, сетка, мягкая тень, они матовые.
    pbr.roughnessFactor = (pbr.baseColorFactor?.[3] ?? 1) < 0.999 ? 0.1 : 0.85;
  }
  const bare = (json.meshes ?? []).flatMap((mesh) => mesh.primitives).filter((primitive) => primitive.material === undefined);
  if (bare.length) {
    json.materials = [...(json.materials ?? []), { name: 'SketchUp Default', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 } }];
    for (const primitive of bare) primitive.material = json.materials.length - 1;
    report.defaultFaces = bare.length;
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (!json[key]) continue;
    json[key] = json[key].filter((name) => name !== SPEC_GLOSS);
    if (!json[key].length) delete json[key];
  }

  // 2D-растения: все примитивы узла — вырезанная картинка на вертикальной
  // плоскости. Ось поворота сцена берёт у родителя — точку вставки компонента.
  for (const [index, matrix] of world) {
    const node = json.nodes[index];
    if (node.mesh === undefined || !parent.has(index)) continue;
    const primitives = json.meshes[node.mesh].primitives;
    const cutout = primitives.every((primitive) => (primitive.mode ?? 4) === 4 && json.materials?.[primitive.material]?.alphaMode === 'MASK');
    const points = primitives.flatMap((primitive) => positionsOf(json, bin, primitive)).map((point) => transform(matrix, point));
    if (!cutout || !isFlatVertical(points, transform(world.get(parent.get(index)), [0, 0, 0]))) continue;
    node.extras = { ...node.extras, faceCamera: true };
    report.billboards += 1;
  }
  report.views = [...world.keys()].filter((index) => isSketchupView(json.nodes[index].name) && json.nodes[index].mesh === undefined).length;

  // Двоичная часть собирается заново, только если картинки поменялись.
  let outBin = bin;
  if (replaced.size) {
    const parts = [];
    let offset = 0;
    json.bufferViews.forEach((view, index) => {
      const data = replaced.get(index) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const padding = (4 - (offset % 4)) % 4;
      if (padding) parts.push(Buffer.alloc(padding));
      offset += padding;
      view.byteOffset = offset;
      view.byteLength = data.length;
      parts.push(data);
      offset += data.length;
    });
    outBin = Buffer.concat(parts);
    json.buffers[0].byteLength = outBin.length;
  }
  return { bytes: writeGlb(json, outBin), report };
}
