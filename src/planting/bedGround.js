import * as THREE from 'three';
import { groundAt } from './fillBed.js';
import { seasonImage } from './season.js';

// Грунт цветника — процедурный: кора мульчи на тёмной земле, с глубиной
// (параллакс), и всё, что меняется с месяцем. Грунт привязан к растениям
// цветника: под каждым — свой опад и своя тень. Что под каким растением
// лежит в каком месяце, решают его запись и сезон:
//   цветёт            — лепестки его цвета;
//   весна (поросль)   — молодые ростки у многолетников и злаков;
//   осень, зима       — листья цвета осени у листопадных, бурый лист у
//                       многолетников, солома у злаков, хвоя у хвойных;
//   срезка злака      — солома срезки.
// Сезон всего грунта — влажность (весна и поздняя осень темнее), выгорание
// коры к концу лета и иней зимой.
//
// Две текстуры-плитки рисуются один раз на GPU (bakeGroundTiles): кора с
// землёй (цвет и высота) и опад (листья, лепестки, солома — маски со случайным
// числом на каждый кусочек: чем больше опада, тем больше кусочков видно).
// Карты растений (plantGroundMaps) — по цветнику: цвет опада, его доля, вид
// (лист, лепесток, солома) и тень кроны; пересчитываются с месяцем.
export const GROUND_TILE = 1.6; // м на плитку коры
export const LITTER_TILE = 1.2; // м на плитку опада
export const GROUND_DEPTH = 0.022; // м: глубина рельефа коры для параллакса
export const GROUND_LIFT = 0.012; // м над поверхностью модели: без мерцания с ней

// Сезон грунта по месяцу: влажность, иней, выгорание коры (весной кора свежая).
const MOISTURE = [0.5, 0.55, 0.7, 0.65, 0.45, 0.3, 0.2, 0.2, 0.3, 0.5, 0.65, 0.55];
const FROST = [0.8, 0.7, 0.15, 0, 0, 0, 0, 0, 0, 0, 0.15, 0.5];
export function groundSeason(month) {
    const m = Math.min(12, Math.max(1, Math.round(month))) - 1;
    return { moisture: MOISTURE[m], frost: FROST[m], aged: ((m - 3 + 12) % 12) / 11 };
}

const STRAW = '#c8b07a', DRY_LEAF = '#6b5436', OLD_LEAF = '#4f3c2b', NEEDLE = '#6a5536', SPROUT = '#6f9a3e', GOLD = '#c8a458';
const inBloom = (plant, month) => {
    if (!Array.isArray(plant.bloom)) return false;
    const [a, b] = plant.bloom;
    return a <= b ? month >= a && month <= b : month >= a || month <= b;
};
const LEAF = [1, 0, 0], PETAL = [0, 1, 0], THIN = [0, 0, 1];

// Что лежит под растением в этом месяце: цвет, доля (0…1), вид — [лист,
// лепесток, солома] — и есть ли над землёй крона (тень и влага под ней).
export function groundLitter(plant, month) {
    const foliage = plant.foliage ?? 'evergreen';
    const image = seasonImage(plant, month);
    const canopy = image.visible ? Math.min(1, image.grow[1] + 0.2) : 0;
    const none = { color: null, amount: 0, kind: LEAF, canopy };
    if (inBloom(plant, month) && plant.bloomColor) return { color: plant.bloomColor, amount: 0.18, kind: PETAL, canopy };
    if (foliage === 'deciduous') {
        const autumn = plant.autumnColor ?? GOLD;
        if (month === 10) return { color: autumn, amount: 0.45, kind: LEAF, canopy };
        if (month === 11) return { color: autumn, amount: 0.85, kind: LEAF, canopy };
        if (month === 12 || month <= 2) return { color: OLD_LEAF, amount: 0.7, kind: LEAF, canopy };
        if (month === 3) return { color: OLD_LEAF, amount: 0.35, kind: LEAF, canopy };
        return none;
    }
    if (foliage === 'evergreen') {
        const conifer = ['conifer', 'tree'].includes(plant.category);
        return conifer ? { color: NEEDLE, amount: 0.25, kind: THIN, canopy } : none;
    }
    const grass = foliage === 'grass';
    const cut = plant.cutBack ?? 3;
    if (grass) {
        if (month === cut) return { color: STRAW, amount: 0.6, kind: THIN, canopy };
        if (month === 10) return { color: GOLD, amount: 0.2, kind: THIN, canopy };
        if (month === 11 || month === 12 || month <= 2) return { color: STRAW, amount: 0.35, kind: THIN, canopy };
        if (image.phase === 'spring') return { color: SPROUT, amount: 0.2, kind: PETAL, canopy };
        return none;
    }
    if (month === 10) return { color: DRY_LEAF, amount: 0.3, kind: LEAF, canopy };
    if (month === 11) return { color: DRY_LEAF, amount: 0.45, kind: LEAF, canopy };
    if (month === 12 || month <= 2) return { color: OLD_LEAF, amount: plant.winter === 'gone' ? 0.5 : 0.35, kind: LEAF, canopy };
    if (month === cut && plant.winter === 'stands') return { color: DRY_LEAF, amount: 0.45, kind: THIN, canopy };
    if (image.phase === 'spring') return { color: SPROUT, amount: 0.25, kind: PETAL, canopy };
    return none;
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16));

