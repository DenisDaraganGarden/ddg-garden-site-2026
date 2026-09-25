import * as THREE from 'three';
import { BAKE_COMMON, BAKE_VERTEX } from './bedGround.js';

// Газон — само покрытие и есть трава (цветник kind: 'lawn', settings.js):
// процедурный, как грунт цветника (bedGround.js). Плитка травинок — цвет и
// высота — рисуется один раз на GPU; материал спускает луч взгляда сквозь
// траву (параллакс), и травинки наклонены по стрижке: косилка кладёт траву
// по ходу прохода, соседний проход — навстречу, поэтому полосы видны —
// трава, лежащая от смотрящего, светлее, к нему — темнее. Клетка и ромбы —
// два прохода накрест, ровно — без наклона, луг — высокая некошеная трава.
// Месяц — цвет (весенняя свежесть, летняя зелень, без полива — выгорание в
// жару, осенняя тусклость, зимний покой) и иней; опад и тень — от деревьев
// на газоне и рядом (plantGroundMaps по одиночным растениям).
export const LAWN_TILE = 0.5; // м на плитку травы
const LAWN_TILE_PX = 1024;
export const LAWN_PATTERNS = Object.freeze({ plain: 0, stripes: 1, checker: 2, diamond: 3, meadow: 4 });

// Цвет газона по месяцу (sRGB): трава, кончики, дернина под ней; без полива
// летом — пятна выгорания; иней зимой. Ростов: зима с оттепелями, жаркое
// сухое лето.
const GREEN = ['#6c7345', '#697244', '#5d7a39', '#4f8a2e', '#46862b', '#3f7d27', '#3b7425', '#3c7026', '#3f7428', '#4a7430', '#596f38', '#656f41'];
const TIP = ['#9a9467', '#958f63', '#8e9457', '#8cb351', '#7fae45', '#6f9f3d', '#6a963a', '#6d913b', '#70963f', '#7d9148', '#8a8a55', '#948e60'];
const FROST = [0.8, 0.7, 0.15, 0, 0, 0, 0, 0, 0, 0, 0.15, 0.5];
const DROUGHT = [0, 0, 0, 0, 0, 0.12, 0.38, 0.55, 0.22, 0, 0, 0];
const SEED_HEADS = [0, 0, 0, 0, 0.2, 0.55, 0.7, 0.6, 0.35, 0, 0, 0];
export function lawnSeason(month, lawn = {}) {
    const m = Math.min(12, Math.max(1, Math.round(month))) - 1;
    const meadow = lawn.mowing === 'meadow';
    return {
        green: GREEN[m], tip: meadow && SEED_HEADS[m] ? mixHex(TIP[m], '#c2ae72', SEED_HEADS[m]) : TIP[m],
        thatch: '#2f2a1c', dry: '#a8995c',
        dryAmount: lawn.irrigated === false ? DROUGHT[m] : DROUGHT[m] * 0.12,
        frost: FROST[m],
    };
}
function mixHex(a, b, t) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return `#${ca.lerp(cb, t).getHexString()}`;
}

// Узор стрижки для шейдера: угол (рад, от оси +X сцены по часовой, как
// север), ширина прохода, узор, контраст полос.
export function lawnMow(lawn) {
    const pattern = LAWN_PATTERNS[lawn?.mowing] ?? LAWN_PATTERNS.stripes;
    // Ровный газон — без полос: его пестрота — от «пятен».
    const contrast = pattern === LAWN_PATTERNS.plain ? 0.35 * (lawn?.patches ?? 0.3) : lawn?.contrast ?? 0.3;
    return [((lawn?.angle ?? 0) * Math.PI) / 180, lawn?.stripe ?? 0.9, pattern, contrast];
}

