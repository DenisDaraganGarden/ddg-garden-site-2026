import { useSyncExternalStore } from 'react';

// Работа движка для индикатора — логотипа в верхней строке: запросы к своему
// серверу в полёте (/__…: сохранение проекта, модели, библиотеки, ИИ) плюс
// то, что сообщают сами (engineBusy(+1) … engineBusy(-1)).
let active = 0;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());
export const engineBusy = (delta) => { active = Math.max(0, active + delta); emit(); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useEngineActivity = () => useSyncExternalStore(subscribe, () => active > 0, () => false);

let watching = false;
const ownRoute = (input) => {
    try { return new URL(typeof input === 'string' ? input : input?.url ?? String(input), window.location.href).pathname.startsWith('/__'); } catch { return false; }
};
// Один раз на страницу редактора: fetch к своим маршрутам считается работой.
export function watchEngineFetches() {
    if (watching || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    watching = true;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
        if (!ownRoute(input)) return original(input, init);
        engineBusy(1);
        return original(input, init).finally(() => engineBusy(-1));
    };
}
