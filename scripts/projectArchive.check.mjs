import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

// Архив проекта одним файлом (projectArchive.mjs) на временном доме данных:
// что уходит в архив, как он встаёт обратно, что из библиотек добавляется, а
// что остаётся своим. Боевые проекты Дениса не трогаются.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-archive-'));
process.env.DDG_PROJECTS_DIR = home;
const { exportProjectArchive, importProjectArchive, usedLibrary } = await import('./projectArchive.mjs');
const { projects, STORE_SCHEMA } = await import('./projectStore.mjs');
const write = async (relative, content) => {
  const file = path.join(home, ...relative.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};
const read = (relative) => fs.readFile(path.join(home, ...relative.split('/')), 'utf8');

try {
  const settings = {
    plantingBeds: [{ id: 'bed-1', recipe: [{ plant: 'sedum', share: 60 }, { plant: 'stipa', share: 40 }] }],
    plantingPoints: [{ plant: 'malus', x: 1, z: 2 }],
    plantingVines: [{ plant: 'hedera', shoots: [] }],
    lightingFixtures: [{ id: 'f1', type: 'flos-step', x: 0, y: 0, z: 0 }],
    modelMaterials: { house: { Wood: { material: 'oak-boards', faces: [{ faces: ['up'], material: 'slate' }] } } },
    terrainSeed: 7,
  };
  assert.deepEqual(usedLibrary(settings), {
    plants: ['hedera', 'malus', 'sedum', 'stipa'], luminaires: ['flos-step'], materials: ['oak-boards', 'slate'],
  });
  assert.deepEqual(usedLibrary({}), { plants: [], luminaires: [], materials: [] });

  const garden = await projects.create({ name: 'Сад у моря', kind: 'design', settings });
  await write(`projects/${garden.id}/models/house.glb`, 'glb bytes');
  await write(`projects/${garden.id}/brief.json`, '{"client":"x"}');
  await write(`projects/${garden.id}/history/20260926T100000000Z-open.json`, '{}');
  await write(`projects/${garden.id}.webp`, 'thumbnail');
  await write('library/plants/sedum.json', '{"id":"sedum"}');
  await write('library/plants/sedum/card.webp', 'card');
  await write('library/plants/stipa.json', '{"id":"stipa"}');
  await write('library/luminaires/flos-step.json', '{"id":"flos-step"}');
  await write('library/luminaires/flos-step/photo.webp', 'photo');
  await write('library/materials/oak-boards/material.json', '{"id":"oak-boards"}');

  const archive = await exportProjectArchive(garden.id);
  assert.match(archive.name, new RegExp(`^${garden.id}-\\d{4}-\\d{2}-\\d{2}\\.zip$`));
  const files = unzipSync(archive.bytes);
  for (const name of [`project/${garden.id}.json`, `project/${garden.id}.webp`, `project/${garden.id}/models/house.glb`, `project/${garden.id}/brief.json`,
    'library/plants/sedum.json', 'library/plants/sedum/card.webp', 'library/luminaires/flos-step/photo.webp', 'library/materials/oak-boards/material.json']) {
    assert.ok(files[name], `the archive carries ${name}`);
  }
  assert.ok(!Object.keys(files).some((name) => name.includes('/history/')), 'the history stays home');
  assert.deepEqual(archive.manifest.library, { plants: ['sedum', 'stipa'], luminaires: ['flos-step'], materials: ['oak-boards'] }, 'only records this computer has');
  assert.equal(await exportProjectArchive('nobody'), null);

  // Another computer: one plant missing, the luminaire edited locally.
  await fs.rm(path.join(home, 'library/plants/sedum.json'));
  await fs.rm(path.join(home, 'library/plants/sedum'), { recursive: true });
  await write('library/luminaires/flos-step.json', '{"id":"flos-step","note":"edited here"}');
  const result = await importProjectArchive(archive.bytes);
  assert.notEqual(result.entry.id, garden.id, 'a taken name gets a free one');
  assert.equal(result.entry.name, 'Сад у моря');
  assert.equal(result.entry.kind, 'design');
  assert.equal(result.entry.schema, STORE_SCHEMA);
  assert.deepEqual(result.entry.settings.modelMaterials, settings.modelMaterials, 'the scene comes back whole');
  assert.equal(await read(`projects/${result.entry.id}/models/house.glb`), 'glb bytes');
  assert.equal(await read(`projects/${result.entry.id}/brief.json`), '{"client":"x"}');
  assert.equal(await read(`projects/${result.entry.id}.webp`), 'thumbnail');
  assert.deepEqual(result.added, { plants: ['sedum'], luminaires: [], materials: [] });
  assert.deepEqual(result.kept, { plants: ['stipa'], luminaires: ['flos-step'], materials: ['oak-boards'] });
  assert.equal(await read('library/plants/sedum/card.webp'), 'card', 'a missing record arrives with its pictures');
  assert.match(await read('library/luminaires/flos-step.json'), /edited here/, 'a local record is not overwritten');

  await assert.rejects(importProjectArchive(new Uint8Array([1, 2, 3])), /не архив проекта/);
  await assert.rejects(importProjectArchive(zipSync({ 'readme.txt': strToU8('hi') })), /archive\.json/);
  const newer = unzipSync(archive.bytes);
  newer[`project/${garden.id}.json`] = strToU8(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(newer[`project/${garden.id}.json`])), schema: STORE_SCHEMA + 1 }));
  await assert.rejects(importProjectArchive(zipSync(newer)), /более новой версией движка/);

  const sneaky = unzipSync(archive.bytes);
  sneaky[`project/${garden.id}/../../../escape.txt`] = strToU8('out');
  sneaky['library/plants/sedum/../../../../escape.txt'] = strToU8('out');
  const sneakyResult = await importProjectArchive(zipSync(sneaky));
  await assert.rejects(fs.access(path.join(home, 'escape.txt')), 'no file leaves its folder');
  await assert.rejects(fs.access(path.join(path.dirname(home), 'escape.txt')));
  assert.ok(sneakyResult.entry.id);
  console.log('project archive: scene, folder without history, thumbnail and used library records; import under a free name keeps local records');
} finally {
  await fs.rm(home, { recursive: true, force: true });
}
