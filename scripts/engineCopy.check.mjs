import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Стабильная копия движка (scripts/engineCopy.mjs) на временных репозиториях:
// клон, обновление до main, откат туда и обратно, отказ при правках кода в
// копии и при открытом приложении, перенос сцены сайта из «В проект» через
// обновление, переустановка зависимостей только по lock-файлу.
// Настоящий ~/Ouroboros не трогается.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddg-engine-copy-'));
process.env.DDG_PROJECTS_DIR = path.join(temp, 'home');
const { SCENE_FILES, engineStatus, needsInstall, rollbackEngine, updateEngine } = await import('./engineCopy.mjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=check', '-c', 'user.email=check@example.com', ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const commit = (message, files) => {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.writeFileSync(path.join(source, name), content);
  }
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

  // «В проект» in the app writes the site scene into the copy: an update
  // carries it onto the new commit and keeps a copy aside.
  const [sceneFile, sourceFile] = SCENE_FILES;
  const sceneStart = commit('scene in main', { [sceneFile]: 'scene: main 1\n', [sourceFile]: '{"project":null}\n' });
  await updateEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), sceneStart);
  fs.writeFileSync(path.join(dir, sceneFile), 'scene: from the app\n');
  const codeOnly = commit('code only', { 'README.md': 'four\n' });
  const carried = await updateEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), codeOnly, 'an unpublished scene does not hold the update back');
  assert.equal(fs.readFileSync(path.join(dir, sceneFile), 'utf8'), 'scene: from the app\n', 'the scene rides onto the new commit');
  assert.deepEqual(carried.scene.files, [sceneFile]);
  assert.equal(fs.readFileSync(path.join(carried.scene.backup, path.basename(sceneFile)), 'utf8'), 'scene: from the app\n', 'and a copy waits in backups');
  assert.ok(carried.scene.backup.startsWith(path.join(process.env.DDG_PROJECTS_DIR, 'backups', 'engine-scene')));
  assert.deepEqual(carried.scene.upstream, [], 'main did not touch the scene');

  // main changed the scene too: the app's version stays, main's is set aside.
  const theirs = commit('scene from elsewhere', { [sceneFile]: 'scene: main 2\n' });
  const both = await updateEngine(options);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), theirs);
  assert.equal(fs.readFileSync(path.join(dir, sceneFile), 'utf8'), 'scene: from the app\n', 'the app keeps what Denis last saved in it');
  assert.equal(both.scene.upstream.length, 1);
  assert.equal(fs.readFileSync(both.scene.upstream[0], 'utf8'), 'scene: main 2\n', 'main\'s scene is kept beside it');

  // A failed update puts the scene back on the old commit, exactly as it was.
  await assert.rejects(updateEngine({ ...options, ref: 'no-such-ref' }));
  assert.equal(git(dir, 'rev-parse', 'HEAD'), theirs);
  assert.equal(fs.readFileSync(path.join(dir, sceneFile), 'utf8'), 'scene: from the app\n', 'nothing is lost on failure');

  // Code edits in the copy still stop the update, with the scene untouched.
  fs.writeFileSync(path.join(dir, 'README.md'), 'edited by an agent\n');
  await assert.rejects(updateEngine(options), /правки кода \(README\.md\)/);
  assert.equal(fs.readFileSync(path.join(dir, sceneFile), 'utf8'), 'scene: from the app\n');
  git(dir, 'checkout', '--', 'README.md');
  console.log('engine copy: clone, update to main, rollback both ways, refusals, the app\'s site scene carried over (and main\'s kept beside it) and lock-file installs hold');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
