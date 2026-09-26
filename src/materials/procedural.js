// Deterministic material fields, shared by the live swatch and the saved bake.
// RGB contains reflectance only; shape lives in height, never painted shadows.
export const SURFACES = [
    ['pebble', 'Галька', 'Pebbles'], ['gravel', 'Гравий', 'Gravel'],
    ['carpet', 'Каменный ковёр', 'Stone carpet'], ['standing-seam', 'Фальцевая кровля', 'Standing seam'],
    ['tiles', 'Плитка из образца', 'Tiles from sample'],
];
export const surfacePreset = (kind = 'pebble') => ({ kind, seed: 17, stoneSize: kind === 'carpet' ? 5 : kind === 'gravel' ? 14 : 45,
    variation: 0.35, roundness: kind === 'gravel' ? 0.18 : 0.85, gap: kind === 'carpet' ? 0.25 : 1.2,
    tint: kind === 'standing-seam' ? '#555a5d' : '#c7c0b1', tint2: kind === 'standing-seam' ? '#666b6d' : '#d8d2c5',
    bed: '#8c887f', tintVariation: 0.42, relief: kind === 'carpet' ? 1 : kind === 'gravel' ? 7 : kind === 'standing-seam' ? 25 : kind === 'tiles' ? 3 : 16,
    roughness: kind === 'standing-seam' ? 0.42 : 0.78, spacing: 500, seamWidth: 12, tileWidth: 600, tileHeight: 1200, bond: 0.5,
});
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function normalizeSurface(input = {}) {
    const kind = SURFACES.some(([id]) => id === input.kind) ? input.kind : 'pebble', base = surfacePreset(kind);
    const out = { ...base };
    for (const [key, min, max] of [['seed', 1, 99999], ['stoneSize', 2, 160], ['variation', 0, 0.8], ['roundness', 0, 1], ['gap', 0.1, 40], ['tintVariation', 0, 1],
        ['relief', 0, 60], ['roughness', 0.05, 1], ['spacing', 100, 1500], ['seamWidth', 3, 40], ['tileWidth', 30, 3000], ['tileHeight', 30, 3000], ['bond', 0, 0.5]]) {
        if (input[key] !== null && input[key] !== '' && Number.isFinite(Number(input[key]))) out[key] = clamp(Number(input[key]), min, max);
    }
    for (const key of ['tint', 'tint2', 'bed']) if (/^#[a-f\d]{6}$/i.test(input[key])) out[key] = input[key];
    out.seed = Math.round(out.seed);
    out.bond = Math.round(out.bond * 2) / 2;
    return out;
}
const random = (x, y, seed = 0) => {
    let n = Math.imul(x + seed * 71, 374761393) ^ Math.imul(y + seed * 13, 668265263);
    n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
const wrap = (v, n) => (v % n + n) % n;
const rgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const noise = (u, v, n, seed) => {
    const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy);
    const h = (dx, dy) => random(wrap(ix + dx, n), wrap(iy + dy, n), seed);
    return (h(0, 0) * (1 - fx) + h(1, 0) * fx) * (1 - fy) + (h(0, 1) * (1 - fx) + h(1, 1) * fx) * fy;
};
// Architectural repeats have exact seam spacing. The returned extent is part
// of the material metadata, so the saved texture and scene agree in metres.
export function surfaceSize(input, requested = [1, 1]) {
    const s = normalizeSurface(input);
    if (s.kind === 'standing-seam') return [s.spacing / 1000 * 4, requested[1]];
    if (s.kind === 'tiles') return [s.tileWidth / 1000 * 4, s.tileHeight / 1000 * 2];
    return requested;
}
export const surfaceRecipe = (input) => {
    const s = normalizeSurface(input);
    return { heightMode: 'file', depth: s.relief, smoothing: 0, roughness: s.roughness, variation: 0.06, ao: 0.65, metalness: 0, invert: false };
};
export function generateSurface(input, width, height, requested = [1, 1], source = null) {
    const s = normalizeSurface(input), extent = surfaceSize(s, requested);
    const color = new Uint8Array(width * height * 3), field = new Float32Array(width * height);
    const a = rgb(s.tint), b = rgb(s.tint2), bed = rgb(s.bed);
    const nx = Math.max(2, Math.round(extent[0] * 1000 / s.stoneSize)), ny = Math.max(2, Math.round(extent[1] * 1000 / s.stoneSize));
    const stone = !['standing-seam', 'tiles'].includes(s.kind);
    if (stone && (nx > 256 || ny > 256)) throw new Error('Уменьшите образец: на его стороне должно быть не больше 256 камней. / Reduce the sample to at most 256 stones per side.');
    const points = stone ? new Map() : null;
    const point = (x, y) => {
        const ix = wrap(x, nx), iy = wrap(y, ny), id = iy * nx + ix;
        if (!points.has(id)) {
            const angle = random(ix, iy, s.seed + 5) * Math.PI * 2;
            points.set(id, { x: 0.05 + random(ix, iy, s.seed) * 0.9, y: 0.05 + random(ix, iy, s.seed + 1) * 0.9,
                shade: random(ix, iy, s.seed + 2), stretch: 0.72 + random(ix, iy, s.seed + 3) * 0.55,
                radius: 0.65 + (random(ix, iy, s.seed + 4) - 0.5) * s.variation * 0.9,
                cos: Math.cos(angle), sin: Math.sin(angle), height: 0.7 + random(ix, iy, s.seed + 6) * 0.3 });
        }
        return points.get(id);
    };
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const u = (x + 0.5) / width, v = (y + 0.5) / height, i = y * width + x;
        const fine = noise(u, v, 197, s.seed + 19), coarse = noise(u, v, 13, s.seed + 29);
        let level = 0, face = 1, shade = 0.5, detail = (fine - 0.5) * 7 + (coarse - 0.5) * 4, su = u, sv = v;
        if (stone) {
            const px = u * nx, py = v * ny, bx = Math.floor(px), by = Math.floor(py);
            let top = -1, chosen = null, coverage = 0;
            const gap = s.gap / s.stoneSize * 0.5;
            // Rounded stones overlap in height, as real loose aggregate does.
            // No Voronoi partition: it would turn a pebble bed into polygon paving.
            for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
                const p = point(bx + dx, by + dy), vx = px - bx - dx - p.x, vy = py - by - dy - p.y;
                const qx = (vx * p.cos - vy * p.sin) * p.stretch, qy = (vx * p.sin + vy * p.cos) / p.stretch;
                const squared = qx * qx + qy * qy;
                if (squared > p.radius * p.radius * 1.5) continue;
                const angle = Math.atan2(qy, qx);
                const radius = Math.max(0.16, p.radius - gap) * (1 + Math.sin(angle * 3 + p.shade * 20) * 0.055
                    + Math.cos(angle * 5 + p.shade * 8) * (1 - s.roundness) * 0.12);
                const distance = Math.sqrt(squared) / radius;
                if (distance >= 1) continue;
                const dome = Math.pow(Math.max(0, 1 - distance * distance), 0.35 + s.roundness * 0.3);
                const facets = 1 - (1 - s.roundness) * 0.12 * Math.abs(Math.sin(angle * 3 + p.shade));
                const height = dome * facets * p.height;
                if (height > top) { top = height; chosen = p; coverage = 1 - smooth(0.94, 1, distance); }
            }
            face = coverage;
            level = Math.max(0, top) + (fine - 0.5) * 0.015 * face;
            if (s.kind === 'carpet') level = face * (0.7 + Math.max(0, top) * 0.2);
            shade = chosen?.shade ?? 0.5;
            detail += (noise(u, v, 61, s.seed + 7) - 0.5) * 12;
        } else if (s.kind === 'standing-seam') {
            const t = wrap(u * 4, 1), distance = Math.min(t, 1 - t) * s.spacing;
            level = 1 - smooth(s.seamWidth * 0.35, s.seamWidth * 0.55, distance);
            // Rounded double fold and a shallow foot at the sheet connection.
            level = Math.max(level * (0.92 + 0.08 * Math.cos(distance / s.seamWidth * Math.PI)), 0.1 * (1 - smooth(s.seamWidth * 0.7, s.seamWidth * 1.1, distance)));
            level += Math.sin(t * Math.PI) * 0.012 * coarse;
            shade = 0.5; detail *= 0.22;
        } else {
            const row = Math.floor(v * 2), xx = wrap(u * 4 + row * s.bond, 4), yy = v * 2;
            const tx = xx % 1, ty = yy % 1;
            const distance = Math.min(tx * s.tileWidth, (1 - tx) * s.tileWidth, ty * s.tileHeight, (1 - ty) * s.tileHeight);
            face = smooth(s.gap * 0.5, s.gap * 0.5 + 1.5, distance);
            level = face * (0.96 + fine * 0.025); shade = random(Math.floor(xx), row, s.seed);
            su = tx; sv = ty;
        }
        field[i] = clamp(level, 0, 1);
        const mix = 0.5 + (shade - 0.5) * s.tintVariation;
        for (let c = 0; c < 3; c += 1) {
            let reflectance = a[c] * (1 - mix) + b[c] * mix + detail + (shade - 0.5) * s.tintVariation * 30;
            if (s.kind === 'standing-seam') reflectance = a[c] + detail;
            if (s.kind === 'tiles' && source) reflectance = source.rgb[(Math.min(source.height - 1, Math.floor(sv * source.height)) * source.width + Math.min(source.width - 1, Math.floor(su * source.width))) * 3 + c];
            color[i * 3 + c] = Math.round(clamp(reflectance * face + bed[c] * (1 - face), 0, 255));
        }
    }
    return { rgb: color, height: field, extent, surface: s };
}
