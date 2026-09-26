import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFence, FENCE_DEFAULT, normalizeFence, normalizeFenceSettings, normalizeFenceStyle, TYPE_DEFAULTS } from './settings.js';
import { insideSign, moveFenceNode, segmentCurve, smoothFenceSegment, splitFenceSegment, surfaceSample } from './path.js';
import { fenceLayout, fenceSchedule, profileArea, FENCE_PRISM_FACES } from './layout.js';
import { constrainFencePoint, createFencePicker, fenceSnapEdges } from './snapping.js';
import { createSceneSnapshot, applySceneSnapshot } from '../features/home-scene/lib/sceneCameras.js';

const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} ≠ ${b}`);
const line = (points, style = {}, closed = false) => createFence(points.map(point => ({ point, normal: [0, 1, 0] })), normalizeFenceStyle({ ...FENCE_DEFAULT, ...style }), 'Check', closed);
let f = line([[0, 0, 0], [5, 0, 0], [5, 0, 5]]);
let layout = fenceLayout(f);
assert.equal(layout.posts.length, 5, 'the corner is one shared post');
assert.equal(layout.panels.length, 4);
close(layout.length, 10);
assert.ok(layout.panels.every(p => p.run <= 2.5 + 1e-7));
for (const part of layout.parts) { assert.ok(Number.isFinite(part.volume) && part.volume > 0); assert.ok(part.matrix.elements.every(Number.isFinite)); }

const broken = { ...f, segments: f.segments.map((s, i) => i ? { ...s, enabled: false } : s) };
close(fenceSchedule([broken])[0].length, 5);
assert.equal(fenceLayout(broken).posts.length, 3, 'gap contributes no intermediate or detached end posts');
assert.equal(fenceSchedule([broken])[0].sections, 2);

const varied = { ...f, segments: f.segments.map((s, i) => i ? { ...s, style: normalizeFenceStyle({ ...s.style, ...TYPE_DEFAULTS.brick, type: 'brick', height: 10 }) } : s) };
layout = fenceLayout(varied);
assert.equal(layout.posts.length, 5);
assert.equal(layout.posts.find(p => p.key === f.nodes[1].id).style.postKind, 'brick', 'the stronger corner owns the shared pillar');
assert.ok(layout.parts.some(p => p.kind === 'brick'));
assert.deepEqual(varied.segments[0], f.segments[0], 'a partial type edit leaves its neighbour intact');
assert.equal(normalizeFence(varied).segments[1].style.height, 10, 'no normative height clamp');

for (const reverse of [false, true]) {
    const points = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]];
    if (reverse) points.reverse();
    const square = line(points, { type: 'concrete', ...TYPE_DEFAULTS.concrete, alignment: 'inside' }, true);
    assert.equal(insideSign(square), reverse ? -1 : 1);
    const inner = fenceLayout(square);
    assert.ok(inner.posts.every(p => p.point.x >= .149 && p.point.x <= 9.851 && p.point.z >= .149 && p.point.z <= 9.851), 'inside is independent of winding');
    assert.equal(new Set(inner.posts.map(p => p.key)).size, inner.posts.length, 'closed seam has one post');
}
const outside = fenceLayout(line([[0, 0, 0], [5, 0, 0]], { alignment: 'outside' }));
assert.ok(outside.posts.every(p => p.point.z < 0));

let curve = smoothFenceSegment(f, f.segments[0].id, true);
const originalCurve = segmentCurve(curve, curve.segments[0]);
const curvedPosts = fenceLayout({ ...curve, segments: [curve.segments[0]] }).posts;
assert.ok(curvedPosts[0].tangent.dot(originalCurve.getTangent(0)) > .999, 'first post follows the local spline tangent');
assert.ok(curvedPosts.at(-1).tangent.dot(originalCurve.getTangent(1)) > .999, 'last post follows the local spline tangent');
curve = splitFenceSegment(curve, curve.segments[0].id, .37);
for (let i = 0; i <= 20; i++) {
    const t = i / 20, at = t <= .37 ? segmentCurve(curve, curve.segments[0]).getPoint(t / .37) : segmentCurve(curve, curve.segments[1]).getPoint((t - .37) / .63);
    close(at.distanceTo(originalCurve.getPoint(t)), 0, 'splitting Bezier preserves its shape');
}
const moved = moveFenceNode(curve, curve.nodes[0].id, { point: [1, 2, 3] });
close(moved.segments[0].controls[0][1] - curve.segments[0].controls[0][1], 2, 'handle follows endpoint');

f = line([[0, 0, 0], [5, 1, 0]], { type: 'concrete', ...TYPE_DEFAULTS.concrete });
const sloped = fenceLayout(f);
assert.ok(sloped.length > sloped.planLength);
close(sloped.planLength, 5);
const stepped = fenceLayout({ ...f, segments: f.segments.map(s => ({ ...s, style: { ...s.style, grade: 'step' } })) });
assert.ok(stepped.panels.every(p => p.p.y === p.q.y));
for (const p of stepped.panels) for (const station of [p.a, p.b]) {
    const post = stepped.posts.find(q => q.key === station.key);
    assert.ok(post.point.y + post.height >= p.p.y + p.edge.style.height, 'stepped panel is supported by a full-height post');
}

const wall = line([[0, 0, 0], [5, 0, 0], [5, 0, 5]], { type: 'concrete', postEnabled: false, thickness: .2, height: 2, spacing: 10 });
const wallLayout = fenceLayout(wall), walls = wallLayout.parts.filter(p => p.vertices);
assert.equal(walls.length, 2);
close(walls[0].vertices[1].distanceTo(walls[1].vertices[0]), 0, 'inner miter meets');
close(walls[0].vertices[2].distanceTo(walls[1].vertices[3]), 0, 'outer miter meets');
close(fenceSchedule([wall])[0].materials.concrete, 4, 'wall volume is the actual mitered mesh volume');
for (const part of walls) {
    const centre = part.vertices.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(8);
    for (let i = 0; i < FENCE_PRISM_FACES.length; i += 3) {
        const [a, b, c] = FENCE_PRISM_FACES.slice(i, i + 3).map(k => part.vertices[k]);
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        assert.ok(normal.dot(a.clone().sub(centre)) > 0, 'wall faces point outward, including bottom and miter ends');
    }
}
close(profileArea(.06, .04, .002), .000384, 'hollow section volume');

for (const type of Object.keys(TYPE_DEFAULTS)) {
    const object = line([[0, 0, 0], [6, .5, 0]], { ...TYPE_DEFAULTS[type], type });
    const l = fenceLayout(object), row = fenceSchedule([object])[0];
    assert.ok(l.valid);
    assert.equal(row.cuts.reduce((sum, part) => sum + part.count, 0), l.parts.length, `${type}: schedule uses every rendered part once`);
    close(Object.values(row.materials).reduce((a, b) => a + b, 0), l.parts.reduce((sum, p) => sum + p.volume, 0));
}
const excessive = line([[0, 0, 0], [1000, 0, 0]], { wire: .001, cellWidth: .0001, cellHeight: .0001, height: 10 });
assert.equal(fenceLayout(excessive).valid, false, 'expensive dimensions remain stored but cannot silently produce a partial schedule');
assert.equal(excessive.segments[0].style.height, 10);

f = line([[0, 0, 0], [4, 0, 0]]);
f.segments[0].surface = [[0, 0, 0, 0, 0, 1, 0], [.5, 2, 1, 0, 0, 1, 0], [1, 4, 0, 0, 0, 1, 0]];
close(surfaceSample(f, f.segments[0], .5).point.y, 1, 'intermediate relief is persisted');
const divided = splitFenceSegment(f, f.segments[0].id, .5);
close(divided.nodes.at(-1).point[1], 1);
close(surfaceSample(divided, divided.segments[0], .5).point.y, .5);
const normalized = normalizeFenceSettings({ fenceObjects: [f] });
assert.deepEqual(normalizeFenceSettings(normalized), normalized);
const future = structuredClone(f); future.nodes[0].future = 7; future.segments[0].style.future = 9;
assert.equal(normalizeFence(future).segments[0].style.future, 9);
assert.equal(normalizeFence(future).nodes[0].future, 7);
const root = { fenceObjects: [f] };
assert.ok(!('fenceObjects' in createSceneSnapshot(root, ['fenceObjects'])), 'fences belong to the project, not to one camera');
assert.deepEqual(applySceneSnapshot(root, { fenceObjects: [] }).fenceObjects, [f]);

const constrained = constrainFencePoint({ point: [4, 0, 3], normal: [0, 1, 0] }, { point: [0, 0, 0] }, { distance: 10 });
close(Math.hypot(...constrained.point), 10, 'exact length');
const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(10, 10), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
assert.deepEqual(fenceSnapEdges(geometry).map(edges => edges.filter(Boolean).length), [2, 2], 'the planar diagonal is not a snap edge');
const mesh = new THREE.Mesh(geometry, material); mesh.name = 'placed'; mesh.rotation.x = -Math.PI / 3; scene.add(mesh); scene.updateMatrixWorld(true);
const camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.set(0, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
const picker = createFencePicker(scene, camera, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
const picked = picker.cast({ clientX: 50, clientY: 50 }, { snap: false });
close(Math.hypot(...picked.normal), 1);
assert.ok(picked.normal[1] > .8 && picked.normal[2] > .49, 'surface normal is transformed into world coordinates');
geometry.dispose(); material.dispose();
console.log('Fences: geometry, joins, materials, relief, stock sizes, gaps, Bezier edits, snapshots and snapping passed.');
