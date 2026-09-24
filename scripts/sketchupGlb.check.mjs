import assert from 'node:assert/strict';
import sharp from 'sharp';
import { isFlatVertical, mapNodes, modelOrigin, prepareSketchupGlb, readGlb, writeGlb } from './sketchupGlb.mjs';

// Маленький «SketchUp»: двадцать кубиков участка, обломок и павильон в 5 км,
// 2D-куст на родителе, забор-сетка с точкой вставки в углу, лежачий диск с той
// же картинкой, материал Specular-Glossiness, RGBA-картинка без прозрачности,
// ровно полупрозрачная картинка, слишком большая картинка, грань без материала
// и сцена SketchUp.
const parts = [];
let offset = 0;
const bufferViews = [];
const accessors = [];
const view = (data) => {
  const padding = (4 - (offset % 4)) % 4;
  if (padding) parts.push(Buffer.alloc(padding));
  offset += padding;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  parts.push(data);
  offset += data.length;
  return bufferViews.length - 1;
};
const mesh = (points, material) => {
  const primitive = (attributes, indices) => (material === undefined ? { attributes, indices } : { attributes, indices, material });
  const positions = Buffer.from(new Float32Array(points.flat()).buffer);
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis])));
  accessors.push({ bufferView: view(positions), componentType: 5126, count: points.length, type: 'VEC3', min, max });
  const indices = [];
  for (let i = 1; i + 1 < points.length; i += 1) indices.push(0, i, i + 1);
  accessors.push({ bufferView: view(Buffer.from(new Uint16Array(indices).buffer)), componentType: 5123, count: indices.length, type: 'SCALAR' });
  return { primitives: [primitive({ POSITION: accessors.length - 2 }, accessors.length - 1)] };
};
const png = (width, height, alpha) => sharp({ create: { width, height, channels: 4, background: { r: 90, g: 140, b: 60, alpha } } }).png().toBuffer();
// Вырезка: левая половина листа глухая, правая прозрачная.
const cutout = () => sharp(Buffer.from(Array.from({ length: 64 }, (_, i) => [90, 140, 60, i % 8 < 4 ? 255 : 0]).flat()), { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
const images = [
  { mimeType: 'image/png', bufferView: view(await cutout()) }, // лист-вырезка
  { mimeType: 'image/png', bufferView: view(await png(8, 8, 1)) }, // RGBA, но непрозрачная
  { mimeType: 'image/png', bufferView: view(await png(40, 10, 1)) }, // больше предела (в проверке 16)
  { mimeType: 'image/png', bufferView: view(await png(8, 8, 0.3)) }, // тюль: ровно полупрозрачная
];
const cube = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]];
const meshes = [
  mesh(cube, 0),
  mesh([[-0.5, 0, 0], [0.5, 0, 0], [0.5, 2, 0], [-0.5, 2, 0]], 1), // вертикальная картинка
  mesh([[-1, 3, -1], [1, 3, -1], [1, 3, 1], [-1, 3, 1]], 1), // лежачий диск
  mesh(cube, 2),
  mesh(cube, 3),
  mesh([[0, 0, 0], [3, 0, 0], [3, 1.5, 0], [0, 1.5, 0]], 1), // 5: сетка забора от угла
  mesh([[0, 0, 0], [20, 0, 0], [20, 6, 20], [0, 6, 20]], 0), // 6: павильон 20 м
  mesh(cube), // 7: грань без материала
  mesh(cube, 4), // 8: тюль
];
const nodes = [
  { name: 'root', children: [] },
  { name: 'Куст#1', translation: [3, 0, 3], children: [] },
  { name: 'Geom3D', mesh: 1 },
  { name: 'Geom3D', mesh: 2 },
  { name: 'Сцена №1', translation: [10, 1.6, 10] },
  { name: 'Обломок', translation: [5000, 0, 0], children: [] },
  { name: 'Geom3D', mesh: 0 },
  { name: 'Плита', mesh: 3 },
  { name: 'Стена', mesh: 4 },
  { name: 'Забор#1', translation: [8, 0, 1], children: [] },
  { name: 'Geom3D', mesh: 5 },
  { name: 'Павильон', translation: [5000, 0, 40], mesh: 6 },
  { name: 'Default', mesh: 7 },
  { name: 'Тюль', mesh: 8 },
];
nodes[1].children.push(2, 3);
nodes[5].children.push(6);
nodes[9].children.push(10);
nodes[0].children.push(1, 4, 5, 7, 8, 9, 11, 12, 13);
for (let i = 0; i < 20; i += 1) {
  nodes.push({ name: `Кубик#${i}`, mesh: 0, translation: [i * 2, 0, (i % 3) * 2] });
  nodes[0].children.push(nodes.length - 1);
}
const json = {
  asset: { version: '2.0', generator: 'SimLab GLTF' },
  extensionsUsed: ['KHR_materials_pbrSpecularGlossiness'],
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes,
  meshes,
  accessors,
  bufferViews,
  images,
  textures: images.map((_, source) => ({ source })),
  materials: [
    { name: 'Бетон', alphaMode: 'MASK', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.5 } },
    { name: 'Куст', alphaMode: 'MASK', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.1 } },
    { name: 'Старый', extensions: { KHR_materials_pbrSpecularGlossiness: { diffuseFactor: [0.2, 0.3, 0.4, 1], diffuseTexture: { index: 1 }, glossinessFactor: 0.5 } } },
    { name: 'Стекло', alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.3], baseColorTexture: { index: 2 } } },
    { name: 'Тюль', alphaMode: 'MASK', pbrMetallicRoughness: { baseColorTexture: { index: 3 } } },
  ],
};
const bin = Buffer.concat(parts);
json.buffers = [{ byteLength: bin.length }];

