import * as THREE from 'three';

// Стекло модели SketchUp. SketchUp отдаёт стекло полупрозрачной краской
// (в «Ростове» окна — «[Color H08]1», серый 58 %): обычная прозрачность
// умножает на неё всё, и отражение неба гаснет вместе с цветом — выходит
// серая плёнка. Здесь стекло честное: отражение (Френель: в упор — 4 %, по
// касательной — почти зеркало) не гасится, а насквозь видно столько, сколько
// позволяет прозрачность. Смешение — с предумноженной альфой: цвет стекла
// прибавляется к тому, что за ним, а за ним остаётся (1 − альфа).
//
// Стекло узнаётся само: прозрачное, без текстуры, серое или с «glass/стекло»
// в имени, не только горизонтальное (кружки крон SketchUp — плоские цветные
// диски). Решение можно поменять в окне материала: «Это стекло».
// Отражение 2 — как у фасадного стекла с напылением: в упор 8 % вместо 4 % у
// голого, по касательной — то же зеркало. Отражается сцена вокруг модели
// (GlassReflections.jsx: снимок в куб), пока снимка нет — небо сцены.
export const GLASS_DEFAULTS = Object.freeze({ clarity: 0.6, frost: 0.03, reflect: 2 });
const GLASS_NAME = /glass|стекл|window|окн|витраж|витрин/i;
const up = new THREE.Vector3();

// Все грани лежат плашмя (нормаль вверх или вниз) — это знак на плане, не окно.
function flatOnly(meshes, root) {
    let seen = 0;
    for (const mesh of meshes) {
        const normal = mesh.geometry.attributes.normal;
        if (!normal) continue;
        const matrix = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld));
        const step = Math.max(1, Math.floor(normal.count / 40));
        for (let i = 0; i < normal.count; i += step) {
            up.fromBufferAttribute(normal, i).applyMatrix3(matrix).normalize();
            if (Math.abs(up.y) < 0.95) return false;
            seen += 1;
        }
    }
    return seen > 0;
}

export function looksLikeGlass(material, meshes = [], root = null) {
    if (!material?.isMeshStandardMaterial || material.map) return false;
    const named = GLASS_NAME.test(material.name ?? '');
    const original = material.userData.glassBase ?? material;
    if (!named && !(original.transparent && original.opacity < 0.95)) return false;
    if (meshes.some((mesh) => mesh.userData.crownPlan)) return false;
    if (root && !named && flatOnly(meshes, root)) return false;
    if (named) return true;
    const { r, g, b } = original.color;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max === 0 || (max - min) / max < 0.25;
}

// Параметры стекла по умолчанию — из материала SketchUp: сквозь видно
// столько, сколько он прозрачен, оттенок — его цвет.
export function glassDefaults(material) {
    const original = material.userData.glassBase ?? material;
    return { ...GLASS_DEFAULTS, clarity: Math.min(0.95, Math.max(0.2, 1 - (original.opacity ?? 0.4))), tint: `#${original.color.getHexString()}` };
}

// Снимок окружения снят из середины модели, а окно стоит сбоку: луч отражения
// продлевается до стенок коробки участка (пол — земля у дома) и уже оттуда
// смотрится в снимок. Так нижнее окно видит газон у своего фасада, а не
// землю под серединой дома.
const BOX_GLSL = `
vec3 glassBox( vec3 direction ) {
    vec3 side = step( 0.0, direction );
    vec3 safe = mix( vec3( -1.0 ), vec3( 1.0 ), side ) * max( abs( direction ), vec3( 1e-5 ) );
    vec3 reach = ( mix( uGlassBoxMin, uGlassBoxMax, side ) - vGlassWorld ) / safe;
    vec3 hit = vGlassWorld + direction * max( 0.0, min( min( reach.x, reach.y ), reach.z ) ) - uGlassProbe;
    return dot( hit, hit ) > 1e-6 ? hit : direction;
}
`;
const ENVMAP_TURN = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
const ENVMAP_GLSL = `${BOX_GLSL}${THREE.ShaderChunk.envmap_physical_pars_fragment.replace(ENVMAP_TURN, `${ENVMAP_TURN}
            if ( uGlassBox > 0.5 ) reflectVec = glassBox( reflectVec );`)}`;

// Стекло ставится на материал один раз, дальше только включается и
// выключается. three помнит программы материала и, возвращаясь к уже
// собранной, onBeforeCompile не зовёт: юниформы стекла должны быть одними и
// теми же в каждой его сборке, иначе после «снял — поставил» ползунки молчат.
function install(material) {
    if (material.userData.glassBase) return material.userData.glassUniforms;
    const base = {
        onBeforeCompile: material.onBeforeCompile, key: material.customProgramCacheKey, premultipliedAlpha: material.premultipliedAlpha,
        transparent: material.transparent, depthWrite: material.depthWrite, opacity: material.opacity,
        roughness: material.roughness, metalness: material.metalness, color: material.color.clone(), envMap: material.envMap,
    };
    const uniforms = {
        uGlassAbsorb: { value: 0.4 }, uGlassReflect: { value: 1 }, uGlassBox: { value: 0 },
        uGlassProbe: { value: new THREE.Vector3() }, uGlassBoxMin: { value: new THREE.Vector3() }, uGlassBoxMax: { value: new THREE.Vector3() },
    };
    material.onBeforeCompile = function glassCompile(shader, renderer) {
        base.onBeforeCompile?.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        if (!material.userData.glassOn) return;
        shader.vertexShader = `varying vec3 vGlassWorld;\n${shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
            vec4 glassWorld = vec4( transformed, 1.0 );
            #ifdef USE_BATCHING
                glassWorld = batchingMatrix * glassWorld;
            #endif
            #ifdef USE_INSTANCING
                glassWorld = instanceMatrix * glassWorld;
            #endif
            vGlassWorld = ( modelMatrix * glassWorld ).xyz;`)}`;
        shader.fragmentShader = `uniform float uGlassAbsorb;
