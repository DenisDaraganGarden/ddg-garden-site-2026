// Листья и цветки лиан — формы, из которых рисуются атлас листьев в сцене
// (VineLayer, canvas) и карточка растения в библиотеке (scripts/
// climber-library.mjs, SVG). Всё в единичном квадрате: черешок снизу
// посередине (0.5, 1), кончик вверх. Форма — числа, а не картинка: новая лиана
// — строка в библиотеке с `vine.leaf` из LEAF_KINDS (или новая строка здесь).
// Вариант 0…2 — тот же лист чуть иначе: доли, зубцы, наклон.
const DEG = Math.PI / 180, TAU = Math.PI * 2;

export function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// Лопастной лист (плющ, девичий виноград триостренный, виноград, хмель):
// контур вокруг середины пластинки; доля — [угол от верха, °; длина; ширина, °].
// Между долями — body; у черешка выемка; зубцы смотрят к кончику доли.
function lobed({ lobes, body, notch = 0.4, teeth = 0, depth = 0.04, center = 0.54, point = 1.5, tent = false }, rand) {
    const jitter = lobes.map(() => [(rand() - 0.5) * 8, 1 + (rand() - 0.5) * 0.12]);
    const radius = (a) => {
        let r = body;
        lobes.forEach(([deg, length, width], j) => {
            for (const side of deg ? [1, -1] : [1]) {
                const u = Math.abs(wrap(a - side * (deg + jitter[j][0]) * DEG)) / (width * DEG);
                // tent — острые доли (плющ), иначе округлые.
                if (u < 1) r += (length * jitter[j][1] - body) * (tent ? Math.pow(1 - u, point) : Math.pow(Math.cos((u * Math.PI) / 2), point));
            }
        });
        r *= 1 - notch * Math.exp(-((wrap(a - Math.PI) / 0.32) ** 2));
        if (teeth) { const f = (a / TAU) * teeth; r *= 1 - depth * (f - Math.floor(f)); }
        return r;
    };
    const fill = [];
    for (let i = 0; i < 240; i += 1) { const a = (i / 240) * TAU, r = radius(a); fill.push([0.5 + r * Math.sin(a), center - r * Math.cos(a)]); }
    const base = [0.5, center + radius(Math.PI) * 0.9];
    const veins = lobes.flatMap(([deg], j) => (deg ? [1, -1] : [1]).map((side) => {
        const a = side * (deg + jitter[j][0]) * DEG, r = radius(a) * 0.86;
        return [base, [0.5 + r * Math.sin(a), center - r * Math.cos(a)]];
    }));
    return { fills: [fill], veins, stems: [[base, [0.5, 1]]] };
}

// Листочек — продолговатый, шире к кончику (obovate > 0) или к основанию
// (< 0); from — где крепится, angle — куда смотрит (° от верха), length.
function leaflet(from, angle, length, width, { obovate = 0.15, teeth = 0, depth = 0.05, cordate = 0 } = {}) {
    const a = angle * DEG, along = [Math.sin(a), -Math.cos(a)], across = [Math.cos(a), Math.sin(a)];
    const side = (s) => {
        const points = [];
        for (let i = 0; i <= 24; i += 1) {
            const t = i / 24;
            let w = width * Math.pow(Math.sin(Math.PI * Math.pow(t, 1 - obovate)), 0.85);
            if (teeth && t > 0.25) { const f = t * teeth; w *= 1 - depth * (f - Math.floor(f)); }
            const y = length * t - cordate * width * Math.exp(-((t / 0.12) ** 2));
            points.push([from[0] + along[0] * y + across[0] * w * s, from[1] + along[1] * y + across[1] * w * s]);
        }
        return points;
    };
    return { fill: [...side(1), ...side(-1).reverse()], vein: [from, [from[0] + along[0] * length * 0.9, from[1] + along[1] * length * 0.9]] };
}

function compound(parts, stems) {
    return { fills: parts.map((part) => part.fill), veins: parts.map((part) => part.vein), stems };
}

