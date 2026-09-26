import { useCallback, useState } from 'react';

// Где стоит компас (NorthCompass.jsx) — выбор интерфейса этого браузера, не
// сцены: {} — посередине над кадром, {mode: 'float', x, y} — где его
// оставили во вьюпорте (точка окна), {mode: 'topbar'} — в верхней строке.
const PLACE_KEY = 'ddg_focus_compass_v1';
const readPlace = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(PLACE_KEY));
        if (stored?.mode === 'topbar') return { mode: 'topbar' };
        if (stored?.mode === 'float' && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return { mode: 'float', x: stored.x, y: stored.y };
    } catch { /* no storage — the default place */ }
    return {};
};
export function useCompassPlace() {
    const [place, setPlace] = useState(readPlace);
    const update = useCallback((next) => {
        setPlace(next);
        try { localStorage.setItem(PLACE_KEY, JSON.stringify(next)); } catch { /* the place lives for this visit only */ }
    }, []);
    return [place, update];
}