uniform float uGlassReflect;
uniform float uGlassBox;
uniform vec3 uGlassProbe;
uniform vec3 uGlassBoxMin;
uniform vec3 uGlassBoxMax;
varying vec3 vGlassWorld;
${shader.fragmentShader
            .replace('#include <envmap_physical_pars_fragment>', ENVMAP_GLSL)
            // Отражение — сила напыления: в упор ×uGlassReflect, по касательной
            // зеркало остаётся зеркалом (Шлик с бо́льшим F0).
            .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
            float glassEdge = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 5.0 );
            #if defined( RE_IndirectSpecular )
                radiance *= mix( uGlassReflect, 1.0, glassEdge );
            #endif`)
            .replace('#include <opaque_fragment>', `float glassF0 = min( 1.0, 0.04 * uGlassReflect );
            float glassFresnel = glassF0 + ( 1.0 - glassF0 ) * glassEdge;
            gl_FragColor = vec4( outgoingLight, mix( uGlassAbsorb, 1.0, glassFresnel ) );`)
            .replace('#include <premultiplied_alpha_fragment>', '')}`;
    };
    material.customProgramCacheKey = function glassKey() {
        return `${base.key ? base.key.call(this) : ''}${material.userData.glassOn ? '|placed-glass-v2' : ''}`;
    };
    material.userData.glassBase = base;
    material.userData.glassUniforms = uniforms;
    return uniforms;
}

export function makeGlass(material) {
    const uniforms = install(material);
    if (material.userData.glassOn) return uniforms;
    material.userData.glassOn = true;
    material.premultipliedAlpha = true;
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = 1;
    material.metalness = 0;
    material.needsUpdate = true;
    return uniforms;
}

// Снимок окружения (GlassReflections.jsx) — отражением стекла: куб, откуда
// снят, и коробка участка. null — снова небо сцены.
export function setGlassProbe(material, probe) {
    if (!material.userData.glassOn) return;
    const uniforms = material.userData.glassUniforms;
    material.envMap = probe?.texture ?? material.userData.glassBase.envMap;
    uniforms.uGlassBox.value = probe ? 1 : 0;
    if (!probe) return;
    uniforms.uGlassProbe.value.copy(probe.center);
    uniforms.uGlassBoxMin.value.copy(probe.box.min);
    uniforms.uGlassBoxMax.value.copy(probe.box.max);
}

// Стекло под ползунки: прозрачность — сколько видно насквозь в упор;
// матовость — размытые отражения и молочность; отражение — сила напыления.
export function tuneGlass(material, meshes, glass) {
    const uniforms = makeGlass(material);
    const base = material.userData.glassBase;
    const frost = glass.frost ?? GLASS_DEFAULTS.frost;
    const tint = glass.tint ? new THREE.Color(glass.tint) : base.color;
    material.color.copy(tint).multiplyScalar(0.12 + frost * 0.6);
    material.roughness = Math.min(1, 0.02 + frost);
    uniforms.uGlassReflect.value = glass.reflect ?? GLASS_DEFAULTS.reflect;
    uniforms.uGlassAbsorb.value = Math.max(1 - (glass.clarity ?? GLASS_DEFAULTS.clarity), frost * 0.8);
    // Стекло не отбрасывает чёрной тени: свет сквозь него проходит.
    for (const mesh of meshes) {
        if (!mesh.userData.glassShadows) mesh.userData.glassShadows = [mesh.castShadow, mesh.receiveShadow];
        mesh.castShadow = false;
        mesh.receiveShadow = false;
    }
}

export function unmakeGlass(material, meshes) {
    if (!material.userData.glassOn) return;
    const base = material.userData.glassBase;
    material.userData.glassOn = false;
    material.premultipliedAlpha = base.premultipliedAlpha;
    material.transparent = base.transparent;
    material.depthWrite = base.depthWrite;
    material.opacity = base.opacity;
    material.roughness = base.roughness;
    material.metalness = base.metalness;
    material.color.copy(base.color);
    material.envMap = base.envMap;
    for (const mesh of meshes) {
        if (!mesh.userData.glassShadows) continue;
        [mesh.castShadow, mesh.receiveShadow] = mesh.userData.glassShadows;
        delete mesh.userData.glassShadows;
    }
    material.needsUpdate = true;
}
