import * as THREE from 'three';

// Земля и стены прогулки: треугольники твёрдых сеток расстановки (модель
// SketchUp и всё, что поставлено) в мире, разложенные по клеткам плана
// метр на метр. Луч вниз от уровня колена находит пол там, где встанет нога:
// под навесом — пол, а не крышу, на ступени — ступень. Луч вбок на высоте
// пояса и груди — стену. Стекло — стена; сквозь листву-вырезки (alphaTest),
// 2D-растения и кроны на плане ходят. Под моделью — плоскость проекта и
// рельеф берега, если есть.
const solidMesh = (mesh) => {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    return !mesh.userData.faceNormal && !mesh.userData.crownPlan && !(material?.alphaTest > 0);
};

// roots: один объект сцены или список (null пропускаются).
export function buildWalkGround(roots, { planeY = null, terrain = null } = {}) {
    const meshes = [];
    let count = 0;
    for (const root of [roots].flat()) {
        root?.updateWorldMatrix(true, true);
        root?.traverseVisible((mesh) => {
            if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || !mesh.geometry?.attributes.position || !solidMesh(mesh)) return;
            meshes.push(mesh);
            count += Math.floor((mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3);
        });
    }
    const tris = new Float32Array(count * 9);
    const v = new THREE.Vector3();
    let k = 0, minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const mesh of meshes) {
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const n = Math.floor((index ? index.count : position.count) / 3);
        for (let t = 0; t < n * 3; t += 1) {
            v.fromBufferAttribute(position, index ? index.getX(t) : t).applyMatrix4(mesh.matrixWorld);
            tris[k++] = v.x; tris[k++] = v.y; tris[k++] = v.z;
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        }
    }
    const x0 = Number.isFinite(minX) ? Math.floor(minX) : 0, z0 = Number.isFinite(minZ) ? Math.floor(minZ) : 0;
    const nx = Number.isFinite(maxX) ? Math.floor(maxX) - x0 + 1 : 1, nz = Number.isFinite(maxZ) ? Math.floor(maxZ) - z0 + 1 : 1;
    // Клетки треугольника — по его рамке на плане; сначала счёт, потом раскладка.
    const cells = (o, visit) => {
        const i0 = Math.floor(Math.min(tris[o], tris[o + 3], tris[o + 6]) - x0), i1 = Math.floor(Math.max(tris[o], tris[o + 3], tris[o + 6]) - x0);
        const j0 = Math.floor(Math.min(tris[o + 2], tris[o + 5], tris[o + 8]) - z0), j1 = Math.floor(Math.max(tris[o + 2], tris[o + 5], tris[o + 8]) - z0);
        for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) visit(j * nx + i);
    };
    const start = new Int32Array(nx * nz + 1);
    for (let t = 0; t < count; t += 1) cells(t * 9, (cell) => { start[cell + 1] += 1; });
    for (let c = 0; c < nx * nz; c += 1) start[c + 1] += start[c];
    const list = new Int32Array(start[nx * nz]), fill = start.slice(0, nx * nz);
    for (let t = 0; t < count; t += 1) cells(t * 9, (cell) => { list[fill[cell]++] = t; });
    return { tris, count, x0, z0, nx, nz, start, list, planeY: Number.isFinite(planeY) ? planeY : null, terrain };
}

// Высота пола под (x, z) не выше fromY: самый высокий треугольник, плоскость
// или рельеф ниже этого уровня; нет ничего — −Infinity.
export function groundHeight(g, x, z, fromY) {
    let best = -Infinity;
    if (g.planeY !== null && g.planeY <= fromY + 1e-4) best = g.planeY;
    if (g.terrain) {
        const h = g.terrain(x, z);
        if (Number.isFinite(h) && h <= fromY + 1e-4 && h > best) best = h;
    }
    const i = Math.floor(x - g.x0), j = Math.floor(z - g.z0);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return best;
    const cell = j * g.nx + i, t = g.tris;
    for (let p = g.start[cell]; p < g.start[cell + 1]; p += 1) {
        const o = g.list[p] * 9;
        const ax = t[o], az = t[o + 2], bx = t[o + 3], bz = t[o + 5], cx = t[o + 6], cz = t[o + 8];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-10) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue;
        const y = l1 * t[o + 1] + l2 * t[o + 4] + l3 * t[o + 7];
        if (y <= fromY + 1e-4 && y > best) best = y;
    }
    return best;
}

// Первое попадание луча из (ox, oy, oz) по единичному (dx, dy, dz) не дальше
// far — расстояние; мимо — Infinity. Клетки — по рамке отрезка на плане.
export function rayDistance(g, ox, oy, oz, dx, dy, dz, far) {
    const ex = ox + dx * far, ez = oz + dz * far;
    const i0 = Math.max(0, Math.floor(Math.min(ox, ex) - g.x0)), i1 = Math.min(g.nx - 1, Math.floor(Math.max(ox, ex) - g.x0));
    const j0 = Math.max(0, Math.floor(Math.min(oz, ez) - g.z0)), j1 = Math.min(g.nz - 1, Math.floor(Math.max(oz, ez) - g.z0));
    let best = far;
    const t = g.tris;
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
        const cell = j * g.nx + i;
        for (let p = g.start[cell]; p < g.start[cell + 1]; p += 1) {
            const o = g.list[p] * 9;
            // Мёллер — Трумбор.
            const e1x = t[o + 3] - t[o], e1y = t[o + 4] - t[o + 1], e1z = t[o + 5] - t[o + 2];
            const e2x = t[o + 6] - t[o], e2y = t[o + 7] - t[o + 1], e2z = t[o + 8] - t[o + 2];
            const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
            const det = e1x * px + e1y * py + e1z * pz;
            if (Math.abs(det) < 1e-12) continue;
            const inv = 1 / det, sx = ox - t[o], sy = oy - t[o + 1], sz = oz - t[o + 2];
            const u = (sx * px + sy * py + sz * pz) * inv;
            if (u < 0 || u > 1) continue;
            const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
            const w = (dx * qx + dy * qy + dz * qz) * inv;
            if (w < 0 || u + w > 1) continue;
            const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
            if (d > 1e-4 && d < best) best = d;
        }
    }
    return best < far ? best : Infinity;
}
