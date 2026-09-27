import { insideBed, spacingFor } from './fillBed.js';
import { vineRoot } from './vines.js';

// Геометрия посадочного чертежа в метрах. Один контракт для WebGL, SVG и
// будущего CAD-экспорта: источники/идентификаторы, группы, связи, номера.
// Число в выноске — экземпляры группы, не количество к закупке с запасом.
export const PLANT_PLAN_VERSION = 1;
export const planHeight = (plant, instance) => instance.vine ? 0.3 : Math.max(0, Number(plant?.height) || 0) * (instance.scale ?? 1);
export const planOpacity = (height) => Math.max(0.10, Math.min(0.62, 0.66 / (1 + Math.max(0, height) * 0.42)));
export const planRadius = (plant, instance) => instance.vine ? 0.28 : Math.max(0.06, (Number(plant?.spread) || 0.5) * (instance.scale ?? 1) / 2);
const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function throughBed(a, b, bed) {
    if (!bed) return true;
    if (!insideBed(bed, (a.x + b.x) / 2, (a.z + b.z) / 2)) return false;
    for (const ring of [bed.points, ...(bed.holes ?? [])]) {
        for (let i = 0; i < ring.length; i += 1) {
            const p = { x: ring[i][0], z: ring[i][1] }, q = { x: ring[(i + 1) % ring.length][0], z: ring[(i + 1) % ring.length][1] };
            if (cross(a, b, p) * cross(a, b, q) < -1e-12 && cross(p, q, a) * cross(p, q, b) < -1e-12) return false;
        }
    }
    return true;
}

