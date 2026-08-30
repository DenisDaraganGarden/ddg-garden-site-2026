import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.join(process.cwd(), 'public/models/seagull/seagull-flight.glb');
const buffer = await fs.readFile(file);

assert.equal(buffer.toString('ascii', 0, 4), 'glTF', 'invalid GLB header');
assert.equal(buffer.readUInt32LE(4), 2, 'expected glTF 2.0');

const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
const primitive = json.meshes?.[0]?.primitives?.[0];

assert.equal(json.scenes?.length, 1, 'expected one scene');
assert.equal(json.meshes?.length, 1, 'expected one mesh');
assert.equal(json.meshes[0].primitives.length, 1, 'expected one primitive');
assert.equal(json.skins?.length, 1, 'expected one skin');
assert.equal(json.skins[0].joints.length, 17, 'expected 16 authored bones plus neutral helper');
assert.equal(json.animations?.length ?? 0, 0, 'runtime asset must not contain the stock animation');
assert.equal(json.images?.length ?? 0, 0, 'PBR maps must remain external');

for (const attribute of ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  assert.ok(Number.isInteger(primitive.attributes?.[attribute]), `missing ${attribute}`);
}

const vertices = json.accessors[primitive.attributes.POSITION].count;
const triangles = json.accessors[primitive.indices].count / 3;
assert.equal(vertices, 13238, 'unexpected exported vertex count');
assert.equal(triangles, 5607, 'unexpected triangle count');
assert.ok(buffer.length < 1_000_000, 'GLB exceeds the 1 MB collection budget');

console.log(JSON.stringify({
  file,
  bytes: buffer.length,
  meshes: json.meshes.length,
  primitives: json.meshes[0].primitives.length,
  vertices,
  triangles,
  joints: json.skins[0].joints.length,
  animations: json.animations?.length ?? 0,
  embeddedImages: json.images?.length ?? 0,
}, null, 2));
