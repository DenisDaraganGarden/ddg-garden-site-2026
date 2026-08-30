import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { FISH_CATALOG } from '../src/features/home-scene/creatures/fish/fishCatalog.js';

const root = path.resolve(process.cwd(), 'public/models/fish');
const manifestPath = path.join(root, 'manifest.json');
const textureManifestPath = path.join(root, 'textures/textures-manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const textureManifest = JSON.parse(await fs.readFile(textureManifestPath, 'utf8'));
// The normal, ORM and specular maps were stored losslessly, which for this kind
// of data is 2.7 MB spent on bit-exactness nobody can see. They are near-lossless
// now: 4.00 MB -> 2.78 MB across the fish and the seagull, with a measured maximum
// error of 2 of 255 on every channel of every file. Lossy WebP is NOT an option
// here and the hashes must never be updated to accept it - it is unconditionally
// 4:2:0, which halves the resolution of the normal's Y axis and costs about 6.5
// degrees RMS on a material whose whole read is the glint on one scale.
const expectedHashes = Object.freeze({
  pike: Object.freeze({
    glb: '12c7edfb1633fbb6338f3804c1811263389f3d848459ba368a97da076561e6e3',
    albedo: '0f0926766e69c86848743c7280dee72d8093d2d3e3ccd1ea05f731a080bb5c26',
    normal: 'f5d6e5a211b9522b211c2c73165c9634b681c5a3327f6d6d3ad1385bc257df61',
    orm: '3b9c964a5fb8f42400de8e2e95ec6bf883ca86a607f14de79c491462e8068a23',
    specular: '81c3732a47b11a5e974eb15ca3885d03a593067b0293b70bab376765216576b0',
  }),
  perch: Object.freeze({
    glb: '441467a16dd573eaa7da87f77cafc315983d7417f7de42db5d59f5800cfd4cbc',
    albedo: 'ef9990e178657f36cb7ee4622a66e2bc445e5184cda1b67c720b56130e0164a3',
    normal: 'd50c6effbc6a967738ba72666f0330f014b6d6631310d29e5fcf06bc16372208',
    orm: 'f4734bd33a0b1b114d67682c9fb8fc1aac9f141fcbe791d0d20774822e36d49e',
    specular: 'e04afcd2150cb276ef1279439590e0ebeefc32a6396c0f5b768ce2c1a95503e4',
  }),
  roach: Object.freeze({
    glb: 'd093b97002cf958e5b182cd267ea60529a79fe5060ae55fd6640365bad5724e4',
    albedo: 'ac24eacfdac67b7dcec34dcfa184c32ce4b7cb505195edaf351dff91e06a4e2f',
    normal: 'e5877a5b7a35dfc6c67f0976588648e77481d028c4c1e7d11dee074e00dfd5b1',
    orm: 'bb1b748f33734219c47a6a849ce396f2ab8fdf529c8764bd1a6f708abb76659a',
    specular: '14f81536ce041d8af7feb277e9673f71f34fa07e366f019d284d0ef1bbd1f1dc',
  }),
});

function assetPath(publicPath) {
  assert.ok(publicPath.startsWith('/models/fish/'), `unexpected public asset path: ${publicPath}`);
  return path.join(path.resolve(process.cwd(), 'public'), publicPath.replace(/^\//, ''));
}

function parseGlb(buffer, file) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', `${file}: invalid GLB header`);
  assert.equal(buffer.readUInt32LE(4), 2, `${file}: expected glTF 2.0`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${file}: header byte length mismatch`);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${file}: first chunk must be JSON`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
  const binaryHeader = 20 + jsonLength;
  assert.equal(buffer.readUInt32LE(binaryHeader + 4), 0x004e4942, `${file}: second chunk must be BIN`);
  const binaryLength = buffer.readUInt32LE(binaryHeader);
  const binary = buffer.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);
  return { json, binary };
}

function readFloatAccessor(gltf, binary, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126, 'expected FLOAT accessor');
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
  const stride = view.byteStride ?? componentCount * 4;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    for (let component = 0; component < componentCount; component += 1) {
      row.push(binary.readFloatLE(start + index * stride + component * 4));
    }
    rows.push(row);
  }
  return rows;
}