// Карты растений цветника: сверху, по рамке цветника. litter — цвет опада
// (sRGB) и его доля, kind — веса листа, лепестка, соломы и тень кроны.
// Кусок опада растения — пятно чуть шире его кроны, мягко к краю.
export function plantGroundMaps(bed, instances, library, month, maxSide = 512) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of bed.points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    x0 -= 0.5; z0 -= 0.5; x1 += 0.5; z1 += 0.5;
    const perMetre = Math.min(10, maxSide / Math.max(x1 - x0, z1 - z0));
    const width = Math.max(2, Math.ceil((x1 - x0) * perMetre)), height = Math.max(2, Math.ceil((z1 - z0) * perMetre));
    const colour = new Float32Array(width * height * 3), amount = new Float32Array(width * height), weight = new Float32Array(width * height);
    const kind = new Float32Array(width * height * 3), canopy = new Float32Array(width * height);
    const looks = new Map();
    for (const p of instances) {
        const plant = library.get(p.plant);
        if (!plant) continue;
        if (!looks.has(plant.id)) looks.set(plant.id, groundLitter(plant, month));
        const look = looks.get(plant.id);
        const radius = Math.max(0.08, (plant.spread ?? 0.5) * (p.scale ?? 1) * 0.58);
        const rgb = look.color ? hexRgb(look.color) : null;
        const ci = (p.x - x0) * perMetre, cj = (p.z - z0) * perMetre, r = radius * perMetre;
        for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(height - 1, Math.ceil(cj + r)); j += 1) {
            for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(width - 1, Math.ceil(ci + r)); i += 1) {
                const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / r;
                if (d >= 1) continue;
                const w = (1 - d * d) ** 2, k = j * width + i;
                canopy[k] = Math.max(canopy[k], w * look.canopy);
                if (!rgb || !look.amount) continue;
                const a = w * look.amount;
                colour[k * 3] += rgb[0] * a; colour[k * 3 + 1] += rgb[1] * a; colour[k * 3 + 2] += rgb[2] * a;
                kind[k * 3] += look.kind[0] * a; kind[k * 3 + 1] += look.kind[1] * a; kind[k * 3 + 2] += look.kind[2] * a;
                weight[k] += a;
                amount[k] = Math.max(amount[k], a);
            }
        }
    }
    const litter = new Uint8Array(width * height * 4), kinds = new Uint8Array(width * height * 4);
    for (let k = 0; k < width * height; k += 1) {
        const w = weight[k];
        for (let c = 0; c < 3; c += 1) {
            litter[k * 4 + c] = w > 0 ? Math.round(colour[k * 3 + c] / w) : 0;
            kinds[k * 4 + c] = w > 0 ? Math.round((kind[k * 3 + c] / w) * 255) : 0;
        }
        litter[k * 4 + 3] = Math.round(Math.min(1, amount[k]) * 255);
        kinds[k * 4 + 3] = Math.round(Math.min(1, canopy[k]) * 255);
    }
    return { width, height, litter, kinds, frame: [x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)] };
}

