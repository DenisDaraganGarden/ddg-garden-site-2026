import * as THREE from 'three';

const edgeCache = new WeakMap();
// Диагональ триангуляции плоского полигона не является ребром построения.
// Копии вершин на швах UV свариваются только для поиска, модель не меняется.
export function fenceSnapEdges(geometry) {
    if (edgeCache.has(geometry)) return edgeCache.get(geometry);
    const position = geometry.attributes.position, index = geometry.index, ids = new Map(), weld = [];
    for (let i = 0; i < position.count; i++) {
        const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
        if (!ids.has(key)) ids.set(key, ids.size);
        weld[i] = ids.get(key);
    }
    const edgeKey = (a, b) => [weld[a], weld[b]].sort((x, y) => x - y).join(':');
    const edges = new Map(), faces = [];
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
        const vertices = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
        const [a, b, c] = vertices.map(k => new THREE.Vector3().fromBufferAttribute(position, k));
        const normal = b.sub(a).cross(c.sub(a)).normalize(), keys = [];
        for (let k = 0; k < 3; k++) {
            const key = edgeKey(vertices[k], vertices[(k + 1) % 3]); keys.push(key);
            if (!edges.has(key)) edges.set(key, []);
            edges.get(key).push(normal);
        }
        faces.push(keys);
    }
    const result = faces.map(keys => keys.map(key => {
        const normals = edges.get(key);
        return normals.length !== 2 || Math.abs(normals[0].dot(normals[1])) < .9999;
    }));
    edgeCache.set(geometry, result); return result;
}

const visibleSolid = object => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return !object.userData.faceNormal && !object.userData.crownPlan && materials.some(m => m && !m.transparent && !(m.alphaTest > 0));
};
export function screenPoint(point, camera, rect) {
    const p = point.clone().project(camera);
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, visible: p.z >= -1 && p.z <= 1 };
}
export function closestScreenSegment(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return { t, distance: Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t) };
}
export function createFencePicker(scene, camera, canvas, terrainQuery) {
    const ray = new THREE.Raycaster(), normalMatrix = new THREE.Matrix3();
    const cast = (event, { snap = true, planeY = 0, nodes = [] } = {}) => {
        const rect = canvas.getBoundingClientRect(), mouse = { x: event.clientX, y: event.clientY };
        ray.setFromCamera({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 }, camera);
        const roots = [scene.getObjectByName('placed'), scene.getObjectByName('ground-plane')].filter(Boolean);
        const hit = ray.intersectObjects(roots, true).find(h => h.distance < 5000 && visibleSolid(h.object));
        const terrain = terrainQuery?.raycast(ray.ray.origin, ray.ray.direction, hit?.distance ?? 5000);
        let found;
        if (terrain && (!hit || terrain.distance < hit.distance)) found = { point: terrain.point.toArray ? terrain.point.toArray() : [terrain.point.x, terrain.point.y, terrain.point.z], normal: [terrain.normal.x, terrain.normal.y, terrain.normal.z], kind: 'surface' };
        else if (hit) {
            const normal = hit.face?.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize() ?? new THREE.Vector3(0, 1, 0);
            if (normal.dot(ray.ray.direction) > 0) normal.negate();
            found = { point: hit.point.toArray(), normal: normal.toArray(), kind: 'surface' };
            if (snap && hit.face && !hit.object.isInstancedMesh) {
                const position = hit.object.geometry.attributes.position;
                const vertices = [hit.face.a, hit.face.b, hit.face.c].map(i => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(hit.object.matrixWorld));
                const edges = fenceSnapEdges(hit.object.geometry)[hit.faceIndex] ?? [true, true, true];
                let best = 12, picked = null;
                for (const [i, vertex] of vertices.entries()) {
                    if (!edges[i] && !edges[(i + 2) % 3]) continue;
                    const p = screenPoint(vertex, camera, rect), distance = Math.hypot(p.x - mouse.x, p.y - mouse.y);
                    if (p.visible && distance < best) { best = distance; picked = { point: vertex.toArray(), kind: 'vertex' }; }
                }
                if (!picked) for (let i = 0; i < 3; i++) {
                    if (!edges[i]) continue;
                    const a = vertices[i], b = vertices[(i + 1) % 3];
                    const projectedA = screenPoint(a, camera, rect), projectedB = screenPoint(b, camera, rect);
                    if (!projectedA.visible || !projectedB.visible) continue;
                    const near = closestScreenSegment(mouse, projectedA, projectedB);
                    if (near.distance < best) {
                        const onEdge = new THREE.Vector3(); ray.ray.distanceSqToSegment(a, b, new THREE.Vector3(), onEdge);
                        best = near.distance; picked = { point: onEdge.toArray(), kind: 'edge' };
                    }
                }
                if (picked) found = { ...found, ...picked };
            }
        } else {
            const at = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3());
            if (at && ray.ray.origin.distanceTo(at) < 5000) found = { point: at.toArray(), normal: [0, 1, 0], kind: 'plane' };
        }
        if (snap) {
            let best = 12;
            for (const node of nodes) {
                const p = screenPoint(new THREE.Vector3(...node.point), camera, rect), distance = Math.hypot(p.x - mouse.x, p.y - mouse.y);
                if (p.visible && distance < best) { best = distance; found = { point: [...node.point], normal: [...node.normal], kind: 'vertex' }; }
            }
        }
        return found ?? null;
    };
    // Измерение опорной поверхности вдоль уже заданной оси. Берём ближайшую
    // к построению грань, а не самую высокую крышу во всём проекте.
    const project = (point, normal, reach = 2) => {
        const up = new THREE.Vector3(...normal).normalize(), p = new THREE.Vector3(...point);
        if (up.lengthSq() < .5) up.set(0, 1, 0);
        const roots = [scene.getObjectByName('placed'), scene.getObjectByName('ground-plane')].filter(Boolean);
        const probe = new THREE.Raycaster(p.clone().addScaledVector(up, reach), up.clone().negate(), 0, reach * 2);
        const hits = probe.intersectObjects(roots, true).filter(h => visibleSolid(h.object));
        const terrain = terrainQuery?.raycast(probe.ray.origin, probe.ray.direction, reach * 2);
        const choices = hits.map(hit => ({ point: hit.point, normal: hit.face?.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize() ?? up.clone() }));
        if (terrain) choices.push({ point: new THREE.Vector3(terrain.point.x, terrain.point.y, terrain.point.z), normal: new THREE.Vector3(terrain.normal.x, terrain.normal.y, terrain.normal.z) });
        choices.sort((a, b) => a.point.distanceToSquared(p) - b.point.distanceToSquared(p));
        const found = choices[0];
        if (!found) return { point, normal };
        if (found.normal.dot(up) < 0) found.normal.negate();
        return { point: found.point.toArray(), normal: found.normal.toArray() };
    };
    return { cast, project };
}
export function constrainFencePoint(sample, previous, { axis = false, distance = 0 } = {}) {
    if (!sample || !previous) return sample;
    const a = new THREE.Vector3(...previous.point), p = new THREE.Vector3(...sample.point), delta = p.clone().sub(a);
    if (axis) {
        const dimension = Math.abs(delta.x) >= Math.abs(delta.z) ? 'x' : 'z';
        p[dimension === 'x' ? 'z' : 'x'] = a[dimension === 'x' ? 'z' : 'x'];
    }
    if (distance > 0 && p.distanceTo(a) > 1e-7) p.sub(a).setLength(distance).add(a);
    return { ...sample, point: p.toArray(), kind: distance > 0 ? 'length' : axis ? 'axis' : sample.kind };
}
