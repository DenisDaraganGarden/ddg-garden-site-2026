import * as THREE from 'three';
import { insideSign, segmentCurve, surfaceSample } from './path.js';

const UP = new THREE.Vector3(0, 1, 0);
const EPS = 1e-7;
const PART_BUDGET = 60000;
const vec = p => new THREE.Vector3(...p);
const mix = (a, b, t) => a.clone().lerp(b, t);
export const FENCE_PRISM_FACES = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 3, 6, 7, 3, 2, 6, 0, 7, 4, 0, 3, 7, 1, 6, 2, 1, 5, 6];
export function prismVolume(vertices) {
    let volume = 0;
    for (let i = 0; i < FENCE_PRISM_FACES.length; i += 3) {
        const [a, b, c] = FENCE_PRISM_FACES.slice(i, i + 3).map(k => vertices[k]);
        volume += a.dot(b.clone().cross(c)) / 6;
    }
    return Math.abs(volume);
}
export const profileArea = (w, d, wall = 0) => wall > 0 ? w * d - Math.max(0, w - 2 * wall) * Math.max(0, d - 2 * wall) : w * d;
const sideWidth = s => {
    const wall = s.type === 'brick' || s.type === 'concrete', infill = s.type === 'mesh' ? s.wire : s.memberDepth;
    return Math.max(s.postEnabled ? s.postDepth + (s.caps ? 2 * s.capOverhang : 0) : 0,
        wall ? s.thickness : s.type === 'posts' ? 0 : infill,
        !wall && s.type !== 'posts' && s.railCount ? infill + 2 * s.railDepth : 0);
};
const upAt = (s, a, b, t) => s.up === 'normal' ? mix(a, b, t).normalize() : UP.clone();

function pathLayout(fence) {
    const sign = insideSign(fence), nodes = new Map(fence.nodes.map(n => [n.id, n]));
    const ends = new Map(), paths = [];
    for (const edge of fence.segments.filter(s => s.enabled)) {
        const s = edge.style, curve = segmentCurve(fence, edge), a = nodes.get(edge.a), b = nodes.get(edge.b);
        const normalA = vec(a.normal), normalB = vec(b.normal);
        const distance = s.offset + (s.alignment === 'axis' ? 0 : (s.alignment === 'inside' ? sign : -sign) * sideWidth(s) / 2);
        const sample = t => {
            const surface = edge.surface ? surfaceSample(fence, edge, t) : null;
            const tangent = curve.getTangent(t).normalize(), up = surface && s.up === 'normal' ? surface.normal : upAt(s, normalA, normalB, t);
            const side = tangent.clone().cross(up).normalize();
            return { point: (surface?.point ?? curve.getPoint(t)).addScaledVector(side, distance), up, tangent, t };
        };
        const start = sample(0), end = sample(1);
        for (const [id, at] of [[edge.a, start], [edge.b, end]]) {
            if (!ends.has(id)) ends.set(id, []);
            ends.get(id).push({ at, distance });
        }
        paths.push({ edge, curve, start, end, sample });
    }
    // Две смещённые оси встречаются в одной точке. Предел косого стыка
    // защищает почти развёрнутый угол; там получается короткий скошенный узел.
    for (const [id, list] of ends) {
        if (list.length !== 2) continue;
        const [a, b] = list.map(item => item.at), r = a.point.clone().sub(b.point);
        const dot = a.tangent.dot(b.tangent), denominator = 1 - dot * dot;
        let joined = mix(a.point, b.point, .5);
        if (denominator > .00001) {
            const t = (dot * b.tangent.dot(r) - a.tangent.dot(r)) / denominator;
            const candidate = a.point.clone().addScaledVector(a.tangent, t);
            if (candidate.distanceTo(vec(nodes.get(id).point)) <= 4 * Math.max(.02, ...list.map(item => Math.abs(item.distance)))) joined = candidate;
        }
        a.point.copy(joined); b.point.copy(joined);
    }
    return paths;
}

