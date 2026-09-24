import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { buildCloudNoise } from '../sky/painterly/cloudNoise';
import { DDG_CLOUD_SHADOW_GLSL } from '../sky/painterly/cloudShadowRuntime.js';
import { skyShaderChunk } from '../shaders/skyShader';
import { cursorFlashlightShaderChunk } from '../shaders/cursorFlashlightShader';
import { createWaterSceneBindingUniforms } from './waterSceneBindings';
import { RIPPLE_PLANES } from './waterRipplePlanes.js';
import { WAKE_RINGS, WAKE_SPEED } from './waterWake.js';

// One look for every water surface: the open-water mesh, the breaking-wave
// ribbons and later the shore. Body colour, sky reflection, sun glint,
// translucency by thickness, and foam drawn with the painterly clouds' noise
// (Worley edges for the lace, the fine octave for the eroded edge, Beer/powder
// for the light). Every detail layer fades by metres-per-pixel before it aliases.

const vec = ([axis, name]) => `vec3(${axis.map((x) => x.toFixed(4)).join(', ')}) * ${name}`;

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
  uniform float uFoamVariety;   // 0: one lace at one scale; 1: a finer lace inside, dense and thin stretches
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
  uniform vec2 uSkyRotation;
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
  uniform float uRippleChop;      // rippleChopFactor(waveChoppiness): 0 at its default
  uniform float uWaterDebugView;  // DEBUG_VIEW_IDS: 1 height, 2 normals; the rest keep the picture
  uniform sampler2D uSkyIrradianceMap;
  uniform float uSkyIrradianceActive;
  uniform vec4 uWakeRing[${WAKE_RINGS}];
  uniform vec4 uWakeBounds;
  #define WATER_PI 3.14159265
  float gerstnerNoise(vec2 p); // defined by gerstnerShader, which every water fragment includes first
  // The summer bloom over this water, 0..1 (terrainShader.js coastBloom): a
  // surface that knows the coast sets it before shadeWater, the rest leave 0.
  float waterBloom = 0.0;

  // The engine's diagnostic views of the surface: 1 its height over still
  // water, grey at the still line, black and white at the full swing of the
  // swell's trains, so any sea state fills the range (the ripple and the surf
  // ride on it and may clip); 2 its normal as a colour. A measurement, unlit
  // and not tone-mapped. False for the picture and the seabed's own views.
  bool waterDebugView(vec3 world, vec3 n, out vec3 color) {
    color = vec3(0.0);
    if (uWaterDebugView < 0.5 || uWaterDebugView > 2.5) return false;
    if (uWaterDebugView > 1.5) {
      color = n * 0.5 + 0.5;
      return true;
    }
    float swing = 0.0;
    for (int i = 0; i < GERSTNER_TRAINS; i++) swing += uGerstnerTrain[i].w;
    color = vec3(clamp(0.5 + 0.5 * world.y / max(swing, 0.01), 0.0, 1.0));
    return true;
  }

  // The panorama the sea reflects in «Только HDRI» turns with «Поворот HDRI»
  // exactly as three turns it for objects (envMapRotation, about y by minus
  // the angle); the painted skies are never turned, (1, 0) leaves the ray be.
  vec3 waterSkyRay(vec3 ray) {
    return vec3(ray.x * uSkyRotation.x - ray.z * uSkyRotation.y, ray.y, ray.x * uSkyRotation.y + ray.z * uSkyRotation.x);
  }
  vec3 waterSkyColor(vec3 ray) {
    vec3 fallback = mix(uSkyHorizon, uSkyZenith, pow(clamp(ray.y, 0.0, 1.0), 0.55));
    // In the product use exactly the LUT the dome and PMREM use. The colour
    // anchors remain a complete lab fallback before a scene sky is available.
    if (uWaterSceneSkyActive < 0.5) return fallback * uSkyLevel;
    return skyRadiance(waterSkyRay(ray)) * uSkyLevel;
  }
  // One bilinear tap of the same sky, for taps that are averaged anyway: the
  // nine-tap Catmull-Rom is for the one ray that is seen sharp.
  vec3 waterSkyColorSoft(vec3 ray) {
    if (uWaterSceneSkyActive < 0.5) return waterSkyColor(ray);
    vec3 r = normalize(waterSkyRay(ray));
    vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return textureLod(uSkyLut, uv, 0.0).rgb * uSkyLevel;
  }
  // Light a diffuse surface facing n receives from the sky the water reflects:
  // an ambient cube reduced from that very sky each frame (waterSceneBindings),
  // at the scale the sand is lit by it. Foam had only the fill light, 50 times
  // less, so any foam facing away from the sun went black beside bright water.
  vec3 waterSkyIrradiance(vec3 n) {
    if (uSkyIrradianceActive < 0.5) return mix(uSkyHorizon, uSkyZenith, 0.5) * uSkyLevel * WATER_PI * (0.5 + 0.5 * n.y);
    vec3 n2 = n * n;
    return n2.x * texelFetch(uSkyIrradianceMap, ivec2(n.x < 0.0 ? 1 : 0, 0), 0).rgb
      + n2.y * texelFetch(uSkyIrradianceMap, ivec2(n.y < 0.0 ? 3 : 2, 0), 0).rgb
      + n2.z * texelFetch(uSkyIrradianceMap, ivec2(n.z < 0.0 ? 5 : 4, 0), 0).rgb;
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
#ifdef WATER_OBJECT_REFLECTION_SCALE
  float waterObjectReflectionScale; // the breaker: the mirror holds the breaker itself, so only its rim may read it
#endif
  vec3 waterObjectReflection(vec3 world, vec3 n, vec3 view, vec3 reflected, vec3 fallback, float roughness) {
    if (uReflectionActive < 0.5) return fallback;
    vec4 projected = uReflectionMatrix * vec4(world, 1.0);
    vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
    // The capture is a flat mirror; the sea is not. Shift the lookup by how far
    // the wave-bent reflected ray points from the flat mirror's, where both
    // land at infinity: reflected objects then ripple with the same normal as
    // the sky around them instead of lying still under it like a pane of glass.
    vec4 bent = uReflectionMatrix * vec4(normalize(vec3(reflected.x, max(reflected.y, 0.002), reflected.z)), 0.0);
    vec4 mirror = uReflectionMatrix * vec4(-view.x, view.y, -view.z, 0.0);
    vec2 shift = (bent.xy / max(bent.w, 0.0001) - mirror.xy / max(mirror.w, 0.0001)) * 0.5;
    vec2 distorted = uv + clamp(shift, vec2(-0.08), vec2(0.08));
    // Soft at the capture's border, never a step to the sky.
    vec2 edge = min(distorted, 1.0 - distorted);
    float coverage = clamp(min(edge.x, edge.y) / 0.02, 0.0, 1.0) * step(0.0001, projected.w);
    vec2 at = clamp(distorted, vec2(0.002), vec2(0.998));
    vec4 captured = texture2D(uReflectionTexture, at);
    // A distant wind ripple has no resolvable normal, but it is still a rough
    // reflector. Four symmetric texel taps are enough for this small planar
    // object capture; keep the exact centre sample in glassy patches.
    if (roughness > 0.0001) {
      vec2 texel = 1.0 / vec2(textureSize(uReflectionTexture, 0));
      vec2 spread = texel * (1.0 + roughness * 4.0);
      vec4 filtered = (
        texture2D(uReflectionTexture, clamp(at + vec2(spread.x, 0.0), vec2(0.002), vec2(0.998)))
        + texture2D(uReflectionTexture, clamp(at - vec2(spread.x, 0.0), vec2(0.002), vec2(0.998)))
        + texture2D(uReflectionTexture, clamp(at + vec2(0.0, spread.y), vec2(0.002), vec2(0.998)))
        + texture2D(uReflectionTexture, clamp(at - vec2(0.0, spread.y), vec2(0.002), vec2(0.998)))
      ) * 0.25;
      captured = mix(captured, filtered, roughness * 0.8);
    }
    // An object hides the sky behind it. The capture is cleared to transparent
    // black, so its colour is already weighted by its own coverage.
    float weight = coverage * clamp(uSeaObjectReflectionStrength * 0.5, 0.0, 1.0);
#ifdef WATER_OBJECT_REFLECTION_SCALE
    weight *= waterObjectReflectionScale;
#endif
    return fallback * (1.0 - weight * captured.a) + max(captured.rgb, vec3(0.0)) * weight;
  }
  vec3 waterReflectionTangent(vec3 ray) {
    vec3 tangent = vec3(-ray.z, 0.0, ray.x) + vec3(0.0001, 0.0, 0.0);
    return tangent * inversesqrt(max(dot(tangent, tangent), 1e-8));
  }
  vec3 waterSkyReflection(vec3 ray, float roughness) {
    vec3 centre = waterSkyColor(ray);
    if (roughness <= 0.0001) return centre;
    vec3 tangent = waterReflectionTangent(ray);
    vec3 bitangent = normalize(cross(ray, tangent));
    float spread = roughness * 0.12;
    vec3 filtered = (
      waterSkyColorSoft(normalize(ray + tangent * spread))
      + waterSkyColorSoft(normalize(ray - tangent * spread))
      + waterSkyColorSoft(normalize(ray + bitangent * spread))
      + waterSkyColorSoft(normalize(ray - bitangent * spread))
    ) * 0.25;
    return mix(centre, filtered, smoothstep(0.001, 0.08, roughness));
  }
  float waterSunGlint(vec3 reflected, float roughness) {
    float sharp = pow(max(dot(reflected, uSunDirection), 0.0), 320.0);
    if (roughness <= 0.0001) return sharp;
    vec3 tangent = waterReflectionTangent(reflected);
    vec3 bitangent = normalize(cross(reflected, tangent));
    float spread = roughness * 0.12;
    float wide = (
      pow(max(dot(normalize(reflected + tangent * spread), uSunDirection), 0.0), 320.0)
      + pow(max(dot(normalize(reflected - tangent * spread), uSunDirection), 0.0), 320.0)
      + pow(max(dot(normalize(reflected + bitangent * spread), uSunDirection), 0.0), 320.0)
      + pow(max(dot(normalize(reflected - bitangent * spread), uSunDirection), 0.0), 320.0)
    ) * 0.25;
    return clamp(mix(sharp, wide, smoothstep(0.001, 0.08, roughness)), 0.0, 1.0);
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
  vec3 waterUnrefractedScene(vec3 world, vec3 fallback) {
    if (uRefractionActive < 0.5) return fallback;
    vec4 projected = uRefractionMatrix * vec4(world, 1.0);
    vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
    float coverage = step(0.002, uv.x) * step(0.002, uv.y)
      * step(uv.x, 0.998) * step(uv.y, 0.998) * step(0.0001, projected.w);
    vec4 captured = texture2D(uRefractionTexture, clamp(uv, vec2(0.002), vec2(0.998)));
    return mix(fallback, max(captured.rgb, vec3(0.0)), coverage * captured.a);
  }
#ifdef WATER_REFRACTION_ANCHOR
  vec3 waterRefractionAnchor; // the water surface under this point: the breaker is seen through the sea it stands on
#endif
  vec3 waterCapturedRefraction(vec3 world, vec3 n, vec3 view, vec3 fallback, float thickness) {
    if (uRefractionActive < 0.5) return fallback;
    vec3 at = world;
#ifdef WATER_REFRACTION_ANCHOR
    at = waterRefractionAnchor;
#endif
    // Metres of wave standing above that water: more water on the way down.
    float above = max(world.y - at.y, 0.0);
    vec4 projected = uRefractionMatrix * vec4(at, 1.0);
    vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
    vec3 captureNormal = normalize(mat3(uRefractionViewMatrix) * n);
    vec3 captureUp = normalize(mat3(uRefractionViewMatrix) * vec3(0.0, 1.0, 0.0));
    // A centimetre of swash cannot shift the sand by the same screen distance
    // as metres of sea. Zero thickness reads the terrain at its own pixel.
    float distortion = clamp(thickness, 0.0, 1.0);
    // The offset follows the normal's departure from flat water, so it is
    // continuous. Normalised, its direction flipped wherever a steep face
    // looked into the lens, and the sand behind jumped in bands along the rows.
    vec2 refracted = uv + clamp((captureNormal.xy - captureUp.xy) * 0.03, vec2(-0.014), vec2(0.014)) * distortion;
    // Soft at the capture's border; clamp, not a reversed smoothstep.
    vec2 edge = min(refracted, 1.0 - refracted);
    float coverage = clamp(min(edge.x, edge.y) / 0.03, 0.0, 1.0) * step(0.0001, projected.w);
    vec4 captured = texture2D(uRefractionTexture, clamp(refracted, vec2(0.002), vec2(0.998)));
    coverage *= captured.a;
    float path = min(uSeaRefractionDepth / max(dot(n, view), 0.22), uSeaRefractionDepth * 4.0);
    if (uRefractionDepthActive > 0.5 && coverage > 0.0) {
      float sceneDepth = texture2D(uRefractionDepthTexture, refracted).x;
      coverage = step(0.000001, sceneDepth) * (1.0 - step(0.999999, sceneDepth)) * coverage;
      if (sceneDepth > 0.000001 && sceneDepth < 0.999999) {
        vec3 surfaceView = (uRefractionViewMatrix * vec4(at, 1.0)).xyz;
        float sceneViewZ = waterRefractionViewZ(refracted, sceneDepth);
        float rayCosine = max(abs(normalize(surfaceView).z), 0.08);
        // The water the ray really crosses, uncapped: a ray that grazes toward
        // a far bed fades into deep water instead of switching to it.
        path = max((abs(sceneViewZ) - abs(surfaceView.z)) / rayCosine, 0.0);
      }
    }
    path += above;
    float density = clamp(uSeaRefractionTurbidity, 0.0, 1.0);
    density *= 0.45 + 0.55 * density;
    float depthScale = 5.0 / max(uSeaRefractionDepth, 0.25);
    // The authored water colour belongs to the medium, rather than merely to
    // the fallback below a capture. Normalising by its strongest channel keeps
    // this a hue-only attenuation: white adds none, black stays finite, and it
    // can only remove light along a non-zero water path. The established base
    // spectrum still provides clear-water absorption at zero turbidity.
    vec3 waterHue = clamp(uWaterColor, vec3(0.0), vec3(1.0));
    vec3 waterTransmissionTint = waterHue / max(max(waterHue.r, waterHue.g), max(waterHue.b, 0.001));
    vec3 hueAbsorption = (vec3(1.0) - waterTransmissionTint) * density * 0.16;
    // The bloom eats the red and the blue as chlorophyll does and thickens the
    // haze (the retired water's coefficients).
    vec3 absorption = (vec3(0.008, 0.003, 0.001) + density * vec3(0.13, 0.055, 0.018) + hueAbsorption + waterBloom * vec3(0.05, 0.008, 0.04)) * depthScale;
    float scattering = density * 0.62 * depthScale * clamp(uSeaRefractionScattering, 0.0, 2.0) * (1.0 + waterBloom * 1.4);
    vec3 transmittance = exp(-(absorption + vec3(scattering)) * path);
    // The dedicated scattering colour remains the art direction for suspended
    // matter. Water hue only tints part of it, so changing either control is
    // visible without one silently replacing the other.
    vec3 scatterColor = mix(uDeepColor, max(uSeaRefractionScatteringColor, vec3(0.001)), 0.7);
    scatterColor *= mix(vec3(1.0), waterTransmissionTint, 0.42);
    // One medium. What the capture cannot see through this water is the same
    // water, infinitely deep: the lit body the caller computed. The old
    // in-scatter was a colour of its own that ignored the light (olive at
    // noon, brown at dawn) and the capture's edge switched between the two:
    // the hard line across the waves at eye level, sand below it, teal above.
    vec3 hue = scatterColor / max(max(scatterColor.r, scatterColor.g), max(scatterColor.b, 0.001));
    vec3 medium = fallback * mix(vec3(1.0), hue, 0.2 * clamp(uSeaRefractionScattering, 0.0, 1.0));
    vec3 seen = transmittance * clamp(coverage, 0.0, 1.0);
    return max(captured.rgb, vec3(0.0)) * seen + medium * (vec3(1.0) - seen);
  }
  // Two scrolling slices of the cloud volume as wind ripples on the swell.
  // Each slice is a plane tilted through the periodic volume, so no world
  // vector lands on a whole tile, and it is pushed along its normal by a slow
  // drift so near returns differ. Read on axis planes, the ripple was an exact
  // square tile of 1/(2.9 x scale) metres, parallel to the beach: the waffle.
  float waterRippleDrift(vec2 p) {
    return (gerstnerNoise(p * 0.23 + vec2(5.3, 1.7)) - 0.5) * 2.0;
  }
  float waterRippleHeight(vec2 p, float drift) {
    vec2 a = p * uRippleScale + uWind * uTime * 0.05;
    vec2 b = p * uRippleScale * 2.9 - uWind * uTime * 0.03;
    vec3 ta = ${RIPPLE_PLANES[0].map(vec).join(' + ')} + vec3(0.0, 0.0, 0.31);
    vec3 tb = ${RIPPLE_PLANES[1].map(vec).join(' + ')} + vec3(0.0, 0.0, 0.67);
    return texture(uNoise, ta).r * 0.65 + texture(uNoise, tb).b * 0.35;
  }
  // The large wind field says whether a crest can whitecap. This finer field
  // only distributes its unresolved chop: irregular paws tens of metres wide
  // between calm mirrors. It is world/carrier based and advances with the
  // swell, so a paused sea does not crawl under a static camera.
  float waterRippleWindPatch(vec2 p) {
    float broad = waterWindPatch(p);
    if (uGerstnerPatches <= 0.001) return broad;
    vec2 drift = uGerstnerTrain[0].xy * uGerstnerMotion[0].x * uGerstnerTime;
    vec2 q = mat2(0.86, -0.51, 0.51, 0.86) * (p * 0.013 + drift * 0.0032);
    vec2 warp = vec2(
      gerstnerNoise(p * 0.0037 + drift * 0.0009 + 3.17),
      gerstnerNoise(mat2(0.63, -0.78, 0.78, 0.63) * p * 0.0031 + drift * 0.0007 + 7.43)
    ) - 0.5;
    float medium = gerstnerNoise(q + warp * 0.82);
    float fine = gerstnerNoise(mat2(0.71, -0.70, 0.70, 0.71) * q * 2.41 + warp * 1.37 + 11.29);
    float paws = smoothstep(0.32, 0.71, mix(medium, fine, 0.43));
    return broad * mix(1.0, mix(0.16, 1.0, paws), uGerstnerPatches);
  }
  float waterRippleResolvedWeight(float pixel) {
    // uRippleScale is cycles per metre: .09 means a broad ~11 m slice and a
    // finer ~3.8 m octave. Filter the latter by the world footprint, rather
    // than by grid density, so the horizon does not stripe as rings widen.
    float feature = 0.125 / max(uRippleScale * 2.9, 0.001);
    return 1.0 - smoothstep(feature * 0.12, feature * 0.5, pixel);
  }
  float waterRippleUnresolvedRoughness(vec2 p, float pixel) {
    if (uRipple <= 0.001 || uNoiseReady < 0.5) return 0.0;
    float feature = 0.125 / max(uRippleScale * 2.9, 0.001);
    float unresolved = smoothstep(feature * 0.18, feature * 0.82, pixel);
    if (unresolved <= 0.001) return 0.0;
    // At distance the normal is filtered away, but its bounded angular spread
    // still softens the same reflected directions in windy paws.
    return clamp(uRipple * waterRippleWindPatch(p) * unresolved * 0.22, 0.0, 0.22);
  }
  float waterRippleMapWeight(vec2 p) {
    vec2 uv = vec2(p.x / uSeaRippleExtent + 0.5, 0.5 - p.y / uSeaRippleExtent);
    vec2 lo = smoothstep(vec2(0.035), vec2(0.07), uv);
    vec2 hi = 1.0 - smoothstep(vec2(0.93), vec2(0.965), uv);
    return lo.x * lo.y * hi.x * hi.y;
  }
  // The wakes (waterWake.js): every ring a packet of small waves running out
  // from where the water was cut or struck, as the slope it adds. A moving
  // board's row of rings sums to its V. They are a few centimetres high, so
  // they belong in the normal, not in the mesh. The packet's width and its
  // wavelength grow with age as in waterWake.js, whose reach bounds the loop.
  vec2 waterWakeSlope(vec2 p) {
    vec2 slope = vec2(0.0);
    if (uWakeBounds.w < 0.5 || distance(p, uWakeBounds.xy) > uWakeBounds.z) return slope;
    for (int i = 0; i < ${WAKE_RINGS}; i++) {
      vec4 ring = uWakeRing[i];
      if (ring.w <= 0.0) continue;
      vec2 d = p - ring.xy;
      float r = length(d);
      float age = ring.z;
      float spread = 0.25 + 0.3 * age;
      float fromFront = r - ${WAKE_SPEED.toFixed(3)} * age - 0.15;
      float x = fromFront / spread;
      if (abs(x) > 3.0 || r < 0.001) continue;
      float k = 2.0 * WATER_PI / (0.45 + 0.25 * age);
      // A few centimetres at strength one, spread over the ring as it grows
      // and given back to the water over a couple of seconds.
      float amplitude = 0.035 * ring.w * exp(-0.9 * age) * inversesqrt(1.0 + 2.0 * r);
      float envelope = exp(-x * x);
      float dhdr = amplitude * envelope * (-2.0 * x / spread * cos(k * fromFront) - k * sin(k * fromFront));
      slope += dhdr * d / r;
    }
    return slope;
  }
  // The chop of the small ripples (waveChoppiness, «Излом поверхности»; the
  // swell's own is its steepness). A ripple shoved sideways toward its crests,
  // as a trochoid is, has its crests pinched and its troughs opened: its slope
  // is the unshoved slope over the Jacobian of the shove, 1 - chop at a full
  // crest (crest 1) and 1 + chop in a full trough (crest -1), floored so it
  // cannot fold. 1 while the slider stands at its default.
  float waterRippleChop(float crest) {
    return 1.0 / max(1.0 - uRippleChop * clamp(crest, -1.0, 1.0), 0.3);
  }
  vec3 waterRippleNormal(vec3 n, vec2 p, float pixel, float weight, float wet) {
    float w = 0.0;
    if (uRipple > 0.001 && weight > 0.001 && uNoiseReady > 0.5) {
      float resolved = waterRippleResolvedWeight(pixel);
      if (resolved > 0.001) w = uRipple * weight * resolved * waterRippleWindPatch(p);
    }
    if (w > 0.001) {
      float e = 0.02 / max(uRippleScale, 0.001);
      float drift = waterRippleDrift(p);
      float h = waterRippleHeight(p, drift);
      float hx = waterRippleHeight(p + vec2(e, 0.0), drift);
      float hz = waterRippleHeight(p + vec2(0.0, e), drift);
      float relief = 0.06 * w;
      // The ripple is a height field over the *water surface*, rather than a
      // world-horizontal normal stamped onto every face.  Project its slope onto
      // the Gerstner tangent plane so a steep crest cannot acquire an artificial
      // dark side simply because its fine normal was composed in a different
      // frame.
      // h is 0.5 ± 0.15 on 90% of the sea (waterRipple.check.js): a full crest at +0.15.
      vec3 slope = vec3(-(hx - h) / e * relief, 0.0, -(hz - h) / e * relief) * waterRippleChop((h - 0.5) / 0.15);
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
      vec4 ripple = texture2D(uSeaRippleNormalMap, clamp(rippleUv, vec2(0.0), vec2(1.0)));
      vec3 encoded = ripple.rgb * 2.0 - 1.0;
      float runtimeWeight = waterRippleMapWeight(p) * clamp(wet, 0.0, 1.0);
      // Alpha is the smoothed height. The simulation pulls a crest back past
      // 0.72, so half of that counts as a full one.
      vec3 localSlope = vec3(encoded.x, 0.0, encoded.z) * (0.16 * uSeaRippleStrength * inBounds * runtimeWeight)
        * waterRippleChop((ripple.a * 2.0 - 1.0) / 0.35);
      localSlope -= n * dot(n, localSlope);
      n = normalize(n + localSlope);
    }
    vec2 wake = waterWakeSlope(p);
    if (dot(wake, wake) > 1e-8) {
      // Waves finer than a pixel average out instead of shimmering.
      float resolved = 1.0 - smoothstep(0.06, 0.25, pixel);
      vec3 wakeSlope = vec3(-wake.x, 0.0, -wake.y) * resolved * clamp(wet, 0.0, 1.0);
      wakeSlope -= n * dot(n, wakeSlope);
      n = normalize(n + wakeSlope);
    }
    return n;
  }
  // Foam coordinates: x across the flow, y along it, in metres. On open water
  // the flow is the wind; a breaker hands in crest × arc so the streaks run
  // down its face. The coordinate belongs to its carrier: a field advects its
  // own coverage and a breaking profile advances its own arc. Do not scroll a
  // second texture through either one, or the foam crawls over still water.
  vec2 waterFlowUv(vec2 p) {
    return vec2(dot(p, vec2(-uWind.y, uWind.x)), dot(p, uWind));
  }
  vec2 waterFoamCarrierWarp(vec2 fp) {
    // The volume repeats every 1/uLaceScale metres. A low-frequency carrier
    // warp shifts each repeat by several metres before it is sampled, without
    // adding another 3D fetch or an independent clock. Its derivative stays
    // below one, so the lace is distorted into a film instead of folding.
    vec2 q = fp * 0.071;
    vec2 warp = vec2(
      gerstnerNoise(mat2(0.81, -0.59, 0.59, 0.81) * q + 2.73),
      gerstnerNoise(mat2(0.62, -0.78, 0.78, 0.62) * q * 0.83 + 8.41)
    ) - 0.5;
    return fp + warp * 4.6;
  }
  // Empirical inverse CDF of the lace pattern at uLaceScale .34. The field
  // coverage is the fraction of a patch that should carry visible foam, so
  // map it to a pattern quantile instead of multiplying every pixel by it.
  // Linear segments keep the lookup deterministic and inexpensive.
  float waterFoamPatternQuantile(float probability) {
    float p = clamp(probability, 0.0, 1.0);
    if (p < 0.01) return mix(0.29077, 0.35352, p * 100.0);
    if (p < 0.05) return mix(0.35352, 0.39697, (p - 0.01) * 25.0);
    if (p < 0.10) return mix(0.39697, 0.42188, (p - 0.05) * 20.0);
    if (p < 0.25) return mix(0.42188, 0.46460, (p - 0.10) / 0.15);
    if (p < 0.50) return mix(0.46460, 0.51318, (p - 0.25) * 4.0);
    if (p < 0.75) return mix(0.51318, 0.56250, (p - 0.50) * 4.0);
    if (p < 0.90) return mix(0.56250, 0.60596, (p - 0.75) / 0.15);
    if (p < 0.95) return mix(0.60596, 0.62988, (p - 0.90) * 20.0);
    if (p < 0.99) return mix(0.62988, 0.67529, (p - 0.95) * 25.0);
    return mix(0.67529, 0.76807, (p - 0.99) * 100.0);
  }
  // Foam from a coverage 0..1. On the water this is a porous film: a dense
  // body breaks at its edge into short strands and holes. The only genuinely
  // volumetric foam is the shell at a breaking lip; promoting every Worley
  // cell here into a bright dome made the whole sea read as cauliflower. The
  // detail octave is rotated and warped so the volume's tiling never appears
  // as a lattice. age 0..1 comes from the foam field: old foam survives only
  // where the fine octave is strong, so a patch breaks into rags and holes.
  // height: how much foam stands here, 0..1, for its relief light.
  float waterFoam(vec2 fp, float coverage, float pixel, float age, out float bubbles, out float height) {
    bubbles = 0.0;
    height = 0.0;
    // uNoiseReady is uniform. Do not return on the per-fragment coverage
    // field before fwidth below: GLSL derivatives become undefined where a
    // foam edge crosses a pixel quad, which showed up as a dotted inner line.
    if (uNoiseReady < 0.5) return 0.0;
    vec2 carrier = waterFoamCarrierWarp(fp);
    vec2 lp = vec2(carrier.x * 0.85, carrier.y * 1.25) * uLaceScale;
    // The noise volume tiles in all three axes, so a plane through it repeats
    // every 1/scale metres — at a metre-scale lace that lattice is plainly
    // visible on the sea. The slice varies along the foam carrier instead:
    // neighbouring stretches read different depths of the volume, and there
    // is no plane in it left to repeat. The offset is hashed value noise,
    // itself without a period.
    // The plane is also tilted by irrational slopes and bent at a few repeats:
    // shifted only smoothly, the same islands came back one repeat away.
    // Not wrapped: the volume repeats in depth by itself, and a fract() here
    // cut the detail octave (read at 0.63 of this depth) along a line every
    // couple of metres once the tilt made the slice climb.
    float slice = 0.12 + gerstnerNoise(carrier * 0.019) * 3.0 + dot(lp, vec2(0.618, 0.7549)) + gerstnerNoise(lp * 0.37 + vec2(5.1, -2.3)) * 1.2;
    vec3 lace = texture(uNoise, vec3(lp, slice)).rgb;
    // Variety. The detail octave followed the lace scale, so a large lace
    // (islands of several metres) had nothing finer in it: smooth blobs of
    // one size that read as one stamp. Its scale is floored at about a
    // metre, so big islands carry a fine lace and ragged rims; and a slow
    // patchiness makes some stretches of the water dense and others thin.
    float detailScale = mix(2.37, max(2.37, 0.8 / max(uLaceScale, 0.001)), uFoamVariety);
    float feature = 0.125 / max(uLaceScale, 0.001) * 2.37 / detailScale;
    float fineFade = 1.0 - smoothstep(feature * 0.05, feature * 0.25, pixel);
    coverage = min(coverage * mix(1.0, 0.3 + 1.4 * gerstnerNoise(carrier * 0.027 + 3.7), 0.7 * uFoamVariety), 1.0);
    // Rotated and warped between octaves: the noise volume tiles, the foam must not.
    vec2 dp = mat2(0.83, -0.56, 0.56, 0.83) * lp * detailScale + lace.g * 0.35;
    lp += (vec2(lace.b, lace.g) - 0.5) * 0.9;
    vec3 detail = texture(uNoise, vec3(dp, 0.52 + lace.r * 0.2 + slice * 0.63)).rgb;
    float fine = mix(0.5, detail.b, fineFade);
    // Old foam is drawn out along the flow into windrows, a few metres apart
    // and tens of metres long, instead of shrinking in place.
    coverage *= mix(1.0, 0.25 + 1.5 * gerstnerNoise(vec2(carrier.x * 0.31, carrier.y * 0.045) + 13.1), clamp(age, 0.0, 1.0) * 0.8);
    float pattern = lace.r * 0.5 + detail.r * 0.3 + fine * 0.2;
    // The former threshold used 1 - coverage directly against this biased
    // distribution. That made .25 empty while .5 covered most of the sea.
    // The inverse CDF instead makes coverage approximately the island area:
    // .1/.25 remain lace over clear water and 1 fills the whole carrier.
    float threshold = waterFoamPatternQuantile(1.0 - coverage);
    float width = max(fwidth(pattern) * 0.75, 0.008);
    float coverageActive = smoothstep(0.0005, 0.0025, coverage);
    float islands = smoothstep(threshold - width, threshold + width, pattern);
    // Density: thin at an island's rim, dense in its core — not a cut-out.
    float thick = clamp((pattern - threshold) / 0.11 + 0.15, 0.0, 1.0);
    float density = islands * (1.0 - exp(-3.0 * thick - 0.35));
    // Aged foam opens into a net on the cell walls, thickest where walls meet,
    // as a real patch does before it is gone; fresh foam is still whole.
    float netLevel = mix(0.28, 0.40, age);
    float net = smoothstep(netLevel - 0.03, netLevel + 0.03, (1.0 - lace.g) + (fine - 0.5) * 0.08);
    float pores = mix(0.52, detail.g, fineFade);
    float porosity = smoothstep(0.20, 0.54, fine + coverage * 0.52) * mix(0.62, 1.0, pores);
    // Once lace is smaller than a pixel, resolve it to its area-weighted film
    // density. Thresholding a mean pattern would switch that foam off.
    float farFilm = coverage * (0.62 + 0.38 * 0.52);
    farFilm *= mix(1.0, 0.57, clamp(age, 0.0, 1.0));
    float body = mix(farFilm, density * mix(1.0, net, clamp(age, 0.0, 1.0)) * porosity, fineFade);
    height = coverageActive * thick * smoothstep(threshold - width * 4.0, threshold + 0.11, pattern) * fineFade;
    // The sparse rim is a film left as a patch breaks apart, not a cloudy
    // halo around each noise cell. It is deliberately narrower than the body
    // and fades by pixel width before it can sparkle at distance.
    float strands = fineFade * smoothstep(threshold - width * 2.5, threshold + width * 0.5, pattern)
      * (1.0 - body)
      * smoothstep(0.18, 0.56, fine);
    bubbles = coverageActive * clamp(pores * body + (1.0 - body) * 0.72, 0.0, 1.0);
    return coverageActive * clamp(body + strands * 0.34, 0.0, 1.0);
  }
  // thickness: metres of water behind this point toward the light (a lip is
  // centimetres, open water is metres). lift: extra backlight for a crest.
  // bed: how much of the sand shows through the water here, 0..1 —
  // exp(-depth * k) down and back up, k about 3 for this turbid sea.
#ifdef WATER_SEA_FOAM
  float waterSeaFoamCoverage;
  float waterSeaFoamAge;
#endif
#ifdef WATER_BODY_NORMAL
  vec3 waterBodyNormal; // the mean water surface the medium is seen through; the breaker sets it
#endif
  // Sun a thin sheet of water scatters toward the eye from behind it: nothing
  // for a film, most at about 0.6 m, gone within a few metres. Beer's exp(-x)
  // alone peaked at zero thickness, so the thinnest lip glowed most.
  float waterSlabGlow(float thickness) {
    float x = 1.6 * thickness;
    return x * exp(1.0 - x);
  }
  // A reflected ray that looks down lands on the sea itself: part mirrored
  // sky, part lit water — not the black it was under a steep face.
  vec3 waterBelowRadiance(vec3 reflectedDown, float keyVisibility) {
    vec3 mirrored = waterSkyColor(vec3(reflectedDown.x, abs(reflectedDown.y), reflectedDown.z)) * 0.3;
    vec3 lit = uWaterColor * (uFillIrradiance + uSunRadiance * 0.3 * keyVisibility) * 0.55 / WATER_PI;
    return mix(mirrored, lit, 0.6);
  }
  // One light for every foam: the film on the water, the roller's volume and
  // the spray. sky: waterSkyIrradiance(n) plus fill, from the caller; sunShare:
  // the sun's visibility times the caller's own shading. Foam is a white
  // diffuser: the sky the water reflects, the sun on its face and, where it is
  // thin, the sun through it from behind.
  vec3 waterFoamLight(vec3 sky, vec3 n, vec3 view, float sunShare, float powder) {
    float forward = pow(max(dot(-view, uSunDirection), 0.0), 6.0) * (1.0 - 0.6 * powder);
    vec3 irradiance = sky + uSunRadiance * sunShare * (max(dot(n, uSunDirection), 0.0) + 0.8 * forward);
    return vec3(0.9, 0.92, 0.88) * irradiance / WATER_PI * uFoamBrightness;
  }
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
    vec3 reflectedDown = reflected;
    reflected.y = abs(reflected.y);
    // Toward the horizon the mirrored sky is magnified: one row of the cloud
    // atlas spans many screen rows and its steps read as horizontal streaks.
    // Filter it there as a rough sea would.
    float grazing = 1.0 - smoothstep(0.004, 0.07, reflected.y);
    float unresolvedRoughness = max(waterRippleUnresolvedRoughness(world.xz, pixel), 0.2 * grazing);
    float keyVisibility = waterKeyVisibility(world);
    vec3 reflection = mix(waterSkyReflection(reflected, unresolvedRoughness), waterBelowRadiance(reflectedDown, keyVisibility), below);
    reflection = waterObjectReflection(world, n, view, reflected, reflection, unresolvedRoughness);
    reflection += uSunRadiance * waterSunGlint(reflected, unresolvedRoughness) * uGlint * 0.02 * keyVisibility;
    float sunDiffuse = max(dot(n, uSunDirection), 0.0);
    // The medium is seen through the mean water surface. A breaker's wall
    // facing the lens is no more water than the flat sea at its foot; only
    // its reflection, Fresnel and glow belong to the wall itself.
    vec3 bodyNormal = n;
#ifdef WATER_BODY_NORMAL
    bodyNormal = waterBodyNormal;
#endif
    float bodyFacing = clamp(dot(bodyNormal, view), 0.0, 1.0);
    float bodyDiffuse = max(dot(bodyNormal, uSunDirection), 0.0);
    vec3 body = mix(uDeepColor, uWaterColor, pow(bodyFacing, 0.6));
    // Cyanobacteria in the body of the water: green-yellow by the bloom's
    // amount (terrainShader.js coastBloomColor, which this chunk cannot reach).
    body = mix(body, body * vec3(0.64, 1.12, 0.56) + vec3(0.003, 0.008, 0.001), waterBloom * 0.65);
    body *= (uFillIrradiance + uSunRadiance * (0.15 + 0.45 * bodyDiffuse) * keyVisibility) * 0.55 / WATER_PI;
    // Translucency: sun and sky through thin water toward the eye. The wall
    // of a wave lit from behind glows green.
    float transmit = exp(-thickness * 1.6);
    float backlight = pow(max(dot(view, -uSunDirection), 0.0), 3.0);
    vec3 sunThrough = uWaterColor * uSunRadiance / WATER_PI * backlight * uCrestGlow * 1.6 * keyVisibility;
    body += sunThrough * lift;
    body += uWaterColor * uFillIrradiance / WATER_PI * transmit * 1.8;
    // Shallow water: the sand shows through — wet sand, lit as the beach's own
    // wet band is, by the share the caller took from Beer-Lambert for the
    // depth — and the surface reads less as a mirror over it.
    vec3 bedLit = uBedColor * 0.55 * (uFillIrradiance + uSunRadiance * (0.3 + 0.7 * bodyDiffuse) * keyVisibility) / WATER_PI;
    body = mix(body, bedLit, bed);
    body = waterCapturedRefraction(world, n, view, body, thickness);
    // The sheet's own scattering reaches the eye whatever lies behind it, so it
    // comes after the capture; sand under a film blocks it.
    vec3 glow = sunThrough * 1.5 * waterSlabGlow(thickness) * (1.0 - bed);
    body += glow;
    vec3 behind = body;
    // Fresnel does not know how deep the water is. Damping the reflection by
    // the bed killed the sheen exactly where a real shore has most of it — on
    // the swash film, a millimetre of water over wet sand, which is a mirror.
    float reflectionWeight = clamp(fresnel, 0.02, 0.85) * (1.0 - transmit * 0.8);
    vec3 color = mix(body, reflection, reflectionWeight);
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
    // Scum lines: the bloom gathers into thin streaks the wind draws out and
    // drifts, gone before they could shimmer (the retired water's recipe).
    if (waterBloom > 0.001) {
      vec2 across = vec2(-uWind.y, uWind.x);
      float lines = smoothstep(0.8, 0.96, gerstnerNoise(vec2(dot(world.xz, uWind) * 0.45 - uTime * 0.12, dot(world.xz, across) * 0.055)))
        * smoothstep(0.35, 0.75, gerstnerNoise(world.xz * 0.07 + uWind * uTime * 0.03))
        * smoothstep(0.3, 0.8, gerstnerNoise(world.xz * 0.9))
        * (1.0 - smoothstep(0.5, 2.5, pixel));
      vec3 scum = waterFoamLight(waterSkyIrradiance(n) + uFillIrradiance, n, view, keyVisibility, 1.0) * vec3(0.46, 0.56, 0.18);
      color = mix(color, scum, lines * waterBloom * 0.45);
    }
    float bubbles;
    float foamHeight;
    float foam = waterFoam(foamUv, foamCoverage, pixel, foamAge, bubbles, foamHeight);
#ifdef WATER_SEA_FOAM
    // A breaker carries two foams: its own, riding with the wave in the
    // crest-and-arc frame, and the sea's, lying still on the water the wave
    // runs through. Each keeps its own frame; drawn in one, the other slides.
    float seaBubbles;
    float seaHeight;
    float seaFoam = waterFoam(waterFlowUv(world.xz), waterSeaFoamCoverage, pixel, waterSeaFoamAge, seaBubbles, seaHeight);
    bubbles = mix(bubbles, seaBubbles, step(foam, seaFoam));
    foamHeight = max(foamHeight, seaHeight);
    foam = max(foam, seaFoam);
#endif
    // Relief. Foam is a layer of bubbles standing on the water, not a decal:
    // its height tilts the normal it is lit with, so rims catch the light and
    // hollows sit in the shade. A surface gradient from the screen
    // derivatives, taken before any branch; it fades with the lace itself.
    vec3 dpx = dFdx(world);
    vec3 dpy = dFdy(world);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 relief = (dFdx(foamHeight) * r1 + dFdy(foamHeight) * r2) * (sign(det) / max(abs(det), 1e-10)) * mix(0.02, 0.008, foamAge);
    relief *= min(1.0, 0.7 / max(length(relief), 1e-6));
    if (foam <= 0.0) return color;
    vec3 nF = normalize(n - relief);
    // Beer/powder from the clouds: a thick patch is lit flat white, a thin one
    // keeps some of the water's shading under it. Pores only attenuate the film
    // a little; they are not separate bright bubbles on every noise cell.
    float powder = 1.0 - exp(-foam * 2.6);
    float cavity = mix(0.72, 1.0, smoothstep(0.0, 0.6, foamHeight));
    vec3 foamLit = waterFoamLight(waterSkyIrradiance(nF) * cavity + uFillIrradiance, nF, view, keyVisibility, powder) * (0.55 + 0.45 * powder);
    // Foam lies on, or is made of, the water that glows: it scatters the same
    // light, so a backlit lip's foam is never darker than the lip.
    foamLit += (sunThrough * lift + glow) * (1.0 - 0.35 * powder);
    // Thin foam lets through what the water behind it shows; and foam on a
    // thin sheet is lit through the sheet from its far side as well.
    foamLit += behind * (1.0 - powder);
    foamLit += waterFoamLight(waterSkyIrradiance(-nF), -nF, view, keyVisibility, powder) * exp(-thickness * 1.6) * (1.0 - 0.5 * powder);
    foamLit *= mix(0.82, 0.98, bubbles);
    foamLit += uSunRadiance * pow(max(dot(reflect(-view, nF), uSunDirection), 0.0), 48.0) * uGlint * (0.02 + 0.06 * bubbles) * keyVisibility;
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
    uFoamVariety: { value: 0 },
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
  uniforms.uFoamVariety.value = Number(settings.foamVariety ?? 0);
  uniforms.uFoamBrightness.value = settings.foamBrightness;
  uniforms.uBedColor.value.set(settings.bedColor ?? '#c4b08a');
  // Turbidity in the editor's own sense: more of it, less depth to hide the sand.
  uniforms.uBedReach.value = 3.5 + 9 * Math.min(Math.max(Number(settings.bedTurbidity ?? 0.5), 0), 1);
  vec3From(uniforms.uSunDirection.value, lighting?.key?.direction, [0.4, 0.7, -0.5]).normalize();
  vec3From(uniforms.uSunRadiance.value, lighting?.key?.sceneRadiance, [2.5, 2.3, 2]);
  vec3From(uniforms.uFillIrradiance.value, lighting?.fill?.irradiance, [0.7, 0.8, 1]);
  uniforms.uSkyHorizon.value.fromArray(lighting?.environment?.horizon?.linear ?? [0.55, 0.65, 0.75]);
  uniforms.uSkyZenith.value.fromArray(lighting?.environment?.zenith?.linear ?? [0.15, 0.3, 0.55]);
  // The panorama («Только HDRI») at the level it lights objects with; the
  // painted skies at theirs.
  uniforms.uSkyLevel.value = (settings.skyReflection ?? 1) * (lighting?.environment?.hdriSea
    ? lighting.environment.hdriLevel
    : lighting?.sky?.skyLevel ?? 1);
}

// Per frame: the clock and the noise volume, once it has been built.
export function tickWaterShadingUniforms(uniforms, time, noise) {
  uniforms.uTime.value = time;
  uniforms.uNoise.value = noise?.volume ?? null;
  uniforms.uNoiseReady.value = noise?.volume ? 1 : 0;
}

// A truthy pending handle is distinct from an absent external resource. It
// stops child water materials from interpreting the parent's async start as a
// request to launch another identical volume build.
export const EMPTY_WATER_NOISE = Object.freeze({ volume: null });

// Builds the cloud noise once for every water surface root that does not
// receive one from the clouds themselves. Until it resolves the explicit
// pending handle is safe for the shader and safe to share with child surfaces.
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
  return noise ?? ownNoise ?? EMPTY_WATER_NOISE;
}
