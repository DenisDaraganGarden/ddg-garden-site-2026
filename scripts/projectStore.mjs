import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Файловые хранилища движка. Два вида записей, одна механика:
//
//   projects/<id>.json — проект: числа сцены и камеры. Ассеты (модели,
//     текстуры, небо, звук) общие, лежат в public/ и в проект не копируются:
//     движок процедурный, форму он считает из этих чисел.
//   presets/<id>.json — деталь: настроенный вариант одного объекта (три вида
//     травы, пять кустов). Из деталей собирается новый проект.
//
// Файлы, а не localStorage: сцены собирает агент, а агент читает файлы. Имя
// файла делается читаемым по той же причине — чтобы «projects/azovskiy-bereg.json»
// можно было открыть, не спрашивая редактор.
//
// Папка переопределяется переменной окружения: так проверка пишет во временный
// каталог, а собранное приложение — в свою папку данных, не в исходники.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.DDG_PROJECTS_DIR ? path.resolve(process.env.DDG_PROJECTS_DIR) : ROOT;

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

  return slug || 'zapis';
}

// Идентификатор приходит из сети и становится путём — всё, кроме простого
// имени файла, отбрасывается, иначе «../../» ушло бы гулять по диску.
export const isValidId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);

// Тяжёлое поле (сцена проекта, значения детали) не уезжает в список: там сотни
// ключей на запись, а меню их не показывает.
export function createStore(folder, payloadKey) {
  const dir = path.join(HOME, folder);
  const filePath = (id) => path.join(dir, `${id}.json`);

  const readAll = async () => {
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [];
    }

    const entries = await Promise.all(names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        try {
          return JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
        } catch {
          return null;
        }
      }));

    return entries.filter(Boolean);
  };

  const list = async () => (await readAll())
    .map(({ [payloadKey]: _payload, ...meta }) => meta)
    .sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));

  const read = async (id) => {
    if (!isValidId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(filePath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  const freeId = async (name) => {
    const base = slugify(name);
    const taken = new Set((await list()).map((entry) => entry.id));
    if (!taken.has(base)) return base;
    for (let index = 2; ; index += 1) {
      if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
    }
  };

  const write = async (entry) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath(entry.id), `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
    return entry;
  };

  const create = async ({ name, ...rest }) => {
    if (!rest[payloadKey] || typeof rest[payloadKey] !== 'object' || Array.isArray(rest[payloadKey])) {
      throw new Error(`Запись не создана: не передано поле «${payloadKey}».`);
    }

    const now = new Date().toISOString();
    return write({
      id: await freeId(name),
      name: String(name ?? '').trim() || 'Без названия',
      created: now,
      updated: now,
      ...rest,
    });
  };

  // Правки приходят по одной: переименование без сцены не должно её стирать.
  const save = async (id, patch) => {
    const current = await read(id);
    if (!current) return null;

    // Личность записи правкой не подменяется: id — это имя файла, created — факт.
    const fields = { ...patch };
    delete fields.id;
    delete fields.created;
    const next = { ...current, ...fields, updated: new Date().toISOString() };
    if (patch?.name !== undefined) next.name = String(patch.name).trim() || current.name;
    return write(next);
  };

  const remove = async (id) => {
    if (!isValidId(id)) return false;
    try {
      await fs.unlink(filePath(id));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };

  return { dir, list, read, create, save, remove };
}

export const projects = createStore('projects', 'settings');
export const presets = createStore('presets', 'values');