// Единый результат для мешей и ведомости. Ведомость не оценивает детали
// повторной формулой: каждый отрисованный элемент уже имеет объём и длину.
export function fenceLayout(fence) {
    const paths = pathLayout(fence), posts = new Map(), panels = [], parts = [], warnings = [];
    let length = 0, planLength = 0;
    const reserve = count => { if (parts.length + count > PART_BUDGET) throw new Error('detail-budget'); };
    const addBox = (role, owner, centre, x, up, width, height, depth, kind, material, wall = 0, round = false) => {
        if (Math.min(width, height, depth) <= EPS) return;
        reserve(1);
        const y = up.clone().normalize(), xx = x.clone().addScaledVector(y, -x.dot(y)).normalize();
        if (xx.lengthSq() < .5) xx.set(1, 0, 0).addScaledVector(y, -y.x).normalize();
        if (xx.lengthSq() < .5) xx.set(0, 0, 1);
        const z = xx.clone().cross(y).normalize();
        const matrix = new THREE.Matrix4().makeBasis(xx, y, z).scale(new THREE.Vector3(width, height, depth)).setPosition(centre);
        parts.push({ role, owner, matrix, kind, material, width, depth, length: height, volume: (round ? Math.PI * width * depth / 4 : profileArea(width, depth, wall)) * height, wall, round });
    };
    const addBeam = (role, edge, a, b, width, depth, kind, material, wall = 0, round = false) => {
        const up = b.clone().sub(a), span = up.length();
        if (span <= EPS) return;
        up.divideScalar(span);
        let x = UP.clone().cross(up).normalize();
        if (x.lengthSq() < .5) x = new THREE.Vector3(1, 0, 0);
        addBox(role, edge.id, mix(a, b, .5), x, up, width, span, depth, kind, material, wall, round);
    };
    try {
        for (const path of paths) {
            const { edge, curve, sample, start, end } = path, s = edge.style;
            const samples = Math.min(512, Math.max(1, Math.ceil(curve.getLength() / .1)));
            const rawStart = sample(0).point, rawEnd = sample(1).point;
            const shiftA = start.point.clone().sub(rawStart), shiftB = end.point.clone().sub(rawEnd);
            const arc = [], total = [0];
            for (let i = 0; i <= samples; i++) {
                const at = sample(i / samples);
                at.point.add(mix(shiftA, shiftB, i / samples));
                arc.push(at);
                if (i) total.push(total[i - 1] + at.point.distanceTo(arc[i - 1].point));
            }
            const span = total.at(-1);
            if (span < .001) continue;
            const count = Math.ceil(span / s.spacing);
            if (posts.size + panels.length + count > PART_BUDGET) throw new Error('detail-budget');
            const stations = [];
            let search = 1;
            const level = Math.max(...arc.map(at => at.point.y));
            for (let i = 0; i <= count; i++) {
                const distance = span * i / count;
                while (search < total.length - 1 && total[search] < distance) search++;
                const t = (distance - total[search - 1]) / Math.max(EPS, total[search] - total[search - 1]);
                const station = { point: mix(arc[search - 1].point, arc[search].point, t), up: mix(arc[search - 1].up, arc[search].up, t).normalize() };
                const tangent = arc[search].point.clone().sub(arc[search - 1].point).normalize();
                station.key = i === 0 ? edge.a : i === count ? edge.b : `${edge.id}:${i}`;
                stations.push(station);
                if (s.postEnabled) {
                    const existing = posts.get(station.key);
                    const height = s.height + s.clearance + s.postExtra + (s.grade === 'level' ? level - station.point.y : 0);
                    if (!existing) posts.set(station.key, { ...station, style: s, owner: edge.id, height, tangent });
                    else {
                        existing.height = Math.max(existing.height, height);
                        // На смене типов узлом владеет более широкая опора.
                        if (s.postWidth * s.postDepth > existing.style.postWidth * existing.style.postDepth) { existing.style = s; existing.owner = edge.id; }
                    }
                }
            }
            for (let i = 0; i < count; i++) {
                const a = stations[i], b = stations[i + 1];
                const run = a.point.distanceTo(b.point);
                const horizontal = Math.hypot(b.point.x - a.point.x, b.point.z - a.point.z);
                length += run; planLength += horizontal;
                if (s.type === 'posts') continue;
                let p = a.point.clone(), q = b.point.clone();
                if (s.grade === 'step') {
                    const y = Math.max(p.y, q.y); p.y = y; q.y = y;
                    for (const station of [a, b]) { const post = posts.get(station.key); if (post) post.height = Math.max(post.height, y - post.point.y + s.height + s.clearance + s.postExtra); }
                }
                if (s.grade === 'level') { p.y = level; q.y = level; }
                panels.push({ edge, a, b, p, q, run, horizontal });
            }
        }
        for (const post of posts.values()) {
            const s = post.style;
            addBox('post', post.owner, post.point.clone().addScaledVector(post.up, post.height / 2), post.tangent, post.up, s.postWidth, post.height, s.postDepth, s.postKind, s.postMaterial, s.postKind === 'metal' ? s.postWall : 0);
            if (s.caps) addBox('cap', post.owner, post.point.clone().addScaledVector(post.up, post.height + s.capHeight / 2), post.tangent, post.up, s.postWidth + 2 * s.capOverhang, s.capHeight, s.postDepth + 2 * s.capOverhang, s.postKind, s.capMaterial || s.postMaterial);
        }
        const panelJoints = new Map();
        for (const panel of panels) for (const station of [panel.a, panel.b]) {
            if (!panelJoints.has(station.key)) panelJoints.set(station.key, []);
            panelJoints.get(station.key).push(panel);
        }
        for (const panel of panels) {
            const { edge, a, b } = panel, s = edge.style;
            const x = panel.q.clone().sub(panel.p).normalize();
            const clearance = station => {
                const post = posts.get(station.key);
                if (!post) return 0;
                const tangent = post.tangent.clone().addScaledVector(post.up, -post.tangent.dot(post.up)).normalize();
                const along = Math.abs(x.dot(tangent)), across = Math.abs(x.dot(tangent.clone().cross(post.up)));
                return Math.max(0, Math.min(post.style.postWidth / (2 * Math.max(EPS, along)), post.style.postDepth / (2 * Math.max(EPS, across))));
            };
            const insetA = clearance(a), insetB = clearance(b);
            const available = panel.p.distanceTo(panel.q) - insetA - insetB;
            if (available < .001) { warnings.push({ edge: edge.id, code: 'short-panel' }); continue; }
            const p = panel.p.clone().addScaledVector(x, insetA).addScaledVector(a.up, s.clearance);
            const q = panel.q.clone().addScaledVector(x, -insetB).addScaledVector(b.up, s.clearance);
            panel.clear = available;
            if (s.type === 'concrete' || s.type === 'brick') {
                reserve(1);
                const side = x.clone().cross(mix(a.up, b.up, .5)).normalize().multiplyScalar(s.thickness / 2);
                // Четыре нижние вершины + четыре верхние: верх и низ следуют
                // рельефу, опоры остаются вертикальными либо по нормали.
                const corner = (station, centre, sign) => {
                    const start = centre.clone().addScaledVector(side, sign);
                    if (posts.has(station.key)) return start;
                    const neighbors = panelJoints.get(station.key).filter(other => other !== panel);
                    if (neighbors.length !== 1 || !['concrete', 'brick'].includes(neighbors[0].edge.style.type)) return start;
                    const other = neighbors[0], direction = other.q.clone().sub(other.p).normalize();
                    const otherUp = other.a.key === station.key ? other.a.up : other.b.up;
                    const flip = (a.key === station.key) === (other.a.key === station.key) ? -1 : 1;
                    const second = centre.clone().addScaledVector(direction.clone().cross(otherUp).normalize(), sign * flip * other.edge.style.thickness / 2);
                    const dot = x.dot(direction), den = 1 - dot * dot;
                    if (den < .00001) return mix(start, second, .5);
                    const r = start.clone().sub(second), t = (dot * direction.dot(r) - x.dot(r)) / den;
                    const at = start.clone().addScaledVector(x, t);
                    return at.distanceTo(centre) < 4 * Math.max(s.thickness, other.edge.style.thickness) ? at : mix(start, second, .5);
                };
                const base = [corner(a, p, -1), corner(b, q, -1), corner(b, q, 1), corner(a, p, 1)];
                const vertices = [...base, ...base.map((pt, i) => pt.clone().addScaledVector(i === 1 || i === 2 ? b.up : a.up, s.height))];
                parts.push({ role: 'panel', owner: edge.id, vertices, width: s.thickness, depth: s.height, length: available, volume: prismVolume(vertices), kind: s.type, material: s.panelMaterial, wall: 0 });
                continue;
            }
            const timber = s.type === 'timber' || s.type === 'boards', kind = timber ? 'timber' : 'metal';
            const count = s.type === 'boards' ? Math.max(1, Math.floor((s.height + s.memberGap) / (s.memberWidth + s.memberGap)))
                : s.type === 'mesh' ? Math.max(1, Math.ceil(available / s.cellWidth))
                    : Math.max(1, Math.floor((available + s.memberGap) / (s.memberWidth + s.memberGap)));
            reserve(count + s.railCount + (s.type === 'mesh' ? Math.ceil(s.height / s.cellHeight) + 1 : 0));
            if (s.type === 'boards') {
                for (let i = 0; i < count; i++) {
                    const y = count === 1 ? s.height / 2 : s.memberWidth / 2 + i * (s.height - s.memberWidth) / (count - 1);
                    addBeam('infill', edge, p.clone().addScaledVector(a.up, y), q.clone().addScaledVector(b.up, y), s.memberDepth, Math.min(s.height, s.memberWidth), kind, s.panelMaterial);
                }
            } else {
                const n = s.type === 'mesh' ? count + 1 : count;
                for (let i = 0; i < n; i++) {
                    const margin = s.type === 'mesh' ? s.wire / 2 : Math.min(s.memberWidth, available) / 2;
                    const t = n === 1 ? .5 : (margin + i * (available - 2 * margin) / (n - 1)) / available;
                    const up = mix(a.up, b.up, t).normalize();
                    addBox('infill', edge.id, mix(p, q, t).addScaledVector(up, s.height / 2), x, up,
                        s.type === 'mesh' ? s.wire : Math.min(s.memberWidth, available), s.height, s.type === 'mesh' ? s.wire : s.memberDepth, kind, s.panelMaterial,
                        s.type === 'metal' ? s.memberWall : 0, s.type === 'mesh');
                }
            }
            if (s.type === 'mesh') {
                const rows = Math.max(1, Math.ceil(s.height / s.cellHeight));
                for (let i = 0; i <= rows; i++) addBeam('wire', edge, p.clone().addScaledVector(a.up, i * s.height / rows), q.clone().addScaledVector(b.up, i * s.height / rows), s.wire, s.wire, 'metal', s.panelMaterial, 0, true);
            }
            for (let i = 0; i < s.railCount; i++) {
                const y = s.height * (i + 1) / (s.railCount + 1), side = x.clone().cross(mix(a.up, b.up, .5)).normalize().multiplyScalar(-((s.type === 'mesh' ? s.wire : s.memberDepth) + s.railDepth) / 2);
                addBeam('rail', edge, p.clone().add(side).addScaledVector(a.up, y), q.clone().add(side).addScaledVector(b.up, y), s.railDepth, s.railWidth, kind, s.railMaterial || s.panelMaterial, timber ? 0 : s.railWall);
            }
        }
    } catch (error) {
        if (error.message !== 'detail-budget') throw error;
        // Никакого молчаливого урезания размеров/спецификации. Перегруженный
        // объект сохраняется целиком, но не выдаёт частичную ведомость.
        return { fence, parts: [], posts: [], panels: [], length: 0, planLength: 0, warnings: [{ code: 'detail-budget' }], valid: false };
    }
    return { fence, parts, posts: [...posts.values()], panels, length, planLength, warnings, valid: true };
}