export const LAWN_MOWING_LABELS = Object.freeze({ stripes: ['Полосы', 'Stripes'], checker: ['Клетка', 'Checker'], diamond: ['Ромбы', 'Diamonds'], plain: ['Ровно', 'Plain'], meadow: ['Луг', 'Meadow'] });
export const lawnNumber = (value, ru = true, digits = 1) => value.toLocaleString(ru ? 'ru-RU' : 'en-GB', { maximumFractionDigits: digits });
// Сколько брать: рулонного газона — площадь с запасом 5 % на подрезку,
// семян — 35 г/м² (норма посева для смеси с райграсом и овсяницей).
export const lawnTurf = (area) => area * 1.05;
export const lawnSeed = (area) => area * 0.035;
export const lawnNeeds = (area, ru = true) => (ru
    ? `рулонного ≈ ${lawnNumber(lawnTurf(area), ru, 0)} м² (+5 %) · семян ≈ ${lawnNumber(lawnSeed(area), ru)} кг (35 г/м²)`
    : `turf ≈ ${lawnNumber(lawnTurf(area), ru, 0)} m² (+5 %) · seed ≈ ${lawnNumber(lawnSeed(area), ru)} kg (35 g/m²)`);

// Направление проходов по умолчанию — вдоль самой длинной стороны контура:
// так газон и стригут.
export function lawnAngleFor(points) {
    let best = 0, angle = 0;
    points.forEach(([x, z], i) => {
        const [nx, nz] = points[(i + 1) % points.length], length = Math.hypot(nx - x, nz - z);
        if (length > best) { best = length; angle = (Math.atan2(nz - z, nx - x) * 180) / Math.PI; }
    });
    return Math.round(((((angle + 90) % 180) + 180) % 180) - 90);
}

// --- плитка травы: рисуется один раз на рендерер ----------------------------------

// Травинки — тонкие сужающиеся листики в ячейках 6 мм, по две: от корня к
// кончику лист поднимается (высота) и уходит вбок (наклон, случайный); сверху
// — та, что выше. Под ними — дернина и земля. r — тон травинки (случайный),
// g — где на травинке (0 — корень, 1 — кончик), b — травинка или дернина,
// a — высота 0…1.
const LAWN_FRAGMENT = /* glsl */`${BAKE_COMMON}
const float CELLS = 80.0;
void main() {
    vec2 q = vUv * CELLS;
    vec2 base = floor(q);
    float soil = pfbm(vUv * 24.0, 24.0);
    float best = 0.03 + 0.12 * soil;
    vec4 outColour = vec4(0.5 + 0.3 * (soil - 0.5), 0.0, 0.0, best);
    for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
        vec2 cell = base + vec2(float(i), float(j));
        for (int k = 0; k < 2; k++) {
            vec2 id = mod(cell, CELLS) + float(k) * 71.3;
            vec2 root = cell + hash22(id);
            float angle = hash12(id + 3.1) * 6.2831;
            vec2 dir = vec2(cos(angle), sin(angle));
            float tall = mix(0.55, 1.0, hash12(id + 5.7));
            float reach = mix(0.5, 2.4, hash12(id + 9.2)) * tall;
            vec2 d = q - root;
            float t = dot(d, dir) / reach;
            if (t < 0.0 || t > 1.0) continue;
            float halfWidth = mix(0.1, 0.2, hash12(id + 11.4)) * (1.0 - 0.85 * t);
            if (abs(dot(d, vec2(-dir.y, dir.x))) > halfWidth) continue;
            float h = tall * mix(0.12, 1.0, t);
            if (h <= best) continue;
            best = h;
            outColour = vec4(hash12(id + 13.9), t, 1.0, h);
        }
    }
    gl_FragColor = outColour;
}`;

const tiles = new WeakMap();
export function bakeLawnTile(renderer) {
    if (tiles.has(renderer)) return tiles.get(renderer);
    const target = new THREE.WebGLRenderTarget(LAWN_TILE_PX, LAWN_TILE_PX, {
        type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
    });
    target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader: LAWN_FRAGMENT, depthTest: false, depthWrite: false });
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
    tiles.set(renderer, target);
    return target;
}

// --- материал газона ----------------------------------------------------------------

