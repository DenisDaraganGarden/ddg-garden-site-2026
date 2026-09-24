import { useEffect, useState } from 'react';

// Файл окружения проекта с локального сервера (scripts/surroundings.mjs).
// Одна загрузка на метку: сцена и панель редактора берут один и тот же ответ.
const cache = new Map();

export function loadSurroundingsData(projectId, stamp) {
    const key = `${projectId}:${stamp}`;
    if (!cache.has(key)) {
        cache.set(key, fetch(`/__surroundings/${encodeURIComponent(projectId)}?v=${encodeURIComponent(stamp)}`)
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
            .then((data) => {
                // Не пришло — следующий показ спросит снова, а не возьмёт пустоту из памяти.
                if (!data) cache.delete(key);
                return data;
            }));
    }
    return cache.get(key);
}

export function useSurroundingsData(projectId, stamp) {
    const [state, setState] = useState({ key: '', data: null });
    const key = projectId && stamp ? `${projectId}:${stamp}` : '';
    useEffect(() => {
        if (!key) return undefined;
        let alive = true;
        void loadSurroundingsData(projectId, stamp).then((data) => { if (alive) setState({ key, data }); });
        return () => { alive = false; };
    }, [key, projectId, stamp]);
    return state.key === key ? state.data : null;
}

async function call(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Сервер ответил ${response.status}`);
    return payload;
}

export const searchPlaces = async (query) => (await call(`/__geo/search?q=${encodeURIComponent(query)}`)).places ?? [];

export const requestSurroundings = (projectId, { lat, lon, radius }) => call(`/__surroundings/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, radius }),
});
