// Light link check for the laboratory (AGENTS.md §5): every collection shows
// product modules and keeps no copy of one, the pages that mirror scene
// settings start from the published file, and the catalog, the registry and
// the numbering agree. `npm run check:lab-links` — seconds, no browser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ASSET_CATALOG, ASSET_GROUPS } from '../src/asset-lab/assetCatalog.js';
import { SCENE_OBJECTS, SCENE_OBJECT_GROUPS } from '../src/features/home-scene/lib/sceneObjects.js';
import { publishedHomeSceneKeys } from '../src/features/home-scene/data/publishedHomeSceneKeys.js';

const root = new URL('../src/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const isModule = (file) => /\.(js|jsx)$/.test(file) && !/\.check\.js$/.test(file);
const failures = [];

// 1. No lab file may share its name with a product module — that is a copy.
const productFiles = new Map(
  ['features', 'components', 'plants', 'tanker', 'terrain']
    .flatMap((dir) => walk(join(root, dir)))
    .filter(isModule)
    .map((file) => [basename(file), file.replace(root, 'src/')]),
);
const labDirs = readdirSync(root).filter((name) => name.endsWith('-lab') && name !== 'asset-lab');
for (const dir of labDirs) {
  const files = walk(join(root, dir)).filter(isModule);
  const importsProduct = files.some((file) => /from '\.\.\/(features|components|plants|tanker|terrain)\//.test(readFileSync(file, 'utf8')));
  if (!importsProduct) failures.push(`${dir}: imports no product module`);
  for (const file of files) {
    const twin = productFiles.get(basename(file));
    if (twin) failures.push(`${dir}/${basename(file)}: has a product twin ${twin} — import it, do not keep a copy`);
  }
}

// 2. Pages that mirror scene settings read the published file.
for (const page of [
  'boat-lab/BoatLab.jsx',
  'black-stone-lab/blackStonePresets.js',
  'fish-lab/FishSchool.jsx',
  'water-plant-lab/WaterPlantLab.jsx',
  'rock-lab/RockLab.jsx',
]) {
  if (!readFileSync(join(root, page), 'utf8').includes('getPublishedHomeSceneSettings')) {
    failures.push(`${page}: does not read the published scene`);
  }
}

// 3. Catalog, registry and numbering agree.
const registry = readFileSync(join(root, 'asset-lab/assetRegistry.js'), 'utf8');
ASSET_CATALOG.forEach((entry, position) => {
  if (!new RegExp(`(^|[\\s{'])'?${entry.id}'?:`, 'm').test(registry)) failures.push(`catalog id "${entry.id}" has no component in assetRegistry.js`);
  if (entry.index !== String(position + 1).padStart(2, '0')) failures.push(`catalog index ${entry.index} is out of order for "${entry.id}"`);
  if (!ASSET_GROUPS.some((group) => group.id === entry.group)) failures.push(`catalog "${entry.id}" has unknown group "${entry.group}"`);
});

// 4. Scene object registry: every switch is a published key and sits on a real editor node.
const editorTree = readFileSync(join(root, 'features/home-scene/components/editor/editorTree.js'), 'utf8');
const published = new Set(publishedHomeSceneKeys);
for (const object of SCENE_OBJECTS) {
  if (!published.has(object.key)) failures.push(`scene object "${object.id}" switch ${object.key} is not a published key`);
  if (!SCENE_OBJECT_GROUPS.includes(object.group)) failures.push(`scene object "${object.id}" has unknown group "${object.group}"`);
  if (object.node && !new RegExp(`id: '${object.node.split('/')[1]}'`).test(editorTree)) failures.push(`scene object "${object.id}" points at a missing editor node ${object.node}`);
}

if (failures.length) {
  console.error(`lab links: ${failures.length} problem(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`lab links: ${labDirs.length} collections directories, ${ASSET_CATALOG.length} catalog entries, ${SCENE_OBJECTS.length} scene objects, all linked to product modules and the published scene.`);
