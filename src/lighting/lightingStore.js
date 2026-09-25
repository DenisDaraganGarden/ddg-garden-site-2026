import { useSyncExternalStore } from 'react';

// Сетка участка и посчитанная электрика — из сцены (ConnectionsLayer) для
// панели редактора, которая живёт вне холста. Не настройки: всё выводится.
let state = { grid: null, network: null, status: 'idle' };
const listeners = new Set();
export const setLightingState = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useLightingState = () => useSyncExternalStore(subscribe, () => state, () => state);
