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
  #define WATER_PI 3.14159265

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
    float w = uRipple * weight * uNoiseReady * (1.0 - smoothstep(feature * 0.12, feature * 0.5, pixel));
    if (w <= 0.001) return n;
    float e = 0.02 / max(uRippleScale, 0.001);
    float h = waterRippleHeight(p);
    float hx = waterRippleHeight(p + vec2(e, 0.0));
    float hz = waterRippleHeight(p + vec2(0.0, e));
    float relief = 0.06 * w;
    return normalize(n + vec3(-(hx - h) / e * relief, 0.0, -(hz - h) / e * relief));
  }
  // Foam from a coverage 0..1: the lace lies along the crest (stretched across
  // the wind), the fine octave erodes the thin parts like a cloud edge, and
  // the edge widens with the pixel so distant lace blurs instead of sparkling.
  float waterFoam(vec2 p, float coverage, float pixel) {
    if (coverage <= 0.001 || uNoiseReady < 0.5) return 0.0;
    vec2 acrossWind = vec2(-uWind.y, uWind.x);
    vec2 lp = vec2(dot(p, acrossWind) * 0.7, dot(p, uWind) * 1.25 - uTime * 0.25) * uLaceScale;
    vec3 lace = texture(uNoise, vec3(lp, 0.12)).rgb;
    float feature = 0.125 / max(uLaceScale, 0.001);
    float fineFade = 1.0 - smoothstep(feature * 0.05, feature * 0.25, pixel);
    float fine = mix(0.6, texture(uNoise, vec3(lp * 2.7, 0.52)).b, fineFade);
    float pattern = mix(lace.r, 1.0 - lace.g, 0.6);
    float width = 0.18 + smoothstep(feature * 0.1, feature * 0.6, pixel) * 0.25;
    float foam = smoothstep(1.0 - coverage - width, 1.0 - coverage + width, pattern);
    return foam * smoothstep(0.2, 0.55, fine + coverage * 0.6);
  }
  // thickness: metres of water behind this point toward the light (a lip is
  // centimetres, open water is metres). lift: extra backlight for a crest.
  vec3 shadeWater(vec3 world, vec3 n, vec3 view, float pixel, float foamCoverage, float thickness, float lift) {
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-view, n);
    reflected.y = abs(reflected.y);
    vec3 reflection = waterSkyColor(reflected);
    reflection += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 320.0) * uGlint * 0.02;
    float sunDiffuse = max(dot(n, uSunDirection), 0.0);
    vec3 body = mix(uDeepColor, uWaterColor, pow(facing, 0.6));
    body *= (uFillIrradiance + uSunRadiance * (0.15 + 0.45 * sunDiffuse)) * 0.55 / WATER_PI;
    // Translucency: sun and sky through thin water toward the eye. The wall
    // of a wave lit from behind glows green.
    float transmit = exp(-thickness * 1.6);
    float backlight = pow(max(dot(view, -uSunDirection), 0.0), 3.0);
    body += uWaterColor * uSunRadiance / WATER_PI * backlight * (lift + transmit * 1.5) * uCrestGlow * 1.6;
    body += uWaterColor * uFillIrradiance / WATER_PI * transmit * 0.8;
    vec3 color = mix(body, reflection, clamp(fresnel, 0.02, 0.85) * (1.0 - transmit * 0.6));
    float foam = waterFoam(world.xz, foamCoverage, pixel);
    // Beer/powder from the clouds: a thick patch is lit flat white, a thin one
    // keeps some of the water's shading under it.
    float powder = 1.0 - exp(-foam * 2.6);
    vec3 foamLit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance + uSunRadiance * sunDiffuse) / WATER_PI * (0.55 + 0.45 * powder) * uFoamBrightness;
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
