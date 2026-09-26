import * as THREE from 'three';

// Stable uniforms across CSM/glass recompiles and repeated on/off toggles.
// POM changes only the common sampling offset; it never changes geometry,
// authored UVs or shadow/depth silhouettes. Physical depth is in metres.
const installed = new WeakMap();
const GLSL = `
uniform sampler2D uMaterialHeight;
uniform float uMaterialParallax;
uniform float uMaterialDepth;
#ifdef USE_MAP
vec2 materialParallaxOffset() {
    float fade = 1.0 - smoothstep(10.0, 35.0, length(vViewPosition));
    if (uMaterialParallax < 0.5 || uMaterialDepth <= 0.0 || fade <= 0.001) return vec2(0.0);
    vec3 qx = dFdx(-vViewPosition), qy = dFdy(-vViewPosition);
    vec2 ux = dFdx(vMapUv), uy = dFdy(vMapUv);
    float determinant = ux.x * uy.y - ux.y * uy.x;
    if (abs(determinant) < 1e-12) return vec2(0.0);
    vec3 tangent = (qx * uy.y - qy * ux.y) / determinant;
    vec3 bitangent = (qy * ux.x - qx * uy.x) / determinant;
    vec3 eye = normalize(vViewPosition);
    float tt = dot(tangent, tangent), bb = dot(bitangent, bitangent), tb = dot(tangent, bitangent);
    float gram = max(tt * bb - tb * tb, 1e-10);
    vec2 projected = vec2(dot(eye, tangent) * bb - dot(eye, bitangent) * tb,
        dot(eye, bitangent) * tt - dot(eye, tangent) * tb) / gram;
    float cosine = abs(dot(normalize(cross(tangent, bitangent)), eye));
    vec2 travel = projected * uMaterialDepth * fade / max(0.18, cosine);
    float steps = mix(24.0, 12.0, cosine), layer = 1.0 / steps;
    vec2 delta = travel / steps, uv = vMapUv;
    float ray = 0.0, before = 0.0;
    float depth = 1.0 - textureGrad(uMaterialHeight, uv, ux, uy).r;
    for (int i = 0; i < 24; ++i) {
        if (ray >= depth) break;
        before = ray - depth;
        uv -= delta; ray += layer;
        depth = 1.0 - textureGrad(uMaterialHeight, uv, ux, uy).r;
    }
    float after = ray - depth;
    float blend = clamp(after / max(after - before, 1e-5), 0.0, 1.0);
    return uv + delta * blend - vMapUv;
}
#endif
`;
export function setMaterialParallax(material, heightMap, settings = {}) {
    let uniforms = installed.get(material);
    if (!uniforms && !heightMap && !settings.prepare) return;
    if (!uniforms) {
        uniforms = { uMaterialHeight: { value: heightMap }, uMaterialParallax: { value: 0 }, uMaterialDepth: { value: 0 } };
        installed.set(material, uniforms);
        const previous = material.onBeforeCompile, key = material.customProgramCacheKey;
        material.onBeforeCompile = function compileMaterialParallax(shader, renderer) {
            previous?.call(this, shader, renderer);
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${GLSL}\nvoid main() {\n vec2 ddgParallaxOffset = vec2(0.0);\n#ifdef USE_MAP\n ddgParallaxOffset = materialParallaxOffset();\n#endif`);
            for (const name of ['map_fragment', 'normal_fragment_maps', 'roughnessmap_fragment', 'aomap_fragment']) {
                const chunk = THREE.ShaderChunk[name].replace(/\bv(Map|NormalMap|RoughnessMap|AoMap)Uv\b/g, '(v$1Uv + ddgParallaxOffset)');
                shader.fragmentShader = shader.fragmentShader.replace(`#include <${name}>`, chunk);
            }
        };
        material.customProgramCacheKey = function materialParallaxKey() { return `${key?.call(this) || ''}|material-pom-v1`; };
        material.needsUpdate = true;
    }
    uniforms.uMaterialHeight.value = heightMap;
    uniforms.uMaterialParallax.value = heightMap && settings.parallax ? 1 : 0;
    uniforms.uMaterialDepth.value = Math.max(0, Math.min(60, settings.parallaxDepth ?? settings.recipe?.depth ?? 5)) / 1000;
}

// Install before the mesh enters the scene, so CSM can wrap and restore this
// hook when shadow quality/canvases change. Textures arrive asynchronously.
export function prepareMaterialParallax(material) {
    if (material.isMeshStandardMaterial) setMaterialParallax(material, null, { prepare: true });
}
