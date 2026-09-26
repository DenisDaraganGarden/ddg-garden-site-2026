import * as THREE from 'three';
import { surfaceBasis } from './projection.js';
import { materialMeshKey, paintTargets, sourceGeometry, sourceMaterial, targetAppearances, targetOverride, triangleCount, triangleMaterial } from './selection.js';

const EPS = 0.0001; // Weld export seams within 0.1 mm, in model metres.
const vector = (value) => new THREE.Vector3().fromArray(value);
const pointKey = (p) => p.toArray().map((n) => Math.round(n / EPS)).join(',');
const canonical = (direction) => {
    const values = direction.toArray(), axis = values.reduce((best, n, i) => Math.abs(n) > Math.abs(values[best]) ? i : best, 0);
    return values[axis] < 0 ? direction.negate() : direction;
};
const trianglePoints = (geometry, triangle, matrix) => [0, 1, 2].map((k) => new THREE.Vector3()
    .fromBufferAttribute(geometry.attributes.position, geometry.index ? geometry.index.getX(triangle * 3 + k) : triangle * 3 + k).applyMatrix4(matrix));
const normalOf = ([a, b, c]) => b.clone().sub(a).cross(c.clone().sub(a)).normalize();
const relative = (mesh, root) => root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);

export function normalizeSurfaceMapping(value) {
    if (!value || !['origin', 'u', 'normal'].every((key) => Array.isArray(value[key]) && value[key].length === 3
        && value[key].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9))) return null;
    const seed = value.seed;
    if (!seed || !/^\d+(?:\.\d+)*$/.test(seed.mesh ?? '') || !Number.isInteger(seed.triangle) || seed.triangle < 0 || seed.triangle >= 10000000) return null;
    const n = vector(value.normal), u = vector(value.u);
    if (n.lengthSq() < 1e-12 || u.lengthSq() < 1e-12) return null;
    n.normalize(); u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-12) return null;
    let surfaces;
    if (value.surfaces !== undefined) {
        if (!Array.isArray(value.surfaces) || !value.surfaces.length || value.surfaces.length > 2048) return null;
        surfaces = [];
        for (const item of value.surfaces) {
            if (!item || !/^\d+(?:\.\d+)*$/.test(item.mesh ?? '')) return null;
            if (item.triangles !== undefined && (!Array.isArray(item.triangles) || !item.triangles.length || item.triangles.length > 500000
                || !item.triangles.every((t) => Number.isInteger(t) && t >= 0 && t < 10000000))) return null;
            surfaces.push({ mesh: item.mesh, ...(item.triangles ? { triangles: [...new Set(item.triangles)].sort((a, b) => a - b) } : {}) });
        }
    }
    // Keep enough precision for long, oblique edges; never quantize directions to millimetres.
    return { origin: [...value.origin], u: u.normalize().toArray(), normal: n.toArray(), ...(surfaces ? { surfaces } : {}), seed: {
        mesh: seed.mesh, triangle: seed.triangle, ...(/^[a-zA-Z0-9._-]{1,160}$/.test(seed.asset ?? '') ? { asset: seed.asset } : {}),
    } };
}

export function mappingForSelection(reference, root, targets, scope, nearestEdge = false) {
    const mapping = mappingFromTarget(reference, root, nearestEdge);
    if (!mapping) return null;
    const selected = new Map();
    if (scope === 'material') {
        const names = new Set(targets.map((target) => target.materialName));
        root.traverse((mesh) => {
            if (!mesh.isMesh) return;
            const materials = [sourceMaterial(mesh)].flat(), geometry = sourceGeometry(mesh);
            if (!materials.some((material) => names.has(material.name))) return;
            selected.set(materialMeshKey(mesh, root), materials.every((material) => names.has(material.name)) ? null
                : new Set(Array.from({ length: triangleCount(geometry) }, (_, t) => t).filter((t) => names.has(materials[triangleMaterial(geometry, t)]?.name))));
        });
    } else for (const target of targets) {
        if (!target.triangles) selected.set(target.meshKey, null);
        else if (selected.get(target.meshKey) !== null) selected.set(target.meshKey, new Set([...(selected.get(target.meshKey) ?? []), ...target.triangles]));
    }
    // Keep the geometric domain with the frame, independently of current paint.
    // Repainting one tread must not shift the untouched risers' UVs afterwards.
    const surfaces = [...selected].map(([mesh, triangles]) => ({ mesh, ...(triangles ? { triangles: [...triangles] } : {}) }));
    return normalizeSurfaceMapping({ ...mapping, surfaces });
}

