import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { BUILTIN_LUMINAIRES } from './types.js';
import { LUMINAIRE_KINDS } from './fixtures.js';

// Типы светильников глазами редактора: встроенные заготовки (types.js) и
// изделия библиотеки этого компьютера (/__library/luminaires,
// scripts/luminaireLibrary.mjs). Перечитывается, когда окно снова в фокусе:
// записи правит агент, как проекты. Без сервера (сайт) — только заготовки.
const EMPTY = [];
let state = { status: 'idle', records: EMPTY, text: '' };
const listeners = new Set();
const emit = (next) => { state = next; listeners.forEach((listener) => listener()); };

async function load() {
    if (state.status === 'loading') return;
    if (state.status === 'idle') emit({ ...state, status: 'loading' });
    try {
        const response = await fetch('/__library/luminaires', { cache: 'no-store' });
        const text = await response.text();
        if (!response.ok) throw new Error(text);
        if (text === state.text) { if (state.status !== 'ready') emit({ ...state, status: 'ready' }); return; }
        const { luminaires = [] } = JSON.parse(text);
        emit({ status: 'ready', records: luminaires, text });
    } catch {
        emit({ status: 'missing', records: EMPTY, text: '' });
    }
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => state;

// Map id → тип: заготовки, поверх — изделия библиотеки.
export function useLuminaireTypes() {
    const current = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => {
        if (state.status === 'idle') void load();
        const refresh = () => { if (document.visibilityState === 'visible') void load(); };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, []);
    return useMemo(() => new Map([...BUILTIN_LUMINAIRES, ...current.records].map((type) => [type.id, type])), [current.records]);
}

export const luminaireName = (type, ru = true) => (type ? (ru ? type.ru : type.en) || type.ru || type.id : '');

// Производитель — первое слово записи («Flos», «Центрсвет»); заготовки без
// изделия — отдельно.
export const makerOf = (type) => (type?.generic ? 'generic' : String(type?.maker ?? '').split(/[\s(]/)[0] || 'other');
export const makerLabel = (maker, ru = true) => (maker === 'generic' ? (ru ? 'Заготовки' : 'Generic') : maker === 'other' ? (ru ? 'Без производителя' : 'No maker') : maker);

// Порядок в библиотеке: вид (как LUMINAIRE_KINDS), изделия раньше заготовок,
// дальше по имени.
const KIND_ORDER = new Map(LUMINAIRE_KINDS.map((kind, i) => [kind.id, i]));
export const byKind = (a, b) => (KIND_ORDER.get(a.housing?.shape) ?? 99) - (KIND_ORDER.get(b.housing?.shape) ?? 99)
    || Number(Boolean(a.generic)) - Number(Boolean(b.generic)) || String(a.ru ?? a.id).localeCompare(String(b.ru ?? b.id), 'ru');
export const kindLabel = (id, ru = true) => { const kind = LUMINAIRE_KINDS.find((item) => item.id === id); return kind ? (ru ? kind.ru : kind.en) : (ru ? 'Другие' : 'Other'); };
export const specLine = (type, ru = true) => [
    type?.optics?.lumens ? `${type.optics.lumens} ${ru ? 'лм' : 'lm'}` : null,
    type?.optics?.beam ? `${type.optics.beam}°` : null,
    type?.power?.watts ? `${type.power.watts} ${ru ? 'Вт' : 'W'}` : null,
].filter(Boolean).join(' · ');

// Что в записи изделия угадано, а не из паспорта, — по-русски и без повторов.
const GUESSED = {
    'optics.lumens': ['световой поток', 'luminous flux'], 'optics.beam': ['угол', 'beam'], 'optics.profile': ['кривая света', 'light curve'],
    'optics.tilt': ['наклон оптики', 'optics tilt'], 'housing.h': ['размеры', 'size'], 'housing.d': ['размеры', 'size'], 'housing.w': ['размеры', 'size'],
    'housing.color': ['отделка', 'finish'], 'housing.metal': ['отделка', 'finish'], 'housing.rough': ['отделка', 'finish'],
    pitch: ['направление', 'aim'], 'power.driver': ['драйвер', 'driver'], price: ['цена', 'price'],
};
export function guessedFields(type, ru = true) {
    if (!type || type.generic) return [];
    return [...new Set(Object.entries(type.source ?? {}).filter(([, from]) => from === 'guess').map(([field]) => GUESSED[field]?.[ru ? 0 : 1] ?? field))];
}

// Цена за штуку с тем, где и когда её видели; Flos — у дилера.
export function priceText(type, ru = true) {
    if (!type || type.generic) return '—';
    const rub = Number(type.price?.rub);
    if (!(rub > 0)) return ru ? 'по запросу у дилера' : 'on request from a dealer';
    return `${Math.round(rub).toLocaleString(ru ? 'ru-RU' : 'en-GB')} ₽${type.price.at ? ` · ${type.price.at}` : ''}${type.price.date ? `, ${type.price.date}` : ''}`;
}
// Имя без производителя в начале: он стоит рядом, отдельной строкой.
export const shortName = (type, ru = true) => {
    const name = luminaireName(type, ru), maker = makerOf(type);
    return maker !== 'generic' && name.startsWith(`${maker} `) ? name.slice(maker.length + 1) : name;
};

// Картинка изделия (library/luminaires/<id>/photo.webp): фото с сайта
// производителя или своя; без неё — схема корпуса (LuminaireGlyph).
export const luminairePhotoUrl = (type) => (type?.photoVersion ? `/__library/luminaires/${encodeURIComponent(type.id)}/photo.webp?v=${type.photoVersion}` : null);

export async function uploadLuminairePhoto(id, file) {
    const response = await fetch(`/__library/luminaires/${encodeURIComponent(id)}/photo`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Картинка не сохранилась');
    await load();
}

export async function removeLuminairePhoto(id) {
    await fetch(`/__library/luminaires/${encodeURIComponent(id)}/photo`, { method: 'DELETE' });
    await load();
}