const { bytes, report } = await prepareSketchupGlb(writeGlb(json, bin), { maxTexture: 16 });
const out = readGlb(bytes);

assert.deepEqual(report.removed.map((entry) => entry.name), ['Обломок'], 'the far speck goes, named by its component');
assert.equal(out.json.nodes[6].mesh, undefined);
assert.equal(out.json.nodes[7].mesh, 3, 'the site stays');
assert.equal(out.json.nodes[11].mesh, 6, 'a far pavilion of 20 m is no stray');

assert.equal(report.billboards, 1);
assert.equal(out.json.nodes[2].extras?.faceCamera, true, 'the upright cut-out turns to the camera');
assert.equal(out.json.nodes[3].extras?.faceCamera, undefined, 'the flat disc does not');
assert.equal(out.json.nodes[10].extras?.faceCamera, undefined, 'a cut-out fence turning about its corner is no plant');

const [concrete, leaf, old, glass] = out.json.materials;
assert.equal(concrete.alphaMode, undefined, 'no texture, no alpha: opaque');
assert.equal(leaf.alphaMode, 'MASK', 'a picture with see-through pixels keeps its cut-out');
assert.equal(old.extensions, undefined);
assert.deepEqual(old.pbrMetallicRoughness.baseColorFactor, [0.2, 0.3, 0.4, 1], 'spec-gloss diffuse becomes the base colour');
assert.equal(old.pbrMetallicRoughness.baseColorTexture.index, 1);
assert.equal(old.alphaMode, undefined, 'RGBA without a see-through pixel is opaque');
assert.equal(glass.alphaMode, 'BLEND');
assert.equal(glass.pbrMetallicRoughness.roughnessFactor, 0.1);
assert.equal(concrete.pbrMetallicRoughness.metallicFactor, 0);
assert.equal(concrete.pbrMetallicRoughness.roughnessFactor, 0.85);
assert.equal(out.json.extensionsUsed, undefined);
const tulle = out.json.materials[4];
assert.equal(tulle.alphaMode, 'BLEND', 'an evenly see-through picture stays see-through, not cut away');
assert.equal(tulle.pbrMetallicRoughness.roughnessFactor, 0.85, 'a textured see-through surface is matte, only glass is glossy');
const bare = out.json.materials[out.json.meshes[7].primitives[0].material];
assert.equal(bare?.name, 'SketchUp Default', 'a face with no material gets SketchUp’s default');
assert.equal(bare.doubleSided, true);
assert.equal(bare.pbrMetallicRoughness.metallicFactor, 0);
assert.equal(report.defaultFaces, 1);

assert.deepEqual(report.texturesResized, [{ image: 2, from: [40, 10], to: [16, 4] }]);
for (const [index, image] of out.json.images.entries()) {
  const v = out.json.bufferViews[image.bufferView];
  const meta = await sharp(out.bin.subarray(v.byteOffset, v.byteOffset + v.byteLength)).metadata();
  assert.equal(meta.format, 'png', `image ${index} still decodes after the binary was rebuilt`);
}
for (const [index, accessor] of out.json.accessors.entries()) {
  const v = out.json.bufferViews[accessor.bufferView];
  assert.equal(v.byteOffset % 4, 0);
  const first = accessor.componentType === 5126 ? out.bin.readFloatLE(v.byteOffset) : out.bin.readUInt16LE(v.byteOffset);
  const was = accessor.componentType === 5126 ? bin.readFloatLE(bufferViews[accessor.bufferView].byteOffset) : bin.readUInt16LE(bufferViews[accessor.bufferView].byteOffset);
  assert.equal(first, was, `accessor ${index} reads the same data`);
}
assert.equal(report.views, 1);
assert.equal(out.json.nodes[4].name, 'Сцена №1', 'SketchUp scenes stay for the cameras');

assert.equal(isFlatVertical([[0, 0, 0], [1, 0, 1], [1, 2, 1], [0, 2, 0]]), true, 'a diagonal upright plane is flat');
assert.equal(isFlatVertical([[0, 0, 0], [1, 0, 1], [1, 2, 1], [0, 2, 0]], [0.5, 0, 0.5]), true, 'a trunk in the middle is a pivot');
assert.equal(isFlatVertical([[0, 0, 0], [1, 0, 1], [1, 2, 1], [0, 2, 0]], [0, 0, 0]), false, 'a corner is not');
assert.equal(isFlatVertical([[0, 0, 0], [1, 0, 0], [0, 2, 0.5]]), false, 'a leaning shape is not');

// «Низ середины»: середина габарита в плане, самая низкая точка — по ящикам.
const box = modelOrigin({
  scenes: [{ nodes: [0] }], scene: 0,
  nodes: [{ children: [1, 2] }, { mesh: 0, translation: [10, 2, 0] }, { mesh: 0, translation: [-2, -1, 4] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ min: [0, 0, 0], max: [2, 3, 1] }],
});
assert.deepEqual(box, { x: 5, y: -1, z: 2.5 });

// Новая выгрузка: перед знакомыми узлами появился новый, у двух одинаковых
// имён поменялся порядок нет — узлы находят себя по пути имён.
const previous = { scenes: [{ nodes: [0] }], nodes: [{ name: 'root', children: [1, 2, 3] }, { name: 'Куст' }, { name: 'Куст' }, { name: 'Забор' }] };
const next = { scenes: [{ nodes: [0] }], nodes: [{ name: 'root', children: [4, 1, 2, 3] }, { name: 'Куст' }, { name: 'Куст' }, { name: 'Скамья' }, { name: 'Беседка' }] };
assert.deepEqual(mapNodes(previous, next), [0, 1, 2, -1], 'the root and both bushes are found, the fence is gone');

console.log('sketchupGlb: ok');
