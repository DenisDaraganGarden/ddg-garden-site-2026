import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME, isValidId } from './projectStore.mjs';

// Библиотека растений — общая для всех проектов, в доме данных, а не в
// репозитории: картинки взяты из библиотеки SketchUp Дениса, их лицензии
// неизвестны, в git и на сайт они не уходят.
//
//   library/plants/<id>.json  — запись: имена, размеры, плотность, календарь;
//   library/plants/<id>/card.webp — 2D-картинка растения (до 1024 px).
//
// Наполняет её scripts/import-plant-library.mjs; руками и агентом правятся
// сами записи — это обычный JSON.
export const PLANTS_DIR = path.join(HOME, 'library', 'plants');

export async function listPlants(dir = PLANTS_DIR) {
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const plants = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    try {
      const plant = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      if (!isValidId(plant?.id) || `${plant.id}.json` !== name) return null;
      // Версия картинки — время файла: адрес меняется только с картинкой, и
      // браузер держит её в кеше сколько угодно.
      const card = await fs.stat(path.join(dir, plant.id, 'card.webp')).catch(() => null);
      return card ? { ...plant, cardVersion: Math.round(card.mtimeMs) } : null;
    } catch {
      return null;
    }
  }));
  return plants.filter(Boolean).sort((a, b) => String(a.ru ?? a.id).localeCompare(String(b.ru ?? b.id), 'ru'));
}

export async function plantCardFile(id, dir = PLANTS_DIR) {
  if (!isValidId(id)) return null;
  const file = path.join(dir, id, 'card.webp');
  try {
    const { size } = await fs.stat(file);
    return { file, size };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
