import * as THREE from 'three';
import { polygonArea, simplifyContour } from './fillBed.js';

// Поверхность модели под цветник — без лассо. SimLab сливает все грани одного
// материала группы в одну сетку (весь «Рельеф» с корой — одна сетка на 490 м²),
// поэтому щелчок выбирает компонент целиком. Здесь из сетки вынимается
// связный участок под курсором: грани одной сетки (один материал SketchUp),
// сходящиеся под углом не круче 30°, — как «поверхность» в SketchUp: полоса
// грунта у изгороди, газон, земля в кашпо. Стена, бордюр, соседний материал —
// граница участка.
const SMOOTH = Math.cos(THREE.MathUtils.degToRad(30));
const MIN_UP = 0.5;
const regionsCache = new WeakMap();

// Участки сетки: номер участка каждого треугольника. Считается один раз на
// геометрию — копии компонента делят её, а вид сверху у них свой (мир ниже).
export function surfaceRegions(geometry) {
    if (regionsCache.has(geometry)) return regionsCache.get(geometry);
    const position = geometry.attributes.position, index = geometry.index;
    const count = Math.floor((index ? index.count : position.count) / 3);
    const vertex = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
    // Одна точка — один номер: грани SketchUp хранят свои копии вершин.
    const ids = new Map(), weld = new Int32Array(position.count);
    for (let i = 0; i < position.count; i += 1) {
        const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
        if (!ids.has(key)) ids.set(key, ids.size);
        weld[i] = ids.get(key);
    }
    const width = ids.size;
    const normals = new Float32Array(count * 3);
    const edges = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < count; t += 1) {
        a.fromBufferAttribute(position, vertex(t, 0)); b.fromBufferAttribute(position, vertex(t, 1)); c.fromBufferAttribute(position, vertex(t, 2));
        const n = c.sub(b).cross(a.sub(b)).normalize();
        normals.set([n.x, n.y, n.z], t * 3);
        for (let k = 0; k < 3; k += 1) {
            const p = weld[vertex(t, k)], q = weld[vertex(t, (k + 1) % 3)];
            if (p === q) continue;
            const key = p < q ? p * width + q : q * width + p;
            const list = edges.get(key);
            if (list) list.push(t); else edges.set(key, [t]);
        }
    }
    const regionOf = new Int32Array(count).fill(-1), regions = [];
    const smooth = (t, u) => Math.abs(normals[t * 3] * normals[u * 3] + normals[t * 3 + 1] * normals[u * 3 + 1] + normals[t * 3 + 2] * normals[u * 3 + 2]) >= SMOOTH;
    for (let seed = 0; seed < count; seed += 1) {
        if (regionOf[seed] >= 0) continue;
        const id = regions.length, members = [seed];
        regionOf[seed] = id;
        for (let head = 0; head < members.length; head += 1) {
            const t = members[head];
            if (!Number.isFinite(normals[t * 3])) continue;
            for (let k = 0; k < 3; k += 1) {
                const p = weld[vertex(t, k)], q = weld[vertex(t, (k + 1) % 3)];
                for (const u of edges.get(p < q ? p * width + q : q * width + p) ?? []) {
                    if (regionOf[u] < 0 && Number.isFinite(normals[u * 3]) && smooth(t, u)) { regionOf[u] = id; members.push(u); }
                }
            }
        }
        regions.push(Int32Array.from(members));
    }
    const result = { regionOf, regions, vertex };
    regionsCache.set(geometry, result);
    return result;
}

// Треугольники участка в мире (9 чисел на треугольник) и насколько он
// «земля»: средняя по площади вертикаль нормали. Стена и потолок землёй не
// считаются.
export function regionTriangles(mesh, faceIndex) {
    const { regionOf, regions, vertex } = surfaceRegions(mesh.geometry);
    const id = regionOf[faceIndex];
    if (id === undefined || id < 0) return null;
    const position = mesh.geometry.attributes.position, members = regions[id];
    const out = new Float32Array(members.length * 9), p = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    let up = 0, area = 0;
    members.forEach((t, i) => {
        for (let k = 0; k < 3; k += 1) {
            p.fromBufferAttribute(position, vertex(t, k)).applyMatrix4(mesh.matrixWorld);
            out.set([p.x, p.y, p.z], i * 9 + k * 3);
        }
        e1.set(out[i * 9 + 3] - out[i * 9], out[i * 9 + 4] - out[i * 9 + 1], out[i * 9 + 5] - out[i * 9 + 2]);
        e2.set(out[i * 9 + 6] - out[i * 9], out[i * 9 + 7] - out[i * 9 + 1], out[i * 9 + 8] - out[i * 9 + 2]);
        n.crossVectors(e1, e2);
        const twice = n.length();
        area += twice / 2; up += Math.abs(n.y) / 2;
    });
    return { id, triangles: out, area, upright: area ? up / area : 0, ground: area > 0 && up / area >= MIN_UP };
}