export function fenceSchedule(fences) {
    return fences.map(fence => {
        const layout = fenceLayout(fence), materials = { metal: 0, timber: 0, concrete: 0, brick: 0 }, cuts = new Map();
        for (const part of layout.parts) {
            materials[part.kind] += part.volume;
            const profile = part.round ? `Ø ${(part.width * 1000).toFixed(1)}` : `${(part.width * 1000).toFixed(1)} × ${(part.depth * 1000).toFixed(1)}${part.wall ? ` × ${(part.wall * 1000).toFixed(1)}` : ''}`;
            const key = `${part.role}:${part.kind}:${part.material}:${profile}:${part.length.toFixed(4)}`;
            if (!cuts.has(key)) cuts.set(key, { key, role: part.role, kind: part.kind, material: part.material, profile, length: part.length, count: 0, volume: 0 });
            const row = cuts.get(key); row.count++; row.volume += part.volume;
        }
        return { id: fence.id, name: fence.name, valid: layout.valid, warnings: layout.warnings, length: layout.length, planLength: layout.planLength, posts: layout.posts.length,
            sections: layout.panels.filter(p => p.clear > 0).length, caps: layout.parts.filter(p => p.role === 'cap').length, materials, cuts: [...cuts.values()],
            heights: [...new Set(fence.segments.filter(s => s.enabled).map(s => s.style.height))],
            spans: layout.panels.filter(p => p.clear > 0).map(p => ({ edge: p.edge.id, length: p.run, clear: p.clear, height: p.edge.style.height })) };
    });
}
