import * as THREE from 'three';
import { hash } from './field.js';

// Botanical height/albedo stamps, baked once per shared asset lease. The maps
// contain no studio light. Millimetre leaves survive as filtered PBR detail.
function botanicalMaps(kind, tile = false) {
    const size = tile ? 512 : kind === 'flower' ? 128 : 256;
    const height = new Float32Array(size * size), colour = new Uint8Array(size * size * 4);
    const moss = kind === 'moss', flower = kind === 'flower';
    const palette = moss ? [58, 95, 34] : flower ? [235, 231, 211] : [104, 129, 75];
    for (let i = 0; i < height.length; i++) {
        const grain = hash(i % size, Math.floor(i / size), 71);
        height[i] = tile ? .08 + grain * .015 : 0;
        colour.set([palette[0] * (tile ? .69 : .8), palette[1] * (tile ? .69 : .8), palette[2] * (tile ? .69 : .8), tile ? 255 : 0], i * 4);
    }
    const oval = (cx, cy, rx, ry, angle, level, tint = 1, petal = false) => {
        const ca = Math.cos(angle), sa = Math.sin(angle), radius = Math.max(rx, ry);
        const x0 = Math.floor((cx - radius) * size), x1 = Math.ceil((cx + radius) * size);
        const y0 = Math.floor((cy - radius) * size), y1 = Math.ceil((cy + radius) * size);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (!tile && (x < 0 || y < 0 || x >= size || y >= size)) continue;
            const dx = (x + .5) / size - cx, dy = (y + .5) / size - cy;
            const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry, d = u * u + v * v;
            if (d >= 1) continue;
            const ix = (x + size * 2) % size, iy = (y + size * 2) % size, i = iy * size + ix;
            const dome = Math.sqrt(1 - d), vein = Math.exp(-Math.abs(v) * 28) * .025;
            const h = level + dome * .16 + vein;
            if (h < height[i]) continue;
            height[i] = h;
            const pigment = tint * (.81 + .13 * dome + .04 * hash(ix, iy, 13));
            const base = petal ? [239, 233, 216] : palette;
            colour.set([base[0] * pigment, base[1] * pigment, base[2] * pigment, tile ? 255 : Math.min(255, (1 - d) * Math.min(rx, ry) * size * 380)], i * 4);
        }
    };
    const bloom = (x, y, r, seed) => {
        for (let j = 0; j < 5; j++) {
            const a = j * Math.PI * .4 + seed;
            oval(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .5, r * .57, r * .32, a, .82, .98, true);
        }
        oval(x, y, r * .19, r * .19, 0, 1.08, .7);
    };
    if (flower) {
        for (let i = 0; i < 7; i++) {
            const a = i * 2.39996, r = .23 * Math.sqrt(i / 7);
            bloom(.5 + Math.cos(a) * r, .5 + Math.sin(a) * r, .105, i);
        }
    } else if (moss && !tile) {
        for (let stem = 0; stem < 11; stem++) {
            const x = .18 + hash(stem, 1) * .64, top = .42 + hash(stem, 9) * .52;
            oval(x, top * .5 + .04, top * .5, .008, Math.PI / 2, .13, .6);
            for (let j = 1; j <= 9; j++) for (const side of [-1, 1]) {
                const t = j / 10, length = .025 + (1 - t) * .019;
                oval(x + side * length * .48, .08 + top * t, length, .008, side * .65, .2 + stem * .016, .8 + hash(stem, j) * .3);
            }
        }
    } else if (moss) {
        for (let i = 0; i < 1100; i++) {
            const x = hash(i, 4), y = hash(i, 9), level = .15 + hash(i, 3) * .4;
            for (let j = 0; j < 9; j++) {
                const a = j * 2.39996 + i, r = .012 + hash(i, j) * .007;
                oval(x + Math.cos(a) * r, y + Math.sin(a) * r, .019, .0048, a, level, .76 + hash(i, 7) * .39);
            }
        }
    } else {
        const sprigs = tile ? 100 : 9;
        for (let i = 0; i < sprigs; i++) {
            const a = i * 2.39996, x = tile ? hash(i, 4) : .5, y = tile ? hash(i, 9) : .5;
            const length = tile ? .17 : .25 + hash(i, 1) * .19, dx = Math.cos(a), dy = Math.sin(a);
            oval(x + dx * length * .5, y + dy * length * .5, length * .5, .004, a, .12, .63);
            for (let pair = 1; pair <= 6; pair++) for (const side of [-1, 1]) {
                const t = pair / 7, offset = (tile ? .013 : .023) * (.7 + hash(i, pair) * .5);
                const px = x + dx * length * t - dy * (offset * side + t * t * .04 * Math.sin(i)), py = y + dy * length * t + dx * (offset * side + t * t * .04 * Math.sin(i));
                oval(px, py, tile ? .022 : .032, tile ? .009 : .014, a + side * (.6 + hash(i, pair) * .7), .22 + hash(i, 7) * .25 + t * .08, .8 + hash(i, pair) * .26);
            }
        }
    }
    // Extrude RGB under the cutout edge before mip filtering: no black halos.
    const painted = Uint8Array.from(height, (_, i) => colour[i * 4 + 3] > 0 ? 1 : 0);
    if (!tile) for (let pass = 0; pass < 4; pass++) {
        const copy = colour.slice(), mask = painted.slice();
        for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
            const pixel = y * size + x, i = pixel * 4; if (mask[pixel]) continue;
            for (const step of [-1, 1, -size, size]) if (mask[pixel + step]) {
                colour[i] = copy[i + step * 4]; colour[i + 1] = copy[i + step * 4 + 1]; colour[i + 2] = copy[i + step * 4 + 2]; painted[pixel] = 1; break;
            }
        }
    }
    const normal = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const at = (a, b) => height[tile ? ((b + size) % size) * size + (a + size) % size : Math.max(0, Math.min(size - 1, b)) * size + Math.max(0, Math.min(size - 1, a))];
        const dx = (at(x - 1, y) - at(x + 1, y)) * (moss ? 2.2 : 1.4), dy = (at(x, y - 1) - at(x, y + 1)) * (moss ? 2.2 : 1.4), length = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        normal.set([128 + dx / length * 127, 128 + dy / length * 127, 128 + 127 / length, 255], i);
    }
    return [colour, normal].map((bytes, i) => {
        const map = new THREE.DataTexture(bytes, size, size); map.name = `cover-${kind}-${tile ? 'tile' : 'card'}-${i}`;
        map.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        map.wrapS = map.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
        if (!tile && i === 0) { map.mipmaps = coverageMips(bytes, size); map.generateMipmaps = false; }
        else map.generateMipmaps = true;
        map.anisotropy = 4; map.needsUpdate = true; return map;
    });
}
export function coverTextureSets() {
    return { mossTile: botanicalMaps('moss', true), thymeTile: botanicalMaps('thyme', true), mossCard: botanicalMaps('moss'), thymeCard: botanicalMaps('thyme'), flowerCard: botanicalMaps('flower') };
}

