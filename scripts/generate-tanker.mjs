import fs from 'node:fs/promises';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createTanker, disposeTanker, TANKER_DIMENSIONS } from '../src/tanker/model.js';

// GLTFExporter uses the browser FileReader API only to serialise binary buffers.
globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const output = new URL('../public/models/tanker/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const variants = [];
for (const lod of ['near', 'horizon']) {
  const asset = createTanker({ lod, procedural: false });
  const data = await new GLTFExporter().parseAsync(asset.group, { binary: true, onlyVisible: true });
  const filename = `river-sea-tanker-${lod}.glb`;
  await fs.writeFile(new URL(filename, output), Buffer.from(data));
  variants.push({ ...asset.metrics, filename, bytes: data.byteLength });
  disposeTanker(asset);
}
const manifest = {
  id: 'river-sea-tanker', version: 1, units: 'metres', up: '+Y', forward: '+X', port: '-Z',
  waterline: 0, dimensions: TANKER_DIMENSIONS,
  authoring: 'src/tanker/model.js', generator: 'node scripts/generate-tanker.mjs',
  material: 'PBR metallic-roughness; runtime procedural weathering in src/tanker/materials.js; no external textures',
  audio: 'Procedural diesel, propeller wash and air horn; Web Audio source attaches to shared world bus',
  variants,
};
await fs.writeFile(new URL('manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
