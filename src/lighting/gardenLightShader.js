import * as THREE from 'three';

// Световое поле сада в шейдерах (docs/garden-lighting-2026-09-25.md).
// Светильники — не источники three.js: те входят в ключ программы (добавить
// один — пересобрать все шейдеры) и стоят итерацию в каждом пикселе. Здесь
// все светы лежат строками float-текстуры, участок в плане — сеткой клеток
// со списками до 16 светов (lightField.js), и пиксель перебирает только
// список своей клетки. Цена ограничена, число приборов в программу не входит.
//
// Вставляется одним местом для всех освещённых Standard/Physical
// материалов — там же, где тени облаков (applyCloudShadowShader: и путь CSM,
// и без него), перед #include <lights_fragment_maps>: в области видны
// geometryPosition/Normal/ViewDir, material и reflectedLight, и RE_Direct
// отвечает собственным PBR материала (диффуз, блик, стекло). Мировая точка
// пикселя — из viewMatrix, поэтому свет верен и в отражении воды, и в кубе
// стекла. Униформы одни на всех (как ветер сада): текстуры меняются на месте.
const texture = (data, width, height, format) => {
    const tex = new THREE.DataTexture(data, width, height, format, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
};

export const gardenLightUniforms = Object.freeze({
    uGardenLights: { value: texture(new Float32Array(16), 4, 1, THREE.RGBAFormat) },
    uGardenGrid: { value: texture(new Float32Array([-1, -1, -1, -1]), 1, 1, THREE.RGBAFormat) },
    uGardenProfiles: { value: texture(new Float32Array(128), 128, 1, THREE.RedFormat) },
    uGardenGridInfo: { value: new THREE.Vector4(0, 0, 1, 0) },
    uGardenGridSize: { value: new THREE.Vector2(0, 0) },
    // Итоговый множитель: люксы → сцена × экспозиция света × фотореле.
    uGardenLevel: { value: 0 },
    // Тени (gardenShadows.js): атлас глубины и (плиток в ряд — 0, если теней
    // нет; пикселей в плитке; логарифмическая глубина 1/0; не занято).
    uGardenShadowMap: { value: texture(new Float32Array([1]), 1, 1, THREE.RedFormat) },
    uGardenShadowInfo: { value: new THREE.Vector4(0, 256, 1, 0) },
});

// Текстура того же размера перезаписывается, другого — заменяется.
function refill(uniform, data, width, height, format) {
    const current = uniform.value;
    if (current.image.width === width && current.image.height === height) {
        current.image.data.set(data);
        current.needsUpdate = true;
        return;
    }
    uniform.value = texture(data, width, height, format);
    current.dispose();
}

// field — результат packLightField, profiles — Float32Array(128 · строк).
export function setGardenLightField(field, profiles, rows) {
    const u = gardenLightUniforms;
    refill(u.uGardenLights, field.lightData, 4, field.capacity, THREE.RGBAFormat);
    refill(u.uGardenGrid, field.grid.data, field.grid.width, field.grid.rows, THREE.RGBAFormat);
    refill(u.uGardenProfiles, profiles, 128, Math.max(1, rows), THREE.RedFormat);
    u.uGardenGridInfo.value.set(field.grid.minX, field.grid.minZ, 1 / field.grid.cell, 0);
    u.uGardenGridSize.value.set(field.count ? field.grid.cols : 0, field.grid.rows);
}

const PARS = /* glsl */`
#define DDG_GARDEN_LIGHTS
uniform highp sampler2D uGardenLights;
uniform highp sampler2D uGardenGrid;
uniform highp sampler2D uGardenProfiles;
uniform vec4 uGardenGridInfo;
uniform vec2 uGardenGridSize;
uniform float uGardenLevel;
uniform highp sampler2D uGardenShadowMap;
uniform vec4 uGardenShadowInfo;
// Сколько света доходит до точки мимо моделей и растений: плитка атласа этого
// света (спот — своя, широкий — грань куба по направлению от света), глубина
// взгляда от светильника против глубины в плитке, четыре соседних текселя с
// весами — мягкий край. Точка сдвинута к свету на полтора текселя (иначе
// поверхность затеняла бы сама себя); вырезанная карточка — на крону (bias).
// Базис камеры плитки — как в tileBasis (gardenShadows.js).
float ddgGardenShadow(vec3 light, vec3 axis, vec4 t3, float far, vec3 world, vec3 normal, float bias) {
    if (uGardenShadowInfo.x < 0.5 || t3.y < 0.0) return 1.0;
    vec3 d = world - light;
    vec3 dir = axis;
    float tanHalf = t3.w;
    int tile = int(t3.y + 0.5);
    if (t3.z > 0.5) {
        vec3 a = abs(d);
        int face = (a.x >= a.y && a.x >= a.z) ? (d.x > 0.0 ? 0 : 1) : (a.y >= a.z ? (d.y > 0.0 ? 2 : 3) : (d.z > 0.0 ? 4 : 5));
        int mask = int(t3.z + 0.5) - 64;
        if (((mask >> face) & 1) == 0) return 1.0;
        for (int f = 0; f < 6; f++) if (f < face && ((mask >> f) & 1) == 1) tile++;
        dir = face == 0 ? vec3(1.0, 0.0, 0.0) : face == 1 ? vec3(-1.0, 0.0, 0.0) : face == 2 ? vec3(0.0, 1.0, 0.0) : face == 3 ? vec3(0.0, -1.0, 0.0) : face == 4 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
        tanHalf = 1.0;
    }
    vec3 up = abs(dir.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 fz = -dir, fx = normalize(cross(up, fz)), fy = cross(fz, fx);
    float res = uGardenShadowInfo.y;
    float texel = 2.0 * tanHalf * max(-dot(d, fz), 0.05) / res;
    vec3 p = d + (dot(normal, d) > 0.0 ? -normal : normal) * texel * 1.5;
    float w = -dot(p, fz);
    if (w <= 0.03) return 1.0;
    vec2 ndc = vec2(dot(p, fx), dot(p, fy)) / (w * tanHalf);
    if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) return 1.0;
    float perRow = uGardenShadowInfo.x;
    vec2 origin = vec2(mod(float(tile), perRow), floor(float(tile) / perRow)) * res;
    vec2 at = origin + (ndc * 0.5 + 0.5) * res - 0.5;
    vec2 base = floor(at), f = at - base;
    float depthScale = log2(far + 1.0), reach = w - bias - 0.004 * w;
    float lit = 0.0;
    for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k & 1), float(k >> 1));
        vec2 c = clamp(base + o, origin, origin + res - 1.0);
        float s = texelFetch(uGardenShadowMap, ivec2(c), 0).r;
        float occluder = uGardenShadowInfo.z > 0.5 ? exp2(s * depthScale) - 1.0
            : 2.0 * 0.03 * far / ((far + 0.03) - (s * 2.0 - 1.0) * (far - 0.03));
        lit += (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y) * step(reach, occluder);
    }
    return lit;
}
// Сила света по углу от оси луча: строка профиля, 128 отсчётов на 0…π.
float ddgGardenProfile(float row, float cosA) {
    float u = acos(clamp(cosA, -1.0, 1.0)) * (127.0 / PI);
    int i0 = min(int(u), 126);
    float a = texelFetch(uGardenProfiles, ivec2(i0, int(row)), 0).r;
    float b = texelFetch(uGardenProfiles, ivec2(i0 + 1, int(row)), 0).r;
    return mix(a, b, clamp(u - float(i0), 0.0, 1.0));
}
`;

// Закон обратных квадратов с размером излучателя и окном three.js
// (1 − (d/r)⁴)² — к краю дальности свет сходит в ноль, швов по клеткам нет.
// Вырезанные карточки (растения, 2D-деревья модели) пропускают свет насквозь:
// фонарь под кроной светит в изнанку листа.
const LOOP = /* glsl */`
// ddgGardenLights
if (uGardenLevel > 0.0) {
    vec3 ddgGardenWorld = transpose(mat3(viewMatrix)) * (geometryPosition - viewMatrix[3].xyz);
    vec3 ddgGardenNormal = transpose(mat3(viewMatrix)) * geometryNormal;
#ifdef USE_ALPHATEST
    // Карточка кроны в карте теней развёрнута к светильнику, в кадре — к
    // камере: без запаса в размер кроны она затеняла бы сама себя клином.
    float ddgGardenBias = 2.5;
#else
    float ddgGardenBias = 0.03;
#endif
    vec2 ddgGardenCell = (ddgGardenWorld.xz - uGardenGridInfo.xy) * uGardenGridInfo.z;
    if (all(greaterThanEqual(ddgGardenCell, vec2(0.0))) && all(lessThan(ddgGardenCell, uGardenGridSize))) {
        ivec2 ddgCell = ivec2(ddgGardenCell);
        IncidentLight ddgGardenLight;
        ddgGardenLight.visible = true;
        for (int ddgK = 0; ddgK < 16; ddgK++) {
            float ddgId = texelFetch(uGardenGrid, ivec2(ddgCell.x * 4 + (ddgK >> 2), ddgCell.y), 0)[ddgK & 3];
            if (ddgId < 0.0) break;
            int ddgI = int(ddgId);
            vec4 ddgT0 = texelFetch(uGardenLights, ivec2(0, ddgI), 0);
            vec3 ddgToLight = ddgT0.xyz - ddgGardenWorld;
            float ddgD2 = dot(ddgToLight, ddgToLight);
            if (ddgD2 >= ddgT0.w * ddgT0.w) continue;
            vec4 ddgT1 = texelFetch(uGardenLights, ivec2(1, ddgI), 0);
            float ddgD = sqrt(ddgD2);
            vec3 ddgL = ddgToLight / max(ddgD, 1e-4);
            float ddgProfile = ddgGardenProfile(ddgT1.w, dot(-ddgL, ddgT1.xyz));
            if (ddgProfile <= 0.0) continue;
            float ddgShade = ddgGardenShadow(ddgT0.xyz, ddgT1.xyz, texelFetch(uGardenLights, ivec2(3, ddgI), 0), ddgT0.w, ddgGardenWorld, ddgGardenNormal, ddgGardenBias);
            if (ddgShade <= 0.0) continue;
            vec4 ddgT2 = texelFetch(uGardenLights, ivec2(2, ddgI), 0);
            float ddgWindow = saturate(1.0 - pow4(ddgD / ddgT0.w));
            ddgGardenLight.color = ddgT2.rgb * (ddgShade * ddgProfile * ddgWindow * ddgWindow / max(ddgD2 + ddgT2.w * ddgT2.w, 1e-4) * uGardenLevel);
            ddgGardenLight.direction = normalize(mat3(viewMatrix) * ddgL);
            RE_Direct(ddgGardenLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
#ifdef USE_ALPHATEST
            reflectedLight.directDiffuse += ddgGardenLight.color * max(dot(-geometryNormal, ddgGardenLight.direction), 0.0) * BRDF_Lambert(material.diffuseColor) * 0.6;
#endif
        }
    }
}
`;

// Атлас теней в униформы: size — пикселей атласа, 0 — теней нет.
export function setGardenShadowMap(texture, perRow, tile, logarithmic) {
    const u = gardenLightUniforms;
    if (texture) u.uGardenShadowMap.value = texture;
    u.uGardenShadowInfo.value.set(texture ? perRow : 0, tile, logarithmic ? 1 : 0, 0);
}

export function applyGardenLightShader(shader) {
    Object.assign(shader.uniforms, gardenLightUniforms);
    if (shader.fragmentShader.includes('ddgGardenLights') || !shader.fragmentShader.includes('#include <lights_fragment_maps>')) return;
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PARS}`)
        .replace('#include <lights_fragment_maps>', `${LOOP}\n#include <lights_fragment_maps>`);
}
