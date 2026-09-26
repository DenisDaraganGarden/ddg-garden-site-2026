import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { HOME, STORE_SCHEMA, isValidId, projects } from './projectStore.mjs';

// Архив проекта одним файлом (.zip): запись со сценой, папка проекта (модели,
// ТЗ, окружение, сетка участка, генплан — без истории), миниатюра и записи
// библиотек, которые проект использует: растения цветников, точек и лиан,
// светильники по типу, материалы моделей. Так проект переезжает на другой
// компьютер или в резерв целиком. При загрузке проект встаёт под свободным
// именем, а записи библиотек, которые на этом компьютере уже есть, не
// перезаписываются — правки Дениса важнее архива.
export const ARCHIVE_FORMAT = 1;
const LIBRARY = Object.freeze({
  plants: { dir: () => path.join(HOME, 'library', 'plants'), record: true },
  luminaires: { dir: () => path.join(HOME, 'library', 'luminaires'), record: true },
  materials: { dir: () => path.join(HOME, 'library', 'materials'), record: false },
});
const projectsDir = () => path.join(HOME, 'projects');

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

// Какие записи библиотек называет сцена проекта.
export function usedLibrary(settings = {}) {
  const plants = new Set(), luminaires = new Set(), materials = new Set();
  for (const bed of list(settings.plantingBeds)) for (const row of list(bed?.recipe)) if (row?.plant) plants.add(row.plant);
  for (const point of list(settings.plantingPoints)) if (point?.plant) plants.add(point.plant);
  for (const vine of list(settings.plantingVines)) if (vine?.plant) plants.add(vine.plant);
  for (const fixture of list(settings.lightingFixtures)) if (fixture?.type) luminaires.add(fixture.type);
  for (const byMaterial of Object.values(isRecord(settings.modelMaterials) ? settings.modelMaterials : {})) {
    for (const entry of Object.values(isRecord(byMaterial) ? byMaterial : {})) {
      if (entry?.material) materials.add(entry.material);
      for (const rule of list(entry?.faces)) if (rule?.material) materials.add(rule.material);
    }
  }
  const valid = (set) => [...set].filter(isValidId).sort();
  return { plants: valid(plants), luminaires: valid(luminaires), materials: valid(materials) };
}

const exists = (file) => fs.access(file).then(() => true, () => false);

// Файлы папки как { относительный путь: байты }; skip — имена верхнего уровня.
async function readTree(root, prefix, files, skip = new Set()) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await readTree(full, `${prefix}${entry.name}/`, files);
    else if (entry.isFile()) files[`${prefix}${entry.name}`] = new Uint8Array(await fs.readFile(full));
  }
}

