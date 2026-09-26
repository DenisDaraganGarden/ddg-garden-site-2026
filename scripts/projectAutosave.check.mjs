import assert from 'node:assert/strict';
import { createProjectAutosave, readProjectRecoveries } from '../src/features/engine/projectAutosave.js';

const memory = () => {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index],
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
};
const project = { id: 'test', revision: 1, settings: { height: 0 } };
const storage = memory(), statuses = [], calls = [];
let resolveFirst;
const writer = createProjectAutosave({
  project, storage, onStatus: (value) => statuses.push(value.phase),
  send: async (id, settings, { base }) => {
    calls.push({ id, settings, base });
    if (calls.length === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return { ...project, settings, revision: base + 1 };
  },
});
writer.pause();
writer.stage({ height: 1 });
const flight = writer.flush();
writer.stage({ height: 2 });
resolveFirst({ ...project, settings: { height: 1 }, revision: 2 });
await flight;
assert.deepEqual(calls.map(({ base }) => base), [1, 2]);
assert.equal(calls[1].settings.height, 2, 'an edit during a save is sent after its acknowledgement');
assert.equal(writer.revision, 3);
assert.equal(writer.dirty, false);
assert.equal(storage.length, 0);
assert.equal(statuses.at(-1), 'saved');

// A scene larger than keepalive's limit survives a failed request and closure.
const large = { height: 4, extra: 'x'.repeat(140000) };
const offline = createProjectAutosave({ project, storage, send: async () => { throw new Error('offline'); } });
offline.pause();
offline.stage(large);
await assert.rejects(offline.flush(), /offline/);
assert.equal(offline.dirty, true);
assert.equal(offline.durable, true);
const recovery = readProjectRecoveries(storage, project)[0];
assert.deepEqual(recovery.settings, large);
const reopened = createProjectAutosave({
  project, storage, send: async (_id, settings, { base }) => ({ ...project, settings, revision: base + 1 }),
});
reopened.pause();
reopened.restore(recovery);
reopened.stage(recovery.settings);
await reopened.flush();
assert.equal(storage.length, 0, 'acknowledgement removes both the new journal and the recovered record');

let phase, adopted;
const quota = createProjectAutosave({
  project, storage: { ...memory(), setItem: () => { throw new Error('quota'); } },
  onStatus: (value) => { phase = value.phase; }, send: async () => { throw new Error('offline'); },
});
quota.pause();
quota.stage(large);
assert.equal(quota.durable, false);
await assert.rejects(quota.flush());
assert.equal(phase, 'recovery-error', 'do not promise recovery when storage and network both failed');

const external = { ...project, revision: 8, settings: { height: 8 } };
const conflict = Object.assign(new Error('conflict'), { status: 409, payload: { entry: external } });
const chooseDisk = createProjectAutosave({
  project, storage, send: async () => { throw conflict; },
  onConflict: async () => true, onAdopt: (value) => { adopted = value; },
});
chooseDisk.stage({ height: 5 });
await chooseDisk.flush();
chooseDisk.pause();
assert.equal(adopted, external);
assert.equal(chooseDisk.dirty, false);
assert.equal(storage.length, 0);
const bases = [], reasons = [];
const chooseLocal = createProjectAutosave({
  project, storage, onConflict: async () => false,
  send: async (_id, settings, { base, snapshot }) => {
    bases.push(base);
    reasons.push(snapshot ?? null);
    if (base === 1) throw conflict;
    return { ...project, settings, revision: base + 1 };
  },
});
chooseLocal.stage({ height: 6 });
await chooseLocal.flush();
chooseLocal.pause();
assert.deepEqual(bases, [1, 8]);
assert.deepEqual(reasons, [null, 'overwrite'], 'writing over the other version asks the server to keep it in the history');
assert.equal(chooseLocal.revision, 9);
assert.equal(storage.length, 0);
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
try {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  const lan = createProjectAutosave({ project, storage, send: async () => project });
  lan.pause();
  lan.stage({ height: 7 });
  assert.equal(lan.durable, true, 'HTTP LAN editors can still journal without randomUUID');
  await lan.flush();
} finally {
  Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
}
console.log('project autosave: in-flight edits, large recovery, quota, conflicts — ok');
