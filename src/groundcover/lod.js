import * as THREE from 'three';
import { coverWind } from './assets.js';

// Detail is governed by its screen footprint, not the field's total area.
// These are physical leaf/needle sizes, independent of the card's empty space.
export const COVER_DETAIL = Object.freeze({ moss: .003, thyme: .008, flower: .005 });
export const COVER_LOD = Object.freeze({ end: .55, full: 2.4 });
export function coverDetailWeight(pixels) {
    const t = THREE.MathUtils.clamp((pixels - COVER_LOD.end) / (COVER_LOD.full - COVER_LOD.end), 0, 1);
    return t * t * (3 - 2 * t);
}
export function coverViewState() {
    return { uCoverEye: { value: new THREE.Vector3() }, uCoverPixels: { value: 1000 }, uCoverOrtho: { value: false } };
}
export function detailMaterial(material, kind, view) {
    coverWind(material);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer); Object.assign(shader.uniforms, view);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
            uniform vec3 uCoverEye;
            uniform float uCoverPixels;
            uniform bool uCoverOrtho;
            varying float vCoverDetail;
            varying vec2 vCoverUv;
        `).replace('#include <begin_vertex>', `#include <begin_vertex>
            vec3 coverRoot = (modelMatrix * instanceMatrix[3]).xyz;
            float coverScale = max(length(modelMatrix[0].xyz), max(length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)));
            float coverPixels = ${COVER_DETAIL[kind].toFixed(5)} * coverScale * uCoverPixels / (uCoverOrtho ? 1.0 : max(.01, distance(coverRoot, uCoverEye)));
            vCoverDetail = smoothstep(${COVER_LOD.end}, ${COVER_LOD.full}, coverPixels);
            vCoverUv = uv;
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vCoverDetail;\nvarying vec2 vCoverUv;`)
            .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
                // Texture-anchored dithering: the pattern follows the plant, not
                // the screen. The opaque PBR carpet is always present below it.
                vec2 coverPixel = floor(vCoverUv * 256.0);
                float coverThreshold = fract(52.9829189 * fract(dot(coverPixel, vec2(.06711056, .00583715))));
                if (vCoverDetail <= coverThreshold) discard;
            `);
    };
    material.customProgramCacheKey = () => `groundcover-card-lod-1-${kind}`;
    return material;
}
