import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deployPublishedHomeScene } from './deployScene.mjs';

// A site repo and its GitHub in a temp folder: the scene alone goes live, a
// branch carrying other commits is refused and left as it was.
// Run: node scripts/deployScene.check.mjs
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-deploy-'));
const remote = path.join(temp, 'remote.git');
const work = path.join(temp, 'work');
const git = (args, cwd = work) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  execFileSync('git', ['init', '--bare', '-b', 'main', remote]);
  execFileSync('git', ['clone', remote, work], { stdio: 'ignore' });
  git(['config', 'user.email', 'check@example.com']);
  git(['config', 'user.name', 'check']);
  git(['checkout', '-b', 'main']);
  await fs.writeFile(path.join(work, 'scene.js'), 'export const scene = 1;\n');
  await fs.writeFile(path.join(work, 'code.js'), 'export const code = 1;\n');
  git(['add', '.']);
  git(['commit', '-m', 'start']);
  git(['push', 'origin', 'main']);

  await fs.writeFile(path.join(work, 'scene.js'), 'export const scene = 2;\n');
  const done = await deployPublishedHomeScene({ cwd: work, files: ['scene.js'] });
  assert.equal(done.ok, true);
  assert.equal(git(['rev-parse', 'main'], remote), git(['rev-parse', 'HEAD']), 'the scene commit is live');
  assert.equal(git(['show', 'main:scene.js'], remote), 'export const scene = 2;');

  await fs.writeFile(path.join(work, 'code.js'), 'export const code = 2;\n');
  git(['commit', '-am', 'unreleased work']);
  const live = git(['rev-parse', 'main'], remote);
  await fs.writeFile(path.join(work, 'scene.js'), 'export const scene = 3;\n');
  await assert.rejects(deployPublishedHomeScene({ cwd: work, files: ['scene.js'] }), /1 коммит/);
  assert.equal(git(['rev-parse', 'main'], remote), live, 'nothing went live');
  assert.equal(git(['log', '-1', '--format=%s']), 'unreleased work', 'the branch is left as it was');
  assert.match(git(['status', '--porcelain']), /scene\.js/, 'the published file stays written');
  console.log('deployScene: the scene alone goes live; a branch with other commits is refused and untouched');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
