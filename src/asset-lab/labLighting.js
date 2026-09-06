import { useSyncExternalStore } from 'react';

// One light for the whole laboratory. 'scene' is the home scene's own sky, sun
// and image-based light from the published settings; 'studio' the white room.
// The choice is remembered in this browser and shared by every collection.
const KEY = 'ddg_lab_light';
const listeners = new Set();
const read = () => {
  try { return window.localStorage.getItem(KEY) === 'studio' ? 'studio' : 'scene'; } catch { return 'scene'; }
};
let mode = typeof window === 'undefined' ? 'scene' : read();

export const getLabLightMode = () => mode;
export function setLabLightMode(next) {
  mode = next === 'studio' ? 'studio' : 'scene';
  try { window.localStorage.setItem(KEY, mode); } catch { /* private mode: the choice lives for the page */ }
  listeners.forEach((listener) => listener());
}
export function useLabLightMode() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, getLabLightMode, () => 'scene');
}