const LAWN_VERTEX_DECL = /* glsl */`
varying vec3 vLawnWorld;
varying vec3 vLawnUp;`;
const LAWN_FRAGMENT_DECL = /* glsl */`
uniform sampler2D uLawnTile, uLitterTile, uPlantLitter, uPlantKind;
uniform vec4 uPlantFrame, uLawnMow;
uniform vec3 uLawnGreen, uLawnTip, uLawnThatch, uLawnDry;
uniform float uLawnDryAmount, uLawnFrost, uLawnDepth, uLawnSeed, uLawnPatches;
uniform vec3 uLawnKey;
varying vec3 vLawnWorld;
varying vec3 vLawnUp;
const float LAWN_TILE = ${LAWN_TILE.toFixed(3)};
const float LAWN_LITTER_TILE = 1.2;
float lawnHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lawnNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lawnHash(i), lawnHash(i + vec2(1.0, 0.0)), u.x), mix(lawnHash(i + vec2(0.0, 1.0)), lawnHash(i + 1.0), u.x), u.y);
}
// Наклон травы в точке (мир xz): длина 0…1 — насколько трава положена,
// направление — куда. Стрижка — проходами; луг — ветер кладёт траву плавными
// вихрями; ровный газон — чуть, вразнобой.
vec2 lawnLean(vec2 xz) {
    float pattern = uLawnMow.z;
    if (pattern < 0.5 || pattern > 3.5) {
        float swirl = lawnNoise(xz * 0.14 + uLawnSeed) * 6.0 + lawnNoise(xz * 0.37 + 11.0 + uLawnSeed) * 1.6;
        return vec2(cos(swirl), sin(swirl)) * (pattern > 3.5 ? 0.8 : 0.6);
    }
    float width = max(uLawnMow.y, 0.05);
    vec2 along = vec2(cos(uLawnMow.x), sin(uLawnMow.x));
    if (pattern > 2.5) along = normalize(along + vec2(-along.y, along.x));
    vec2 across = vec2(-along.y, along.x);
    vec2 lean = along * clamp(cos(3.14159265 * dot(xz, across) / width) * 2.2, -1.0, 1.0);
    if (pattern > 1.5) lean = (lean + across * clamp(cos(3.14159265 * dot(xz, along) / width) * 2.2, -1.0, 1.0)) * 0.7071;
    return lean;
}`;

