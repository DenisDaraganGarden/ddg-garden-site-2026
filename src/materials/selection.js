import * as THREE from 'three';

// IDs address a mesh instance in the original glTF hierarchy, not its shared
// geometry or its transient, regrouped triangle order after painting.
export function materialMeshKey(mesh, root) {
    const path = [];
    for (let node = mesh; node && node !== root; node = node.parent) path.unshift(node.parent?.children.indexOf(node) ?? 0);
    return path.join('.');
}
export const sourceGeometry = (mesh) => mesh.userData.sourceGeometry ?? mesh.userData.faceSplit?.geometry ?? mesh.geometry;
export const sourceMaterial = (mesh) => mesh.userData.faceSplit?.material ?? mesh.material;
export const triangleCount = (geometry) => Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3);
export function triangleMaterial(geometry, triangle) {
    return geometry.groups.find((group) => triangle * 3 >= group.start && triangle * 3 < group.start + group.count)?.materialIndex ?? 0;
}
const islands = new WeakMap();
function topology(geometry) {
    if (islands.has(geometry)) return islands.get(geometry);
    const position = geometry.attributes.position, index = geometry.index, count = triangleCount(geometry);
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], edge = new THREE.Vector3();
    const rows = [], edges = new Map();
    const vertex = (p) => [p.x, p.y, p.z].map((v) => Math.round(v * 100000)).join(',');
    for (let t = 0; t < count; t += 1) {
        points.forEach((p, k) => p.fromBufferAttribute(position, index ? index.getX(t * 3 + k) : t * 3 + k));
        const normal = new THREE.Vector3().subVectors(points[1], points[0]).cross(edge.subVectors(points[2], points[0])).normalize();
        const row = { normal, plane: normal.dot(points[0]), slot: triangleMaterial(geometry, t), edges: [] };
        const ids = points.map(vertex);
        for (let k = 0; k < 3; k += 1) {
            const key = [ids[k], ids[(k + 1) % 3]].sort().join('|');
            if (!edges.has(key)) edges.set(key, []);
            edges.get(key).push(t); row.edges.push(key);
        }
        rows.push(row);
    }
    const result = { rows, edges }; islands.set(geometry, result); return result;
}
// A SketchUp face is normally several triangles. Weld only matching edges;
// disconnected coplanar slabs and the opposite side of a thin sheet stay apart.
export function connectedFace(geometry, seed) {
    const { rows, edges } = topology(geometry), first = rows[seed];
    if (!first) return [];
    const found = new Set([seed]), queue = [seed];
    for (let i = 0; i < queue.length; i += 1) for (const edge of rows[queue[i]].edges) for (const next of edges.get(edge)) {
        const row = rows[next];
        if (found.has(next) || row.slot !== first.slot || row.normal.dot(first.normal) < 0.99999 || Math.abs(row.plane - first.plane) > 0.0001) continue;
        found.add(next); queue.push(next);
    }
    return [...found].sort((a, b) => a - b);
}
export function targetAt(hit, root) {
    const mesh = hit?.object;
    if (!mesh?.isMesh || !root) return null;
    const geometry = sourceGeometry(mesh), triangle = mesh.geometry.userData.sourceTriangles?.[hit.faceIndex] ?? hit.faceIndex;
    const base = sourceMaterial(mesh), material = Array.isArray(base) ? base[triangleMaterial(geometry, triangle ?? 0)] : base;
    if (!material?.name || !material.isMeshStandardMaterial) return null;
    return { placedId: hit.placedId, materialName: material.name, material, mesh, asset: root.userData.materialModel, meshKey: materialMeshKey(mesh, root),
        triangles: connectedFace(geometry, triangle ?? 0), count: triangleCount(geometry) };
}
export const targetKey = (target) => `${target.placedId}:${target.materialName}:${target.meshKey}:${target.asset ?? ""}:${target.triangles?.join(',') ?? '*'}`;
export const matchesTarget = (rule, target, triangle = target.triangles?.[0] ?? 0) => rule.targets?.some((item) => item.mesh === target.meshKey && (!item.asset || item.asset === target.asset) && (!item.triangles || item.triangles.includes(triangle)));
export function targetOverride(all, target, scope) {
    if (!target) return null;
    const base = all?.[target.placedId]?.[target.materialName];
    return scope === 'material' ? base : base?.faces?.find((rule) => matchesTarget(rule, target)) ?? base;
}

