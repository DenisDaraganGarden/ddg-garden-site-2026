import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { buildCloudNoise } from '../sky/painterly/cloudNoise';
import { DDG_CLOUD_SHADOW_GLSL } from '../sky/painterly/cloudShadowRuntime.js';
import { skyShaderChunk } from '../shaders/skyShader';
import { cursorFlashlightShaderChunk } from '../shaders/cursorFlashlightShader';
import { createWaterSceneBindingUniforms } from './waterSceneBindings';

// One look for every water surface: the open-water mesh, the breaking-wave
// ribbons and later the shore. Body colour, sky reflection, sun glint,
// translucency by thickness, and foam drawn with the painterly clouds' noise
// (Worley edges for the lace, the fine octave for the eroded edge, Beer/powder
// for the light). Every detail layer fades by metres-per-pixel before it aliases.

export const waterShadingShader = /* glsl */`
  precision highp sampler3D;
  ${skyShaderChunk}
  ${DDG_CLOUD_SHADOW_GLSL}
  ${cursorFlashlightShaderChunk}
  uniform sampler3D uNoise;
  uniform float uNoiseReady;
  uniform float uTime;
  uniform vec2 uWind;
  uniform vec3 uSunDirection;
  uniform vec3 uSunRadiance;
  uniform vec3 uFillIrradiance;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform float uSkyLevel;
  uniform vec3 uWaterColor;
  uniform vec3 uDeepColor;
  uniform float uCrestGlow;
  uniform float uGlint;
  uniform float uRipple;
  uniform float uRippleScale;
  uniform float uLaceScale;
  uniform float uFoamBrightness;
  uniform vec3 uBedColor;
  // Metres of water that hide the bed. This sea is turbid: the sand is gone
  // within a knee's depth, not a metre and a half — read too far it makes the
  // whole shallows look like beach, which is what read as a flooded shore.
  uniform float uBedReach;
  uniform highp sampler2DShadow uKeyShadowMap;
  uniform highp sampler2DShadow uKeyShadowMapFar;
  uniform mat4 uKeyShadowMatrix;
  uniform mat4 uKeyShadowMatrixFar;
  uniform float uKeyShadowActive;
  uniform float uKeyShadowFarActive;
  uniform float uKeyShadowBias;
  uniform float uKeyShadowFarBias;
  uniform vec2 uKeyShadowTexelSize;
  uniform vec2 uKeyShadowFarTexelSize;
  uniform float uKeyShadowRadius;
  uniform float uKeyShadowFarRadius;
  uniform float uKeyShadowSplit;
  uniform float uKeyDirectShare;
  uniform float uShadowIntensity;
  uniform float uWaterShadowStrength;
  uniform float uWaterSceneSkyActive;
  uniform sampler2D uReflectionTexture;
  uniform sampler2D uRefractionTexture;
  uniform mat4 uReflectionMatrix;
  uniform mat4 uRefractionMatrix;
  uniform mat4 uRefractionViewMatrix;
  uniform vec2 uRefractionCameraRange;
  uniform float uReflectionActive;
  uniform float uRefractionActive;
  uniform float uRefractionDepthActive;
  uniform sampler2D uRefractionDepthTexture;
  uniform float uSeaObjectReflectionStrength;
  uniform float uSeaRefractionDepth;
  uniform float uSeaRefractionTurbidity;
  uniform float uSeaRefractionScattering;
  uniform vec3 uSeaRefractionScatteringColor;
  uniform float uSeaRefractionEnvironment;
  uniform sampler2D uSeaRippleNormalMap;
  uniform sampler2D uSeaRippleStateMap;
  uniform float uSeaRippleActive;
  uniform float uSeaRippleExtent;
  uniform float uSeaRippleStrength;
  uniform float uSeaRippleAmplitude;
  #define WATER_PI 3.14159265
  float gerstnerNoise(vec2 p); // defined by gerstnerShader, which every water fragment includes first

  vec3 waterSkyColor(vec3 ray) {
    vec3 fallback = mix(uSkyHorizon, uSkyZenith, pow(clamp(ray.y, 0.0, 1.0), 0.55));
    // In the product use exactly the LUT the dome and PMREM use. The colour
    // anchors remain a complete lab fallback before a scene sky is available.
    if (uWaterSceneSkyActive < 0.5) return fallback * uSkyLevel;
    return skyRadiance(ray) * uSkyLevel;
  }
  float waterShadowTap(sampler2DShadow shadowMap, vec4 shadowCoord, float shadowEnabled, float bias, vec2 texelSize, float radius) {
    if (shadowEnabled < 0.5) return 1.0;
    vec3 coord = shadowCoord.xyz / max(shadowCoord.w, 1e-5);
    if (coord.z > 1.0 || any(lessThan(coord.xy, vec2(0.0))) || any(greaterThan(coord.xy, vec2(1.0)))) return 1.0;
    float compareDepth = coord.z + bias;
    vec2 stepSize = texelSize * max(radius, 0.5);
    float lit = texture(shadowMap, vec3(coord.xy, compareDepth)) * 0.28;
    lit += texture(shadowMap, vec3(coord.xy + vec2(stepSize.x, 0.0), compareDepth)) * 0.18;
    lit += texture(shadowMap, vec3(coord.xy - vec2(stepSize.x, 0.0), compareDepth)) * 0.18;
    lit += texture(shadowMap, vec3(coord.xy + vec2(0.0, stepSize.y), compareDepth)) * 0.18;
    lit += texture(shadowMap, vec3(coord.xy - vec2(0.0, stepSize.y), compareDepth)) * 0.18;
    return mix(1.0, lit, clamp(uShadowIntensity, 0.0, 1.0));
  }
  float waterKeyVisibility(vec3 world) {
    float nearShadow = waterShadowTap(uKeyShadowMap, uKeyShadowMatrix * vec4(world, 1.0), uKeyShadowActive, uKeyShadowBias, uKeyShadowTexelSize, uKeyShadowRadius);
    float farShadow = waterShadowTap(uKeyShadowMapFar, uKeyShadowMatrixFar * vec4(world, 1.0), uKeyShadowFarActive, uKeyShadowFarBias, uKeyShadowFarTexelSize, uKeyShadowFarRadius);
    float viewDepth = -(viewMatrix * vec4(world, 1.0)).z;
    float cascade = smoothstep(uKeyShadowSplit - 2.0, uKeyShadowSplit + 2.0, viewDepth) * step(0.5, uKeyShadowFarActive);
    float shadows = mix(nearShadow, farShadow, cascade) * ddgCloudTransmission(world);
    return mix(1.0, shadows, clamp(uKeyDirectShare * uWaterShadowStrength, 0.0, 1.0));
  }
  vec3 waterObjectReflection(vec3 world, vec3 n, vec3 fallback) {
    if (uReflectionActive < 0.5) return fallback;
    vec4 projected = uReflectionMatrix * vec4(world, 1.0);
    vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
    vec2 distorted = uv + n.xz * 0.002;
    float coverage = step(0.002, distorted.x) * step(0.002, distorted.y)
      * step(distorted.x, 0.998) * step(distorted.y, 0.998) * step(0.0001, projected.w);
    vec4 captured = texture2D(uReflectionTexture, clamp(distorted, vec2(0.002), vec2(0.998)));
    // The physical sky stays the dominant reflection. Captured objects only
    // occupy their own translucent pixels, avoiding dark mirror silhouettes.
    return mix(fallback, captured.rgb, coverage * captured.a * clamp(uSeaObjectReflectionStrength * 0.24, 0.0, 0.48));
  }
  float waterPerspectiveDepthToViewZ(float depth) {
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    return 1.0 - exp2(depth * log2(uRefractionCameraRange.y + 1.0));
#else
    return (uRefractionCameraRange.x * uRefractionCameraRange.y) / ((uRefractionCameraRange.y - uRefractionCameraRange.x) * depth - uRefractionCameraRange.y);
#endif
  }
  float waterRefractionViewZ(vec2 uv, float nearestDepth) {
    vec2 size = vec2(textureSize(uRefractionDepthTexture, 0));
    vec2 pixel = uv * size - 0.5;
    vec2 base = (floor(pixel) + 0.5) / size;
    vec2 texel = 1.0 / size;
    vec4 depths = vec4(
      texture2D(uRefractionDepthTexture, base).x,
      texture2D(uRefractionDepthTexture, base + vec2(texel.x, 0.0)).x,
      texture2D(uRefractionDepthTexture, base + vec2(0.0, texel.y)).x,
      texture2D(uRefractionDepthTexture, base + texel).x
    );
    if (min(min(depths.x, depths.y), min(depths.z, depths.w)) <= 0.000001 || max(max(depths.x, depths.y), max(depths.z, depths.w)) >= 0.999999) return waterPerspectiveDepthToViewZ(nearestDepth);
    vec4 inverseZ = 1.0 / vec4(
      waterPerspectiveDepthToViewZ(depths.x), waterPerspectiveDepthToViewZ(depths.y),
      waterPerspectiveDepthToViewZ(depths.z), waterPerspectiveDepthToViewZ(depths.w)
    );
    vec2 f = fract(pixel);
    return 1.0 / mix(mix(inverseZ.x, inverseZ.y, f.x), mix(inverseZ.z, inverseZ.w, f.x), f.y);
  }
  vec3 waterCapturedRefraction(vec3 world, vec3 n, vec3 view, vec3 fallback) {
    if (uRefractionActive < 0.5) return fallback;
    vec4 projected = uRefractionMatrix * vec4(world, 1.0);
    vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
    vec3 captureNormal = normalize(mat3(uRefractionViewMatrix) * n);
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);
    vec2 refracted = uv + normalize(captureNormal.xy + vec2(0.0001)) * mix(0.0035, 0.014, slope);
    float coverage = step(0.002, refracted.x) * step(0.002, refracted.y)
      * step(refracted.x, 0.998) * step(refracted.y, 0.998) * step(0.0001, projected.w);
    vec4 captured = texture2D(uRefractionTexture, clamp(refracted, vec2(0.002), vec2(0.998)));
    coverage *= captured.a;
    float path = min(uSeaRefractionDepth / max(dot(n, view), 0.22), uSeaRefractionDepth * 4.0);
    if (uRefractionDepthActive > 0.5 && coverage > 0.5) {
      float sceneDepth = texture2D(uRefractionDepthTexture, refracted).x;
      coverage = step(0.000001, sceneDepth) * (1.0 - step(0.999999, sceneDepth)) * coverage;
      if (sceneDepth > 0.000001 && sceneDepth < 0.999999) {
        vec3 surfaceView = (uRefractionViewMatrix * vec4(world, 1.0)).xyz;
        float sceneViewZ = waterRefractionViewZ(refracted, sceneDepth);
        float rayCosine = max(abs(normalize(surfaceView).z), 0.08);
        path = min(max((abs(sceneViewZ) - abs(surfaceView.z)) / rayCosine, 0.0), uSeaRefractionDepth * 4.0);
      }
    }
    float density = clamp(uSeaRefractionTurbidity, 0.0, 1.0);
    density *= 0.45 + 0.55 * density;
    float depthScale = 5.0 / max(uSeaRefractionDepth, 0.25);
    vec3 absorption = (vec3(0.008, 0.003, 0.001) + density * vec3(0.13, 0.055, 0.018)) * depthScale;
    float scattering = density * 0.62 * depthScale * clamp(uSeaRefractionScattering, 0.0, 2.0);
    vec3 transmittance = exp(-(absorption + vec3(scattering)) * path);
    float scatterAmount = 1.0 - exp(-scattering * path);
    float forward = pow(max(dot(view, uSunDirection), 0.0), 5.0);
    vec3 scatterColor = mix(mix(uDeepColor, max(uSeaRefractionScatteringColor, vec3(0.001)), 0.7), uSunRadiance, forward * 0.46);
    vec3 refractedScene = max(captured.rgb, vec3(0.0)) * transmittance
      + scatterColor * scatterAmount * mix(0.48, 1.0, sqrt(clamp(uSeaRefractionEnvironment, 0.0, 1.0)))
      * waterKeyVisibility(world) * (0.82 + forward * 0.2);
    return mix(fallback, refractedScene, clamp(coverage, 0.0, 1.0));
  }
  // Two scrolling slices of the cloud volume as wind ripples on the swell.
  float waterRippleHeight(vec2 p) {
    vec2 a = p * uRippleScale + uWind * uTime * 0.05;
    vec2 b = p * uRippleScale * 2.9 - uWind * uTime * 0.03;
    return texture(uNoise, vec3(a, 0.31)).r * 0.65 + texture(uNoise, vec3(b, 0.67)).b * 0.35;
  }
  float waterRippleMapWeight(vec2 p) {
    vec2 uv = vec2(p.x / uSeaRippleExtent + 0.5, 0.5 - p.y / uSeaRippleExtent);
    vec2 lo = smoothstep(vec2(0.035), vec2(0.07), uv);
    vec2 hi = 1.0 - smoothstep(vec2(0.93), vec2(0.965), uv);
    return lo.x * lo.y * hi.x * hi.y;
  }
  vec3 waterRippleNormal(vec3 n, vec2 p, float pixel, float weight, float wet) {
    // waterRippleHeight has a second octave 2.9 times smaller than the
    // first.  Filtering only against the broad octave left that detail alive
    // after it crossed a pixel; at a shallow camera angle it turned into dark,
    // marching bands.  Fade at the shortest represented feature instead.
    float feature = 0.125 / max(uRippleScale * 2.9, 0.001);
    float w = uRipple * weight * uNoiseReady * (1.0 - smoothstep(feature * 0.12, feature * 0.5, pixel)) * mix(0.12, 1.0, waterWindPatch(p));
    if (w > 0.001) {
      float e = 0.02 / max(uRippleScale, 0.001);
      float h = waterRippleHeight(p);
      float hx = waterRippleHeight(p + vec2(e, 0.0));
      float hz = waterRippleHeight(p + vec2(0.0, e));
      float relief = 0.06 * w;
      // The ripple is a height field over the *water surface*, rather than a
      // world-horizontal normal stamped onto every face.  Project its slope onto
      // the Gerstner tangent plane so a steep crest cannot acquire an artificial
      // dark side simply because its fine normal was composed in a different
      // frame.
      vec3 slope = vec3(-(hx - h) / e * relief, 0.0, -(hz - h) / e * relief);
      slope -= n * dot(n, slope);
      n = normalize(n + slope);
    }
    // Preserve the existing simulation as an interaction layer. Its texture is
    // in the pond's world-XZ UV convention, and only its horizontal gradient is
    // composed so it follows the Gerstner face rather than flattening it.
    if (uSeaRippleActive > 0.5) {
      vec2 rippleUv = vec2(p.x / uSeaRippleExtent + 0.5, 0.5 - p.y / uSeaRippleExtent);
      float inBounds = step(0.0, rippleUv.x) * step(0.0, rippleUv.y)
        * step(rippleUv.x, 1.0) * step(rippleUv.y, 1.0);
      vec3 encoded = texture2D(uSeaRippleNormalMap, clamp(rippleUv, vec2(0.0), vec2(1.0))).rgb * 2.0 - 1.0;
      float runtimeWeight = waterRippleMapWeight(p) * clamp(wet, 0.0, 1.0);
      vec3 localSlope = vec3(encoded.x, 0.0, encoded.z) * (0.16 * uSeaRippleStrength * inBounds * runtimeWeight);
      localSlope -= n * dot(n, localSlope);
      n = normalize(n + localSlope);
    }
    return n;
  }
  // Foam coordinates: x across the flow, y along it, in metres. On open water
  // the flow is the wind; a breaker hands in crest × arc so the streaks run
  // down its face.
  vec2 waterFlowUv(vec2 p) {
    return vec2(dot(p, vec2(-uWind.y, uWind.x)), dot(p, uWind));
  }
  // Foam from a coverage 0..1. A dense body with a torn edge (widened only by
  // the pixel, so distance blurs it instead of sparkling), a low-contrast
  // milky veil around it where the foam is thin, and small bubbles on the
  // body (Worley cells: bright domes, dark seams). The detail octave is read
  // through a rotated, warped coordinate so the volume's tiling never lines
  // up with the base and shows as a lattice. age 0..1 comes from the foam
  // field: old foam survives only where the fine octave is strong, so a
  // patch breaks into rags and holes as it dies.
  float waterFoam(vec2 fp, float coverage, float pixel, float age, out float bubbles) {
    bubbles = 0.0;
    if (coverage <= 0.001 || uNoiseReady < 0.5) return 0.0;
    vec2 lp = vec2(fp.x * 0.85, fp.y * 1.25 - uTime * 0.25) * uLaceScale;
    // The noise volume tiles in all three axes, so a plane through it repeats
    // every 1/scale metres — at a metre-scale lace that lattice is plainly
    // visible on the sea. The slice slides with the world instead: neighbouring
    // stretches of water read different depths of the volume, and there is no
    // plane in it left to repeat. The offset is hashed value noise, itself
    // without a period.
    float slice = fract(0.12 + gerstnerNoise(fp * 0.021) * 3.0);
    vec3 lace = texture(uNoise, vec3(lp, slice)).rgb;
    float feature = 0.125 / max(uLaceScale, 0.001);
    float fineFade = 1.0 - smoothstep(feature * 0.05, feature * 0.25, pixel);
    // Rotated and warped between octaves: the noise volume tiles, the foam must not.
    vec2 dp = mat2(0.83, -0.56, 0.56, 0.83) * lp * 2.37 + lace.g * 0.35;
    lp += (vec2(lace.b, lace.g) - 0.5) * 0.9;
    vec3 detail = texture(uNoise, vec3(dp, fract(0.52 + lace.r * 0.2 + slice * 0.63))).rgb;
    float fine = mix(0.5, detail.b, fineFade);
    coverage *= mix(1.0, 0.4 + 0.6 * smoothstep(0.1, 0.7, fine), clamp(age, 0.0, 1.0));
    float pattern = lace.r * 0.5 + detail.r * 0.3 + fine * 0.2;
    float width = 0.05 + smoothstep(feature * 0.1, feature * 0.6, pixel) * 0.22;
    float body = smoothstep(1.0 - coverage - width, 1.0 - coverage + width, pattern);
    body *= smoothstep(0.18, 0.4, fine + coverage * 0.6);
    float veil = smoothstep(1.0 - coverage - 0.4, 1.0 - coverage + 0.08, pattern) * (1.0 - body) * 0.3 * smoothstep(0.05, 0.4, coverage);
    bubbles = body * mix(0.5, detail.g * detail.g, fineFade);
    return clamp(body + veil, 0.0, 1.0);
  }
  // thickness: metres of water behind this point toward the light (a lip is
  // centimetres, open water is metres). lift: extra backlight for a crest.
  // bed: how much of the sand shows through the water here, 0..1 —
  // exp(-depth * k) down and back up, k about 3 for this turbid sea.
  vec3 shadeWater(vec3 world, vec3 n, vec3 view, float pixel, vec2 foamUv, float foamCoverage, float foamAge, float thickness, float lift, float bed) {
    // A thin, moving loft can cover an MSAA sample while the pixel centre lies
    // just outside its triangle. Its interpolants may then extrapolate by a
    // few metres. Optical thickness has no negative physical meaning: feeding
    // that value to Beer-Lambert turns a sub-pixel edge into exp(+x), which is
    // an HDR firefly rather than a brighter wave.
    thickness = max(thickness, 0.0);
    foamCoverage = clamp(foamCoverage, 0.0, 1.0);
    foamAge = clamp(foamAge, 0.0, 1.0);
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-view, n);
    // The underside of a lip looks down at the water, not at a mirrored sky.
    float below = 1.0 - smoothstep(-0.25, 0.0, reflected.y);
    reflected.y = abs(reflected.y);
    vec3 reflection = mix(waterSkyColor(reflected), uDeepColor * uFillIrradiance * 0.6, below);
    reflection = waterObjectReflection(world, n, reflection);
    float keyVisibility = waterKeyVisibility(world);
    reflection += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 320.0) * uGlint * 0.02 * keyVisibility;
    float sunDiffuse = max(dot(n, uSunDirection), 0.0);
    vec3 body = mix(uDeepColor, uWaterColor, pow(facing, 0.6));
    body *= (uFillIrradiance + uSunRadiance * (0.15 + 0.45 * sunDiffuse) * keyVisibility) * 0.55 / WATER_PI;
    // Translucency: sun and sky through thin water toward the eye. The wall
    // of a wave lit from behind glows green.
    float transmit = exp(-thickness * 1.6);
    float backlight = pow(max(dot(view, -uSunDirection), 0.0), 3.0);
    body += uWaterColor * uSunRadiance / WATER_PI * backlight * (lift + transmit * 1.5) * uCrestGlow * 1.6 * keyVisibility;
    body += uWaterColor * uFillIrradiance / WATER_PI * transmit * 1.8;
    // Shallow water: the sand shows through — wet sand, lit as the beach's own
    // wet band is, by the share the caller took from Beer-Lambert for the
    // depth — and the surface reads less as a mirror over it.
    vec3 bedLit = uBedColor * 0.55 * (uFillIrradiance + uSunRadiance * (0.3 + 0.7 * sunDiffuse) * keyVisibility) / WATER_PI;
    body = mix(body, bedLit, bed);
    body = waterCapturedRefraction(world, n, view, body);
    // Fresnel does not know how deep the water is. Damping the reflection by
    // the bed killed the sheen exactly where a real shore has most of it — on
    // the swash film, a millimetre of water over wet sand, which is a mirror.
    vec3 color = mix(body, reflection, clamp(fresnel, 0.02, 0.85) * (1.0 - transmit * 0.8));
    // This material has no Three lighting chunks. Keep the cursor spotlight's
    // low diffuse lift and narrow water lobe from the established surface so
    // the interactive light still reveals the Gerstner and runtime ripples.
    CursorLightSample cursorLight = sampleCursorFlashlight(world);
    float cursorDiffuse = max(dot(n, cursorLight.directionToLight), 0.0);
    vec3 cursorHalfDirection = normalize(view + cursorLight.directionToLight);
    float cursorSpecular = pow(max(dot(n, cursorHalfDirection), 0.0), mix(42.0, 86.0, 1.0 - facing));
    float cursorSurfaceResponse = 0.045
      + cursorDiffuse * 0.11
      + cursorSpecular * (0.38 + fresnel * 0.82);
    color += cursorLight.radiance * cursorSurfaceResponse;
    float bubbles;
    float foam = waterFoam(foamUv, foamCoverage, pixel, foamAge, bubbles);
    // Beer/powder from the clouds: a thick patch is lit flat white, a thin one
    // keeps some of the water's shading under it. The bubble domes catch the
    // sun as small wet glints.
    float powder = 1.0 - exp(-foam * 2.6);
    vec3 foamLit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance + uSunRadiance * sunDiffuse * keyVisibility) / WATER_PI * (0.55 + 0.45 * powder) * uFoamBrightness;
    foamLit *= 0.7 + 0.5 * bubbles;
    foamLit += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 48.0) * uGlint * (0.02 + 0.06 * bubbles) * keyVisibility;
    return mix(color, foamLit, foam);
  }
`;