// Параллакс: луч спускается по высоте травы (до 32 шагов вскользь, 12 —
// сверху; с 5 м глубина гаснет, дальше 16 м — плоско: там трава — средний
// цвет плитки); начало луча сдвинуто на случайную долю шага в каждом
// пикселе — иначе вскользь уровни шагов видны кольцами. Плитка сдвинута по
// высоте в сторону наклона стрижки — травинка над точкой растёт из точки,
// сдвинутой против наклона.
const LAWN_MAP_FRAGMENT = /* glsl */`
vec3 lawnN = normalize(vLawnUp);
vec3 lawnT = normalize(vec3(1.0, 0.0, 0.0) - lawnN * lawnN.x);
vec3 lawnB = cross(lawnN, lawnT);
vec3 lawnView = normalize(cameraPosition - vLawnWorld);
vec3 lawnTv = vec3(dot(lawnView, lawnT), dot(lawnView, lawnB), dot(lawnView, lawnN));
vec2 lawnBase = vec2(vLawnWorld.x, -vLawnWorld.z) / LAWN_TILE;
vec2 lawnDx = dFdx(lawnBase), lawnDy = dFdy(lawnBase);
float lawnDistance = length(cameraPosition - vLawnWorld);
vec2 lawnXZ = vLawnWorld.xz;
vec2 lawnLeanXZ = lawnLean(lawnXZ);
float lawnDepthUv = uLawnDepth / LAWN_TILE;
vec2 lawnShear = vec2(lawnLeanXZ.x, -lawnLeanXZ.y) * 0.45 * lawnDepthUv;
float lawnMarch = lawnDepthUv * (1.0 - smoothstep(5.0, 16.0, lawnDistance));
vec2 lawnUv = lawnBase;
float lawnHit = 1.0;
if (lawnMarch > 1e-6) {
    float layers = mix(32.0, 12.0, clamp(lawnTv.z, 0.0, 1.0));
    float stepH = 1.0 / layers;
    vec2 delta = lawnTv.xy / max(lawnTv.z, 0.12) * lawnMarch / layers;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float rayH = 1.0 - stepH * jitter;
    lawnUv -= delta * jitter;
    float surfaceH = textureGrad(uLawnTile, lawnUv - lawnShear * rayH, lawnDx, lawnDy).a;
    for (int i = 0; i < 32; i++) {
        if (float(i) >= layers || surfaceH >= rayH) break;
        lawnUv -= delta;
        rayH -= stepH;
        surfaceH = textureGrad(uLawnTile, lawnUv - lawnShear * rayH, lawnDx, lawnDy).a;
    }
    vec2 previousUv = lawnUv + delta;
    float after = surfaceH - rayH;
    float before = textureGrad(uLawnTile, previousUv - lawnShear * (rayH + stepH), lawnDx, lawnDy).a - (rayH + stepH);
    float k = clamp(after / (after - before + 1e-5), 0.0, 1.0);
    lawnUv = mix(lawnUv, previousUv, k);
    lawnHit = clamp(mix(rayH, rayH + stepH, k), 0.0, 1.0);
}
vec4 lawnSample = textureGrad(uLawnTile, lawnUv - lawnShear * lawnHit, lawnDx, lawnDy);
float lawnBlade = lawnSample.b, lawnTone = lawnSample.r, lawnAlong = lawnSample.g, lawnHeight = lawnSample.a;

// Тень травы от ключевого света (солнце, ночью луна): луч от найденной точки
// поднимается к свету сквозь траву; выше его травинки — тень, мягко.
vec3 lawnKeyT = vec3(dot(uLawnKey, lawnT), dot(uLawnKey, lawnB), dot(uLawnKey, lawnN));
lawnShadowG = 1.0;
if (lawnMarch > 1e-6 && lawnKeyT.z > 0.02) {
    vec2 lawnKeyStep = lawnKeyT.xy / max(lawnKeyT.z, 0.1) * lawnMarch;
    float lawnBlock = 0.0;
    for (int i = 1; i <= 8; i++) {
        float rise = float(i) / 8.0 * (1.0 - lawnHit);
        float level = lawnHit + rise;
        float above = textureGrad(uLawnTile, lawnUv + lawnKeyStep * rise - lawnShear * level, lawnDx, lawnDy).a - level;
        lawnBlock = max(lawnBlock, above * (1.0 - float(i) / 10.0) * 6.0);
    }
    lawnShadowG = 1.0 - clamp(lawnBlock, 0.0, 1.0) * 0.8;
}
lawnKeyViewG = normalize((viewMatrix * vec4(uLawnKey, 0.0)).xyz);
// Свет сквозь травинки: к кончикам сильнее, дернина не светится.
lawnGlowG = 0.75 * lawnBlade * smoothstep(0.25, 1.0, lawnHeight);

// Зелень пятнами (где трава сочнее, где светлее) и выгорание без полива.
float lawnPatch = lawnNoise(lawnXZ * 0.16 + uLawnSeed) * 0.65 + lawnNoise(lawnXZ * 0.55 + 7.1 + uLawnSeed) * 0.35;
vec3 lawnGreen = uLawnGreen * (1.0 + (lawnPatch - 0.5) * 0.5 * uLawnPatches);
lawnGreen = mix(lawnGreen, lawnGreen * vec3(1.06, 1.03, 0.86), smoothstep(0.55, 0.9, lawnPatch) * uLawnPatches * 0.5);
float lawnDryField = lawnNoise(lawnXZ * 0.15 + 3.7 + uLawnSeed) * 0.75 + lawnNoise(lawnXZ * 0.5 + uLawnSeed * 1.7) * 0.25;
float lawnDry = uLawnDryAmount > 0.001 ? smoothstep(1.0 - uLawnDryAmount - 0.25, 1.0 - uLawnDryAmount + 0.25, lawnDryField) * 0.85 : 0.0;
lawnGreen = mix(lawnGreen, uLawnDry, lawnDry);
vec3 lawnTipColour = mix(uLawnTip, uLawnDry * 1.12, lawnDry);
vec3 lawnBladeColour = mix(lawnGreen, lawnTipColour, smoothstep(0.55, 1.0, lawnAlong) * 0.6);
lawnBladeColour *= mix(0.86, 1.12, lawnTone);
lawnBladeColour = mix(lawnBladeColour, lawnBladeColour * vec3(1.08, 1.02, 0.8), step(0.86, lawnTone) * 0.6);
vec3 lawnColour = mix(uLawnThatch * mix(0.8, 1.2, lawnTone), lawnBladeColour, lawnBlade);

// Полосы: трава, лежащая от смотрящего, светлее; к нему — темнее.
vec2 lawnLook = (vLawnWorld - cameraPosition).xz;
float lawnStripe = dot(lawnLook / max(length(lawnLook), 1e-4), lawnLeanXZ);
lawnColour *= 1.0 + uLawnMow.w * 0.5 * lawnStripe;

// Опад и тень от деревьев (как в грунте цветника).
vec2 lawnPlantUv = (vec2(lawnUv.x, -lawnUv.y) * LAWN_TILE - uPlantFrame.xy) * uPlantFrame.zw;
vec4 lawnPlantLitter = texture2D(uPlantLitter, lawnPlantUv);
vec4 lawnPlantKind = texture2D(uPlantKind, lawnPlantUv);
vec2 lawnLitterScale = vec2(LAWN_TILE / LAWN_LITTER_TILE);
vec4 lawnLitter = textureGrad(uLitterTile, lawnUv * lawnLitterScale, lawnDx * lawnLitterScale, lawnDy * lawnLitterScale);
float lawnLeaf = step(0.5, lawnLitter.r) * step(lawnLitter.r * 2.0 - 1.0, lawnPlantLitter.a * lawnPlantKind.r);
float lawnStraw = step(0.5, lawnLitter.b) * step(lawnLitter.b * 2.0 - 1.0, lawnPlantLitter.a * lawnPlantKind.b);
lawnColour *= mix(1.0, 0.8, lawnPlantKind.a);
float lawnLeafRand = fract((lawnLitter.r * 2.0 - 1.0) * 7.31);
// Лист и солома лежат на траве: их закрывают только травинки выше них.
float lawnLeafLevel = 0.7 + 0.25 * fract(lawnLeafRand * 5.3);
lawnStraw *= step(lawnHeight, 0.8);
lawnLeaf *= step(lawnHeight, lawnLeafLevel);
lawnColour = mix(lawnColour, lawnPlantLitter.rgb * mix(0.75, 1.1, fract((lawnLitter.b * 2.0 - 1.0) * 4.1)), lawnStraw);
lawnColour = mix(lawnColour, mix(lawnPlantLitter.rgb, lawnPlantLitter.rgb * vec3(0.72, 0.58, 0.42), lawnLeafRand * 0.8), lawnLeaf);
float lawnOnTop = max(lawnLeaf, lawnStraw);

// Иней — на кончиках травы.
float lawnFrost = uLawnFrost * smoothstep(0.55, 0.95, lawnHeight) * lawnBlade * (1.0 - lawnOnTop);
lawnColour = mix(lawnColour, vec3(0.6, 0.64, 0.68), lawnFrost * 0.75);
diffuseColor.rgb = lawnColour;
float lawnRough = mix(0.95, 0.84 - 0.08 * uLawnMow.w * max(lawnStripe, 0.0), lawnBlade);
lawnRough = mix(lawnRough, 0.95, lawnFrost);
float lawnAO = mix(mix(0.45, 1.0, pow(max(lawnHeight, 0.0), 0.8)), 0.92, lawnOnTop) * mix(1.0, 0.85, lawnPlantKind.a);`;

