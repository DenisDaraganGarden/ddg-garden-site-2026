import * as THREE from 'three';
import { newFenceId } from './settings.js';
const v = p => new THREE.Vector3(...p);
export function segmentCurve(fence, segment) {
    const a = v(fence.nodes.find(n => n.id === segment.a).point), b = v(fence.nodes.find(n => n.id === segment.b).point);
    return segment.controls ? new THREE.CubicBezierCurve3(a, v(segment.controls[0]), v(segment.controls[1]), b) : new THREE.LineCurve3(a, b);
}
export function surfaceSample(fence, segment, t) {
    const curve = segmentCurve(fence, segment);
    const a = fence.nodes.find(n => n.id === segment.a), b = fence.nodes.find(n => n.id === segment.b);
    if (!segment.surface?.length) return { point: curve.getPoint(t), normal: v(a.normal).lerp(v(b.normal), t).normalize() };
    const upper = segment.surface.findIndex(p => p[0] >= t), i = upper < 0 ? segment.surface.length - 1 : Math.max(1, upper);
    const p = segment.surface[i - 1], q = segment.surface[i];
    const u = Math.max(0, Math.min(1, (t - p[0]) / Math.max(1e-8, q[0] - p[0])));
    return { point: v(p.slice(1, 4)).lerp(v(q.slice(1, 4)), u), normal: v(p.slice(4, 7)).lerp(v(q.slice(4, 7)), u).normalize() };
}
export function splitFenceSegment(fence, id, t = .5) {
    const edge = fence.segments.find(s => s.id === id);
    if (!edge) return fence;
    t = THREE.MathUtils.clamp(t, .001, .999);
    const a = fence.nodes.find(n => n.id === edge.a), b = fence.nodes.find(n => n.id === edge.b);
    const at = surfaceSample(fence, edge, t);
    const node = { id: newFenceId('node'), point: at.point.toArray(), normal: at.normal.toArray() };
    const first = { ...edge, b: node.id }, second = { ...edge, id: newFenceId('edge'), a: node.id };
    if (edge.controls) {
        const p0 = v(a.point), p1 = v(edge.controls[0]), p2 = v(edge.controls[1]), p3 = v(b.point);
        const q0 = p0.lerp(p1, t), q1 = p1.clone().lerp(p2, t), q2 = p2.lerp(p3, t);
        const r0 = q0.clone().lerp(q1, t), r1 = q1.lerp(q2, t);
        first.controls = [q0.toArray(), r0.toArray()]; second.controls = [r1.toArray(), q2.toArray()];
    }
    if (edge.surface) {
        const middle = [t, ...node.point, ...node.normal];
        first.surface = [...edge.surface.filter(p => p[0] < t), middle].map(p => [p[0] / t, ...p.slice(1)]);
        second.surface = [middle, ...edge.surface.filter(p => p[0] > t)].map(p => [(p[0] - t) / (1 - t), ...p.slice(1)]);
    }
    return { ...fence, nodes: [...fence.nodes, node], segments: fence.segments.flatMap(s => s.id === id ? [first, second] : [s]) };
}
export function moveFenceNode(fence, id, sample) {
    const old = fence.nodes.find(n => n.id === id);
    if (!old) return fence;
    const delta = v(sample.point).sub(v(old.point));
    return { ...fence, nodes: fence.nodes.map(n => n.id === id ? { ...n, point: sample.point, normal: sample.normal ?? n.normal } : n), segments: fence.segments.map(s => {
        if (s.a !== id && s.b !== id) return s;
        const next = { ...s }; delete next.surface;
        if (s.controls) next.controls = s.controls.map((p, i) => ((i === 0 ? s.a : s.b) === id ? v(p).add(delta).toArray() : p));
        return next;
    }) };
}
export function smoothFenceSegment(fence, id, smooth) {
    return { ...fence, segments: fence.segments.map(s => {
        if (s.id !== id) return s;
        const next = { ...s }; delete next.controls; delete next.surface;
        if (!smooth) return next;
        const a = v(fence.nodes.find(n => n.id === s.a).point), b = v(fence.nodes.find(n => n.id === s.b).point);
        const before = fence.segments.find(e => e.enabled && e.b === s.a), after = fence.segments.find(e => e.enabled && e.a === s.b);
        const p = before ? v(fence.nodes.find(n => n.id === before.a).point) : a;
        const q = after ? v(fence.nodes.find(n => n.id === after.b).point) : b;
        const length = a.distanceTo(b) / 3;
        next.controls = [a.clone().add(b.clone().sub(p).normalize().multiplyScalar(length)).toArray(), b.clone().sub(q.sub(a).normalize().multiplyScalar(length)).toArray()];
        return next;
    }) };
}
// Знак внутренней стороны замкнутого контура определяется обходом, а не
// мировыми осями. Для открытой линии inside = слева по ходу, outside = справа.
export function insideSign(fence) {
    const degree = new Map(fence.nodes.map(n => [n.id, 0]));
    for (const s of fence.segments) { degree.set(s.a, degree.get(s.a) + 1); degree.set(s.b, degree.get(s.b) + 1); }
    if ([...degree.values()].some(d => d !== 2)) return 1;
    let area = 0;
    for (const s of fence.segments) {
        const a = fence.nodes.find(n => n.id === s.a).point, b = fence.nodes.find(n => n.id === s.b).point;
        area += a[0] * b[2] - b[0] * a[2];
    }
    return area < 0 ? -1 : 1;
}
