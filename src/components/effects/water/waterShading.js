import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { buildCloudNoise } from '../sky/painterly/cloudNoise';

// One look for every water surface: the open-water mesh, the breaking-wave
// ribbons and later the shore. Body colour, sky reflection, sun glint,
// translucency by thickness, and foam drawn with the painterly clouds' noise
// (Worley edges for the lace, the fine octave for the eroded edge, Beer/powder
// for the light). Every detail layer fades by metres-per-pixel before it aliases.

export const waterShadingShader = /* glsl */`
  precision highp sampler3D;
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
  #define WATER_PI 3.14159265
  float gerstnerNoise(vec2 p); // defined by gerstnerShader, which every water fragment includes first

  vec3 waterSkyColor(vec3 ray) {
    return mix(uSkyHorizon, uSkyZenith, pow(clamp(ray.y, 0.0, 1.0), 0.55)) * uSkyLevel;
  }
  // Two scrolling slices of the cloud volume as wind ripples on the swell.
  float waterRippleHeight(vec2 p) {
    vec2 a = p * uRippleScale + uWind * uTime * 0.05;
    vec2 b = p * uRippleScale * 2.9 - uWind * uTime * 0.03;
    return texture(uNoise, vec3(a, 0.31)).r * 0.65 + texture(uNoise, vec3(b, 0.67)).b * 0.35;
  }
  vec3 waterRippleNormal(vec3 n, vec2 p, float pixel, float weight) {
    float feature = 0.125 / max(uRippleScale, 0.001);
    float w = uRipple * weight * uNoiseReady * (1.0 - smoothstep(feature * 0.12, feature * 0.5, pixel)) * mix(0.12, 1.0, waterWindPatch(p));
    if (w <= 0.001) return n;
    float e = 0.02 / max(uRippleScale, 0.001);
    float h = waterRippleHeight(p);
    float hx = waterRippleHeight(p + vec2(e, 0.0));
    float hz = waterRippleHeight(p + vec2(0.0, e));
    float relief = 0.06 * w;
    return normalize(n + vec3(-(hx - h) / e * relief, 0.0, -(hz - h) / e * relief));
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
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-view, n);
    // The underside of a lip looks down at the water, not at a mirrored sky.
    float below = 1.0 - smoothstep(-0.25, 0.0, reflected.y);
    reflected.y = abs(reflected.y);
    vec3 reflection = mix(waterSkyColor(reflected), uDeepColor * uFillIrradiance * 0.6, below);
    reflection += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 320.0) * uGlint * 0.02;
    float sunDiffuse = max(dot(n, uSunDirection), 0.0);
    vec3 body = mix(uDeepColor, uWaterColor, pow(facing, 0.6));
    body *= (uFillIrradiance + uSunRadiance * (0.15 + 0.45 * sunDiffuse)) * 0.55 / WATER_PI;
    // Translucency: sun and sky through thin water toward the eye. The wall
    // of a wave lit from behind glows green.
    float transmit = exp(-thickness * 1.6);
    float backlight = pow(max(dot(view, -uSunDirection), 0.0), 3.0);
    body += uWaterColor * uSunRadiance / WATER_PI * backlight * (lift + transmit * 1.5) * uCrestGlow * 1.6;
    body += uWaterColor * uFillIrradiance / WATER_PI * transmit * 1.8;
    // Shallow water: the sand shows through — wet sand, lit as the beach's own
    // wet band is, by the share the caller took from Beer-Lambert for the
    // depth — and the surface reads less as a mirror over it.
    vec3 bedLit = uBedColor * 0.55 * (uFillIrradiance + uSunRadiance * (0.3 + 0.7 * sunDiffuse)) / WATER_PI;
    body = mix(body, bedLit, bed);
    // Fresnel does not know how deep the water is. Damping the reflection by
    // the bed killed the sheen exactly where a real shore has most of it — on
    // the swash film, a millimetre of water over wet sand, which is a mirror.
    vec3 color = mix(body, reflection, clamp(fresnel, 0.02, 0.85) * (1.0 - transmit * 0.8));
    float bubbles;
    float foam = waterFoam(foamUv, foamCoverage, pixel, foamAge, bubbles);
    // Beer/powder from the clouds: a thick patch is lit flat white, a thin one
    // keeps some of the water's shading under it. The bubble domes catch the
    // sun as small wet glints.
    float powder = 1.0 - exp(-foam * 2.6);
    vec3 foamLit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance + uSunRadiance * sunDiffuse) / WATER_PI * (0.55 + 0.45 * powder) * uFoamBrightness;
    foamLit *= 0.7 + 0.5 * bubbles;
    foamLit += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 48.0) * uGlint * (0.02 + 0.06 * bubbles);
    return mix(color, foamLit, foam);
  }
`;

const vec3From = (target, source, fallback) => target.fromArray(Array.isArray(source) ? source : fallback);

export function createWaterShadingUniforms() {
  return {
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