// Сетка грунта: контур цветника с дырками; на неровной поверхности (сетка
// высот цветника) треугольники дробятся до шага 0,4 м и ложатся по ней.
export function bedGroundGeometry(bed, lift = GROUND_LIFT) {
    const shape = new THREE.Shape(bed.points.map(([x, z]) => new THREE.Vector2(x, z)));
    for (const hole of bed.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
    const flat = new THREE.ShapeGeometry(shape);
    const source = flat.index ? flat.toNonIndexed() : flat;
    const position = source.attributes.position;
    const triangles = [];
    for (let i = 0; i < position.count; i += 3) triangles.push([0, 1, 2].map((k) => [position.getX(i + k), position.getY(i + k)]));
    flat.dispose();
    if (source !== flat) source.dispose();
    const out = [];
    const limit = bed.ground ? 0.4 : Infinity;
    const split = (tri, depth) => {
        const lengths = [0, 1, 2].map((k) => Math.hypot(tri[k][0] - tri[(k + 1) % 3][0], tri[k][1] - tri[(k + 1) % 3][1]));
        if (depth > 8 || Math.max(...lengths) <= limit) { out.push(tri); return; }
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [a, b, c] = tri, ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        for (const next of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) split(next, depth + 1);
    };
    triangles.forEach((tri) => split(tri, 0));
    const vertices = new Float32Array(out.length * 9);
    out.forEach((tri, t) => tri.forEach(([x, z], k) => vertices.set([x, groundAt(bed, x, z) + lift, z], t * 9 + k * 3)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    // Shape лежит в плоскости XY: после переноса в XZ обход треугольников
    // перевёрнут — нормали должны смотреть вверх.
    const index = [];
    for (let t = 0; t < out.length; t += 1) index.push(t * 3, t * 3 + 2, t * 3 + 1);
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
}

// --- плитки: рисуются один раз на рендерер ---------------------------------------

export const BAKE_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const BAKE_COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// Шум с периодом period узлов: плитка стыкуется сама с собой.
float pnoise(vec2 p, float period) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    float a = hash12(mod(i, period)), b = hash12(mod(i + vec2(1.0, 0.0), period));
    float c = hash12(mod(i + vec2(0.0, 1.0), period)), d = hash12(mod(i + 1.0, period));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 p, float period) {
    float sum = 0.0, amp = 0.5;
    for (int k = 0; k < 5; k++) { sum += amp * pnoise(p, period); p *= 2.0; period *= 2.0; amp *= 0.5; }
    return sum / 0.96875;
}
vec2 rotate(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x + s * v.y, -s * v.x + c * v.y); }`;

// Кора: щепа — скруглённые пластинки в 5×5 соседних ячейках, наверху та, что
// выше; между ними — земля с комьями и песчинками. rgb — цвет (линейный),
// a — высота 0…1.
const MULCH_FRAGMENT = /* glsl */`${BAKE_COMMON}
const float CELLS = 36.0;
void main() {
    vec2 q = vUv * CELLS;
    vec2 base = floor(q);
    float soilNoise = pfbm(vUv * 18.0, 18.0);
    float height = 0.1 * soilNoise + 0.08 * pnoise(vUv * 150.0, 150.0);
    vec3 colour = mix(vec3(0.018, 0.012, 0.009), vec3(0.05, 0.036, 0.027), soilNoise);
    float grit = step(0.992, hash12(floor(vUv * 1024.0) + 7.0));
    colour = mix(colour, vec3(0.16, 0.15, 0.13), grit * 0.8);
    float best = -1.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec2 cell = base + vec2(float(i), float(j));
        for (int k = 0; k < 2; k++) {
            vec2 id = mod(cell, CELLS) + float(k) * 91.7;
            if (hash12(id + 3.3) < 0.18) continue;
            vec2 centre = cell + hash22(id);
            float angle = hash12(id + 5.1) * 6.2831;
            float halfLength = mix(0.35, 1.25, pow(hash12(id + 9.7), 1.4));
            float halfWidth = halfLength * mix(0.22, 0.5, hash12(id + 2.9));
            vec2 local = rotate(q - centre, angle);
            float corner = halfWidth * 0.55;
            vec2 e = abs(local) - vec2(halfLength, halfWidth) + corner;
            float sdf = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - corner;
            if (sdf > 0.0) continue;
            float layer = 0.3 + 0.55 * hash12(id + 13.1);
            float top = layer + 0.16 * smoothstep(0.0, 0.18, -sdf) + 0.03 * pnoise(local * vec2(3.0, 20.0) + id, 1000.0);
            if (top <= best) continue;
            best = top;
            float tone = hash12(id + 17.3);
            vec3 bark = tone < 0.35 ? vec3(0.125, 0.045, 0.02) : tone < 0.65 ? vec3(0.1, 0.055, 0.03) : tone < 0.88 ? vec3(0.14, 0.1, 0.07) : vec3(0.05, 0.028, 0.016);
            float fibre = pnoise(vec2(local.x * 4.0, local.y * 42.0) + id * 3.0, 1000.0);
            bark *= mix(0.62, 1.22, fibre) * mix(0.55, 1.0, smoothstep(0.0, 0.12, -sdf));
            colour = bark;
            height = top;
        }
    }
    gl_FragColor = vec4(colour, clamp(height, 0.0, 1.0));
}`;

// Опад: r — лист (заострённый овал с жилкой), g — лепесток или росток
// (кружок), b — соломина (тонкая полоска). В канале 0 — пусто, иначе
// 0,5 + 0,5 × случайное число кусочка: по нему решается, виден ли он при
// такой доле опада. a — высота опада (лист чуть выгнут).
const LITTER_FRAGMENT = /* glsl */`${BAKE_COMMON}
float mark(float rand) { return 0.5 + 0.5 * rand; }
void main() {
    vec4 outColour = vec4(0.0);
    // Листья: ячейка 5,5 см.
    {
        const float CELLS = 22.0;
        vec2 q = vUv * CELLS, base = floor(q);
        float best = -1.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 cell = base + vec2(float(i), float(j)), id = mod(cell, CELLS);
            if (hash12(id + 1.7) < 0.12) continue;
            vec2 local = rotate(q - cell - hash22(id + 4.2), hash12(id + 8.8) * 6.2831);
            float len = mix(0.35, 0.75, hash12(id + 2.2)), wid = len * mix(0.3, 0.5, hash12(id + 6.6));
            float x = local.x / len;
            if (abs(x) >= 1.0) continue;
            float edge = wid * (1.0 - x * x);
            if (abs(local.y) >= edge) continue;
            float layer = hash12(id + 12.5);
            if (layer <= best) continue;
            best = layer;
            float vein = smoothstep(0.02, 0.07, abs(local.y) / max(edge, 1e-3) * 0.2);
            outColour.r = mark(hash12(id + 21.0));
            outColour.a = mix(0.35, 0.6, 1.0 - abs(local.y) / edge) * mix(0.8, 1.0, vein);
        }
    }
    // Лепестки и ростки: ячейка 2 см.
    {
        const float CELLS = 60.0;
        vec2 q = vUv * CELLS, base = floor(q);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 cell = base + vec2(float(i), float(j)), id = mod(cell, CELLS);
            if (hash12(id + 31.7) < 0.25) continue;
            vec2 local = rotate(q - cell - hash22(id + 33.2), hash12(id + 35.8) * 6.2831);
            float r = mix(0.18, 0.36, hash12(id + 37.1));
            if (length(local / vec2(r, r * 0.7)) >= 1.0) continue;
            outColour.g = mark(hash12(id + 39.0));
            outColour.a = max(outColour.a, 0.3);
        }
    }
    // Солома и хвоя: ячейка 7,5 см, полоски до 15 см.
    {
        const float CELLS = 16.0;
        vec2 q = vUv * CELLS, base = floor(q);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            vec2 cell = base + vec2(float(i), float(j)), id = mod(cell, CELLS);
            for (int k = 0; k < 3; k++) {
                vec2 kid = id + float(k) * 57.3;
                vec2 local = rotate(q - cell - hash22(kid + 41.2), hash12(kid + 43.8) * 6.2831);
                float half_ = mix(0.4, 1.1, hash12(kid + 45.1)), wide = mix(0.018, 0.04, hash12(kid + 47.3));
                if (abs(local.x) >= half_ || abs(local.y) >= wide * (1.0 - 0.5 * abs(local.x) / half_)) continue;
                outColour.b = mark(hash12(kid + 49.0));
                outColour.a = max(outColour.a, 0.25);
            }
        }
    }
    gl_FragColor = outColour;
}`;

const tiles = new WeakMap();
// Плитки грунта и опада: HalfFloat (тёмная земля в 8 битах шла бы ступенями),
// с мипмапами и повтором.
export function bakeGroundTiles(renderer, size = 1024) {
    if (tiles.has(renderer)) return tiles.get(renderer);
    const make = (fragmentShader) => {
        const target = new THREE.WebGLRenderTarget(size, size, {
            type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
        });
        target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const material = new THREE.ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader, depthTest: false, depthWrite: false });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        const scene = new THREE.Scene();
        scene.add(quad);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const previous = renderer.getRenderTarget();
        const xr = renderer.xr.enabled;
        renderer.xr.enabled = false;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(previous);
        renderer.xr.enabled = xr;
        quad.geometry.dispose();
        material.dispose();
        return target;
    };
    const baked = { ground: make(MULCH_FRAGMENT), litter: make(LITTER_FRAGMENT) };
    tiles.set(renderer, baked);
    return baked;
}

// --- материал грунта -------------------------------------------------------------

const GROUND_VERTEX_DECL = /* glsl */`
varying vec3 vGroundWorld;
varying vec3 vGroundUp;`;
const GROUND_FRAGMENT_DECL = /* glsl */`
uniform sampler2D uGroundTile, uLitterTile, uPlantLitter, uPlantKind;
uniform vec4 uPlantFrame;
uniform float uMoisture, uFrost, uAged;
varying vec3 vGroundWorld;
varying vec3 vGroundUp;
const float GROUND_TILE = ${GROUND_TILE.toFixed(3)};
const float LITTER_TILE = ${LITTER_TILE.toFixed(3)};
const float GROUND_DEPTH = ${GROUND_DEPTH.toFixed(4)};
float groundLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`;

// Параллакс: луч взгляда спускается по высоте коры (до 20 шагов вскользь,
// 8 — сверху, дальше 30 м — плоско), потом вся раскраска — в найденной точке.
const GROUND_MAP_FRAGMENT = /* glsl */`
vec3 groundN = normalize(vGroundUp);
vec3 groundT = normalize(vec3(1.0, 0.0, 0.0) - groundN * groundN.x);
vec3 groundB = cross(groundN, groundT);
vec3 groundView = normalize(cameraPosition - vGroundWorld);
vec3 groundTv = vec3(dot(groundView, groundT), dot(groundView, groundB), dot(groundView, groundN));
vec2 groundBase = vec2(vGroundWorld.x, -vGroundWorld.z) / GROUND_TILE;
vec2 groundDx = dFdx(groundBase), groundDy = dFdy(groundBase);
float groundDistance = length(cameraPosition - vGroundWorld);
float groundDepth = GROUND_DEPTH / GROUND_TILE * (1.0 - smoothstep(12.0, 30.0, groundDistance));
vec2 groundUv = groundBase;
if (groundDepth > 1e-6) {
    float layers = mix(20.0, 8.0, clamp(groundTv.z, 0.0, 1.0));
    float stepH = 1.0 / layers;
    vec2 delta = groundTv.xy / max(groundTv.z, 0.15) * groundDepth / layers;
    float rayH = 1.0;
    float surfaceH = textureGrad(uGroundTile, groundUv, groundDx, groundDy).a;
    for (int i = 0; i < 20; i++) {
        if (float(i) >= layers || surfaceH >= rayH) break;
        groundUv -= delta;
        rayH -= stepH;
        surfaceH = textureGrad(uGroundTile, groundUv, groundDx, groundDy).a;
    }
    vec2 previousUv = groundUv + delta;
    float after = surfaceH - rayH;
    float before = textureGrad(uGroundTile, previousUv, groundDx, groundDy).a - (rayH + stepH);
    groundUv = mix(groundUv, previousUv, clamp(after / (after - before + 1e-5), 0.0, 1.0));
}
vec4 groundSample = textureGrad(uGroundTile, groundUv, groundDx, groundDy);
vec2 groundWorldXZ = vec2(groundUv.x, -groundUv.y) * GROUND_TILE;
vec2 litterScale = vec2(GROUND_TILE / LITTER_TILE);
vec4 litter = textureGrad(uLitterTile, groundUv * litterScale, groundDx * litterScale, groundDy * litterScale);
vec2 plantUv = (groundWorldXZ - uPlantFrame.xy) * uPlantFrame.zw;
vec4 plantLitter = texture2D(uPlantLitter, plantUv);
vec4 plantKind = texture2D(uPlantKind, plantUv);

