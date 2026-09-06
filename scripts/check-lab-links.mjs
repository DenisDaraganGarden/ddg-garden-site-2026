// Light link check for the laboratory (AGENTS.md §5): every collection shows
// product modules and keeps no copy of one, the pages that mirror scene
// settings start from the published file, and the catalog, the registry and
// the numbering agree. `npm run check:lab-links` — seconds, no browser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ASSET_CATALOG, ASSET_GROUPS } from '../src/asset-lab/assetCatalog.js';

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

if (failures.length) {
  console.error(`lab links: ${failures.length} problem(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`lab links: ${labDirs.length} collections directories, ${ASSET_CATALOG.length} catalog entries, all linked to product modules and the published scene.`);