// Reference face: its perimeter, not an arbitrary triangulation diagonal or imported UV.
export function mappingFromTarget(target, root, nearestEdge = false) {
    if (!target?.mesh || !root || !target.triangles?.length) return null;
    root.updateMatrixWorld(true);
    const geometry = sourceGeometry(target.mesh), matrix = relative(target.mesh, root), edges = new Map();
    const seed = target.seed ?? target.triangles[0], normal = normalOf(trianglePoints(geometry, seed, matrix));
    for (const triangle of target.triangles) {
        const points = trianglePoints(geometry, triangle, matrix);
        points.forEach((a, k) => {
            const b = points[(k + 1) % 3], key = [pointKey(a), pointKey(b)].sort().join('|');
            const edge = edges.get(key);
            if (edge) edge.count += 1; else edges.set(key, { a, b, count: 1 });
        });
    }
    const hit = target.point ? vector(target.point).applyMatrix4(root.matrixWorld.clone().invert()) : null;
    const perimeter = [...edges.values()].filter(({ a, b, count }) => count === 1 && a.distanceToSquared(b) > EPS * EPS);
    const distance = ({ a, b }) => new THREE.Line3(a, b).closestPointToPoint(hit, true, new THREE.Vector3()).distanceToSquared(hit);
    perimeter.sort(nearestEdge && hit ? (a, b) => distance(a) - distance(b) : (a, b) => b.a.distanceToSquared(b.b) - a.a.distanceToSquared(a.b));
    const edge = perimeter[0];
    if (!edge || normal.lengthSq() < 0.5) return null;
    const u = canonical(edge.b.clone().sub(edge.a).normalize());
    const origin = edge.a.dot(u) <= edge.b.dot(u) ? edge.a : edge.b;
    return normalizeSurfaceMapping({ origin: origin.toArray(), u: u.toArray(), normal: normal.toArray(),
        seed: { mesh: target.meshKey, triangle: seed, ...(target.asset ? { asset: target.asset } : {}) } });
}

const uvAt = (frame, point) => {
    const delta = point.clone().sub(frame.origin);
    return [frame.offset[0] + delta.dot(frame.u), frame.offset[1] + delta.dot(frame.v)];
};
const frameOnPlane = (mapping, normal) => {
    const n = vector(mapping.normal), turn = new THREE.Quaternion().setFromUnitVectors(n, normal);
    const u = vector(mapping.u), v = u.clone().cross(n);
    return { origin: vector(mapping.origin), u: u.applyQuaternion(turn), v: v.applyQuaternion(turn), offset: [0, 0] };
};

