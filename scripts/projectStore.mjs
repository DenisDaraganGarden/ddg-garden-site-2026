import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyBriefOp, briefCounts, normalizeBrief } from '../src/brief/brief.js';
import { withStoreLock, writeJsonAtomic } from './storeFiles.mjs';

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
// Дом один на все чекауты: ~/Ouroboros (projects/, presets/). Пока проекты
// лежали в папке чекаута, у каждого воркдерева был свой список, приложение
// показывало проекты той копии, из которой его запустили, а удаление копии
// уносило проекты с собой; модели заказчиков лежали в публичном репозитории.
// Переменная окружения переопределяет дом: так проверка пишет во временный
// каталог, а собранное приложение — в свою папку данных. Старые папки
// переносит scripts/migrate-projects-home.mjs.
export const HOME = process.env.DDG_PROJECTS_DIR ? path.resolve(process.env.DDG_PROJECTS_DIR) : path.join(os.homedir(), 'Ouroboros');

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
  // Поля записи, которые правка может менять (id, created, updated — нет).
  const EDITABLE = new Set(['name', 'kind', 'engine', 'node', 'object', payloadKey]);
  const filePath = (id) => path.join(dir, `${id}.json`);
  const transaction = (run) => withStoreLock(dir, run);
  const fieldsOf = (patch) => {
    const fields = Object.fromEntries(Object.entries(patch ?? {}).filter(([key]) => EDITABLE.has(key)));
    if ('kind' in fields && !(fields.kind === null || (typeof fields.kind === 'string' && fields.kind.length <= 32))) delete fields.kind;
    if (payloadKey in fields && (!fields[payloadKey] || typeof fields[payloadKey] !== 'object' || Array.isArray(fields[payloadKey]))) {
      throw new Error(`Поле «${payloadKey}» должно быть объектом.`);
    }
    return fields;
  };

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

  // Миниатюра лежит рядом с записью отдельным файлом, а не base64 внутри JSON:
  // агенту, который читает числа, картинка в тексте только мешает.
  const thumbnailPath = (id) => path.join(dir, `${id}.webp`);
  const hasThumbnail = async (id) => fs.access(thumbnailPath(id)).then(() => true, () => false);

  // review — сколько заданий ТЗ ждут проверки Дениса: меню пишет «на проверке N».
  const list = async () => Promise.all((await readAll())
    .map(({ [payloadKey]: _payload, ...meta }) => meta)
    .sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')))
    .map(async (meta) => ({ ...meta, thumbnail: await hasThumbnail(meta.id), ...(await reviewOf(meta.id)) })));

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
    // Even unreadable records own their names and must never be overwritten.
    const taken = new Set((await fs.readdir(dir)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)));
    if (!taken.has(base)) return base;
    for (let index = 2; ; index += 1) {
      if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
    }
  };

  const write = async (entry, previous) => {
    if (!isValidId(entry.id)) throw new Error('Недопустимый ID записи.');
    await writeJsonAtomic(filePath(entry.id), entry, previous);
    return entry;
  };

  // from: копия другой записи — её модели едут вместе с числами.
  const create = async ({ name, from, ...rest }) => transaction(async () => {
    if (!rest[payloadKey] || typeof rest[payloadKey] !== 'object' || Array.isArray(rest[payloadKey])) {
      throw new Error(`Запись не создана: не передано поле «${payloadKey}».`);
    }

    const now = new Date().toISOString();
    const entry = await write({
      id: await freeId(name),
      name: String(name ?? '').trim() || 'Без названия',
      created: now,
      updated: now,
      revision: 1,
      ...fieldsOf(rest),
    });
    if (isValidId(from) && from !== entry.id) await copyModels(from, entry.id);
    return entry;
  });

  // Правки приходят по одной: переименование без сцены не должно её стирать.
  // base — ревизия (или updated старого клиента), которую видел пишущий.
  // Если файл с тех пор изменили
  // (Claude правит проект, пока открыт редактор), поверх не пишется: пишущий
  // получает нынешнюю запись и решает сам.
  const save = async (id, patch) => transaction(async () => {
    const current = await read(id);
    if (!current) return null;
    if (patch?.base !== undefined && patch.base !== (current.revision ?? current.updated) && patch.base !== current.updated) return { conflict: current };

    // Личность записи правкой не подменяется: id — это имя файла, created — факт.
    // И в корень записи попадают только её поля: чужое тело, пришедшее не по
    // адресу (2026-09-25 сетка участка влилась в корень «Ростова» и затёрла
    // kind), отбрасывается, а не пишется поверх.
    const fields = fieldsOf(patch);
    const revision = (Number.isSafeInteger(current.revision) ? current.revision : 0) + 1;
    // Old CLI clients still send updated as base: it must advance even when
    // two writes fall in one millisecond or the system clock goes backwards.
    const updated = new Date(Math.max(Date.now(), (Date.parse(current.updated) || 0) + 1)).toISOString();
    const next = { ...current, ...fields, revision, updated };
    if (patch?.name !== undefined) next.name = String(patch.name).trim() || current.name;
    return write(next, current);
  });

  const remove = async (id) => transaction(async () => {
    if (!isValidId(id)) return false;
    try {
      await fs.unlink(filePath(id));
      await fs.rm(`${filePath(id)}.previous`, { force: true });
      await fs.rm(thumbnailPath(id), { force: true });
      await fs.rm(path.join(dir, id), { recursive: true, force: true });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });

  // Кадр приходит из редактора как data URL (webp, 320 px по ширине).
  const writeThumbnail = async (id, dataUrl) => {
    if (!isValidId(id) || !(await read(id))) return false;
    const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
    if (!match) throw new Error('Миниатюра должна быть webp в data URL.');
    await fs.writeFile(thumbnailPath(id), Buffer.from(match[1], 'base64'));
    return true;
  };

  const readThumbnail = async (id) => {
    if (!isValidId(id)) return null;
    try {
      return await fs.readFile(thumbnailPath(id));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  // Снимок камеры «Генплан» для отчёта: <папка>/<id>/plan.webp и рядом
  // plan.json — где стояла камера (отчёт по нему подписывает цветники и
  // ставит масштаб). Кадр целиком, webp; перезаписывается каждым снимком.
  const planPath = (id, ext) => path.join(dir, id, `plan.${ext}`);
  const writePlan = async (id, dataUrl, view) => {
    if (!isValidId(id) || !(await read(id))) return false;
    const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
    if (!match) throw new Error('Снимок генплана должен быть webp в data URL.');
    const numbers = (value, keys) => Object.fromEntries(keys.map((key) => [key, Number(value?.[key])]));
    const meta = {
      captured: new Date().toISOString(),
      position: numbers(view?.position, ['x', 'y', 'z']),
      target: numbers(view?.target, ['x', 'y', 'z']),
      fov: Number(view?.fov), bearing: Number(view?.bearing), north: Number(view?.north),
    };
    if (![...Object.values(meta.position), ...Object.values(meta.target), meta.fov, meta.bearing].every(Number.isFinite)) throw new Error('У снимка генплана нет положения камеры.');
    await fs.mkdir(path.join(dir, id), { recursive: true });
    await fs.writeFile(planPath(id, 'webp'), Buffer.from(match[1], 'base64'));
    await fs.writeFile(planPath(id, 'json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    return meta;
  };
  const readPlan = async (id) => {
    if (!isValidId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(planPath(id, 'json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const planImage = async (id) => {
    if (!isValidId(id)) return null;
    try {
      return await fs.readFile(planPath(id, 'webp'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  // Модели записи (.glb, импорт из редактора): <папка>/<id>/models/<модель>.glb.
  // Свои у каждого проекта: копия уносит их с собой, удаление стирает. Имя
  // файла — читаемое имя модели и метка времени: адрес модели никогда не
  // переиспользуется, и браузер может держать её в кеше сколько угодно.
  const modelsDir = (id) => path.join(dir, id, 'models');
  const modelPath = (id, model) => path.join(modelsDir(id), `${model}.glb`);

  const writeModel = async (id, name, bytes) => {
    if (!isValidId(id) || !(await read(id))) return null;
    if (!(bytes?.length >= 12) || bytes.toString('ascii', 0, 4) !== 'glTF') {
      throw new Error('Это не .glb: движок принимает двоичный glTF (.glb) целиком, с текстурами внутри.');
    }
    await fs.mkdir(modelsDir(id), { recursive: true });
    const model = `${slugify(String(name ?? '').replace(/\.glb$/i, '')).slice(0, 40)}-${Date.now().toString(36)}`;
    await fs.writeFile(modelPath(id, model), bytes);
    return { model, bytes: bytes.length };
  };

  const modelFile = async (id, model) => {
    if (!isValidId(id) || !isValidId(model)) return null;
    try {
      const { size } = await fs.stat(modelPath(id, model));
      return { file: modelPath(id, model), size };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  async function copyModels(from, to) {
    try {
      await fs.cp(modelsDir(from), modelsDir(to), { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  // Сетка участка для трасс освещения (src/lighting/gridCodec.js): её строит
  // редактор из модели, агент и отчёт считают по ней без сцены.
  const gridPath = (id) => path.join(dir, id, 'site-grid.json');
  const writeSiteGrid = async (id, grid) => {
    if (!isValidId(id) || !(await read(id))) return false;
    const ok = grid && ['x0', 'z0', 'cell', 'cols', 'rows'].every((key) => Number.isFinite(grid[key])) && typeof grid.kind === 'string' && typeof grid.ground === 'string';
    if (!ok) throw new Error('Сетка участка: x0, z0, cell, cols, rows и kind/ground в base64.');
    await fs.mkdir(path.join(dir, id), { recursive: true });
    const tmp = `${gridPath(id)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ ...grid, built: new Date().toISOString() }), 'utf8');
    await fs.rename(tmp, gridPath(id));
    return true;
  };
  const readSiteGrid = async (id) => {
    if (!isValidId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(gridPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  // ТЗ проекта (src/brief/brief.js): <папка>/<id>/brief.json — заказчик и
  // задания. Не в записи: данные заказчика не должны уехать ни в сцену, ни на
  // сайт. Пишется только операцией: прочитать, применить, записать через
  // временный файл под той же межпроцессной блокировкой, что сцена проекта.
  const briefPath = (id) => path.join(dir, id, 'brief.json');
  const readBrief = async (id) => {
    if (!isValidId(id) || !(await fs.access(filePath(id)).then(() => true, () => false))) return null;
    let text;
    try {
      text = await fs.readFile(briefPath(id), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return normalizeBrief();
      throw error;
    }
    // Испорченный файл не подменяется пустым ТЗ: следующая правка затёрла бы задания.
    try {
      return normalizeBrief(JSON.parse(text));
    } catch (error) {
      throw new Error(`ТЗ проекта «${id}» не читается (${briefPath(id)}): ${error.message}`);
    }
  };
  const updateBrief = (id, op) => transaction(async () => {
    const current = await readBrief(id);
    if (!current) return null;
    const next = applyBriefOp(current, op);
    await writeJsonAtomic(briefPath(id), next, current);
    return next;
  });
  const reviewOf = async (id) => {
    try {
      const { review } = briefCounts(await readBrief(id));
      return review ? { review } : {};
    } catch {
      return {};
    }
  };

  return { dir, list, read, create, save, remove, writeThumbnail, readThumbnail, writePlan, readPlan, planImage, writeModel, modelFile, writeSiteGrid, readSiteGrid, readBrief, updateBrief };
}

export const projects = createStore('projects', 'settings');
export const presets = createStore('presets', 'values');