// Нормаль — из высоты травы в найденной точке, мягко: травинки стоят.
const LAWN_NORMAL_FRAGMENT = /* glsl */`
{
    vec2 texel = vec2(1.0 / ${LAWN_TILE_PX.toFixed(1)});
    float hx = textureGrad(uLawnTile, lawnUv - lawnShear * lawnHit + vec2(texel.x, 0.0), lawnDx, lawnDy).a;
    float hy = textureGrad(uLawnTile, lawnUv - lawnShear * lawnHit + vec2(0.0, texel.y), lawnDx, lawnDy).a;
    float bump = 0.7 * uLawnDepth / (LAWN_TILE / ${LAWN_TILE_PX.toFixed(1)}) * (1.0 - smoothstep(10.0, 30.0, lawnDistance));
    vec3 tangentNormal = normalize(vec3((lawnHeight - hx) * bump + lawnShear.x * 0.8, (lawnHeight - hy) * bump + lawnShear.y * 0.8, 1.0));
    vec3 worldNormal = normalize(lawnT * tangentNormal.x + lawnB * tangentNormal.y + lawnN * tangentNormal.z);
    normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
}`;

// Прямой свет газона: у ключевого света — тень травы (lawnShadowG, из
// параллакса), у любого — свет сквозь травинки, когда смотришь на свет через
// траву (задний свет); остальное — обычный физический свет three.
const LAWN_DIRECT = /* glsl */`
float lawnShadowG = 1.0;
float lawnGlowG = 0.0;
vec3 lawnKeyViewG = vec3(0.0, 1.0, 0.0);
void RE_Direct_Lawn(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    IncidentLight light = directLight;
    light.color *= mix(1.0, lawnShadowG, step(0.995, dot(light.direction, lawnKeyViewG)));
    RE_Direct_Physical(light, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float back = pow(clamp(-dot(light.direction, geometryViewDir), 0.0, 1.0), 3.0);
    reflectedLight.directDiffuse += light.color * material.diffuseColor * lawnGlowG * back;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Lawn`;

