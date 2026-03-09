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
  return Object.keys(manifest).find((key) => key.endsWith(suffix));
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
  const snakeEditKey = findManifestEntryKey(manifest, 'src/pages/SnakeEdit.jsx');

  assert(homeKey, 'Could not find Home manifest entry.');
  assert(snakeEditKey, 'Could not find SnakeEdit manifest entry.');
  assert(!allFiles.some((file) => file.includes('three-vendor')), 'Legacy monolithic three-vendor chunk is still present.');
  assert(allFiles.some((file) => file.includes('three-editor')), 'Expected a dedicated three-editor chunk.');

  const homeFiles = collectImportedFiles(manifest, homeKey);
  const snakeEditFiles = collectImportedFiles(manifest, snakeEditKey);

  assert(homeFiles.some((file) => file.includes('three-core')), 'Home entry should import the shared three-core chunk.');
  assert(homeFiles.some((file) => file.includes('three-scene')), 'Home entry should import the shared three-scene chunk.');
  assert(!homeFiles.some((file) => file.includes('three-editor')), 'Home entry must not import the editor-only three-editor chunk.');
  assert(snakeEditFiles.some((file) => file.includes('three-editor')), 'Snake editor should import the editor-only chunk.');

  process.stdout.write('Bundle check passed.\n');
}

await main();
