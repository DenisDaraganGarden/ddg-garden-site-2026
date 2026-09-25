import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { fillBed } from './fillBed.js';

// Библиотека растений глазами редактора: записи с локального сервера
// (/__library/plants, scripts/plantLibrary.mjs). На сайте её нет — посадки
// там не рисуются. Перечитывается, когда окно снова в фокусе: записи правят
// руками и агент, как проекты.
const EMPTY = new Map();
let state = { status: 'idle', plants: EMPTY, text: '' };
const listeners = new Set();
const emit = (next) => { state = next; listeners.forEach((listener) => listener()); };

async function load() {
    if (state.status === 'loading') return;
    if (state.status === 'idle') emit({ ...state, status: 'loading' });
    try {
        const response = await fetch('/__library/plants', { cache: 'no-store' });
        const text = await response.text();
        if (!response.ok) throw new Error(text);
        if (text === state.text) { if (state.status !== 'ready') emit({ ...state, status: 'ready' }); return; }
        const { plants = [] } = JSON.parse(text);
        emit({ status: 'ready', plants: new Map(plants.map((plant) => [plant.id, plant])), text });
    } catch {
        emit({ status: 'missing', plants: EMPTY, text: '' });
    }
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => state;

export function usePlantLibrary() {
    const current = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => {
        if (state.status === 'idle') void load();
        const refresh = () => { if (document.visibilityState === 'visible') void load(); };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, []);
    return current;
}

export const plantCardUrl = (plant) => `/__library/plants/${plant.id}/card.webp?v=${plant.cardVersion ?? 0}`;
// Картинка сезона, нарисованная по карточке (scripts/plantSeasons.mjs).
export const plantSeasonUrl = (plant, phase) => `/__library/plants/${plant.id}/season-${phase}.webp?v=${plant.seasons?.[phase] ?? 0}`;

// Нарисовать фазы растения ИИ ({phases, model, quality}): ответ — по фазе
// {ok, message}; библиотека перечитывается, и сцена берёт новые картинки.
export async function generatePlantSeasons(id, body) {
    const response = await fetch(`/__library/plants/${encodeURIComponent(id)}/seasons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    await load();
    if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Сезоны не нарисовались (${response.status})`);
    return payload.results;
}

export async function removePlantSeason(id, phase) {
    await fetch(`/__library/plants/${encodeURIComponent(id)}/season-${phase}.webp`, { method: 'DELETE' });
    await load();
}
// Картинка Дениса к растению — если он её приложил (scripts/plantLibrary.mjs).
export const plantPhotoUrl = (plant) => (plant?.photoVersion ? `/__library/plants/${plant.id}/photo.webp?v=${plant.photoVersion}` : null);
// Лист «четыре сезона в ряд» — картинка вчетверо шире высоты.
export const isSeasonSheet = (size) => Boolean(size && size.width >= size.height * 2.6);

export async function uploadPlantPhoto(id, file) {
    const response = await fetch(`/__library/plants/${encodeURIComponent(id)}/photo`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Картинка не загрузилась (${response.status})`);
    await load();
}

export async function removePlantPhoto(id) {
    await fetch(`/__library/plants/${encodeURIComponent(id)}/photo`, { method: 'DELETE' });
    await load();
}
export const plantName = (plant, ru = true) => (plant ? (ru ? plant.ru : plant.en) || plant.latin || plant.id : '');

// Заполнения цветников — по тексту цветника, на каждую библиотеку свои:
// ползунок света не пересчитывает посадку.
const fills = new WeakMap();
function cachedFill(bed, library) {
    if (!fills.has(library)) fills.set(library, new Map());
    const cache = fills.get(library), key = JSON.stringify(bed);
    if (!cache.has(key)) {
        if (cache.size > 256) cache.clear();
        cache.set(key, fillBed(bed, library));
    }
    return cache.get(key);
}
export const useBedFills = (beds, library) => useMemo(() => beds.map((bed) => cachedFill(bed, library)), [beds, library]);