// Кора: влажная — темнее (в низинах сильнее), к осени выцветает; под кроной — тень.
vec3 groundColour = groundSample.rgb;
float groundWet = clamp(uMoisture + plantKind.a * 0.25, 0.0, 1.0);
groundColour *= mix(1.0, 0.62, groundWet * (1.0 - 0.5 * groundSample.a));
groundColour = mix(groundColour, vec3(groundLum(groundColour)) * vec3(1.06, 1.0, 0.92), uAged * 0.3);
groundColour *= mix(1.0, 0.78, plantKind.a);

// Опад: кусочек виден, если его случайное число меньше доли опада этого вида.
float litterAmount = plantLitter.a;
float showLeaf = step(0.5, litter.r) * step(litter.r * 2.0 - 1.0, litterAmount * plantKind.r);
float showPetal = step(0.5, litter.g) * step(litter.g * 2.0 - 1.0, litterAmount * plantKind.g);
float showStraw = step(0.5, litter.b) * step(litter.b * 2.0 - 1.0, litterAmount * plantKind.b);
vec3 litterBase = plantLitter.rgb;
float leafRand = fract((litter.r * 2.0 - 1.0) * 7.31);
vec3 leafColour = mix(litterBase, litterBase * vec3(0.72, 0.58, 0.42), leafRand * 0.8) * mix(0.8, 1.15, fract(leafRand * 3.7));
vec3 petalColour = litterBase * mix(0.82, 1.12, fract((litter.g * 2.0 - 1.0) * 5.3));
vec3 strawColour = litterBase * mix(0.75, 1.1, fract((litter.b * 2.0 - 1.0) * 4.1));
groundColour = mix(groundColour, petalColour, showPetal);
groundColour = mix(groundColour, strawColour, showStraw);
groundColour = mix(groundColour, leafColour, showLeaf);
float groundHeight = max(groundSample.a, max(showLeaf, max(showPetal, showStraw)) * (0.75 + 0.25 * litter.a));

