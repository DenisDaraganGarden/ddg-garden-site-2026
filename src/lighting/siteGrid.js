import * as THREE from 'three';
import { insideBed } from '../planting/fillBed.js';
import { KIND, makeGrid } from './electric.js';

// Сетка участка для трасс (electric.js): что лежит в каждой клетке 0,5 м —
// газон, мощение, настил, цветник, корни, стена — и высота земли. Строится
// один раз на модель из её треугольников, цветников и деревьев; в проект не
// пишется (docs/garden-lighting-2026-09-25.md, «Электрика»).
//
// Земля клетки — самая низкая горизонтальная грань над её центром: под
// навесом — пол, а не крыша. Грани SketchUp двусторонние и часто вывернуты
// (земля смотрит вниз), поэтому горизонталь — в обе стороны. Её материал
// SketchUp по таблице проекта (lightingSurfaces) говорит, что это; клетка
// без поверхности модели — за участком; не названный — «не определено» (чуть
// дороже газона: при равном пути трасса обойдёт). Стена — вертикальная грань
// выше 0,4 м, стоящая на этой земле: ограждение, подпорная стенка, фасад —
// сквозь неё гильзой, дорого; бордюр и ступень ниже — не помеха. Здание, где
// не копают вовсе, — только материал, названный так в таблице. Цветники — из посадок; корни —
// круг у ствола дерева: 2D-дерево модели или дерево библиотеки.
const solid = (mesh) => {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    return !mesh.userData.faceNormal && !mesh.userData.crownPlan && !(material?.alphaTest > 0);
};
const WALL = 0.4;

// Треугольники корня сцены в мире: вершины, нормаль, имя материала.
function triangles(root, visit) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((mesh) => {
        if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.geometry?.attributes.position || !solid(mesh)) return;
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const count = Math.floor((index ? index.count : position.count) / 3);
        const materials = Array.isArray(mesh.material) ? mesh.material : null;
        const groups = materials ? mesh.geometry.groups : null;
        for (let t = 0; t < count; t += 1) {
            const at = (k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
            a.fromBufferAttribute(position, at(0)).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(position, at(1)).applyMatrix4(mesh.matrixWorld);
            c.fromBufferAttribute(position, at(2)).applyMatrix4(mesh.matrixWorld);
            n.subVectors(c, b).cross(e.subVectors(a, b));
            if (n.lengthSq() < 1e-12) continue;
            n.normalize();
            let name = mesh.material?.name ?? '';
            if (groups) {
                const group = groups.find((g) => t * 3 >= g.start && t * 3 < g.start + g.count);
                name = materials[group?.materialIndex ?? 0]?.name ?? '';
            }
            visit(a, b, c, n, name);
        }
    });
}

// Центры клеток внутри треугольника на плане — с высотой грани в них.
function rasterize(grid, a, b, c, visit) {
    const { x0, z0, cell, cols, rows } = grid;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell - 0.5)), i1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x, c.x) - x0) / cell - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / cell - 0.5)), j1 = Math.min(rows - 1, Math.ceil((Math.max(a.z, b.z, c.z) - z0) / cell - 0.5));
    const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(det) < 1e-10) return;
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det, v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det, w = 1 - u - v;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        visit(j * cols + i, u * a.y + v * b.y + w * c.y);
    }
}

// Клетки отрезка на плане (с запасом в полклетки — стена не щель).
function segment(grid, ax, az, bx, bz, visit) {
    const length = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(length / (grid.cell * 0.5)));
    for (let s = 0; s <= steps; s += 1) {
        const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
        const i = Math.floor((x - grid.x0) / grid.cell), j = Math.floor((z - grid.z0) / grid.cell);
        if (i >= 0 && j >= 0 && i < grid.cols && j < grid.rows) visit(j * grid.cols + i);
    }
}

// bounds — {minX, maxX, minZ, maxZ} участка; roots — корни сцены с моделями;
// trees — [{x, z, spread}]; surfaces — имя материала → вид покрытия.
export function buildSiteGrid({ roots = [], bounds, planeY = null, beds = [], trees = [], surfaces = {}, cell = 0.5, maxCells = 250000 }) {
    const pad = 3;
    const width = bounds.maxX - bounds.minX + pad * 2, depth = bounds.maxZ - bounds.minZ + pad * 2;
    let size = cell;
    while ((width / size) * (depth / size) > maxCells) size *= 1.25;
    size = Math.round(size * 100) / 100;
    const grid = makeGrid({ x0: bounds.minX - pad, z0: bounds.minZ - pad, cell: size, cols: Math.ceil(width / size), rows: Math.ceil(depth / size) });
    const n = grid.cols * grid.rows;
    const ground = new Float32Array(n).fill(Infinity);
    const names = new Array(n).fill(null);
    const walls = [];
    for (const root of roots.filter(Boolean)) {
        triangles(root, (a, b, c, normal, name) => {
            if (Math.abs(normal.y) > 0.7) {
                rasterize(grid, a, b, c, (i, y) => { if (y < ground[i]) { ground[i] = y; names[i] = name; } });
            } else if (Math.abs(normal.y) < 0.3) {
                // Вертикальная грань: её след на плане — отрезок между крайними вершинами.
                const points = [a, b, c].sort((p, q) => p.x + p.z * 1e-3 - (q.x + q.z * 1e-3));
                const far = [points[0], points[2]];
                walls.push([far[0].x, far[0].z, far[1].x, far[1].z, Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y)]);
            }
        });
    }
    for (let i = 0; i < n; i += 1) {
        const surface = names[i] === null ? null : surfaces[names[i]];
        grid.ground[i] = Number.isFinite(ground[i]) ? ground[i] : planeY ?? 0;
        grid.kind[i] = names[i] === null ? KIND.outside : KIND[surface] ?? KIND.unknown;
    }
    // Стена, стоящая на земле клетки (не парапет крыши и не бордюр).
    for (const [ax, az, bx, bz, low, high] of walls) {
        segment(grid, ax, az, bx, bz, (i) => {
            if (low > grid.ground[i] + 0.5 || high - Math.max(low, grid.ground[i]) < WALL) return;
            if (grid.kind[i] !== KIND.building && grid.kind[i] !== KIND.water) grid.kind[i] = KIND.wall;
        });
    }
    for (let i = 0; i < n; i += 1) {
        if (grid.kind[i] === KIND.building || grid.kind[i] === KIND.water) continue;
        const x = grid.x0 + ((i % grid.cols) + 0.5) * grid.cell, z = grid.z0 + (Math.floor(i / grid.cols) + 0.5) * grid.cell;
        if (beds.some((bed) => insideBed(bed, x, z))) { grid.kind[i] = KIND.bed; continue; }
        if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < Math.min(3, Math.max(0.8, (tree.spread ?? 2) * 0.35)))) grid.kind[i] = KIND.roots;
    }
    return grid;
}

// Деревья сцены для зон корней: 2D-деревья модели (карточки выше 2,5 м) —
// центр рамки на плане и ширина.
export function sceneTrees(root) {
    const trees = [], box = new THREE.Box3(), centre = new THREE.Vector3();
    root?.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.userData.faceNormal) return;
        box.setFromObject(mesh);
        if (box.max.y - box.min.y < 2.5) return;
        box.getCenter(centre);
        trees.push({ x: centre.x, z: centre.z, spread: (box.max.x - box.min.x + box.max.z - box.min.z) / 2 });
    });
    return trees;
}
