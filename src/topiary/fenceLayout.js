import * as THREE from 'three';
import { lineLength } from './settings.js';

// Раскладка ограды вдоль линии стриженой формы: секции не длиннее POST_SPAN
// между столбами, по каждому отрезку линии (у плавной — по точкам сплайна).
// Одна на сцену (TopiaryFence.jsx) и ведомость (fenceSchedule): чертёж и
// цифры не расходятся. Метры в системе объекта, до его масштаба.
export const POST_SPAN = 2.4;
export const FENCE_STYLE_LABELS = Object.freeze({
    'mesh-2d': ['Сетка 2D', '2D mesh'],
    'mesh-358': ['Сетка 358', '358 mesh'],
    palisade: ['Металлический частокол', 'Metal palisade'],
});

export function fencePath(object) {
    const points = object.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    if (!object.fenceSmooth || points.length < 3) return points;
    const closed = points[0].distanceTo(points[points.length - 1]) < .01;
    const curve = new THREE.CatmullRomCurve3(closed ? points.slice(0, -1) : points, closed, 'centripetal');
    const length = curve.getLength();
    return curve.getSpacedPoints(Math.max(points.length * 2, Math.ceil(length / POST_SPAN)));
}

// posts — столбы по порядку, без повторов на стыках; panels — секции между
// соседними столбами (span — их длина).
export function fenceLayout(object) {
    const path = fencePath(object);
    const posts = [], panels = [], seen = new Set();
    const post = (x, z) => {
        const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
        if (seen.has(key)) return;
        seen.add(key);
        posts.push([x, z]);
    };
    for (let segment = 0; segment < path.length - 1; segment++) {
        const start = path[segment], end = path[segment + 1];
        const dx = end.x - start.x, dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (length < .02) continue;
        const count = Math.ceil(length / POST_SPAN);
        for (let panel = 0; panel < count; panel++) {
            const a = (panel / count), b = ((panel + 1) / count);
            const x0 = start.x + dx * a, z0 = start.z + dz * a;
            const x1 = start.x + dx * b, z1 = start.z + dz * b;
            post(x0, z0); post(x1, z1);
            panels.push({ x0, z0, x1, z1, span: Math.hypot(x1 - x0, z1 - z0) });
        }
    }
    return { path, posts, panels };
}


// Ведомость изгородей и оград: строка на линию стриженой формы. Длина и
// высота — с масштабом объекта; секции и столбы — штуки.
export function fenceSchedule(objects) {
    return objects.map((object) => {
        const scale = object.scale ?? 1;
        const hedge = object.foliageVisible !== false;
        const fence = object.fenceStyle && object.fenceStyle !== 'none' ? object.fenceStyle : null;
        const layout = fence ? fenceLayout(object) : null;
        const length = (layout ? layout.panels.reduce((sum, panel) => sum + panel.span, 0) : lineLength(object.points)) * scale;
        return {
            id: object.id,
            name: object.name,
            hedge,
            fence,
            length,
            height: object.height * scale,
            width: object.width * scale,
            ...(hedge && object.plant ? { plant: object.plant, perMetre: object.perMetre ?? 0 } : {}),
            ...(layout ? { sections: layout.panels.length, posts: layout.posts.length } : {}),
        };
    }).filter((row) => (row.hedge || row.fence) && row.length > 0);
}