// Иней — налёт на выступах щепы и листьев, а не снег.
float groundFrost = uFrost * (0.1 + 0.38 * smoothstep(0.5, 0.95, groundHeight));
groundColour = mix(groundColour, vec3(0.5, 0.55, 0.6), groundFrost);
diffuseColor.rgb = groundColour;
float groundLitterShown = max(showLeaf, max(showPetal, showStraw));
float groundRough = mix(mix(0.9, 0.62, groundWet), 0.72, groundLitterShown);
groundRough = mix(groundRough, 0.95, groundFrost);
float groundAO = mix(0.5, 1.0, smoothstep(0.1, 0.8, groundHeight));`;

// Нормаль — из высоты коры в найденной точке (разность соседних текселей).
const GROUND_NORMAL_FRAGMENT = /* glsl */`
{
    vec2 texel = vec2(1.0 / 1024.0);
    float h0 = groundHeight;
    float hx = textureGrad(uGroundTile, groundUv + vec2(texel.x, 0.0), groundDx, groundDy).a;
    float hy = textureGrad(uGroundTile, groundUv + vec2(0.0, texel.y), groundDx, groundDy).a;
    float bump = GROUND_DEPTH / (GROUND_TILE / 1024.0) * (1.0 - smoothstep(20.0, 45.0, groundDistance)) * (1.0 - groundLitterShown * 0.6);
    vec3 tangentNormal = normalize(vec3((h0 - hx) * bump, (h0 - hy) * bump, 1.0));
    vec3 worldNormal = normalize(groundT * tangentNormal.x + groundB * tangentNormal.y + groundN * tangentNormal.z);
    normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
}`;

export function makeGroundMaterial(baked) {
    const uniforms = {
        uGroundTile: { value: baked.ground.texture }, uLitterTile: { value: baked.litter.texture },
        uPlantLitter: { value: null }, uPlantKind: { value: null }, uPlantFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
        uMoisture: { value: 0.3 }, uFrost: { value: 0 }, uAged: { value: 0.3 },
    };
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${GROUND_VERTEX_DECL}`)
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
    vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vGroundUp = normalize(mat3(modelMatrix) * objectNormal);`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${GROUND_FRAGMENT_DECL}`)
            .replace('#include <map_fragment>', GROUND_MAP_FRAGMENT)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n    roughnessFactor = groundRough;')
            .replace('#include <normal_fragment_maps>', GROUND_NORMAL_FRAGMENT)
            .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n    reflectedLight.indirectDiffuse *= groundAO;\n    reflectedLight.indirectSpecular *= groundAO;');
    };
    material.customProgramCacheKey = () => 'planting-bed-ground-v1';
    return { material, uniforms };
}

// Карты растений → текстуры (цвет опада — sRGB, веса и тень — как есть).
export function plantMapTextures(maps, previous) {
    previous?.litter.dispose();
    previous?.kind.dispose();
    const texture = (data, colour) => {
        const map = new THREE.DataTexture(data, maps.width, maps.height, THREE.RGBAFormat);
        map.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        map.magFilter = THREE.LinearFilter;
        map.minFilter = THREE.LinearFilter;
        map.needsUpdate = true;
        return map;
    };
    return { litter: texture(maps.litter, true), kind: texture(maps.kinds, false) };
}
