import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SITE_RELEASE, deployPublishedHomeScene } from './deployScene.mjs';

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
  assert.equal(git(['log', '-1', '--format=%s'], remote), SITE_RELEASE, 'the push the Pages workflow builds');

  // An unchanged scene still sends the site: main's code goes out as it is,
  // and nothing else staged in the checkout rides along.
  const before = git(['rev-parse', 'main'], remote);
  await fs.writeFile(path.join(work, 'note.txt'), 'staged by hand\n');
  git(['add', 'note.txt']);
  const again = await deployPublishedHomeScene({ cwd: work, files: ['scene.js'] });
  assert.match(git(['status', '--porcelain']), /^A {2}note\.txt/m, 'the staged file stays staged, not released');
  git(['rm', '-q', '--cached', 'note.txt']);
  await fs.rm(path.join(work, 'note.txt'));
  assert.equal(git(['rev-parse', 'main'], remote), git(['rev-parse', 'HEAD']));
  assert.notEqual(git(['rev-parse', 'main'], remote), before, 'a new release commit');
  assert.equal(git(['log', '-1', '--format=%s'], remote), SITE_RELEASE);
  assert.equal(git(['diff', '--name-only', before, 'main'], remote), '', 'and it changes no file');
  assert.equal(again.commit, git(['rev-parse', '--short', 'HEAD']));

  await fs.writeFile(path.join(work, 'code.js'), 'export const code = 2;\n');
  git(['commit', '-am', 'unreleased work']);
  const live = git(['rev-parse', 'main'], remote);
  await fs.writeFile(path.join(work, 'scene.js'), 'export const scene = 3;\n');
  await assert.rejects(deployPublishedHomeScene({ cwd: work, files: ['scene.js'] }), /1 коммит/);
  assert.equal(git(['rev-parse', 'main'], remote), live, 'nothing went live');
  assert.equal(git(['log', '-1', '--format=%s']), 'unreleased work', 'the branch is left as it was');
  assert.match(git(['status', '--porcelain']), /scene\.js/, 'the published file stays written');
  // Behind main: refused before committing, so no stray commit blocks the next press.
  git(['checkout', '-q', '--detach', 'main']);
  git(['reset', '-q', '--hard', live]);
  const other = path.join(temp, 'other');
  execFileSync('git', ['clone', '-q', remote, other]);
  git(['-c', 'user.name=o', '-c', 'user.email=o@example.com', 'commit', '-q', '--allow-empty', '-m', 'merged elsewhere'], other);
  git(['push', '-q', 'origin', 'HEAD:main'], other);
  const head = git(['rev-parse', 'HEAD']);
  await fs.writeFile(path.join(work, 'scene.js'), 'export const scene = 4;\n');
  await assert.rejects(deployPublishedHomeScene({ cwd: work, files: ['scene.js'] }), /1 коммит\(ов\), которых здесь нет/);
  assert.equal(git(['rev-parse', 'HEAD']), head, 'no commit was made');
  assert.match(git(['status', '--porcelain']), /scene\.js/, 'the published file stays written');

  // The workflow builds exactly these pushes: its condition names the same words.
  const workflow = await fs.readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes(`startsWith(github.event.head_commit.message, '${SITE_RELEASE}')`), 'deploy-pages.yml builds the «На сайт» push');
  assert.match(workflow, /workflow_dispatch/, 'and can be run by hand');
  console.log('deployScene: the scene alone goes live, an unchanged scene still sends the site, only that push is built; a branch with other commits is refused and untouched');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
