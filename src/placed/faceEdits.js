import * as THREE from 'three';
import { materialMeshKey, sourceGeometry, triangleCount, triangleMaterial } from '../materials/selection.js';

// Project edits address the immutable asset and a mesh instance within it.
// Replacing a GLB must not apply old triangle numbers to unrelated geometry.
export function normalizeRemovedFaces(value) {
    const rows = new Map();
    for (const row of Array.isArray(value) ? value : []) {
        if (!row || typeof row.asset !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(row.asset) || typeof row.mesh !== 'string' || !/^\d+(\.\d+)*$/.test(row.mesh)) continue;
        const key = `${row.asset}:${row.mesh}`;
        if (!rows.has(key)) rows.set(key, { ...row, asset: row.asset, mesh: row.mesh, triangles: new Set() });
        for (const t of Array.isArray(row.triangles) ? row.triangles : []) if (Number.isSafeInteger(t) && t >= 0) rows.get(key).triangles.add(t);
    }
    return [...rows.values()].filter((row) => row.triangles.size).map((row) => ({ ...row, triangles: [...row.triangles].sort((a, b) => a - b) }));
}

export const faceItems = (face) => face ? face.items ?? [face] : [];
export const hasSelectedFaces = (face) => faceItems(face).some((item) => item.triangles.length);

// Shift toggles a complete polygon. Overlapping triple-click selections are
// sets of source triangles, so removing one face leaves the other five sides.
export function selectFaces(current, picked, shift = false, extend = false) {
    if (!shift) return { items: [picked] };
    const items = faceItems(current).map((item) => ({ ...item, triangles: [...item.triangles] }));
    const previous = items.find((item) => item.mesh === picked.mesh);
    if (!previous) return { items: [...items, picked] };
    const chosen = new Set(previous.triangles), subtract = !extend && picked.triangles.every((t) => chosen.has(t));
    for (const t of picked.triangles) { if (subtract) chosen.delete(t); else chosen.add(t); }
    previous.triangles = [...chosen].sort((a, b) => a - b);
    previous.edges ||= picked.edges;
    previous.whole = false;
    return { items: items.filter((item) => item.triangles.length), multiple: true };
}

export function removeSelectedFaces(previous, root, asset, face) {
    const rows = [...(previous ?? [])];
    for (const item of faceItems(face)) {
        const mesh = root.getObjectByProperty('uuid', item.mesh);
        if (!mesh?.isMesh) continue;
        const count = triangleCount(sourceGeometry(mesh));
        rows.push({ asset, mesh: materialMeshKey(mesh, root), triangles: item.triangles.filter((t) => Number.isInteger(t) && t >= 0 && t < count) });
    }
    return normalizeRemovedFaces(rows);
}

// Last stage, after material projection/regrouping. Attribute data belongs to
// this derivative; the GLTF cache and other placed copies remain untouched.
export function cutFaces(geometry, removed) {
    const out = geometry.clone(), order = geometry.userData.sourceTriangles;
    const indices = [], originals = [], position = out.attributes.position;
    const point = new THREE.Vector3(), box = new THREE.Box3();
    let group = null;
    out.clearGroups();
    for (let t = 0; t < triangleCount(geometry); t += 1) {
        const original = order?.[t] ?? t;
        if (removed.has(original)) continue;
        const material = triangleMaterial(geometry, t);
        if (!group || group.materialIndex !== material) {
            out.addGroup(indices.length, 0, material); group = out.groups[out.groups.length - 1];
        }
        for (let k = 0; k < 3; k += 1) {
            const v = geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k;
            indices.push(v); box.expandByPoint(point.fromBufferAttribute(position, v));
        }
        group.count += 3; originals.push(original);
    }
    out.setIndex(indices);
    out.setDrawRange(0, indices.length);
    out.userData.sourceTriangles = originals;
    out.boundingBox = box;
    out.boundingSphere = new THREE.Sphere();
    if (indices.length) {
        box.getCenter(out.boundingSphere.center);
        for (const v of indices) out.boundingSphere.radius = Math.max(out.boundingSphere.radius, point.fromBufferAttribute(position, v).distanceTo(out.boundingSphere.center));
    }
    return out;
}

export function restoreModelFaces(root) {
    root.traverse((mesh) => {
        const edit = mesh.userData.faceRemoval;
        if (!edit) return;
        mesh.geometry.dispose(); mesh.geometry = edit.geometry;
        delete mesh.userData.faceRemoval;
    });
}
export function applyModelFaces(root, rows) {
    const edits = new Map((rows ?? []).filter((row) => row.asset === root.userData.materialModel).map((row) => [row.mesh, row.triangles]));
    root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const triangles = edits.get(materialMeshKey(mesh, root));
        if (!triangles?.length) return;
        const source = sourceGeometry(mesh), removed = new Set(triangles.filter((t) => t < triangleCount(source)));
        if (!removed.size) return;
        const geometry = mesh.geometry;
        mesh.geometry = cutFaces(geometry, removed);
        mesh.userData.faceRemoval = { geometry, source, removed };
    });
}
