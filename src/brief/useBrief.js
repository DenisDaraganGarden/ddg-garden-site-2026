import { useEffect, useSyncExternalStore } from 'react';

// ТЗ открытого проекта в редакторе (brief.js). Одно на страницу: счётчик на
// рейке и рабочее место «Проект» читают одно и то же. Каждая правка — одна
// операция на сервер, в ответ приходит ТЗ целиком. Перечитывается, когда окно
// снова в фокусе: задания отмечает агент из терминала.
let state = { id: null, brief: null, error: '' };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => state;

// Ответ, пришедший позже более свежего (чтение, отправленное до правки),
// ТЗ на экране не откатывает.
let sent = 0, shown = 0;
async function call(id, op) {
    const ticket = (sent += 1);
    const response = await fetch(`/__projects/${encodeURIComponent(id)}/brief`, op
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) }
        : { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `ТЗ: сервер ответил ${response.status}`);
    if (ticket > shown) { shown = ticket; emit({ id, brief: payload.brief, error: '' }); }
    return payload.brief;
}

let loading = null;
const load = (id) => (loading ??= call(id).catch((error) => emit({ id, error: error.message })).finally(() => { loading = null; }));

// Правка ТЗ: { op: 'addTask', date, text } и т. п. (операции — brief.js).
// Ошибка остаётся строкой в состоянии: рабочее место её покажет.
export const runBrief = (id, op) => call(id, op).catch((error) => emit({ error: error.message }));

export function useBrief(id) {
    const current = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => {
        if (!id) return undefined;
        void load(id);
        const refresh = () => { if (document.visibilityState === 'visible') void load(id); };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [id]);
    return current.id === id ? current : { id, brief: null, error: '' };
}