const summaries = [];
for (const species of manifest.species) {
  const glbPath = assetPath(species.glb);
  const buffer = await fs.readFile(glbPath);
  const { json: gltf, binary } = parseGlb(buffer, species.glb);
  const mesh = gltf.meshes?.[0];
  const primitive = mesh?.primitives?.[0];

  assert.equal(buffer.length, species.glbBytes, `${species.id}: GLB byte size does not match manifest`);
  assert.equal(gltf.scenes?.length, 1, `${species.id}: expected one scene`);
  assert.equal(gltf.meshes?.length, 1, `${species.id}: expected one mesh`);
  assert.equal(mesh?.primitives?.length, 1, `${species.id}: expected one primitive`);
  assert.equal(gltf.skins?.length, 1, `${species.id}: expected one skin`);
  assert.equal(gltf.skins[0].joints.length, species.totalBones, `${species.id}: unexpected joint count`);
  assert.equal(gltf.animations?.length ?? 0, 0, `${species.id}: runtime asset must not embed animation`);
  assert.equal(gltf.images?.length ?? 0, 0, `${species.id}: PBR maps must remain external`);
  assert.equal(gltf.materials?.length, 1, `${species.id}: expected one material slot`);
  assert.equal(gltf.materials[0].name, species.materialSlots[0], `${species.id}: material slot mismatch`);

  // TANGENT is intentionally omitted: Three.js derives tangent space for the
  // external normal map, saving one vertex attribute on every fish instance.
  for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
    assert.ok(Number.isInteger(primitive?.attributes?.[attribute]), `${species.id}: missing ${attribute}`);
  }

  const vertices = gltf.accessors[primitive.attributes.POSITION].count;
  const triangles = gltf.accessors[primitive.indices].count / 3;
  assert.equal(vertices, species.vertices, `${species.id}: vertex count mismatch`);
  assert.equal(triangles, species.triangles, `${species.id}: triangle count mismatch`);
  assert.equal(species.forwardAxis, '+X', `${species.id}: runtime forward axis must remain +X`);
  assert.equal(species.maxInfluences, 2, `${species.id}: web rig must stay at two influences`);
  assert.deepEqual(
    gltf.accessors[primitive.attributes.POSITION].min,
    [species.bounds.min[0], species.bounds.min[2], species.bounds.min[1]],
    `${species.id}: exported minimum bounds drifted`,
  );
  assert.deepEqual(
    gltf.accessors[primitive.attributes.POSITION].max,
    [species.bounds.max[0], species.bounds.max[2], species.bounds.max[1]],
    `${species.id}: exported maximum bounds drifted`,
  );

  const weights = readFloatAccessor(gltf, binary, primitive.attributes.WEIGHTS_0);
  let maximumWeightError = 0;
  let maximumInfluences = 0;
  for (const row of weights) {
    maximumWeightError = Math.max(
      maximumWeightError,
      Math.abs(row.reduce((sum, value) => sum + value, 0) - 1),
    );
    maximumInfluences = Math.max(maximumInfluences, row.filter((value) => value > 1e-6).length);
  }
  assert.ok(maximumWeightError <= species.maxWeightError + 1e-6, `${species.id}: weight sums drifted`);
  assert.ok(maximumInfluences <= species.maxInfluences, `${species.id}: too many skin influences`);

  const jointNames = gltf.skins[0].joints.map((nodeIndex) => gltf.nodes[nodeIndex].name);
  const pectoralIndices = jointNames
    .map((name, index) => (name.includes('_pectoral_') ? index : -1))
    .filter((index) => index >= 0);
  assert.deepEqual(
    pectoralIndices,
    [...FISH_CATALOG[species.id].pectoralBones],
    `${species.id}: procedural fin joint mapping drifted`,
  );

  const glbHash = createHash('sha256').update(buffer).digest('hex');
  assert.equal(glbHash, expectedHashes[species.id].glb, `${species.id}: GLB hash drifted`);

  const textures = {};
  for (const [kind, publicPath] of Object.entries(species.textures)) {
    assert.equal(textureManifest.species?.[species.id]?.[kind], publicPath, `${species.id}: ${kind} texture manifest mismatch`);
    const texturePath = assetPath(publicPath);
    const textureBuffer = await fs.readFile(texturePath);
    assert.equal(textureBuffer.toString('ascii', 0, 4), 'RIFF', `${species.id}: ${kind} must be WebP`);
    assert.equal(textureBuffer.toString('ascii', 8, 12), 'WEBP', `${species.id}: ${kind} must be WebP`);
    const metadata = await sharp(textureBuffer).metadata();
    assert.equal(metadata.format, 'webp', `${species.id}: ${kind} decoder format mismatch`);
    assert.equal(metadata.width, 1024, `${species.id}: ${kind} width must be 1024`);
    assert.equal(metadata.height, 512, `${species.id}: ${kind} height must be 512`);
    const textureHash = createHash('sha256').update(textureBuffer).digest('hex');
    assert.equal(textureHash, expectedHashes[species.id][kind], `${species.id}: ${kind} hash drifted`);
    textures[kind] = {
      bytes: textureBuffer.length,
      sha256: textureHash,
    };
  }

  summaries.push({
    id: species.id,
    glb: {
      bytes: buffer.length,
      sha256: glbHash,
      vertices,
      triangles,
      joints: gltf.skins[0].joints.length,
    },
    textures,
  });
}

assert.equal(manifest.units, 'meters', 'fish asset unit contract must be meters');
assert.equal(manifest.delivery, 'GLB rig plus external shared PBR maps; runtime owns procedural motion.');
assert.deepEqual([...manifest.species.map(({ id }) => id)].sort(), ['perch', 'pike', 'roach']);
assert.deepEqual(textureManifest.size, [1024, 512], 'unexpected PBR atlas size');
assert.equal(textureManifest.channels?.orm?.r, 'ambient occlusion');
assert.equal(textureManifest.channels?.orm?.g, 'roughness');
assert.equal(textureManifest.channels?.orm?.b, 'metalness');
assert.equal(textureManifest.channels?.specular?.a, 'per-scale specular intensity');

console.log(JSON.stringify({
  collection: 'fish',
  species: summaries,
  totalGlbBytes: summaries.reduce((sum, species) => sum + species.glb.bytes, 0),
  totalTriangles: summaries.reduce((sum, species) => sum + species.glb.triangles, 0),
  pbrAtlas: textureManifest.size,
}, null, 2));
