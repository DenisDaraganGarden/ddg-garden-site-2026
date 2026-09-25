import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './storeFiles.mjs';

const self = fileURLToPath(import.meta.url);
if (process.argv[2] === 'worker') {
  const { projects } = await import('./projectStore.mjs');
  // Widen the old read/check/write race in separate Node processes.
  const readFile = fs.readFile;
  fs.readFile = async (...args) => {
    const value = await readFile(...args);
    await new Promise((resolve) => setTimeout(resolve, 40));
    return value;
  };
  process.once('message', async ({ method, args }) => {
    try { process.send({ result: await projects[method](...args) }); }
    catch (error) { process.send({ error: error.stack }); }
    process.disconnect();
  });
  process.send({ ready: true });
} else {
  await fs.mkdir('output', { recursive: true });
  const home = await fs.mkdtemp(path.resolve('output/store-stability-'));
  process.env.DDG_PROJECTS_DIR = home;
  const { projects } = await import('./projectStore.mjs');
  const children = new Set();
  const concurrent = async (jobs) => {
    const workers = jobs.map((job) => {
      const child = fork(self, ['worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      children.add(child);
      let ready;
      const started = new Promise((resolve) => { ready = resolve; });
      const result = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) => { children.delete(child); if (code) reject(new Error(`worker exit ${code}`)); });
        child.on('message', (message) => {
          if (message.ready) ready();
          else if (message.error) reject(new Error(message.error));
          else resolve(message.result);
        });
      });
      return { child, job, started, result };
    });
    await Promise.all(workers.map((worker) => worker.started));
    workers.forEach(({ child, job }) => child.send(job));
    return Promise.all(workers.map((worker) => worker.result));
  };
  try {
    const initial = await projects.create({ name: 'Scene', settings: { height: 1 } });
    const injected = await projects.create({ name: 'Scene', id: '../outside', created: 'fake', updated: 'fake', revision: 99, settings: {} });
    assert.equal(injected.id, 'scene-2');
    assert.equal(injected.revision, 1);
    assert.notEqual(injected.created, 'fake');
    assert.equal((await projects.read(initial.id)).settings.height, 1);
    await fs.writeFile(path.join(home, 'projects/broken.json'), '{broken');
    assert.equal((await projects.create({ name: 'Broken', settings: {} })).id, 'broken-2');
    assert.equal(await fs.readFile(path.join(home, 'projects/broken.json'), 'utf8'), '{broken');

    const race = await concurrent([2, 3].map((height) => ({
      method: 'save', args: [initial.id, { base: initial.revision, settings: { height } }],
    })));
    assert.equal(race.filter((entry) => entry.conflict).length, 1, 'only one concurrent writer succeeds');
    const current = await projects.read(initial.id);
    assert.equal(current.revision, 2);
    assert.ok(current.updated > initial.updated);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(home, 'projects/scene.json.previous'))), initial);
    assert.ok(!(await projects.list()).some((entry) => entry.id.endsWith('.previous')));

    const copies = await concurrent([1, 2].map(() => ({ method: 'create', args: [{ name: 'Concurrent', settings: {} }] })));
    assert.equal(new Set(copies.map((entry) => entry.id)).size, 2, 'concurrent creates reserve different names');
    await concurrent([
      { method: 'updateBrief', args: [initial.id, { op: 'updateInfo', client: { name: 'Client' } }] },
      { method: 'updateBrief', args: [initial.id, { op: 'updateInfo', client: { contacts: 'Contact' } }] },
    ]);
    const brief = await projects.readBrief(initial.id);
    assert.equal(brief.client.name, 'Client');
    assert.equal(brief.client.contacts, 'Contact', 'both processes retain their brief changes');

    // Failure immediately before replacement leaves the full old file usable.
    const file = path.join(home, 'atomic.json'), previous = { old: true };
    await writeJsonAtomic(file, previous);
    const rename = fs.rename;
    fs.rename = async (from, to) => { if (to === file) throw new Error('disk failure'); return rename(from, to); };
    try { await assert.rejects(writeJsonAtomic(file, { next: true }, previous), /disk failure/); }
    finally { fs.rename = rename; }
    assert.deepEqual(JSON.parse(await fs.readFile(file)), previous);
    assert.deepEqual(JSON.parse(await fs.readFile(`${file}.previous`)), previous);
    assert.ok(!(await fs.readdir(home)).some((name) => name.endsWith('.tmp')));
    console.log('project stability: safe IDs, multiprocess saves/creates/brief, backups and interrupted writes — ok');
  } finally {
    for (const child of children) child.kill();
    await fs.rm(home, { recursive: true, force: true });
  }
}
