import { mulberry } from './vineLeaves.js';

// Лиана: корень и побеги, нарисованные кистью по поверхности модели — стене,
// кашпо, сетке, земле. Хранится правило, а не листья: побег — точки мазка с
// нормалью поверхности [x, y, z, nx, ny, nz]; от него растут боковые побеги
// в плоскости поверхности, по ним — листья, цветки и плоды. Одинаково при
// каждом открытии (seed), как цветник (fillBed.js). Мазки из одного корня —
// одно растение: в ведомости лиана — штука.
//
// Числа вида — `vine` в записи библиотеки: leaf (форма, vineLeaves.js),
// leafSize (м), spread (ширина полосы, которую закрывает побег, м), density
// (густота листвы), flower / fruit (цветки и плоды, их размер).
const STEP = 0.04, GAP = 0.6, LIFT = 0.012;
export const VINE_DEFAULTS = Object.freeze({ leaf: 'ovate', leafSize: 0.09, spread: 0.7, density: 1, flowerSize: 0.08, fruitSize: 0.14 });
export const vineParams = (plant) => ({ ...VINE_DEFAULTS, ...(plant?.vine ?? {}) });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, fallback = [0, 1, 0]) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback; };
// Любой вектор поперёк n — когда направление совпало с нормалью.
const across = (n) => unit(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));

// Мазок → куски без разрывов (дальше GAP — лиана не перепрыгивает), каждый
// пересобран через STEP по длине: точки, нормали, касательные, длина.
export function shootRuns(shoot) {
    const runs = [];
    let run = [];
    for (const sample of shoot) {
        const p = sample.slice(0, 3), n = unit(sample.slice(3, 6));
        if (run.length && len(sub(p, run[run.length - 1].p)) > GAP) { runs.push(run); run = []; }
        run.push({ p, n });
    }
    if (run.length) runs.push(run);
    return runs.map((points) => {
        const out = [], normals = [];
        let carry = 0;
        out.push(points[0].p); normals.push(points[0].n);
        for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1], b = points[i], d = len(sub(b.p, a.p));
            for (let s = STEP - carry; s <= d; s += STEP) {
                const k = s / d;
                out.push(add(a.p, sub(b.p, a.p), k)); normals.push(unit(add(a.n, sub(b.n, a.n), k)));
            }
            carry = (carry + d) % STEP;
        }
        const tangents = out.map((_, i) => unit(sub(out[Math.min(out.length - 1, i + 1)], out[Math.max(0, i - 1)]), across(normals[i])));
        return { points: out, normals, tangents, length: (out.length - 1) * STEP };
    }).filter((run) => run.points.length >= 3);
}

export const vineLength = (vine) => vine.shoots.reduce((sum, shoot) => sum + shootRuns(shoot).reduce((s, run) => s + run.length, 0), 0);

// Лист лежит на поверхности, чуть отстав от неё, лицом наружу; кончик — вниз и
// вбок: лист висит на черешке. На земле низа нет — кончик куда придётся.
function leafFrame(normal, along, rand) {
    const jitter = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    let facing = unit(add(normal, jitter, 0.9));
    if (dot(facing, normal) < 0.35) facing = unit(add(facing, normal));
    const want = unit(add(add([0, -0.75, 0], [rand() - 0.5, rand() - 0.5, rand() - 0.5], 1.6), along, 0.35));
    const tip = unit(sub(want, facing.map((v) => v * dot(want, facing))), across(facing));
    return { facing, tip };
}