const vec3From = (target, source, fallback) => target.fromArray(Array.isArray(source) ? source : fallback);

// `sceneBindings` is deliberately supplied by the composed SeaWater surface:
// its three materials need the same live capture and CSM uniforms. Standalone
// lab materials receive inert, WebKit-safe defaults.
export function createWaterShadingUniforms(sceneBindings = null) {
  return {
    ...(sceneBindings ?? createWaterSceneBindingUniforms()),
    uNoise: { value: null },
    uNoiseReady: { value: 0 },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0, 1) },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunRadiance: { value: new THREE.Vector3(1, 1, 1) },
    uFillIrradiance: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uSkyHorizon: { value: new THREE.Color('#c0d1df') },
    uSkyZenith: { value: new THREE.Color('#6793c1') },
    uSkyLevel: { value: 1 },
    uWaterColor: { value: new THREE.Color() },
    uDeepColor: { value: new THREE.Color() },
    uCrestGlow: { value: 0 },
    uGlint: { value: 1 },
    uRipple: { value: 0 },
    uRippleScale: { value: 0.06 },
    uLaceScale: { value: 0.15 },
    uFoamBrightness: { value: 1 },
    uBedColor: { value: new THREE.Color('#c4b08a') },
    uBedReach: { value: 7 },
  };
}

