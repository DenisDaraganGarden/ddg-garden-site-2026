import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Стабильная копия движка (scripts/engineCopy.mjs) на временных репозиториях:
// клон, обновление до main, откат туда и обратно, отказ при правках в копии и
// при открытом приложении, переустановка зависимостей только по lock-файлу.
// Настоящий ~/Ouroboros не трогается.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddg-engine-copy-'));
process.env.DDG_PROJECTS_DIR = path.join(temp, 'home');
const { engineStatus, needsInstall, rollbackEngine, updateEngine } = await import('./engineCopy.mjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=check', '-c', 'user.email=check@example.com', ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const commit = (message, files) => {
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(source, name), content);
  git(source, 'add', '.');
  git(source, 'commit', '-q', '-m', message);
  git(source, 'push', '-q', 'origin', 'HEAD:main');
  return git(source, 'rev-parse', 'HEAD');
};
const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const origin = path.join(temp, 'origin.git');
const source = path.join(temp, 'source');
const dir = path.join(temp, 'home', 'engine');
git(temp, 'init', '-q', '--bare', '-b', 'main', origin);
git(temp, 'clone', '-q', origin, source);
git(source, 'checkout', '-q', '-b', 'main');

try {
  const appPort = await freePort();
  const options = { dir, source, install: false, appPort };
  const first = commit('first', { 'package-lock.json': '{"v":1}\n', 'README.md': 'one\n' });

  const created = await updateEngine(options);
  assert.equal(created.created, true, 'the first update clones the copy');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), first);
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD', 'the copy sits on a commit, not on a branch');
  assert.equal(fs.existsSync(path.join(dir, '.git', 'objects', 'info', 'alternates')), false, 'the copy does not borrow objects from the checkout');

  const second = commit('second', { 'README.md': 'two\n' });
  assert.equal(engineStatus({ dir }).behind, 1, 'status sees one newer commit in main');
  const updated = await updateEngine(options);
  assert.equal(updated.moved, true);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), second);
  assert.equal(updated.previous, first);
  assert.equal(engineStatus({ dir }).behind, 0);
  const again = await updateEngine(options);
  assert.equal(again.moved, false, 'an update with nothing new stays put');
  assert.equal(again.previous, first, 'and keeps the commit to roll back to');

  const back = await rollbackEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), first, 'rollback returns to the previous commit');
  assert.equal(back.previous, second);
  await rollbackEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), second, 'a second rollback undoes the first');

  const lockChange = commit('third', { 'package-lock.json': '{"v":2}\n' });
  git(dir, 'fetch', '-q', 'origin');
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  assert.equal(needsInstall(dir, first, second), false, 'same lock file: no reinstall');
  assert.equal(needsInstall(dir, second, lockChange), true, 'a changed lock file reinstalls');
  assert.equal(needsInstall(dir, null, second), true, 'an unknown start reinstalls');
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  assert.equal(needsInstall(dir, first, second), true, 'missing node_modules reinstalls');

  fs.writeFileSync(path.join(dir, 'README.md'), 'edited by someone\n');
  await assert.rejects(updateEngine(options), /правки/, 'a copy with edits is not updated over them');
  git(dir, 'checkout', '--', 'README.md');

  const busy = net.createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => busy.once('listening', resolve));
  await assert.rejects(updateEngine({ ...options, appPort: busy.address().port }), /OUROBOROS открыт/, 'the open app is not updated under itself');
  busy.close();

  const stranger = path.join(temp, 'stranger');
  fs.mkdirSync(stranger);
  await assert.rejects(updateEngine({ ...options, dir: stranger }), /не копия движка/, 'a foreign folder is left alone');
  await assert.rejects(rollbackEngine({ ...options, dir: path.join(temp, 'nowhere') }), /Откатывать некуда/);

  const latest = await updateEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), lockChange);
  assert.equal(latest.previous, second);
  console.log('engine copy: clone, update to main, rollback both ways, refusals and lock-file installs hold');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
