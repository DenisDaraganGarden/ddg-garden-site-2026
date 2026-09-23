// Run: node src/placed/waterline.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { waterlineCircles, waterlineCrossings } from './waterline.js';

// A four-metre box standing half in the water: its waterline is its square
// outline at y = 0, the circles run round that square, and a box wholly above
// or wholly under the water has no waterline at all.
const box = (y) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4, 8, 4, 8));
    mesh.position.set(10, y, -5);
    group.add(mesh);
    return group;
};

{
    const points = waterlineCrossings(box(0.3));
    assert.ok(points.length > 20, `crossings found (${points.length / 2})`);
    for (let i = 0; i < points.length; i += 2) {
        const dx = Math.abs(points[i] - 10), dz = Math.abs(points[i + 1] + 5);
        assert.ok(Math.abs(Math.max(dx, dz) - 2) < 1e-6, 'every crossing lies on the box outline');
    }
    const circles = waterlineCircles(points, 12);
    assert.ok(circles.length >= 6 && circles.length <= 12, `a ring of circles (${circles.length})`);
    for (const { x, z, radius } of circles) {
        assert.ok(Math.abs(Math.max(Math.abs(x - 10), Math.abs(z + 5)) - 2) < radius, 'each circle sits on the outline');
    }
    // Round the square: a circle on each of its four sides.
    const sides = new Set(circles.map(({ x, z }) => (Math.abs(x - 10) > Math.abs(z + 5) ? (x > 10 ? 'E' : 'W') : (z > -5 ? 'S' : 'N'))));
    assert.equal(sides.size, 4, 'the circles go all the way round');
}

assert.equal(waterlineCrossings(box(3)).length, 0, 'wholly above: no waterline');
assert.equal(waterlineCrossings(box(-3)).length, 0, 'wholly under: no waterline');
assert.deepEqual(waterlineCircles([]), []);

console.log('waterline: a box half in the water is ringed on all four sides, none above or under');
