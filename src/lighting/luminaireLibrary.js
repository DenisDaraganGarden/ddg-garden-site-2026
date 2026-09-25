import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { BUILTIN_LUMINAIRES } from './types.js';

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