// Контур участка на плане: наружный край и дырки (приствольные круги,
// дорожки), средняя высота и сетка высот, если участок не ровный.
export function regionOutline(triangles) {
    const count = triangles.length / 9;
    const ids = new Map(), points = [];
    const idOf = (i) => {
        const x = triangles[i], y = triangles[i + 1], z = triangles[i + 2];
        const key = `${Math.round(x * 1000)},${Math.round(z * 1000)},${Math.round(y * 1000)}`;
        if (!ids.has(key)) { ids.set(key, points.length); points.push([x, y, z]); }
        return ids.get(key);
    };
    const edgeCount = new Map();
    const tri = [];
    for (let t = 0; t < count; t += 1) {
        const v = [idOf(t * 9), idOf(t * 9 + 3), idOf(t * 9 + 6)];
        tri.push(v);
        for (let k = 0; k < 3; k += 1) {
            const p = v[k], q = v[(k + 1) % 3];
            if (p === q) continue;
            const key = p < q ? `${p}:${q}` : `${q}:${p}`;
            edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        }
    }
    // Край — рёбра одного треугольника; из них — замкнутые петли.
    const next = new Map();
    for (const [key, n] of edgeCount) {
        if (n !== 1) continue;
        const [p, q] = key.split(':').map(Number);
        if (!next.has(p)) next.set(p, []);
        if (!next.has(q)) next.set(q, []);
        next.get(p).push(q); next.get(q).push(p);
    }
    const used = new Set(), loops = [];
    const edgeKey = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
    for (const [start, around] of next) {
        for (const first of around) {
            if (used.has(edgeKey(start, first))) continue;
            const loop = [start];
            let previous = start, current = first;
            used.add(edgeKey(start, first));
            while (current !== start && loop.length < 100000) {
                loop.push(current);
                const onward = (next.get(current) ?? []).find((q) => q !== previous && !used.has(edgeKey(current, q)));
                if (onward === undefined) break;
                used.add(edgeKey(current, onward));
                previous = current; current = onward;
            }
            if (loop.length >= 3) loops.push(loop.map((id) => [points[id][0], points[id][2]]));
        }
    }
    if (!loops.length) return null;
    loops.sort((p, q) => polygonArea(q) - polygonArea(p));
    const [outer, ...rest] = loops;
    const insideOuter = (loop) => {
        const [x, z] = loop[0];
        let hit = false;
        for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
            const [xi, zi] = outer[i], [xj, zj] = outer[j];
            if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
        }
        return hit;
    };
    const holes = rest.filter((loop) => polygonArea(loop) > 0.02 && insideOuter(loop)).slice(0, 64).map((loop) => simplifyContour(loop, 128));

    // Высота: средняя по площади; сетка высот — если участок не ровный.
    let sum = 0, weight = 0, low = Infinity, high = -Infinity;
    for (let t = 0; t < count; t += 1) {
        const [p, q, r] = tri[t].map((id) => points[id]);
        const area = Math.abs((q[0] - p[0]) * (r[2] - p[2]) - (r[0] - p[0]) * (q[2] - p[2])) / 2;
        sum += ((p[1] + q[1] + r[1]) / 3) * area; weight += area;
        low = Math.min(low, p[1], q[1], r[1]); high = Math.max(high, p[1], q[1], r[1]);
    }
    const y = weight ? sum / weight : points[0][1];
    return { outer: simplifyContour(outer), holes, y, ground: high - low > 0.06 ? heightGrid(tri, points, outer) : null };
}

// Сетка высот участка: в каждой клетке — высота треугольника под её
// серединой (вне участка — пусто). Не больше 64 × 64 клеток.
function heightGrid(tri, points, outer) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of outer) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const step = Math.max(0.25, Math.max(x1 - x0, z1 - z0) / 63);
    const cols = Math.max(2, Math.ceil((x1 - x0) / step) + 1), rows = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
    const h = new Array(cols * rows).fill(null);
    for (const [ia, ib, ic] of tri) {
        const [a, b, c] = [points[ia], points[ib], points[ic]];
        const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(det) < 1e-12) continue;
        const ci0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / step)), ci1 = Math.min(cols - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / step));
        const cj0 = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - z0) / step)), cj1 = Math.min(rows - 1, Math.ceil((Math.max(a[2], b[2], c[2]) - z0) / step));
        for (let j = cj0; j <= cj1; j += 1) for (let i = ci0; i <= ci1; i += 1) {
            const x = x0 + i * step, z = z0 + j * step;
            const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
            const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
            const l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            h[j * cols + i] = Math.round((l1 * a[1] + l2 * b[1] + l3 * c[1]) * 100) / 100;
        }
    }
    return { x0: Math.round(x0 * 1000) / 1000, z0: Math.round(z0 * 1000) / 1000, step: Math.round(step * 1000) / 1000, cols, rows, h };
}

// Подсветка участка под курсором: те же треугольники, чуть над поверхностью.
export function regionHighlight(triangles) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(triangles.slice(), 3));
    geometry.computeVertexNormals();
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i += 1) {
        const up = normal.getY(i) < 0 ? -1 : 1;
        position.setXYZ(i, position.getX(i) + normal.getX(i) * 0.02 * up, position.getY(i) + normal.getY(i) * 0.02 * up, position.getZ(i) + normal.getZ(i) * 0.02 * up);
    }
    return geometry;
}
