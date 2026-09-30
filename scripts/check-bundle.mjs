import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(rootDir, 'dist', '.vite', 'manifest.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findManifestEntryKey(manifest, suffix) {
  const name = path.basename(suffix, path.extname(suffix));
  // Shared lazy chunks may have a generated manifest key instead of a source path.
  return Object.keys(manifest).find((key) => key.endsWith(suffix))
    ?? Object.keys(manifest).find((key) => manifest[key].isDynamicEntry && manifest[key].name === name && manifest[key].file.endsWith('.js'));
}

function collectImportedFiles(manifest, entryKey, visited = new Set()) {
  if (!entryKey || visited.has(entryKey)) {
    return [];
  }

  visited.add(entryKey);
  const entry = manifest[entryKey];
  if (!entry) {
    return [];
  }

  const importedKeys = [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])];
  const importedFiles = importedKeys.flatMap((key) => collectImportedFiles(manifest, key, visited));

  return [entry.file, ...importedFiles];
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const allFiles = Object.values(manifest).map((entry) => entry.file);
  const homeKey = findManifestEntryKey(manifest, 'src/pages/Home.jsx');

  assert(homeKey, 'Could not find Home manifest entry.');
  assert(!allFiles.some((file) => file.includes('three-vendor')), 'Legacy monolithic three-vendor chunk is still present.');
  // The editor, the projects menu and the reports live in OUROBOROS (../Ouroboros-Editor):
  // none of their pages may reach the site's build.
  for (const page of ['src/pages/HomeEdit.jsx', 'src/pages/Engine.jsx', 'src/pages/PlantingReport.jsx']) {
    assert(!findManifestEntryKey(manifest, page), `${page} must not be part of the site`);
  }

  const homeFiles = collectImportedFiles(manifest, homeKey);
  assert(homeFiles.some((file) => file.includes('three-core')), 'Home entry should import the shared three-core chunk.');
  assert(homeFiles.some((file) => file.includes('three-scene')), 'Home entry should import the shared three-scene chunk.');

  process.stdout.write('Bundle check passed.\n');
}

await main();
