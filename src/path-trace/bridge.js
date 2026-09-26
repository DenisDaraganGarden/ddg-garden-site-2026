// Renderer access is local to the editor. The lock is transient and never enters
// project settings, camera snapshots or the undo history.
let source = null;
let owner = null;
const listeners = new Set();
export const subscribeTraceLock = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const isTraceLocked = () => Boolean(owner);
const notify = () => listeners.forEach((listener) => listener());
export function registerTraceSource(getSource) {
    source = getSource;
    return () => { if (source === getSource) { source = null; owner?.abort(); } };
}
export function acquireTraceSource(controller) {
    if (!source) throw new Error('Сцена ещё загружается. / The scene is still loading.');
    if (owner) throw new Error('Рендер уже выполняется. / A render is already running.');
    owner = controller;
    const current = source();
    current.setFrameloop('never');
    notify();
    return { ...current, release() { if (owner === controller) { owner = null; notify(); current.invalidate(); } } };
}