// Unfold only the selected surface. Transport a metric frame around each shared
// edge. A tread and riser then have identical UVs on that edge, at any rotation.
// Collinear overlapping edges also connect: SketchUp often exports T junctions.
export function unfoldSurface(entries, mapping) {
    const rows = [], lines = new Map(), adjacency = [];
    for (const { mesh, geometry, matrix, triangles } of entries) for (const triangle of triangles) {
        const points = trianglePoints(geometry, triangle, matrix), normal = normalOf(points), id = rows.length;
        if (normal.lengthSq() < 0.5) continue;
        rows.push({ mesh, triangle, points, normal }); adjacency.push([]);
        points.forEach((a, k) => {
            const b = points[(k + 1) % 3], length = a.distanceTo(b);
            if (length < EPS) return;
            const direction = canonical(b.clone().sub(a).divideScalar(length));
            const anchor = a.clone().addScaledVector(direction, -a.dot(direction));
            const key = `${direction.toArray().map((n) => Math.round(n * 10000)).join(',')}:${pointKey(anchor)}`;
            if (!lines.has(key)) lines.set(key, []);
            lines.get(key).push({ id, a, b, direction, min: Math.min(a.dot(direction), b.dot(direction)), max: Math.max(a.dot(direction), b.dot(direction)) });
        });
    }
    for (const edges of lines.values()) {
        edges.sort((a, b) => a.min - b.min);
        for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length && edges[j].min < edges[i].max - EPS; j += 1) {
            const a = edges[i], b = edges[j];
            if (a.id === b.id || rows[a.id].normal.dot(rows[b.id].normal) < -0.99999) continue;
            if (new THREE.Line3(a.a, a.b).closestPointToPoint(b.a, false, new THREE.Vector3()).distanceTo(b.a) > EPS) continue;
            const min = Math.max(a.min, b.min), max = Math.min(a.max, b.max);
            if (max - min < EPS) continue;
            const point = a.a.clone().addScaledVector(a.direction, min - a.a.dot(a.direction));
            adjacency[a.id].push({ id: b.id, point, direction: a.direction });
            adjacency[b.id].push({ id: a.id, point, direction: a.direction });
        }
    }
    const frames = new Map(), uv = new Map();
    let islands = 0, seams = 0;
    const transport = (id, edge) => {
        const frame = frames.get(id), normal = rows[edge.id].normal;
        const angle = Math.atan2(edge.direction.dot(rows[id].normal.clone().cross(normal)), rows[id].normal.dot(normal));
        return { origin: edge.point, offset: uvAt(frame, edge.point),
            u: frame.u.clone().applyAxisAngle(edge.direction, angle), v: frame.v.clone().applyAxisAngle(edge.direction, angle) };
    };
    // Finish an entire polygon before crossing a fold. Otherwise a shortcut
    // around the side of a step can cut its densely triangulated flat top.
    const fillPlane = (start, frame) => {
        const members = [start]; frames.set(start, frame);
        for (let at = 0; at < members.length; at += 1) {
            const id = members[at];
            for (const edge of adjacency[id]) if (!frames.has(edge.id) && rows[start].normal.dot(rows[edge.id].normal) > 0.999999) {
                frames.set(edge.id, transport(id, edge)); members.push(edge.id);
            }
        }
        return members;
    };
    const seed = rows.findIndex((row) => row.mesh === mapping.seed.mesh && row.triangle === mapping.seed.triangle);
    const order = [seed, ...rows.map((_, i) => i)];
    for (const start of order) {
        if (start < 0 || frames.has(start)) continue;
        islands += 1;
        const queue = [fillPlane(start, frameOnPlane(mapping, rows[start].normal))];
        for (let at = 0; at < queue.length; at += 1) {
            for (const id of queue[at]) for (const edge of adjacency[id]) {
                if (frames.has(edge.id)) continue;
                queue.push(fillPlane(edge.id, transport(id, edge)));
            }
        }
    }
    rows.forEach((row, id) => {
        if (!uv.has(row.mesh)) uv.set(row.mesh, new Map());
        const frame = frames.get(id);
        uv.get(row.mesh).set(row.triangle, row.points.flatMap((p) => uvAt(frame, p)));
        for (const edge of adjacency[id]) if (edge.id > id) {
            const other = frames.get(edge.id);
            const points = [edge.point, edge.point.clone().add(edge.direction)];
            if (points.some((p) => new THREE.Vector2(...uvAt(frame, p)).distanceTo(new THREE.Vector2(...uvAt(other, p))) > EPS * 2)) seams += 1;
        }
    });
    return { uv, islands, seams };
}