export const LEAF_KINDS = {
    // Плющ: пять долей, средняя длиннее, светлые жилки.
    ivy: (rand) => lobed({ lobes: [[0, 0.46, 44], [60, 0.38, 38], [116, 0.27, 32]], body: 0.16, notch: 0.42, point: 1.1, tent: true }, rand),
    // Девичий виноград триостренный: три доли, мелкие зубцы.
    boston: (rand) => lobed({ lobes: [[0, 0.46, 56], [64, 0.42, 48]], body: 0.2, notch: 0.5, teeth: 34, depth: 0.05, point: 1.15, tent: true }, rand),
    // Виноград: пять долей с глубокими выемками, крупные зубцы.
    grape: (rand) => lobed({ lobes: [[0, 0.46, 36], [56, 0.44, 32], [120, 0.33, 30]], body: 0.17, notch: 0.62, teeth: 40, depth: 0.07, point: 1.7 }, rand),
    // Хмель: три доли, глубокие зубцы.
    hops: (rand) => lobed({ lobes: [[0, 0.46, 40], [64, 0.36, 36]], body: 0.22, notch: 0.45, teeth: 30, depth: 0.09, point: 1.4 }, rand),
    // Девичий виноград пятилисточковый: пять листочков из одной точки.
    creeper: (rand) => {
        const at = [0.5, 0.64], tilt = (rand() - 0.5) * 8;
        return compound([[-74, 0.3], [-37, 0.39], [0, 0.46], [37, 0.39], [74, 0.3]].map(([a, l]) => leaflet(at, a + tilt, l * (0.94 + rand() * 0.1), l * 0.24, { obovate: 0.3, teeth: 11, depth: 0.12 })), [[at, [0.5, 1]]]);
    },
    // Кампсис, глициния: перистый — пары листочков вдоль черешка и верхушечный.
    pinnate: (rand) => {
        const parts = [];
        for (let i = 0; i < 4; i += 1) {
            const y = 0.86 - i * 0.2, l = 0.2 + rand() * 0.03;
            parts.push(leaflet([0.5, y], -62 + i * 5, l, l * 0.3, { obovate: -0.1, teeth: 7, depth: 0.12 }), leaflet([0.5, y], 62 - i * 5, l, l * 0.3, { obovate: -0.1, teeth: 7, depth: 0.12 }));
        }
        parts.push(leaflet([0.5, 0.26], (rand() - 0.5) * 8, 0.24, 0.07, { obovate: -0.1, teeth: 7, depth: 0.12 }));
        return compound(parts, [[[0.5, 1], [0.5, 0.26]]]);
    },
    // Клематис: тройчатый — три листочка на коротком черешке.
    trifoliate: (rand) => {
        const at = [0.5, 0.6];
        // Каждый листочек — на своём черешке: между ними просвет.
        return compound([[-58, 0.3], [0, 0.4], [58, 0.3]].map(([deg, l]) => {
            const a = (deg + (rand() - 0.5) * 10) * DEG, from = [at[0] + Math.sin(a) * 0.07, at[1] - Math.cos(a) * 0.07];
            return leaflet(from, deg, l, l * 0.3, { obovate: 0.1 });
        }), [[at, [0.5, 1]], ...[-58, 0, 58].map((deg) => [at, [at[0] + Math.sin(deg * DEG) * 0.07, at[1] - Math.cos(deg * DEG) * 0.07]])]);
    },
    // Жимолость, гортензия черешковая, горец Обера: цельный яйцевидный.
    ovate: (rand) => compound([leaflet([0.5, 0.9], (rand() - 0.5) * 8, 0.8, 0.27, { obovate: -0.18, cordate: 0.35 })], [[[0.5, 0.9], [0.5, 1]]]),
    serrate: (rand) => compound([leaflet([0.5, 0.84], (rand() - 0.5) * 8, 0.78, 0.3, { obovate: -0.15, cordate: 0.5, teeth: 26, depth: 0.05 })], [[[0.5, 0.84], [0.5, 1]]]),
};

