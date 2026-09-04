import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const MAGIC = [0x52, 0x4c, 0x4f, 0x44]; // RLOD
const VERSION = 1;
const TARGET_RATIO = 0.3;
const TARGET_ERROR = 0.015;

const jobs = [
  {
    source: 'public/models/boat/OBJ_boat2.0.glb',
    output: 'public/models/boat/boat-optics.rlod',
  },
  {
    source: 'public/models/sculpture/sculpture.glb',
    output: 'public/models/sculpture/sculpture-optics.rlod',
  },
];

function parseGltf(arrayBuffer) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
}

function sourceIndices(geometry) {
  if (geometry.index) {
    return Uint32Array.from(geometry.index.array);
  }

  return Uint32Array.from(
    { length: geometry.attributes.position.count },
    (_, index) => index,
  );
}

function simplifyMesh(mesh) {
  const position = mesh.geometry.attributes.position;
  const indices = sourceIndices(mesh.geometry);
  const targetIndexCount = Math.max(3, Math.floor(indices.length * TARGET_RATIO / 3) * 3);
  const [simplified, error] = MeshoptSimplifier.simplify(
    indices,
    position.array,
    position.itemSize,
    targetIndexCount,
    TARGET_ERROR,
    ['Prune'],
  );
  const maxIndex = simplified.reduce((maximum, value) => Math.max(maximum, value), 0);
  if (maxIndex > 0xffff) {
    throw new Error(`${mesh.name}: optics LOD exceeds Uint16 index range`);
  }

  return {
    name: mesh.name,
    indices: Uint16Array.from(simplified),
    sourceTriangles: indices.length / 3,
    targetTriangles: simplified.length / 3,
    error,
  };
}

function encodeLod(entries) {
  const encoder = new TextEncoder();
  const names = entries.map((entry) => encoder.encode(entry.name));
  const totalBytes = 8 + entries.reduce(
    (total, entry, index) => total + 2 + names[index].byteLength + 4 + entry.indices.byteLength,
    0,
  );
  const buffer = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(MAGIC, 0);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, entries.length, true);
  let offset = 8;

  entries.forEach((entry, index) => {
    const name = names[index];
    view.setUint16(offset, name.byteLength, true);
    offset += 2;
    bytes.set(name, offset);
    offset += name.byteLength;
    view.setUint32(offset, entry.indices.length, true);
    offset += 4;
    entry.indices.forEach((value) => {
      view.setUint16(offset, value, true);
      offset += 2;
    });
  });

  return new Uint8Array(buffer);
}

await MeshoptSimplifier.ready;

for (const job of jobs) {
  const sourcePath = path.join(projectRoot, job.source);
  const source = fs.readFileSync(sourcePath);
  const arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const gltf = await parseGltf(arrayBuffer);
  const entries = [];

  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position || !object.name) {
      return;
    }
    entries.push(simplifyMesh(object));
  });

  const outputPath = path.join(projectRoot, job.output);
  fs.writeFileSync(outputPath, encodeLod(entries));
  const sourceTriangles = entries.reduce((sum, entry) => sum + entry.sourceTriangles, 0);
  const targetTriangles = entries.reduce((sum, entry) => sum + entry.targetTriangles, 0);
  console.log(
    `${job.output}: ${Math.round(sourceTriangles)} -> ${Math.round(targetTriangles)} triangles`,
  );
}
