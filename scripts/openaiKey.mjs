import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HOME } from './projectStore.mjs';

// Ключ OpenAI Дениса: вставляется один раз в «Настройки движка → API» и
// живёт на этом Mac — в связке ключей macOS (зашифрованно, как пароли
// браузера). Не в проекте, не в git, не в браузере: редактор видит только
// «sk-…abcd», запросы к OpenAI делает локальный сервер. Не macOS или связка
// не ответила — файл ~/Ouroboros/secrets/openai-key с правами только для
// владельца. OPENAI_API_KEY в окружении важнее обоих (для проверок).
const SERVICE = process.env.DDG_OPENAI_KEYCHAIN_SERVICE || 'ouroboros-openai';
const ACCOUNT = os.userInfo().username;
const FILE = path.join(HOME, 'secrets', 'openai-key');
const useKeychain = process.platform === 'darwin' && process.env.DDG_OPENAI_SECRET !== 'file';

// Ключ OpenAI — «sk-…» из латиницы, цифр, «-» и «_»; всё остальное — не ключ,
// и в команду связки ключей не попадёт.
export const isApiKey = (value) => typeof value === 'string' && /^sk-[A-Za-z0-9_-]{16,300}$/.test(value.trim());
export const keyHint = (key) => (key ? `${key.slice(0, 3)}…${key.slice(-4)}` : '');

const run = (command, args, input) => new Promise((resolve, reject) => {
  if (input === undefined) {
    execFile(command, args, { timeout: 10000 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
    return;
  }
  // Ключ идёт через stdin, а не аргументом: аргументы видны в списке процессов.
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.on('error', reject);
  child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(`${command} вышел с кодом ${code}`)); });
  child.stdin.end(input);
});

let cached; // undefined — не читали; null — ключа нет

async function readStored() {
  if (useKeychain) {
    try {
      const value = (await run('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'])).trim();
      if (isApiKey(value)) return { key: value, where: 'keychain' };
    } catch {
      // Нет в связке — может быть в файле.
    }
  }
  try {
    const value = (await fs.readFile(FILE, 'utf8')).trim();
    if (isApiKey(value)) return { key: value, where: 'file' };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return null;
}

export async function readApiKey() {
  const env = process.env.OPENAI_API_KEY;
  if (isApiKey(env)) return { key: env.trim(), where: 'env' };
  if (cached === undefined) cached = await readStored();
  return cached;
}

export async function saveApiKey(value) {
  const key = String(value ?? '').trim();
  if (!isApiKey(key)) throw Object.assign(new Error('Это не похоже на ключ OpenAI: он начинается с «sk-» и состоит из латиницы, цифр, «-» и «_».'), { status: 400 });
  let where = 'file';
  if (useKeychain) {
    try {
      // -U — заменить прежний. Команда целиком через stdin (security -i).
      await run('security', ['-i'], `add-generic-password -U -s "${SERVICE}" -a "${ACCOUNT}" -l "Ouroboros · OpenAI API" -w "${key}"\n`);
      if ((await run('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'])).trim() === key) where = 'keychain';
    } catch {
      // Связка не ответила — ключ ляжет в файл.
    }
  }
  if (where === 'file') {
    await fs.mkdir(path.dirname(FILE), { recursive: true, mode: 0o700 });
    await fs.writeFile(FILE, `${key}\n`, { mode: 0o600 });
    await fs.chmod(FILE, 0o600);
  } else {
    await fs.rm(FILE, { force: true });
  }
  cached = { key, where };
  return cached;
}

export async function removeApiKey() {
  if (useKeychain) {
    try { await run('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT]); } catch { /* не было */ }
  }
  await fs.rm(FILE, { force: true });
  cached = null;
}
