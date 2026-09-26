// Public Pinterest metadata, durable local cache and additive refresh, offline.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-references-'));
process.env.DDG_PROJECTS_DIR = home;
const { referenceProfile, parsePinterest, pinterestPins, syncReferences, readReferences, referenceImage } = await import('./referenceLibrary.mjs');
const originalFetch = globalThis.fetch;
try {
  assert.equal(referenceProfile('https://ru.pinterest.com/DaraganGarden/'), 'daragangarden');
  assert.equal(referenceProfile('@example'), 'example');
  for (const value of ['../projects', 'https://pinterest.com.evil.test/example', 'https://127.0.0.1/']) assert.throws(() => referenceProfile(value));
  const precise = parsePinterest('[[3,"https://i.pinimg.com/originals/a.jpg",{"id":999999999999999999,"title":"Stone"}]]');
  assert.equal(pinterestPins(precise, 'board')[0].id, '999999999999999999');
  assert.deepEqual(parsePinterest('{"a":"x:123456789012345678,\\"","b":0.1234567890123456789,"c":-123456789012345678,"d":[123456789012345678]}'),
    { a: 'x:123456789012345678,"', b: Number('0.1234567890123456789'), c: Number('-123456789012345678'), d: ['123456789012345678'] }, 'only bare long integers become strings');
  assert.deepEqual(pinterestPins([[3, 'http://127.0.0.1/private', { id: '123456' }]], 'board'), []);
  const boards = ['paving', 'stone'].map((name) => [6, `https://www.pinterest.com/example/${name}/`, { name, pin_count: 1 }]);
  const first = await syncReferences('example', null, async () => boards);
  const pin = (id) => [[3, `https://i.pinimg.com/originals/${id}.jpg`, { id, title: `Sample ${id}` }]];
  await Promise.all(first.boards.map((b, i) => syncReferences('example', b.id, async () => pin(String(123450 + i)))));
  assert.equal((await readReferences('example')).pins.length, 2, 'parallel board refreshes cannot erase each other');
  await assert.rejects(syncReferences('example', first.boards[0].id, async () => { throw new Error('offline'); }));
  assert.equal((await readReferences('example')).pins.length, 2, 'failed refresh preserves local pins');
  await syncReferences('example', first.boards[0].id, async () => pin('123459'));
  assert.equal((await readReferences('example')).pins.length, 3, 'partial remote boards never prune locally retained pins');
  let downloads = 0;
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#aab0ad' } }).png().toBuffer();
  globalThis.fetch = async () => { downloads += 1; return new Response(bytes, { headers: { 'Content-Type': 'image/png' } }); };
  const file = await referenceImage('example', '123459', 'full');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await referenceImage('example', '123459', 'full'), file, 'selected originals work offline');
  assert.ok(await fs.stat(await referenceImage('example', '123459', 'thumb')), 'thumbnail can be rebuilt from local original');
  assert.equal(downloads, 1);
  assert.deepEqual((await readReferences('different')).pins, [], 'profiles have separate manifests');
  console.log('reference library: long IDs, public host validation, concurrent additive refresh, failure preservation and offline images — ok');
} finally { globalThis.fetch = originalFetch; await fs.rm(home, { recursive: true, force: true }); }
