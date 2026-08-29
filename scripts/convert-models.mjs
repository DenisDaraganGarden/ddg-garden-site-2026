import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// OBJ is text: every coordinate is spelled out in decimal digits, and the boat
// alone is 6.6MB of them. The scene waits on both models before it shows
// anything, so this is the largest thing standing between a visitor and the
// first frame. GLB stores the same geometry as binary buffers.
//
// OBJLoader also hands back non-indexed geometry - every triangle carries its
// own three vertices - so welding identical vertices back together usually
// removes more bytes than the format change does.

// GLTFExporter reaches for the browser's FileReader to turn its Blob into an
// ArrayBuffer. Node has Blob but not FileReader, and the exporter only ever uses
// this one method, so a four-line stand-in is cheaper than another dependency.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Source OBJs live outside public/ - they are the authoring format, and nothing
// at runtime asks for them. The GLBs the scene loads are the build output.
const MODELS = [
  {
    source: 'assets-source/models/boat/OBJ_boat2.0.obj',
    output: 'public/models/boat/OBJ_boat2.0.glb',
  },
  {
    source: 'assets-source/models/sculpture/sculpture.obj',
    output: 'public/models/sculpture/sculpture.glb',
  },
];

// OBJLoader hands back non-indexed geometry, so a material group is simply a
// contiguous run of vertices - slicing the attributes is enough.
function splitByMaterialGroup(geometry, material) {
  const groups = geometry.groups ?? [];

  if (groups.length <= 1 || !Array.isArray(material)) {
    return [{ geometry, material: Array.isArray(material) ? material[0] : material }];
  }

  return groups.map((group) => {
    const sliced = new THREE.BufferGeometry();

    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const { itemSize } = attribute;
      sliced.setAttribute(name, new THREE.BufferAttribute(
        attribute.array.slice(group.start * itemSize, (group.start + group.count) * itemSize),
        itemSize,
        attribute.normalized,
      ));
    }

    return { geometry: sliced, material: material[group.materialIndex] };
  });
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function convert({ source: sourcePath, output }) {
  const objPath = path.join(rootDir, sourcePath);
  const glbPath = path.join(rootDir, output);
  const source = await fs.readFile(objPath, 'utf8');
  const objectGroup = new OBJLoader().parse(source);

  let before = 0;
  let after = 0;
  const meshes = [];

  objectGroup.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });

  for (const mesh of meshes) {
    before += mesh.geometry.getAttribute('position').count;

    // The hull is one mesh carrying four material groups - wood, metal, wood,
    // metal. Welding across it would renumber the vertices the groups point at
    // and paint the oarlocks like planking, so split first and weld each piece
    // on its own. One material per mesh afterwards, which is also what the
    // runtime's material picker expects.
    const parts = splitByMaterialGroup(mesh.geometry, mesh.material);

    for (const part of parts) {
      try {
        part.geometry = mergeVertices(part.geometry);
      } catch (error) {
        console.warn(`  ! kept a part of ${mesh.name || 'mesh'} unwelded: ${error.message}`);
      }
      after += part.geometry.getAttribute('position').count;
    }

    if (parts.length === 1) {
      mesh.geometry = parts[0].geometry;
      mesh.material = parts[0].material;
      continue;
    }

    const container = new THREE.Group();
    container.name = mesh.name;
    parts.forEach((part, index) => {
      const piece = new THREE.Mesh(part.geometry, part.material);
      piece.name = `${mesh.name || 'mesh'}_${part.material?.name ?? index}`;
      container.add(piece);
    });
    mesh.parent.add(container);
    mesh.parent.remove(mesh);
  }

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(objectGroup, resolve, reject, { binary: true, onlyVisible: false });
  });

  await fs.mkdir(path.dirname(glbPath), { recursive: true });
  await fs.writeFile(glbPath, Buffer.from(glb));

  const objSize = (await fs.stat(objPath)).size;
  const glbSize = (await fs.stat(glbPath)).size;
  const materials = new Set();
  objectGroup.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    const names = Array.isArray(child.material)
      ? child.material.map((entry) => entry?.name)
      : [child.material?.name];
    names.filter(Boolean).forEach((name) => materials.add(name));
  });

  console.log(
    `${path.basename(objPath)} -> ${path.basename(glbPath)}  `
    + `${formatMb(objSize)} -> ${formatMb(glbSize)} `
    + `(${(100 - (glbSize / objSize) * 100).toFixed(0)}% smaller), `
    + `vertices ${before} -> ${after}`,
  );
  // The boat picks its metal material by name, so a rename here would silently
  // paint the oarlocks like wood.
  console.log(`  materials: ${[...materials].join(', ') || '(none)'}`);
}

for (const model of MODELS) {
  await convert(model);
}
