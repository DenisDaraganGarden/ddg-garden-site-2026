import * as THREE from 'three';
import { regionTriangles } from '../planting/surfacePick.js';

export function describeCoverSurface(mesh, face) {
    const path = []; let root = mesh;
    while (root.parent && !root.userData.placedId) { path.unshift(root.parent.children.indexOf(root)); root = root.parent; }
    return root.userData.placedId ? { root: root.name, path, face } : null;
}
export function resolveCoverSurface(scene, ref) {
    let mesh = ref && scene.getObjectByName(ref.root);
    for (const index of ref?.path ?? []) mesh = mesh?.children[index];
    for (let node = mesh; node; node = node.parent) if (!node.visible) return null;
    return mesh?.isMesh && mesh.geometry?.attributes.position ? mesh : null;
}
// Build once per receiver revision. Sampling a leaf never scans the whole scene.
export function triangleSurface(triangles, cell = 1) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < triangles.length; i += 3) { x0 = Math.min(x0, triangles[i]); x1 = Math.max(x1, triangles[i]); z0 = Math.min(z0, triangles[i + 2]); z1 = Math.max(z1, triangles[i + 2]); }
    cell = Math.max(cell, (x1 - x0) / 64, (z1 - z0) / 64);
    const buckets = new Map(), records = [];
    for (let i = 0; i < triangles.length; i += 9) {
        const a = triangles.slice(i, i + 3), b = triangles.slice(i + 3, i + 6), c = triangles.slice(i + 6, i + 9);
        const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(det) < 1e-9) continue;
        const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize();
        if (normal.y < 0) normal.negate();
        const index = records.length; records.push({ a, b, c, det, normal: normal.toArray() });
        const minX = Math.floor(Math.min(a[0], b[0], c[0]) / cell), maxX = Math.floor(Math.max(a[0], b[0], c[0]) / cell);
        const minZ = Math.floor(Math.min(a[2], b[2], c[2]) / cell), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / cell);
        for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) { const key = `${x}:${z}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(index); }
    }
    return { sample(x, z) {
        for (const i of buckets.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`) ?? []) {
            const { a, b, c, det, normal } = records[i];
            const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
            const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
            if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) return { height: u * a[1] + v * b[1] + (1 - u - v) * c[1], normal };
        }
        return null;
    } };
}
export function receiverSurface(mesh, face) {
    const count = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    if (!Number.isInteger(face) || face < 0 || face >= count) return null;
    const region = regionTriangles(mesh, face);
    return region?.ground ? triangleSurface(region.triangles) : null;
}

export function terrainCoverSurface(query) {
    return query ? { sample(x, z) {
        const s = query.surfaceAt(x, z);
        if (['rock', 'submerged', 'swash'].includes(s.habitat) || s.path > .5) return null;
        return { height: s.height, normal: [s.normal.x, s.normal.y, s.normal.z] };
    } } : null;
}
