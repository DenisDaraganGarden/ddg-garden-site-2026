import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME } from './projectStore.mjs';

// Стабильная копия движка для приложения OUROBOROS (AGENTS.md §4, §5.1).
// Отдельный клон репозитория в доме данных, на коммите из main: агенты в нём
// не работают, приложение запускается только из него, обновляется одной
// командой после влития в main и откатывается на прежний коммит. Рабочие
// копии агентов с их ветками и незакоммиченным больше не подменяют Денису
// инструмент посреди работы.
export const ENGINE_DIR = process.env.DDG_ENGINE_DIR
  ? path.resolve(process.env.DDG_ENGINE_DIR)
  : path.join(HOME, 'engine');
const APP_PORT = Number(process.env.DDG_APP_PORT) || 41219;
const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = 'ouroboros-engine.json';

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const tryGit = (cwd, ...args) => {
  try { return git(cwd, ...args); } catch { return null; }
};

// Приложение держит сервер на своём порту; npm ci вынул бы зависимости из-под
// него (AGENTS.md §4, правило 6), поэтому копия меняется только при закрытом окне.
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

const statePath = (dir) => path.join(dir, '.git', STATE);
function readState(dir) {
  try { return JSON.parse(fs.readFileSync(statePath(dir), 'utf8')); } catch { return {}; }
}

function describe(dir, commit) {
  const [short, date, subject] = git(dir, 'log', '-1', '--format=%h%x09%cs%x09%s', commit).split('\t');
  return { commit, short, date, subject };
}

// Зависимости ставятся заново, только когда их нет или сменился lock-файл.
export function needsInstall(dir, from, to) {
  if (!fs.existsSync(path.join(dir, 'node_modules'))) return true;
  if (!from) return true;
  const diff = spawnSync('git', ['diff', '--quiet', from, to, '--', 'package-lock.json'], { cwd: dir });
  return diff.status !== 0;
}

export async function updateEngine({
  dir = ENGINE_DIR, ref = 'origin/main', install = true, source = CHECKOUT, appPort = APP_PORT,
} = {}) {
  if (await portBusy(appPort)) {
    throw new Error(`OUROBOROS открыт (порт ${appPort}). Закройте приложение и повторите.`);
  }
  const created = !fs.existsSync(dir);
  if (created) {
    // Клон берёт объекты из этого чекаута и сразу отвязывается от него: быстро,
    // без второй загрузки с GitHub, и копия не зависит от чужой папки .git.
    const url = git(source, 'remote', 'get-url', 'origin');
    const objects = path.resolve(source, git(source, 'rev-parse', '--git-common-dir'));
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(path.dirname(dir), 'clone', '--quiet', '--reference', objects, '--dissociate', url, dir);
  } else if (!tryGit(dir, 'rev-parse', '--git-dir')) {
    throw new Error(`${dir} есть, но это не копия движка (нет git). Уберите папку или укажите другую в DDG_ENGINE_DIR.`);
  } else if (git(dir, 'status', '--porcelain', '--untracked-files=no')) {
    throw new Error(`В копии движка есть правки (${dir}). В ней не работают: сохраните правки в своей ветке и верните копию командой git -C "${dir}" checkout -- .`);
  }
  git(dir, 'fetch', '--quiet', '--prune', 'origin');
  const target = git(dir, 'rev-parse', '--verify', `${ref}^{commit}`);
  const state = readState(dir);
  const from = state.current ?? tryGit(dir, 'rev-parse', 'HEAD');
  const moved = from !== target;
  if (tryGit(dir, 'rev-parse', 'HEAD') !== target || tryGit(dir, 'symbolic-ref', '-q', 'HEAD')) {
    git(dir, 'checkout', '--quiet', '--detach', target);
  }
  const installed = install && needsInstall(dir, state.current ? from : null, target);
  if (installed) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const run = spawnSync(npm, ['ci'], { cwd: dir, stdio: 'inherit' });
    if (run.status !== 0) throw new Error(`npm ci в копии движка завершился с ошибкой (${run.status}).`);
  }
  const next = {
    current: target,
    previous: moved ? (from ?? null) : (state.previous ?? null),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath(dir), `${JSON.stringify(next, null, 2)}\n`);
  return { dir, ...describe(dir, target), previous: next.previous, moved, installed, created };
}

// Откат — та же команда на прежний коммит; повторный откат возвращает обратно.
export async function rollbackEngine({ dir = ENGINE_DIR, ...options } = {}) {
  const { previous } = readState(dir);
  if (!previous) throw new Error('Откатывать некуда: копия движка ещё не обновлялась.');
  return updateEngine({ dir, ref: previous, ...options });
}

export function engineStatus({ dir = ENGINE_DIR } = {}) {
  if (!fs.existsSync(dir)) return { dir, exists: false };
  tryGit(dir, 'fetch', '--quiet', '--prune', 'origin');
  const head = git(dir, 'rev-parse', 'HEAD');
  const behind = Number(tryGit(dir, 'rev-list', '--count', `${head}..origin/main`) ?? 0);
  return { dir, exists: true, ...describe(dir, head), behind, previous: readState(dir).previous ?? null };
}

const line = (info) => `${info.short} · ${info.date} · ${info.subject}`;

async function main() {
  const [command = 'status', ...rest] = process.argv.slice(2);
  const install = !rest.includes('--no-install');
  const ref = rest.find((arg) => !arg.startsWith('--'));
  if (command === 'update' || command === 'rollback') {
    const result = command === 'update'
      ? await updateEngine({ ref: ref ?? 'origin/main', install })
      : await rollbackEngine({ install });
    console.log(`Копия движка: ${result.dir}`);
    console.log(result.created || result.moved ? `Теперь: ${line(result)}` : `Уже на ${line(result)}`);
    if (result.installed) console.log('Зависимости переустановлены.');
    console.log('Откройте OUROBOROS заново.');
  } else if (command === 'status') {
    const status = engineStatus();
    if (!status.exists) {
      console.log(`Копии движка ещё нет (${status.dir}). Создать: npm run engine:update`);
      return;
    }
    console.log(`Копия движка: ${status.dir}`);
    console.log(`Сейчас: ${line(status)}`);
    console.log(status.behind ? `В main новее на ${status.behind} коммит(ов): npm run engine:update` : 'Совпадает с main.');
  } else {
    throw new Error('Команды: update [коммит] [--no-install], rollback, status');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
