import * as THREE from 'three';

// Where a model stands in the water: the line its surface crosses the still
// sea level along, as a few circles for the foam field to break the water
// against (foamField.js, waterWake.js obstacles). The circles follow the line
// round the shape — a reef is a ragged ring of them, not one disc — at about
// a metre apart, few enough for a shader loop.

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
// A scan can be millions of triangles; the waterline needs a few thousand.
const TRIANGLE_BUDGET = 200000;

// World (x, z) of every point where a triangle edge crosses y = level.
export function waterlineCrossings(root, level = 0) {
    const points = [];
    root.updateMatrixWorld(true);
    root.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const triangles = (index ? index.count : position.count) / 3;
        const stride = Math.max(1, Math.floor(triangles / TRIANGLE_BUDGET));
        const vertex = (k, out) => out.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
        for (let t = 0; t < triangles; t += stride) {
            vertex(t * 3, a); vertex(t * 3 + 1, b); vertex(t * 3 + 2, c);
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                const dp = p.y - level, dq = q.y - level;
                if (dp * dq >= 0) continue;
                const t2 = dp / (dp - dq);
                points.push(p.x + (q.x - p.x) * t2, p.z + (q.z - p.z) * t2);
            }
        }
    });
    return points;
}

// The crossings gathered into at most `count` circles (x, z, radius): the
// points binned on a grid, the grid coarsened until few enough cells remain,
// each cell a circle at its points' middle reaching its corners.
export function waterlineCircles(points, count = 12, cell = .8) {
    if (points.length < 2) return [];
    for (let size = cell; ; size *= 1.5) {
        const cells = new Map();
        for (let i = 0; i < points.length; i += 2) {
            const key = `${Math.floor(points[i] / size)},${Math.floor(points[i + 1] / size)}`;
            const bin = cells.get(key) ?? cells.set(key, { x: 0, z: 0, n: 0 }).get(key);
            bin.x += points[i]; bin.z += points[i + 1]; bin.n += 1;
        }
        if (cells.size <= count) return [...cells.values()].map(({ x, z, n }) => ({ x: x / n, z: z / n, radius: size * .75 }));
    }
}