export async function exportProjectArchive(id) {
  const entry = await projects.read(id);
  if (!entry) return null;
  const files = {};
  const used = usedLibrary(entry.settings);
  const included = { plants: [], luminaires: [], materials: [] };
  files[`project/${id}.json`] = new TextEncoder().encode(`${JSON.stringify(entry, null, 2)}\n`);
  const thumbnail = path.join(projectsDir(), `${id}.webp`);
  if (await exists(thumbnail)) files[`project/${id}.webp`] = new Uint8Array(await fs.readFile(thumbnail));
  await readTree(path.join(projectsDir(), id), `project/${id}/`, files, new Set(['history']));
  for (const [kind, { dir, record }] of Object.entries(LIBRARY)) {
    for (const item of used[kind]) {
      const recordFile = path.join(dir(), `${item}.json`);
      const folder = path.join(dir(), item);
      if (!(record ? await exists(recordFile) : await exists(folder))) continue;
      if (record) files[`library/${kind}/${item}.json`] = new Uint8Array(await fs.readFile(recordFile));
      await readTree(folder, `library/${kind}/${item}/`, files);
      included[kind].push(item);
    }
  }
  const manifest = {
    format: ARCHIVE_FORMAT,
    exported: new Date().toISOString(),
    project: { id, name: entry.name, kind: entry.kind ?? null, schema: entry.schema ?? null },
    library: included,
  };
  files['archive.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const name = `${id}-${manifest.exported.slice(0, 10)}.zip`;
  return { name, bytes: zipSync(files, { level: 6 }), manifest };
}

// Путь внутри архива не должен выходить из своей папки.
const safePart = (part) => part && part !== '.' && part !== '..' && !part.includes('\\');
const safeRelative = (value) => typeof value === 'string' && !value.startsWith('/') && value.split('/').every(safePart);

export async function importProjectArchive(bytes) {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new Error('Это не архив проекта (не читается как .zip).');
  }
  const text = (name) => new TextDecoder().decode(files[name]);
  if (!files['archive.json']) throw new Error('В архиве нет archive.json — это не архив проекта OUROBOROS.');
  const manifest = JSON.parse(text('archive.json'));
  if (manifest?.format !== ARCHIVE_FORMAT) throw new Error(`Архив формата ${manifest?.format} этот движок не читает.`);
  const oldId = manifest.project?.id;
  if (!isValidId(oldId) || !files[`project/${oldId}.json`]) throw new Error('В архиве нет записи проекта.');
  const record = JSON.parse(text(`project/${oldId}.json`));
  if (Number.isSafeInteger(record.schema) && record.schema > STORE_SCHEMA) {
    throw new Error('Архив сохранён более новой версией движка. Обновите движок (npm run engine:update).');
  }
  const entry = await projects.create({
    name: record.name, kind: record.kind ?? undefined, engine: record.engine, settings: record.settings,
  });
  const folderPrefix = `project/${oldId}/`;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    if (name.startsWith(folderPrefix)) {
      const relative = name.slice(folderPrefix.length);
      if (!safeRelative(relative) || relative.split('/')[0] === 'history') continue;
      const target = path.join(projectsDir(), entry.id, ...relative.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    }
  }
  if (files[`project/${oldId}.webp`]) await fs.writeFile(path.join(projectsDir(), `${entry.id}.webp`), files[`project/${oldId}.webp`]);

  const added = { plants: [], luminaires: [], materials: [] }, kept = { plants: [], luminaires: [], materials: [] };
  for (const [kind, { dir, record: hasRecord }] of Object.entries(LIBRARY)) {
    for (const item of list(manifest.library?.[kind]).filter(isValidId)) {
      const recordFile = path.join(dir(), `${item}.json`);
      const folder = path.join(dir(), item);
      if (hasRecord ? await exists(recordFile) : await exists(folder)) { kept[kind].push(item); continue; }
      const prefix = `library/${kind}/${item}/`;
      for (const [name, data] of Object.entries(files)) {
        if (!name.startsWith(prefix) || name.endsWith('/')) continue;
        const relative = name.slice(prefix.length);
        if (!safeRelative(relative)) continue;
        const target = path.join(folder, ...relative.split('/'));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data);
      }
      if (hasRecord && files[`library/${kind}/${item}.json`]) {
        await fs.mkdir(dir(), { recursive: true });
        await fs.writeFile(recordFile, files[`library/${kind}/${item}.json`]);
      }
      added[kind].push(item);
    }
  }
  return { entry: await projects.read(entry.id), added, kept };
}

async function main() {
  const [command, argument, out] = process.argv.slice(2);
  if (command === 'export' && argument) {
    const archive = await exportProjectArchive(argument);
    if (!archive) throw new Error(`Проекта «${argument}» нет.`);
    const file = path.resolve(out ?? archive.name);
    await fs.writeFile(file, archive.bytes);
    const { library } = archive.manifest;
    console.log(`Архив: ${file} (${(archive.bytes.length / 2 ** 20).toFixed(1)} МБ; растений ${library.plants.length}, светильников ${library.luminaires.length}, материалов ${library.materials.length})`);
  } else if (command === 'import' && argument) {
    const result = await importProjectArchive(await fs.readFile(argument));
    console.log(`Проект: ${result.entry.name} (${result.entry.id})`);
    for (const kind of Object.keys(result.added)) {
      if (result.added[kind].length || result.kept[kind].length) console.log(`${kind}: добавлено ${result.added[kind].length}, уже были ${result.kept[kind].length}`);
    }
  } else {
    throw new Error('Команды: export <проект> [файл.zip] | import <файл.zip>');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
