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
            vec4 ddgT2 = texelFetch(uGardenLights, ivec2(2, ddgI), 0);
            float ddgWindow = saturate(1.0 - pow4(ddgD / ddgT0.w));
            ddgGardenLight.color = ddgT2.rgb * (ddgProfile * ddgWindow * ddgWindow / max(ddgD2 + ddgT2.w * ddgT2.w, 1e-4) * uGardenLevel);
            ddgGardenLight.direction = normalize(mat3(viewMatrix) * ddgL);
            RE_Direct(ddgGardenLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
#ifdef USE_ALPHATEST
            reflectedLight.directDiffuse += ddgGardenLight.color * max(dot(-geometryNormal, ddgGardenLight.direction), 0.0) * BRDF_Lambert(material.diffuseColor) * 0.6;
#endif
        }
    }
}
`;

export function applyGardenLightShader(shader) {
    Object.assign(shader.uniforms, gardenLightUniforms);
    if (shader.fragmentShader.includes('ddgGardenLights') || !shader.fragmentShader.includes('#include <lights_fragment_maps>')) return;
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PARS}`)
        .replace('#include <lights_fragment_maps>', `${LOOP}\n#include <lights_fragment_maps>`);
}