export function windVector(windDirection) {
  const bearing = THREE.MathUtils.degToRad(Number(windDirection) || 0);
  return [Math.sin(bearing), -Math.cos(bearing)];
}

export function syncWaterShadingUniforms(uniforms, settings, lighting) {
  uniforms.uWind.value.fromArray(windVector(settings.windDirection));
  uniforms.uWaterColor.value.set(settings.waterColor);
  uniforms.uDeepColor.value.set(settings.deepColor);
  uniforms.uCrestGlow.value = settings.crestGlow;
  uniforms.uGlint.value = settings.glint;
  uniforms.uRipple.value = settings.ripple;
  uniforms.uRippleScale.value = settings.rippleScale;
  uniforms.uLaceScale.value = settings.laceScale;
  uniforms.uFoamBrightness.value = settings.foamBrightness;
  uniforms.uBedColor.value.set(settings.bedColor ?? '#c4b08a');
  // Turbidity in the editor's own sense: more of it, less depth to hide the sand.
  uniforms.uBedReach.value = 3.5 + 9 * Math.min(Math.max(Number(settings.bedTurbidity ?? 0.5), 0), 1);
  vec3From(uniforms.uSunDirection.value, lighting?.key?.direction, [0.4, 0.7, -0.5]).normalize();
  vec3From(uniforms.uSunRadiance.value, lighting?.key?.sceneRadiance, [2.5, 2.3, 2]);
  vec3From(uniforms.uFillIrradiance.value, lighting?.fill?.irradiance, [0.7, 0.8, 1]);
  uniforms.uSkyHorizon.value.fromArray(lighting?.environment?.horizon?.linear ?? [0.55, 0.65, 0.75]);
  uniforms.uSkyZenith.value.fromArray(lighting?.environment?.zenith?.linear ?? [0.15, 0.3, 0.55]);
  uniforms.uSkyLevel.value = (settings.skyReflection ?? 1) * (lighting?.sky?.skyLevel ?? 1);
}

// Per frame: the clock and the noise volume, once it has been built.
export function tickWaterShadingUniforms(uniforms, time, noise) {
  uniforms.uTime.value = time;
  uniforms.uNoise.value = noise?.volume ?? null;
  uniforms.uNoiseReady.value = noise ? 1 : 0;
}

// Builds the cloud noise once for every water surface in the scene that does
// not receive one from the clouds themselves.
export function useWaterNoise(noise) {
  const [ownNoise, setOwnNoise] = useState(null);
  useEffect(() => {
    if (noise) return undefined;
    const controller = new AbortController();
    let built = null;
    buildCloudNoise({ seed: 7, size: 64, signal: controller.signal })
      .then((result) => { built = result; setOwnNoise(result); })
      .catch(() => {});
    return () => { controller.abort(); built?.dispose(); };
  }, [noise]);
  return noise ?? ownNoise;
}
