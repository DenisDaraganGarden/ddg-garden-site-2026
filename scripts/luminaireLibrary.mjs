import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME, isValidId } from './projectStore.mjs';
import { HOUSING_SHAPES } from '../src/lighting/housings.js';
import { shapeFunction } from '../src/lighting/photometry.js';

// Библиотека светильников — общая для проектов, в доме данных, как растения
// и материалы (docs/garden-lighting-2026-09-25.md): конкретные изделия,
// которые агент добавил по ссылке Дениса, — запись той же формы, что
// встроенные заготовки src/lighting/types.js, с происхождением каждого поля
// (паспорт, Денис, догадка).
//
//   library/luminaires/<id>.json              — запись;
//   library/luminaires/<id>/photometry.ies|ldt — фотометрия из паспорта.
//
// Запись, которую движок не умеет нарисовать (неизвестный корпус или форма
// кривой, нет профиля), отбрасывается здесь, как битый JSON: её светильники
// становятся «типа нет в библиотеке» — не светят, но сцена не падает.
// Профиль нужен и изделию с IES/LDT: файл пока идёт в отчёт, не в сцену.
export const LUMINAIRES_DIR = path.join(HOME, 'library', 'luminaires');
const PHOTOMETRY = /^photometry\.(ies|ldt)$/;

export async function listLuminaires(dir = LUMINAIRES_DIR) {
    let names = [];
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    const records = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
        try {
            const record = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
            if (!isValidId(record?.id) || `${record.id}.json` !== name) return null;
            if (!HOUSING_SHAPES.includes(record.housing?.shape)) return null;
            shapeFunction(record.optics ?? {});
            // Файл фотометрии рядом — его имя и версия (время файла).
            const files = await fs.readdir(path.join(dir, record.id)).catch(() => []);
            const file = files.find((entry) => PHOTOMETRY.test(entry));
            const stat = file ? await fs.stat(path.join(dir, record.id, file)) : null;
            return { ...record, ...(file ? { photometryFile: file, photometryVersion: Math.round(stat.mtimeMs) } : {}) };
        } catch {
            return null;
        }
    }));
    return records.filter(Boolean).sort((a, b) => String(a.ru ?? a.id).localeCompare(String(b.ru ?? b.id), 'ru'));
}

export async function luminairePhotometryFile(id, name, dir = LUMINAIRES_DIR) {
    if (!isValidId(id) || !PHOTOMETRY.test(name ?? '')) return null;
    const file = path.join(dir, id, name);
    try {
        const { size } = await fs.stat(file);
        return { file, size };
    } catch {
        return null;
    }
}