export function targetHasMaterial(all, target, scope, id) {
    const base = all?.[target.placedId]?.[target.materialName];
    if (scope === 'material') return base?.material === id && !base.faces?.length;
    if (base?.faces?.some((rule) => !rule.targets)) return false;
    const remaining = new Set(target.triangles ?? Array.from({ length: target.count }, (_, i) => i));
    for (const rule of base?.faces ?? []) for (const item of rule.targets ?? []) {
        if (item.mesh !== target.meshKey || (item.asset && item.asset !== target.asset)) continue;
        for (const triangle of item.triangles ?? [...remaining]) if (remaining.has(triangle)) {
            if (rule.material !== id) return false;
            remaining.delete(triangle);
        }
        if (!remaining.size) return true;
    }
    return !remaining.size || base?.material === id;
}

// One history transaction, even when Shift collects faces with different base
// materials or on different placed instances. Trim overlap instead of piling
// a new layer onto the same polygon each time a slider changes.
export function paintTargets(all, targets, scope, value) {
    const next = { ...all }, groups = new Map();
    for (const target of targets) {
        const key = `${target.placedId}:${target.materialName}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(target);
    }
    for (const group of groups.values()) {
        const { placedId, materialName } = group[0];
        const materials = { ...(next[placedId] ?? {}) }, base = materials[materialName] ?? {};
        if (scope === 'material') {
            if (value) materials[materialName] = value; else delete materials[materialName];
        } else {
            const faces = (base.faces ?? []).map((rule) => {
                if (!rule.targets) return rule;
                const kept = rule.targets.flatMap((item) => {
                    const picked = group.filter((target) => target.meshKey === item.mesh && (!item.asset || item.asset === target.asset));
                    if (!picked.length) return [item];
                    if (picked.some((target) => !target.triangles)) return [];
                    const removed = new Set(picked.flatMap((target) => target.triangles));
                    const remaining = (item.triangles ?? Array.from({ length: picked[0].count }, (_, i) => i)).filter((t) => !removed.has(t));
                    return remaining.length ? [{ ...item, triangles: remaining }] : [];
                });
                return kept.length ? { ...rule, targets: kept } : null;
            }).filter(Boolean);
            if (value?.material) {
                const { faces: ignored, targets: previous, glass: glass, ...look } = value; // eslint-disable-line no-unused-vars
                faces.unshift({ ...look, faces: ['up', 'down', 'side'], projection: value.projection ?? 'box',
                    targets: group.map((target) => ({ mesh: target.meshKey, ...(target.asset ? { asset: target.asset } : {}), ...(target.triangles ? { triangles: target.triangles } : {}) })) });
            }
            // Combine disjoint selections with the same appearance to keep
            // repeated painting compact and below the persistence limit.
            const combined = new Map();
            let segment = 0;
            for (const rule of faces) {
                const { targets: selection, ...look } = rule;
                if (!selection) segment += 1; // Do not move targets across legacy directional rules.
                const key = selection ? `${segment}:${JSON.stringify(look, Object.keys(look).sort())}` : Symbol();
                if (combined.has(key)) combined.get(key).targets.push(...selection);
                else combined.set(key, { ...rule, ...(selection ? { targets: [...selection] } : {}) });
            }
            faces.splice(0, faces.length, ...combined.values());
            if (faces.length > 128 || faces.some((rule) => rule.targets?.length > 2048)) throw new Error('Слишком много отдельных назначений. Уменьшите выбор. / Too many assignments; reduce the selection.');
            const { faces: old, ...rest } = base; // eslint-disable-line no-unused-vars
            materials[materialName] = { ...rest, ...(faces.length ? { faces } : {}) };
            if (!Object.keys(materials[materialName]).length) delete materials[materialName];
        }
        if (Object.keys(materials).length) next[placedId] = materials; else delete next[placedId];
    }
    return next;
}
