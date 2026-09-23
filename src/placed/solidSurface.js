import * as THREE from 'three';

// A model with «Коллизия» on is ground: the board rides onto it where it is
// low and stops against it where it is a wall, the rider stands and falls on
// it, a tree is planted on its top. What they all ask is the height of solid
// ground under a point, so the model is kept as its top surface on a grid —
// the highest of its triangles over every cell, rasterised once each time it
// moves — and the scene's ground queries take the highest of the terrain and
// every solid model there.

// Cell size (m), coarsened for a big model so the grid stays under this many
// cells a side.
export const SOLID_CELL = .25;
const MAX_SIDE = 512;

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

export function solidHeightfield(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return null;
    const cell = Math.max(SOLID_CELL, (box.max.x - box.min.x) / (MAX_SIDE - 1), (box.max.z - box.min.z) / (MAX_SIDE - 1));
    const nx = Math.ceil((box.max.x - box.min.x) / cell) + 1, nz = Math.ceil((box.max.z - box.min.z) / cell) + 1;
    const heights = new Float32Array(nx * nz).fill(-Infinity);
    const x0 = box.min.x, z0 = box.min.z;
    const raise = (i, j, y) => { const k = j * nx + i; if (y > heights[k]) heights[k] = y; };
    root.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const triangles = (index ? index.count : position.count) / 3;
        const vertex = (k, out) => out.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
        for (let t = 0; t < triangles; t += 1) {
            vertex(t * 3, a); vertex(t * 3 + 1, b); vertex(t * 3 + 2, c);
            // Every corner lands on its nearest cell, so a triangle smaller
            // than a cell (a scan's usual) still marks the ground it covers.
            for (const p of [a, b, c]) raise(Math.round((p.x - x0) / cell), Math.round((p.z - z0) / cell), p.y);
            const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cell));
            const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cell));
            if (i0 > i1 || j0 > j1) continue;
            // Larger ones fill every cell centre they cover, at their height there.
            const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
            if (Math.abs(det) < 1e-12) continue;
            for (let j = j0; j <= j1; j += 1) {
                const pz = z0 + j * cell;
                for (let i = i0; i <= i1; i += 1) {
                    const px = x0 + i * cell;
                    const u = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / det;
                    const v = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / det;
                    const w = 1 - u - v;
                    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
                    raise(i, j, u * a.y + v * b.y + w * c.y);
                }
            }
        }
    });
    return { x0, z0, cell, nx, nz, heights };
}

// The solid top at (x, z), -Infinity off the model. Between four cells of the
// model it is their bilinear blend; at its rim, where some are off it, the
// highest of those that are on — the edge of a rock is where it is, not a ramp.
export function heightfieldAt(field, x, z) {
    const fx = (x - field.x0) / field.cell, fz = (z - field.z0) / field.cell;
    if (!(fx >= 0 && fz >= 0 && fx <= field.nx - 1 && fz <= field.nz - 1)) return -Infinity;
    const i = Math.min(Math.floor(fx), field.nx - 2), j = Math.min(Math.floor(fz), field.nz - 2);
    const tx = fx - i, tz = fz - j, h = field.heights, n = field.nx;
    const h00 = h[j * n + i], h10 = h[j * n + i + 1], h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
    if (h00 > -Infinity && h10 > -Infinity && h01 > -Infinity && h11 > -Infinity) {
        return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    }
    // Off the model within the rim's half cell: the nearest cell decides.
    return h[Math.round(fz) * n + Math.round(fx)];
}

// The scene's solid models, by owner.
const solids = new Map();
export const setSolid = (owner, field) => { if (field) solids.set(owner, field); else solids.delete(owner); };
export function solidHeightAt(x, z, except = null) {
    let top = -Infinity;
    for (const [owner, field] of solids) if (owner !== except) top = Math.max(top, heightfieldAt(field, x, z));
    return top;
}
export const hasSolids = () => solids.size > 0;

// A board (origin p, rotation q as [x, y, z, w], length and width in m) up
// against a solid standing more than `step` over it anywhere round its
// outline: nose, tail, both rails fore and aft.
const OUTLINE = [[0, .5], [0, -.5], [.5, .25], [-.5, .25], [.5, -.25], [-.5, -.25]];
export function boardAgainstSolid(p, q, length, width, step) {
    const [qx, qy, qz, qw] = q;
    for (const [sx, sz] of OUTLINE) {
        const x = sx * width, z = sz * length;
        // v' = v + 2w(q×v) + 2 q×(q×v), with y = 0
        const tx = 2 * (qy * z), ty = 2 * (qz * x - qx * z), tz = 2 * (-qy * x);
        const wx = x + qw * tx + qy * tz - qz * ty, wy = qw * ty + qz * tx - qx * tz, wz = z + qw * tz + qx * ty - qy * tx;
        if (solidHeightAt(p[0] + wx, p[2] + wz) > p[1] + wy + step) return true;
    }
    return false;
}
