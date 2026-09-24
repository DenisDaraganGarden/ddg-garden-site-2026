// Прогулка между сценой (WalkMode) и подсказками поверх неё (WalkHud): вид —
// от глаз или со стороны, что он делает, захвачена ли мышь, чем он правит
// (клавиатура или геймпад). Кадр пишет сюда только перемены; вид помнится до
// перезагрузки страницы.
let snapshot = { view: 'third', state: 'stand', locked: false, device: 'keys' };
const listeners = new Set();

export const getWalkSnapshot = () => snapshot;
export const subscribeWalk = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export function setWalk(patch) {
    if (Object.keys(patch).every((key) => snapshot[key] === patch[key])) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
}
export const toggleWalkView = () => setWalk({ view: snapshot.view === 'first' ? 'third' : 'first' });
