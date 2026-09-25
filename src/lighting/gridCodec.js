import { makeGrid } from './electric.js';

// Сетка участка в файл проекта и обратно (projects/<id>/site-grid.json):
// её строит редактор из модели, а агент (scripts/lighting.mjs) и отчёт
// считают по ней трассы без сцены. Виды клеток — байтами, земля — в
// сантиметрах (Int16), всё в base64.
const toBase64 = (bytes) => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export function encodeGrid(grid) {
    const ground = Int16Array.from(grid.ground, (y) => Math.max(-32000, Math.min(32000, Math.round(y * 100))));
    return { x0: grid.x0, z0: grid.z0, cell: grid.cell, cols: grid.cols, rows: grid.rows, kind: toBase64(grid.kind), ground: toBase64(new Uint8Array(ground.buffer)) };
}

export function decodeGrid(data) {
    if (!data || ![data.x0, data.z0, data.cell, data.cols, data.rows].every(Number.isFinite)) return null;
    const grid = makeGrid(data);
    const kind = fromBase64(data.kind), ground = new Int16Array(fromBase64(data.ground).buffer);
    if (kind.length !== grid.kind.length || ground.length !== grid.ground.length) return null;
    grid.kind.set(kind);
    grid.ground.set(Float32Array.from(ground, (cm) => cm / 100));
    return grid;
}
