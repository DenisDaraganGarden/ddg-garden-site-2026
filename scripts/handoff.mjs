// What any agent must know before touching the repo: where HEAD is, what is not
// committed, which branches and worktrees still hold unmerged work, which ports
// are busy. `npm run handoff` — see AGENTS.md §2.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const sh = (command, timeout = 4000) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim();
  } catch {
    return '';
  }
};
const indent = (text) => (text ? text.replace(/^/gm, '  ') : '  —');
const section = (title, body) => console.log(`\n${title}\n${indent(body)}`);

const fetched = sh('git fetch --quiet origin && echo ok', 15000) === 'ok';
section('Ветка · последний коммит', `${sh('git rev-parse --abbrev-ref HEAD')} · ${sh("git log -1 --format='%h %ad %s' --date=short")}`);
const [behind = '?', ahead = '?'] = sh('git rev-list --left-right --count origin/main...HEAD').split(/\s+/);
section(`Относительно origin/main${fetched ? '' : ' (fetch не удался — по последнему известному)'}`, `отстаём на ${behind} · впереди на ${ahead}`);
section('Не закоммичено', sh('git status --short'));
section('Stash', sh('git stash list'));
section('Ветки с коммитами, которых нет в main', sh('git branch -a --no-merged main'));
section('Воркдеревья', sh('git worktree list'));

const launch = new URL('../.claude/launch.json', import.meta.url);
const ports = existsSync(launch)
  ? JSON.parse(readFileSync(launch, 'utf8')).configurations.map((entry) => `${entry.name}:${entry.port}`)
  : ['site:41211', 'editor:41212', 'sandbox:41213', 'dist:41214', 'lab:41215'];
const listening = sh('lsof -nP -iTCP:41211-41215 -sTCP:LISTEN');
section(`Порты (${ports.join(' ')})`, listening ? listening : 'ни один из портов проекта не занят');
console.log();