// Preserve the alpha-test silhouette until detail fades into the carpet.
// Colour is filtered with alpha weights, alpha coverage at the material's .45.
export function coverageMips(bytes, size) {
    const levels = [{ data: bytes, width: size, height: size }];
    const coverage = data => { let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] >= 115) n++; return n / (data.length / 4); };
    const target = coverage(bytes);
    let previous = bytes, width = size;
    while (width > 1) {
        const nextWidth = width / 2, data = new Uint8Array(nextWidth * nextWidth * 4);
        for (let y = 0; y < nextWidth; y++) for (let x = 0; x < nextWidth; x++) {
            let alpha = 0; const sum = [0, 0, 0];
            for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
                const at = ((y * 2 + j) * width + x * 2 + k) * 4, a = previous[at + 3]; alpha += a;
                for (let c = 0; c < 3; c++) sum[c] += previous[at + c] * a;
            }
            const at = (y * nextWidth + x) * 4;
            for (let c = 0; c < 3; c++) data[at + c] = alpha ? sum[c] / alpha : previous[(y * 2 * width + x * 2) * 4 + c];
            data[at + 3] = alpha / 4;
        }
        let lo = .25, hi = 4;
        for (let k = 0; k < 10; k++) {
            const gain = (lo + hi) * .5; let count = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] * gain >= 115) count++;
            if (count / (data.length / 4) < target) lo = gain; else hi = gain;
        }
        for (let i = 3; i < data.length; i += 4) data[i] = Math.min(255, data[i] * hi);
        levels.push({ data, width: nextWidth, height: nextWidth }); previous = data; width = nextWidth;
    }
    return levels;
}