export function growVine(vine, plant) {
    const params = vineParams(plant);
    const rand = mulberry(vine.seed ?? 1);
    const leafStep = (params.leafSize * 0.42) / Math.max(0.3, params.density);
    const stems = [], leaves = [], flowers = [], fruits = [];
    const leavesAlong = (points, normals, dirs, main) => {
        const total = (points.length - 1) * STEP;
        for (let s = leafStep * rand(); s < total; s += leafStep * (0.75 + rand() * 0.5)) {
            const i = Math.min(points.length - 1, Math.round(s / STEP)), n = normals[i], t = dirs[i], side = unit(cross(n, t), across(n));
            const tipTaper = Math.min(1, Math.max(0.45, (total - s) / 0.25));
            for (let k = 0; k < (main ? 2 : 1 + (rand() < 0.45 ? 1 : 0)); k += 1) {
                const at = add(add(points[i], side, (rand() - 0.5) * 1.3 * params.leafSize), n, 0.006 + rand() * 0.04);
                const { facing, tip } = leafFrame(n, t, rand);
                leaves.push({ p: at, n: facing, t: tip, s: params.leafSize * (0.75 + rand() * 0.45) * tipTaper, k: Math.floor(rand() * 3), r: rand(), q: rand() });
                if (params.flower && rand() < (main ? 0.07 : 0.17) * (s > total * 0.4 ? 1.6 : 0.6)) {
                    const up = unit(sub([0, 1, 0], facing.map((v) => v * facing[1])), tip.map((v) => -v));
                    flowers.push({ p: add(at, facing, 0.02), n: unit(add(facing, [rand() - 0.5, rand() - 0.5, rand() - 0.5], 0.4)), t: up, s: params.flowerSize * (0.8 + rand() * 0.4), r: rand() });
                }
                if (params.fruit && main && rand() < 0.07) fruits.push({ p: add(at, facing, 0.03), n: facing, t: unit(sub([0, -1, 0], facing.map((v) => v * -facing[1])), tip), s: params.fruitSize * (0.8 + rand() * 0.4), r: rand() });
            }
        }
    };
    for (const shoot of vine.shoots) {
        for (const run of shootRuns(shoot)) {
            const { points, normals, tangents, length } = run;
            const phase = rand() * 6.3, phase2 = rand() * 6.3;
            const main = points.map((p, i) => {
                const side = unit(cross(normals[i], tangents[i]), across(normals[i])), s = i * STEP;
                return add(add(p, normals[i], LIFT), side, 0.018 * Math.sin(s * 11 + phase) + 0.01 * Math.sin(s * 23 + phase2));
            });
            stems.push({ points: main, normals, width: [0.016, 0.005] });
            leavesAlong(main, normals, tangents, true);
            // Боковые побеги: попеременно в стороны, короче у корня и у кончика;
            // у ребра (нормаль рядом круто меняется) — вдвое короче. От каждого —
            // веточки второго порядка: вместе они и дают ковёр, а не нитку.
            const branch = (from, n, t, dir, reach, width) => {
                const points2 = [], normals2 = [], dirs2 = [];
                for (let u = 0; u <= reach; u += STEP) {
                    points2.push(add(add(from, dir, u), t, (0.18 * u * u) / Math.max(0.05, reach)));
                    normals2.push(n); dirs2.push(dir);
                }
                if (points2.length < 3) return null;
                stems.push({ points: points2, normals: normals2, width });
                leavesAlong(points2, normals2, dirs2, false);
                return points2;
            };
            let sign = rand() < 0.5 ? 1 : -1;
            for (let s = 0.1 + rand() * 0.08; s < length - 0.06; s += (0.1 + rand() * 0.12) / Math.max(0.3, params.density)) {
                const i = Math.round(s / STEP), n = normals[i], t = tangents[i], side = unit(cross(n, t), across(n));
                if (rand() > 0.9) continue;
                sign = rand() < 0.75 ? -sign : sign;
                const angle = sign * (0.45 + rand() * 0.8), dir = unit(add(t.map((v) => v * Math.cos(angle)), side, Math.sin(angle)));
                let reach = (params.spread / 2) * (0.55 + rand() * 0.6) * Math.min(1, Math.max(0.3, (length - s) / 0.8)) * Math.min(1, Math.max(0.45, s / 0.3));
                const span = Math.ceil(reach / STEP);
                for (let j = Math.max(0, i - span); j <= Math.min(points.length - 1, i + span); j += 1) if (dot(normals[j], n) < 0.8) { reach *= 0.5; break; }
                const shoot = branch(main[i], n, t, dir, reach, [0.007, 0.0025]);
                if (!shoot) continue;
                for (let u = 0.12 + rand() * 0.1; u < reach - 0.05; u += 0.12 + rand() * 0.1) {
                    if (rand() > 0.6) continue;
                    const turn = (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.5), dir2 = unit(add(dir.map((v) => v * Math.cos(turn)), unit(cross(n, dir), side), Math.sin(turn)));
                    branch(shoot[Math.min(shoot.length - 1, Math.round(u / STEP))], n, dir, dir2, Math.min(reach - u, 0.1 + rand() * 0.18), [0.004, 0.0015]);
                }
            }
            if (leaves.length > 6000) break;
        }
    }
    return { stems, leaves: leaves.slice(0, 6000), flowers, fruits };
}

// Корень — первая точка первого побега.
export const vineRoot = (vine) => vine.shoots[0]?.[0]?.slice(0, 3) ?? [0, 0, 0];