const linear = (hex) => new THREE.Color(hex);
export function makeLawnMaterial(tile, litterTile) {
    const uniforms = {
        uLawnTile: { value: tile.texture }, uLitterTile: { value: litterTile.texture },
        uPlantLitter: { value: null }, uPlantKind: { value: null }, uPlantFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
        uLawnMow: { value: new THREE.Vector4(0, 0.9, 1, 0.55) },
        uLawnGreen: { value: linear(GREEN[5]) }, uLawnTip: { value: linear(TIP[5]) }, uLawnThatch: { value: linear('#2f2a1c') }, uLawnDry: { value: linear('#a8995c') },
        uLawnDryAmount: { value: 0 }, uLawnFrost: { value: 0 }, uLawnDepth: { value: 0.04 }, uLawnSeed: { value: 0 }, uLawnPatches: { value: 0.3 },
        uLawnKey: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    };
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${LAWN_VERTEX_DECL}`)
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
    vLawnWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vLawnUp = normalize(mat3(modelMatrix) * objectNormal);`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${LAWN_FRAGMENT_DECL}`)
            .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${LAWN_DIRECT}`)
            .replace('#include <map_fragment>', LAWN_MAP_FRAGMENT)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n    roughnessFactor = lawnRough;')
            .replace('#include <normal_fragment_maps>', LAWN_NORMAL_FRAGMENT)
            .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n    reflectedLight.indirectDiffuse *= lawnAO;\n    reflectedLight.indirectSpecular *= lawnAO * 0.45;\n    reflectedLight.directDiffuse *= mix(1.0, lawnAO, 0.5);');
    };
    material.customProgramCacheKey = () => 'planting-lawn-v4';
    return { material, uniforms };
}

// Месяц, стрижка и высота травы → униформы материала. Иней — к полудню тает
// (hour — время суток сцены); key — направление на ключевой свет (мир).
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function setLawnUniforms(uniforms, lawn, month, seed = 0, hour = 12, key = null) {
    const season = lawnSeason(month, lawn);
    const daylight = smooth(8.5, 11, hour) * (1 - smooth(15.5, 18, hour));
    if (key) uniforms.uLawnKey.value.set(key[0], key[1], key[2]).normalize();
    uniforms.uLawnGreen.value.set(season.green);
    uniforms.uLawnTip.value.set(season.tip);
    uniforms.uLawnThatch.value.set(season.thatch);
    uniforms.uLawnDry.value.set(season.dry);
    uniforms.uLawnDryAmount.value = season.dryAmount;
    uniforms.uLawnFrost.value = season.frost * (1 - 0.8 * daylight);
    uniforms.uLawnMow.value.set(...lawnMow(lawn));
    uniforms.uLawnDepth.value = Math.max(0.02, (lawn?.cut ?? 4) / 100);
    uniforms.uLawnSeed.value = (seed % 997) * 0.37;
    uniforms.uLawnPatches.value = lawn?.patches ?? 0.3;
}