const cache = new WeakMap();
let revision = 0;
export const mappingKey = (mapping) => JSON.stringify(mapping);
// Group assignments by their reference frame, including across material/mesh boundaries.
export function modelSurfaceMappings(root, overrides) {
    if (!Object.values(overrides ?? {}).some((value) => value.projection === 'surface' || value.faces?.some((rule) => rule.projection === 'surface'))) return new Map();
    const groups = new Map(), meshes = new Map();
    root.updateMatrixWorld(true);
    root.traverse((mesh) => { if (mesh.isMesh) meshes.set(materialMeshKey(mesh, root), mesh); });
    const add = (rule, materialName) => {
        if (rule?.projection !== 'surface' || !rule.mapping) return;
        const key = mappingKey(rule.mapping);
        if (!groups.has(key)) {
            const selections = new Map();
            if (!rule.mapping.seed.asset || rule.mapping.seed.asset === root.userData.materialModel) for (const item of rule.mapping.surfaces ?? []) {
                const mesh = meshes.get(item.mesh);
                if (!mesh) continue;
                const count = triangleCount(sourceGeometry(mesh));
                selections.set(item.mesh, new Set((item.triangles ?? Array.from({ length: count }, (_, t) => t)).filter((t) => t < count)));
            }
            groups.set(key, { mapping: rule.mapping, selections });
        }
        const group = groups.get(key);
        if (rule.mapping.surfaces) return;
        for (const [address, mesh] of meshes) {
            const base = [sourceMaterial(mesh)].flat();
            if (!base.some((material) => material.name === materialName)) continue;
            const targets = rule.targets?.filter((item) => item.mesh === address && (!item.asset || item.asset === root.userData.materialModel));
            if (targets && !targets.length) continue;
            if (rule.mapping.seed.asset && rule.mapping.seed.asset !== root.userData.materialModel) continue;
            const geometry = sourceGeometry(mesh);
            const selected = targets && targets.every((item) => item.triangles) ? targets.flatMap((item) => item.triangles)
                : Array.from({ length: triangleCount(geometry) }, (_, t) => t);
            if (!group.selections.has(address)) group.selections.set(address, new Set());
            for (const t of selected) if (t < triangleCount(geometry) && base[triangleMaterial(geometry, t)]?.name === materialName) group.selections.get(address).add(t);
        }
    };
    for (const [name, value] of Object.entries(overrides ?? {})) { add(value, name); value.faces?.forEach((rule) => add(rule, name)); }
    const signature = JSON.stringify([...groups].map(([key, group]) => [key, [...group.selections].map(([address, triangles]) => {
        const mesh = meshes.get(address);
        return [address, [...triangles].sort((a, b) => a - b), sourceGeometry(mesh).uuid, relative(mesh, root).elements];
    })]));
    if (cache.get(root)?.signature === signature) return cache.get(root).result;
    const result = new Map();
    for (const [key, group] of groups) {
        const entries = [...group.selections].map(([address, triangles]) => ({ mesh: address, triangles: [...triangles].sort((a, b) => a - b),
            geometry: sourceGeometry(meshes.get(address)), matrix: relative(meshes.get(address), root) }));
        result.set(key, { ...unfoldSurface(entries, group.mapping), revision: ++revision });
    }
    cache.set(root, { signature, result });
    return result;
}

// Mapping operations preserve the material on each selected face. A component
// may contain several library materials; turning it must not repaint them all.
export function patchTargetMappings(all, targets, scope, patch) {
    let result = all;
    for (const target of targets) {
        if (scope === 'material') {
            const value = targetOverride(all, target, scope);
            if (value?.material) result = paintTargets(result, [target], scope, { ...value, ...patch(value, target) });
            continue;
        }
        for (const [value, selected] of targetAppearances(all, target)) {
            const { y: ignoredY, skip: ignoredSkip, ...look } = value; // eslint-disable-line no-unused-vars
            const change = patch(value, target);
            if (change) result = paintTargets(result, [{ ...target, triangles: selected }], scope, { ...look, ...change });
        }
    }
    return result;
}

export function projectedSurfaceUV(points, normal, mapping) {
    if (mapping) return points.flatMap((p) => uvAt(frameOnPlane(mapping, normal.clone().normalize()), p));
    const [u, v] = surfaceBasis(normal);
    return points.flatMap((p) => [p.dot(u), p.dot(v)]);
}