// Цветки и плоды — одна клетка атласа, серые: цвет — из записи растения.
// Кружок — [x, y, радиус]; лепесток — многоугольник.
const petal = (center, angle, length, width) => leaflet(center, angle, length, width, { obovate: 0.25 }).fill;
export const FLOWER_KINDS = {
    // Кампсис: кисть из трубок, у каждой узкое основание и раструб.
    trumpet: (rand) => ({ fills: [0, 1, 2, 3].map((i) => {
        const a = (-45 + i * 30 + (rand() - 0.5) * 10) * DEG, along = [Math.sin(a), -Math.cos(a)], across = [Math.cos(a), Math.sin(a)], b = [0.5, 0.92];
        const at = (t, w) => [b[0] + along[0] * t + across[0] * w, b[1] + along[1] * t + across[1] * w];
        return [at(0, -0.018), at(0.26, -0.03), at(0.36, -0.075), at(0.42, -0.06), at(0.44, 0), at(0.42, 0.06), at(0.36, 0.075), at(0.26, 0.03), at(0, 0.018)];
    }), dots: [] }),
    star: (rand) => ({ fills: Array.from({ length: 6 }, (_, i) => petal([0.5, 0.5], i * 60 + rand() * 10, 0.42, 0.17)), dots: [[0.5, 0.5, 0.06]] }),
    foam: (rand) => ({ fills: [], dots: Array.from({ length: 70 }, () => { const y = 0.12 + rand() * 0.8, spread = 0.08 + (y - 0.12) * 0.3; return [0.5 + (rand() - 0.5) * 2 * spread, y, 0.018 + rand() * 0.018]; }) }),
    tube: (rand) => ({ fills: Array.from({ length: 7 }, (_, i) => { const a = (-80 + i * 27 + (rand() - 0.5) * 8) * DEG, b = [0.5, 0.62], l = 0.36; return [[b[0] - Math.cos(a) * 0.02, b[1] - Math.sin(a) * 0.02], [b[0] + Math.sin(a) * l - Math.cos(a) * 0.035, b[1] - Math.cos(a) * l - Math.sin(a) * 0.035], [b[0] + Math.sin(a) * l + Math.cos(a) * 0.035, b[1] - Math.cos(a) * l + Math.sin(a) * 0.035], [b[0] + Math.cos(a) * 0.02, b[1] + Math.sin(a) * 0.02]]; }), dots: [] }),
    lace: (rand) => ({ fills: Array.from({ length: 7 }, (_, i) => { const a = i * 51 * DEG, c = [0.5 + Math.sin(a) * 0.3, 0.5 - Math.cos(a) * 0.3]; return Array.from({ length: 4 }, (__, k) => petal(c, k * 90 + 45, 0.09, 0.05)); }).flat(), dots: Array.from({ length: 50 }, () => { const a = rand() * TAU, r = Math.sqrt(rand()) * 0.26; return [0.5 + Math.sin(a) * r, 0.5 - Math.cos(a) * r, 0.02 + rand() * 0.012]; }) }),
    bunch: (rand) => ({ fills: [], dots: Array.from({ length: 34 }, () => { const y = 0.12 + rand() * 0.74, half = 0.28 * (1 - (y - 0.12) / 0.9); return [0.5 + (rand() - 0.5) * 2 * half, y, 0.05 + rand() * 0.012]; }) }),
};

export const leafShape = (kind, variant = 0) => (LEAF_KINDS[kind] ?? LEAF_KINDS.ovate)(mulberry(1013 + variant * 7919));
export const flowerShape = (kind) => (FLOWER_KINDS[kind] ?? FLOWER_KINDS.star)(mulberry(4051));

// SVG листа или цветка в квадрате size — для карточки в библиотеке.
const pointsOf = (list, size) => list.map(([x, y]) => `${(x * size).toFixed(1)},${(y * size).toFixed(1)}`).join(' ');
export function leafSvg(shape, size, { fill, vein, stem }) {
    return [
        ...shape.stems.map((line) => `<polyline points="${pointsOf(line, size)}" fill="none" stroke="${stem}" stroke-width="${(size * 0.022).toFixed(1)}" stroke-linecap="round"/>`),
        ...shape.fills.map((polygon) => `<polygon points="${pointsOf(polygon, size)}" fill="${fill}"/>`),
        ...shape.veins.map((line) => `<polyline points="${pointsOf(line, size)}" fill="none" stroke="${vein}" stroke-width="${(size * 0.012).toFixed(1)}" stroke-linecap="round" opacity="0.8"/>`),
    ].join('');
}
// Тонкий контур — белые цветки не теряются на светлом фоне.
export function flowerSvg(shape, size, color) {
    const edge = `stroke="rgba(0,0,0,0.22)" stroke-width="${(size * 0.008).toFixed(2)}"`;
    return [
        ...shape.fills.map((polygon) => `<polygon points="${pointsOf(polygon, size)}" fill="${color}" ${edge}/>`),
        ...shape.dots.map(([x, y, r]) => `<circle cx="${(x * size).toFixed(1)}" cy="${(y * size).toFixed(1)}" r="${(r * size).toFixed(1)}" fill="${color}" ${edge}/>`),
    ].join('');
}
