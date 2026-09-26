import { insideBed, groundAt } from '../planting/fillBed.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
export const hash = (x, z, seed = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + seed * 19.19) * 43758.5453123; return n - Math.floor(n); };
export function noise(x, z, seed = 0) {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return (hash(i, j, seed) * (1 - a) + hash(i + 1, j, seed) * a) * (1 - b) + (hash(i, j + 1, seed) * (1 - a) + hash(i + 1, j + 1, seed) * a) * b;
}
export function coverBounds(bed) {
    return bed.points.reduce((b, [x, z]) => ({ x0: Math.min(b.x0, x), z0: Math.min(b.z0, z), x1: Math.max(b.x1, x), z1: Math.max(b.z1, z) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
}
export function edgeDistance(bed, x, z) {
    let d = Infinity;
    for (const ring of [bed.points, ...(bed.holes ?? [])]) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-10, dx * dx + dz * dz));
        d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return d;
}
// One seeded metre-space field drives the ground, colonies and their edges.
// Seasons/lighting never enter the seed and cannot reshuffle a planting.
export function coverField(bed, cover, x, z, exclusions = []) {
    const n = noise(x / cover.patches, z / cover.patches, bed.seed);
    const edge = cover.edge > 0 ? clamp(edgeDistance(bed, x, z) / cover.edge - noise(x * 9, z * 9, bed.seed) * .45) : 1;
    let occupancy = insideBed(bed, x, z) ? edge : 0;
    for (const p of exclusions) occupancy *= clamp((Math.hypot(x - p.x, z - p.z) - p.radius) / .08);
    // Colour patches and population use the same thresholds. No independent
    // random far-field colours which would reveal the geometry transition.
    const leaf = cover.leaf > 0 && n < cover.leaf;
    const thyme = !leaf && cover.thyme > 0 && n > 1 - cover.thyme;
    return { kind: leaf ? 'leaf' : thyme ? 'thyme' : 'moss', occupancy, vigor: noise(x * .7, z * .7, bed.seed + 41), height: (.012 + .023 * noise(x * 4, z * 4, bed.seed + 3)) * occupancy };
}
export function gridSurface(bed) {
    return { sample(x, z) {
        const e = .02, height = groundAt(bed, x, z), dx = (groundAt(bed, x + e, z) - groundAt(bed, x - e, z)) / (2 * e), dz = (groundAt(bed, x, z + e) - groundAt(bed, x, z - e)) / (2 * e);
        const length = Math.hypot(dx, 1, dz);
        return { height, normal: [-dx / length, 1 / length, -dz / length] };
    } };
}