export function plantingGroups(instances, library, beds = []) {
    const scopes = new Map(), bedOf = new Map(beds.map((bed) => [bed.id, bed]));
    for (const item of instances) {
        const scope = `${item.bed ?? 'single'}|${item.plant}|${item.existing ? 'existing' : 'new'}|${item.vine ? item.id : 'plant'}`;
        if (!scopes.has(scope)) scopes.set(scope, []);
        scopes.get(scope).push(item);
    }
    const groups = [];
    for (const [scope, raw] of scopes) {
        const members = [...raw].sort((a, b) => compareId(a.id ?? '', b.id ?? '') || a.x - b.x || a.z - b.z);
        const plant = library.get(members[0].plant), bed = bedOf.get(members[0].bed);
        const spacing = plant?.density > 0 ? spacingFor(plant.density * (bed?.density ?? 1)) : Number(plant?.spread) || 0.5;
        const woody = ['tree', 'conifer', 'shrub', 'topiary'].includes(plant?.category);
        const reach = Math.max(0.18, spacing * 1.65, woody ? (Number(plant?.spread) || 0.5) * 1.15 : 0);
        const parent = members.map((_, i) => i), edges = [], buckets = new Map();
        const root = (i) => { let r = i; while (parent[r] !== r) r = parent[r]; while (parent[i] !== i) { const next = parent[i]; parent[i] = r; i = next; } return r; };
        members.forEach((p, i) => {
            const x = Math.floor(p.x / reach), z = Math.floor(p.z / reach);
            for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
                for (const j of buckets.get(`${x + dx}:${z + dz}`) ?? []) {
                    const q = members[j], distance = Math.hypot(p.x - q.x, p.z - q.z);
                    if (distance <= reach && throughBed(p, q, bed)) edges.push({ a: j, b: i, distance });
                }
            }
            const key = `${x}:${z}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(i);
        });
        // Короткое дерево связей без циклов; соседние цветники и разные виды
        // никогда не объединяются, дорожки/дыры контура не пересекаются.
        edges.sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b);
        const links = [];
        for (const edge of edges) {
            const a = root(edge.a), b = root(edge.b);
            if (a === b) continue;
            parent[b] = a;
            links.push([members[edge.a], members[edge.b]]);
        }
        const components = new Map();
        members.forEach((member, i) => {
            const key = root(i);
            if (!components.has(key)) components.set(key, { id: `${scope}|${member.id ?? `${member.x}:${member.z}`}`, plant: member.plant, bed: member.bed, existing: Boolean(member.existing), members: [], links: [] });
            components.get(key).members.push(member);
        });
        const owner = new Map();
        for (const group of components.values()) for (const member of group.members) owner.set(member, group);
        for (const link of links) owner.get(link[0]).links.push(link);
        for (const group of components.values()) {
            const cx = group.members.reduce((sum, p) => sum + p.x, 0) / group.members.length;
            const cz = group.members.reduce((sum, p) => sum + p.z, 0) / group.members.length;
            // Выноска приходит в настоящее растение, а не в пустой центр
            // вогнутой группы. Ничья точка посадки не меняется.
            group.anchor = group.members.reduce((best, p) => Math.hypot(p.x - cx, p.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? p : best);
            group.count = group.members.length;
            groups.push(group);
        }
    }
    return groups.sort((a, b) => compareId(a.id, b.id));
}

export function makePlantingDrawing({ instances, vines = [], beds, library, schedule }) {
    const numberOf = new Map(schedule.map((row, index) => [row.plant.id, index + 1]));
    const plants = [...instances, ...vines.map((vine) => {
        const [x, y, z] = vineRoot(vine);
        return { id: `vine:${vine.id}`, plant: vine.plant, x, y, z, scale: 1, vine: true };
    })];
    const groups = plantingGroups(plants, library, beds).map((group) => ({ ...group, number: numberOf.get(group.plant) ?? null }));
    const totals = new Map();
    for (const group of groups) totals.set(group.plant, (totals.get(group.plant) ?? 0) + group.count);
    const mismatches = schedule.filter((row) => (totals.get(row.plant.id) ?? 0) !== row.count).map((row) => row.plant.id);
    return { version: PLANT_PLAN_VERSION, units: 'm', plants, groups, numberOf, mismatches };
}

export function planProjector(bearing = 0) {
    const angle = bearing * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    return (p) => ({ x: p.x * c + p.z * s, y: -p.x * s + p.z * c });
}

export function drawingBounds(plants, library, project, beds = []) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, radius = 0) => { x0 = Math.min(x0, x - radius); y0 = Math.min(y0, y - radius); x1 = Math.max(x1, x + radius); y1 = Math.max(y1, y + radius); };
    for (const p of plants) { const q = project(p); add(q.x, q.y, planRadius(library.get(p.plant), p)); }
    for (const bed of beds) for (const [x, z] of bed.points) { const q = project({ x, z }); add(q.x, q.y); }
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    return { x0: x0 - 0.3, y0: y0 - 0.3, x1: x1 + 0.3, y1: y1 + 0.3 };
}

// Фиксированные поля и кегль листа: если выносок много, делим группы на
// фрагменты. Не уменьшаем текст и не пропускаем «лишние» номера.
export const PLAN_SHEET = Object.freeze({ width: 1000, height: 1100, top: 74, bottom: 990, left: 136, right: 864, row: 28, font: 14, groups: 44 });
export function drawingSheets(drawing, library, bearing = 0) {
    const project = planProjector(bearing), result = [];
    const split = (groups) => {
        const plants = groups.flatMap((group) => group.members), bounds = drawingBounds(plants, library, project);
        const scale = Math.min((PLAN_SHEET.right - PLAN_SHEET.left) / (bounds.x1 - bounds.x0), (PLAN_SHEET.bottom - PLAN_SHEET.top) / (bounds.y1 - bounds.y0));
        const smallest = plants.reduce((min, p) => Math.min(min, planRadius(library.get(p.plant), p) * scale), Infinity);
        const labelsFit = groups.length <= PLAN_SHEET.groups && !planLeadersOverlap(layoutPlanLabels(groups, sheetProjection(bounds, bearing).at));
        if (groups.length <= 1 || (labelsFit && new Set(groups.map((group) => group.plant)).size <= 14 && (smallest >= 3.5 || groups.length <= 8))) {
            result.push({ groups, plants, bounds }); return;
        }
        const axis = bounds.x1 - bounds.x0 > bounds.y1 - bounds.y0 ? 'x' : 'y';
        const sorted = [...groups].sort((a, b) => project(a.anchor)[axis] - project(b.anchor)[axis] || compareId(a.id, b.id));
        const mid = Math.ceil(sorted.length / 2);
        split(sorted.slice(0, mid)); split(sorted.slice(mid));
    };
    if (drawing.groups.length) split(drawing.groups);
    return result.map((sheet, i) => ({ ...sheet, number: i + 1 }));
}

export function sheetProjection(bounds, bearing = 0) {
    const frame = PLAN_SHEET, project = planProjector(bearing);
    const scale = Math.min((frame.right - frame.left) / (bounds.x1 - bounds.x0), (frame.bottom - frame.top) / (bounds.y1 - bounds.y0));
    const cx = (frame.left + frame.right) / 2, cy = (frame.top + frame.bottom) / 2;
    const width = (bounds.x1 - bounds.x0) * scale, height = (bounds.y1 - bounds.y0) * scale;
    return { scale, rect: { x: cx - width / 2, y: cy - height / 2, width, height }, at: (p) => { const q = project(p); return { x: cx + (q.x - (bounds.x0 + bounds.x1) / 2) * scale, y: cy + (q.y - (bounds.y0 + bounds.y1) / 2) * scale }; } };
}

// Два внешних поля: строки в порядке опор по Y, с гарантированным зазором.
// Даже при совпадающих опорах текстовые прямоугольники не пересекаются.
export function layoutPlanLabels(groups, at) {
    const frame = PLAN_SHEET;
    const sorted = groups.map((group) => ({ group, anchor: at(group.anchor) })).sort((a, b) => a.anchor.x - b.anchor.x || a.anchor.y - b.anchor.y || compareId(a.group.id, b.group.id));
    const halves = [sorted.slice(0, Math.ceil(sorted.length / 2)), sorted.slice(Math.ceil(sorted.length / 2))];
    return halves.flatMap((side, sideIndex) => {
        side.sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x || compareId(a.group.id, b.group.id));
        const ys = [];
        side.forEach((item, i) => { ys.push(Math.max(frame.top + 18, item.anchor.y, i ? ys[i - 1] + frame.row : 0)); });
        if (ys.length && ys[ys.length - 1] > frame.bottom - 18) {
            ys[ys.length - 1] = frame.bottom - 18;
            for (let i = ys.length - 2; i >= 0; i -= 1) ys[i] = Math.min(ys[i], ys[i + 1] - frame.row);
        }
        return side.map((item, i) => ({ ...item, x: sideIndex ? 890 : 24, y: ys[i], width: 86, height: 22, side: sideIndex ? 'right' : 'left', elbow: sideIndex ? frame.right + 10 : frame.left - 10 }));
    });
}

export function planLeaderPoints(label) {
    const { anchor, x, y, width, side, elbow } = label;
    return [anchor, { x: elbow, y: anchor.y }, { x: side === 'left' ? x + width : x, y }, { x: side === 'left' ? x : x + width, y }];
}
export function planLeadersOverlap(labels) {
    const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const within = (a, b, p) => p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7 && p.y >= Math.min(a.y, b.y) - 1e-7 && p.y <= Math.max(a.y, b.y) + 1e-7;
    const hits = (a, b, c, d) => {
        const abC = turn(a, b, c), abD = turn(a, b, d), cdA = turn(c, d, a), cdB = turn(c, d, b);
        return (abC * abD < 0 && cdA * cdB < 0) || (Math.abs(abC) < 1e-7 && within(a, b, c)) || (Math.abs(abD) < 1e-7 && within(a, b, d)) || (Math.abs(cdA) < 1e-7 && within(c, d, a)) || (Math.abs(cdB) < 1e-7 && within(c, d, b));
    };
    const paths = labels.map(planLeaderPoints);
    for (let i = 0; i < paths.length; i += 1) for (let j = 0; j < i; j += 1) {
        for (let a = 1; a < paths[i].length; a += 1) for (let b = 1; b < paths[j].length; b += 1) if (hits(paths[i][a - 1], paths[i][a], paths[j][b - 1], paths[j][b])) return true;
    }
    return false;
}
