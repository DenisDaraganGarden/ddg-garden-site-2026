import { useSyncExternalStore } from 'react';
import { wrapDegrees } from './settings.js';

// Север проекта. В сцене −Z — север, +X — восток (terrainModel WORLD_AXES);
// туда же после выгрузки смотрит зелёная ось SketchUp. Модель несёт свой
// север с собой: повернули её «Поворотом» — повернулся и север. northAngle —
// поправка на случай, когда зелёная ось чертежа смотрит не на север: на
// сколько градусов по часовой стрелке (сверху) от неё истинный север.
// Азимуты здесь — как на компасе: градусы по часовой от севера.
const DEG = Math.PI / 180;
export const bearingOf = (x, z) => (Math.atan2(x, -z) / DEG + 360) % 360;

// Модель участка — первая модель SketchUp в расстановке.
export function siteNorth(settings) {
    const model = (settings.placedObjects ?? []).find((object) => object.kind === 'model' && settings.sketchupModels?.[object.id]);
    return wrapDegrees((Number(settings.northAngle) || 0) - (Number(model?.rotation) || 0));
}

// Куда смотрит кадр на плане: взгляд камеры плюс верх кадра. Их сумма не
// пропадает ни при взгляде вдаль, ни прямо вниз (тогда это верх кадра).
export function viewBearing(matrixWorld) {
    const e = matrixWorld.elements;
    return bearingOf(e[4] - e[8], e[6] - e[10]);
}

// Вид в редакторе для компаса и генплана: азимут кадра, смотрит ли камера
// прямо вниз, и счётчик — вид сдвинулся. Пишет камера (WaterCameraRig), не
// чаще кадра; читают компас и снимок генплана.
let view = { bearing: 0, down: false, version: 0 };
const listeners = new Set();
export function publishView(matrixWorld) {
    const e = matrixWorld.elements, last = view.matrix;
    if (last && e.every((value, i) => Math.abs(value - last[i]) < 1e-5)) return;
    // +Z камеры смотрит назад: прямо вниз — когда он смотрит вверх.
    view = { bearing: viewBearing(matrixWorld), down: e[9] > 0.999, version: view.version + 1, matrix: [...e] };
    for (const listener of listeners) listener();
}
export const subscribeView = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getView = () => view;
export const useView = () => useSyncExternalStore(subscribeView, getView);

// Генплан: камера прямо над серединой участка, север — вверх кадра. Узкий
// объектив с высоты почти не наклоняет стены: план без перспективы, а
// масштаб по земле один на весь кадр. box — {min, max} участка в мире,
// aspect — ширина кадра к высоте.
export const PLAN_FOV = 12;
export const PLAN_CAMERA = 'Генплан';
export function planPose(box, north, aspect, fov = PLAN_FOV) {
    const n = [Math.sin(north * DEG), -Math.cos(north * DEG)], e = [-n[1], n[0]];
    let n0 = Infinity, n1 = -Infinity, e0 = Infinity, e1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
        const along = x * n[0] + z * n[1], across = x * e[0] + z * e[1];
        n0 = Math.min(n0, along); n1 = Math.max(n1, along); e0 = Math.min(e0, across); e1 = Math.max(e1, across);
    }
    const mid = [(n0 + n1) / 2, (e0 + e1) / 2];
    const x = n[0] * mid[0] + e[0] * mid[1], z = n[1] * mid[0] + e[1] * mid[1], y = box.min.y;
    const half = Math.max((n1 - n0) / 2, (e1 - e0) / 2 / Math.max(0.2, aspect), 4) * 1.08;
    const height = half / Math.tan((fov / 2) * DEG);
    // Чуть южнее середины: взгляд наклонён к северу на тысячную (0,06°) — верх
    // кадра на севере, и округление положения до 0,1 мм его не сбивает.
    const round = (value) => Math.round(value * 1e4) / 1e4;
    return {
        cameraPosition: { x: round(x - n[0] * height * 1e-3), y: round(y + height), z: round(z - n[1] * height * 1e-3) },
        cameraTarget: { x: round(x), y: round(y), z: round(z) },
        cameraFov: fov,
    };
}
