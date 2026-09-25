import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';

const queues = new Map();

// One lock protocol for every server and CLI sharing the data home. The lease
// expires after a killed process; a live writer renews it while doing async I/O.
export function withStoreLock(dir, run) {
  const key = path.resolve(dir);
  // Keep the invocation order within a server (e.g. add a brief, then a task).
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => locked(key, run));
  queues.set(key, next);
  const clear = () => { if (queues.get(key) === next) queues.delete(key); };
  void next.then(clear, clear);
  return next;
}

async function locked(dir, run) {
  await fs.mkdir(dir, { recursive: true });
  const release = await lockfile.lock(dir, {
    lockfilePath: path.join(dir, '.write.lock'),
    stale: 30000, update: 5000,
    retries: { retries: 120, minTimeout: 25, maxTimeout: 500, factor: 1.2, randomize: true },
  });
  try { return await run(); } finally { await release(); }
}

// Readers see either the complete old file or the complete new one. Keep the
// previous validated JSON beside it (not ending in .json, so it is not listed).
export async function writeJsonAtomic(file, value, previous) {
  if (previous !== undefined) await writeJsonAtomic(`${file}.previous`, previous);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
}
