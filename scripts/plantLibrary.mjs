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
//
//   library/plants/<id>/photo.webp — картинка, которую Денис приложил сам
//   (растение в питомнике, лист «четыре сезона» на белом): для превью,
//   карточки растения и отчёта заказчику. Сцена рисует карточку SketchUp.
export const PLANTS_DIR = path.join(HOME, 'library', 'plants');
const PHOTO_SIZE = 1600;

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
      const photo = await fs.stat(path.join(dir, plant.id, 'photo.webp')).catch(() => null);
      const photoSize = photo ? await fs.readFile(path.join(dir, plant.id, 'photo.json'), 'utf8').then(JSON.parse, () => null) : null;
      return card ? { ...plant, cardVersion: Math.round(card.mtimeMs), ...(photo ? { photoVersion: Math.round(photo.mtimeMs), photoSize } : {}) } : null;
    } catch {
      return null;
    }
  }));
  return plants.filter(Boolean).sort((a, b) => String(a.ru ?? a.id).localeCompare(String(b.ru ?? b.id), 'ru'));
}

export async function plantCardFile(id, dir = PLANTS_DIR, name = 'card.webp') {
  if (!isValidId(id)) return null;
  const file = path.join(dir, id, name);
  try {
    const { size } = await fs.stat(file);
    return { file, size };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export const plantPhotoFile = (id, dir = PLANTS_DIR) => plantCardFile(id, dir, 'photo.webp');

// Картинка Дениса к растению: любой формат, который читает sharp, — в webp до
// 1600 px по длинной стороне. Запись растения должна быть: картинка без
// растения — мусор.
export async function writePlantPhoto(id, bytes, dir = PLANTS_DIR) {
  if (!isValidId(id)) return null;
  try { await fs.access(path.join(dir, `${id}.json`)); } catch { return null; }
  const { default: sharp } = await import('sharp');
  const { data: webp, info } = await sharp(bytes).rotate().resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
  await fs.mkdir(path.join(dir, id), { recursive: true });
  await fs.writeFile(path.join(dir, id, 'photo.webp'), webp);
  // Размер — для превью: лист «четыре сезона» показывается по одному сезону.
  await fs.writeFile(path.join(dir, id, 'photo.json'), JSON.stringify({ width: info.width, height: info.height }));
  return { bytes: webp.length };
}

export async function removePlantPhoto(id, dir = PLANTS_DIR) {
  if (!isValidId(id)) return false;
  await fs.rm(path.join(dir, id, 'photo.webp'), { force: true });
  await fs.rm(path.join(dir, id, 'photo.json'), { force: true });
  return true;
}
