import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Проект движка — это числа, а не модели: один JSON с настройками сцены и
// камерами. Ассеты (модели, текстуры, небо, звук) общие и лежат в public/,
// в проект не копируются.
//
// Файлы, а не localStorage: сцену собирает агент, а агент читает файлы.
// Имя файла делается читаемым по той же причине — чтобы «projects/azovskiy-
// bereg.json» можно было открыть, не спрашивая редактор.
// Папка переопределяется переменной окружения: так проверка пишет во временный
// каталог, а собранное приложение — в свою папку данных, не в исходники.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECTS_DIR = process.env.DDG_PROJECTS_DIR
  ? path.resolve(process.env.DDG_PROJECTS_DIR)
  : path.join(ROOT, 'projects');

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(name) {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[\u0400-\u04FF]/g, (letter) => TRANSLIT[letter] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'proekt';
}

const projectPath = (id) => path.join(PROJECTS_DIR, `${id}.json`);

// Идентификатор приходит из сети и становится путём — всё, кроме простого
// имени файла, отбрасывается, иначе «../../» ушло бы гулять по диску.
export const isValidId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);

async function readAll() {
  let names = [];
  try {
    names = await fs.readdir(PROJECTS_DIR);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }

  const projects = await Promise.all(names
    .filter((name) => name.endsWith('.json'))
    .map(async (name) => {
      try {
        return JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, name), 'utf8'));
      } catch {
        return null;
      }
    }));

  return projects.filter(Boolean);
}

// Список для меню: без настроек, иначе на каждый проект уезжает по сотне
// килобайт чисел, которые меню всё равно не показывает.
export async function listProjects() {
  const projects = await readAll();
  return projects
    .map(({ settings: _settings, ...meta }) => meta)
    .sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
}

export async function readProject(id) {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(projectPath(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function freeId(name) {
  const base = slugify(name);
  const taken = new Set((await listProjects()).map((project) => project.id));
  if (!taken.has(base)) return base;
  for (let index = 2; ; index += 1) {
    if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
  }
}

export async function createProject({ name, settings, engine }) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Проект не создан: не передана сцена.');
  }

  const now = new Date().toISOString();
  const project = {
    id: await freeId(name),
    name: String(name ?? '').trim() || 'Без названия',
    engine: engine ?? null,
    created: now,
    updated: now,
    settings,
  };

  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.writeFile(projectPath(project.id), `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  return project;
}

// Правки приходят по одной: переименование без сцены не должно её стирать.
export async function saveProject(id, patch) {
  const current = await readProject(id);
  if (!current) return null;

  const next = {
    ...current,
    ...(patch.name === undefined ? {} : { name: String(patch.name).trim() || current.name }),
    ...(patch.settings === undefined ? {} : { settings: patch.settings }),
    updated: new Date().toISOString(),
  };

  await fs.writeFile(projectPath(id), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function deleteProject(id) {
  if (!isValidId(id)) return false;
  try {
    await fs.unlink(projectPath(id));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
