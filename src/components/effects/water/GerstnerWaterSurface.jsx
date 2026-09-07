import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCloudNoise } from '../sky/painterly/cloudNoise';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { buildRadialWaterGeometry } from './radialWaterGeometry';

// The open-water surface: one radial mesh under the camera, Gerstner trains in
// the vertex shader, and on the folding crests the painterly clouds' own noise
// as foam - the same lace, the same eroded edge, the same Beer/powder light,
// only one sample thick instead of a ray march.

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  void main() {
    vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
    float fade = 1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, distance(p, cameraPosition.xz));
    vec3 waveNormal;
    float jacobian;
    vec3 world = gerstnerDisplace(p, fade, waveNormal, jacobian);
    vWorld = world;
    vWaveNormal = waveNormal;
    vJacobian = jacobian;
    vFade = fade;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  precision highp sampler3D;
  #include <fog_pars_fragment>
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
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  uniform float uLaceScale;
  uniform float uFoamBrightness;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;

  vec3 skyColor(vec3 ray) {
    return mix(uSkyHorizon, uSkyZenith, pow(clamp(ray.y, 0.0, 1.0), 0.55)) * uSkyLevel;
  }
  // Two scrolling slices of the cloud volume as wind ripples on the swell.
  float rippleHeight(vec2 p) {
    vec2 a = p * uRippleScale + uWind * uTime * 0.05;
    vec2 b = p * uRippleScale * 2.9 - uWind * uTime * 0.03;
    return texture(uNoise, vec3(a, 0.31)).r * 0.65 + texture(uNoise, vec3(b, 0.67)).b * 0.35;
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vWaveNormal);
    float rippleWeight = uRipple * vFade * uNoiseReady;
    if (rippleWeight > 0.001) {
      float e = 0.02 / max(uRippleScale, 0.001);
      float h = rippleHeight(vWorld.xz);
      float hx = rippleHeight(vWorld.xz + vec2(e, 0.0));
      float hz = rippleHeight(vWorld.xz + vec2(0.0, e));
      float relief = 0.06 * rippleWeight;
      n = normalize(n + vec3(-(hx - h) / e * relief, 0.0, -(hz - h) / e * relief));
    }
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-view, n);
    reflected.y = abs(reflected.y);
    vec3 reflection = skyColor(reflected);
    reflection += uSunRadiance * pow(max(dot(reflected, uSunDirection), 0.0), 320.0) * uGlint * 0.02;

    float sunDiffuse = max(dot(n, uSunDirection), 0.0);
    vec3 body = mix(uDeepColor, uWaterColor, pow(facing, 0.6));
    body *= (uFillIrradiance + uSunRadiance * (0.15 + 0.45 * sunDiffuse)) * 0.55 / 3.14159265;
    // The wall of a wave lit from behind glows green: crest height above the
    // mean level times the sun behind the crest.
    float backlight = pow(max(dot(view, -uSunDirection), 0.0), 3.0);
    float lift = clamp(vWorld.y * 1.5, 0.0, 1.0) * (1.0 - vJacobian * 0.5);
    body += uWaterColor * uSunRadiance / 3.14159265 * backlight * lift * uCrestGlow * 1.6;
    vec3 color = mix(body, reflection, clamp(fresnel, 0.02, 0.96));

    // Foam where the crest folds (small Jacobian). Coverage comes from the
    // fold, shape from the cloud noise: Worley cell edges give the lace, and
    // the fine octave erodes the thin parts exactly like a cloud edge.
    float crest = smoothstep(uFoamThreshold + uFoamSoftness, uFoamThreshold - uFoamSoftness, vJacobian);
    float foam = 0.0;
    if (crest > 0.001 && uNoiseReady > 0.5) {
      vec2 lp = vWorld.xz * uLaceScale + uWind * uTime * 0.02;
      vec3 lace = texture(uNoise, vec3(lp, 0.12)).rgb;
      float fine = texture(uNoise, vec3(lp * 2.7 - uWind * uTime * 0.01, 0.52)).b;
      float pattern = mix(lace.r, 1.0 - lace.g, 0.6);
      float coverage = crest * 0.9;
      foam = smoothstep(1.0 - coverage - 0.12, 1.0 - coverage + 0.12, pattern);
      foam *= smoothstep(0.2, 0.55, fine + coverage * 0.6);
    }
    // Beer/powder from the clouds: a thick patch is lit flat white, a thin one
    // keeps some of the water's shading under it.
    float powder = 1.0 - exp(-foam * 2.6);
    vec3 foamLit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance + uSunRadiance * sunDiffuse) / 3.14159265 * (0.55 + 0.45 * powder) * uFoamBrightness;
    color = mix(color, foamLit, foam);

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const vec3From = (target, source, fallback) => target.fromArray(Array.isArray(source) ? source : fallback);

export default function GerstnerWaterSurface({ settings, lighting, noise = null, followCamera = true, wireframe = false }) {
  const meshRef = useRef();
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
  const activeNoise = noise ?? ownNoise;

  const geometry = useMemo(
    () => buildRadialWaterGeometry({ rings: settings.meshRings, segments: settings.meshSegments }),
    [settings.meshRings, settings.meshSegments],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const [uniforms] = useState(() => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createGerstnerUniforms(),
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
    uFoamThreshold: { value: 0.5 },
    uFoamSoftness: { value: 0.15 },
    uLaceScale: { value: 0.15 },
    uFoamBrightness: { value: 1 },
  }));

  useEffect(() => {
    syncGerstnerUniforms(uniforms, settings);
    const bearing = THREE.MathUtils.degToRad(Number(settings.windDirection) || 0);
    uniforms.uWind.value.set(Math.sin(bearing), -Math.cos(bearing));
    uniforms.uWaterColor.value.set(settings.waterColor);
    uniforms.uDeepColor.value.set(settings.deepColor);
    uniforms.uCrestGlow.value = settings.crestGlow;
    uniforms.uGlint.value = settings.glint;
    uniforms.uRipple.value = settings.ripple;
    uniforms.uRippleScale.value = settings.rippleScale;
    uniforms.uFoamThreshold.value = settings.foamThreshold;
    uniforms.uFoamSoftness.value = settings.foamSoftness;
    uniforms.uLaceScale.value = settings.laceScale;
    uniforms.uFoamBrightness.value = settings.foamBrightness;
    vec3From(uniforms.uSunDirection.value, lighting?.key?.direction, [0.4, 0.7, -0.5]).normalize();
    vec3From(uniforms.uSunRadiance.value, lighting?.key?.sceneRadiance, [2.5, 2.3, 2]);
    vec3From(uniforms.uFillIrradiance.value, lighting?.fill?.irradiance, [0.7, 0.8, 1]);
    uniforms.uSkyHorizon.value.fromArray(lighting?.environment?.horizon?.linear ?? [0.55, 0.65, 0.75]);
    uniforms.uSkyZenith.value.fromArray(lighting?.environment?.zenith?.linear ?? [0.15, 0.3, 0.55]);
    uniforms.uSkyLevel.value = (settings.skyReflection ?? 1) * (lighting?.sky?.skyLevel ?? 1);
  }, [lighting, settings, uniforms]);

  useFrame(({ clock, camera }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uGerstnerTime.value = clock.elapsedTime;
    uniforms.uNoise.value = activeNoise?.volume ?? null;
    uniforms.uNoiseReady.value = activeNoise ? 1 : 0;
    if (followCamera && meshRef.current) meshRef.current.position.set(camera.position.x, 0, camera.position.z);
  });

  return (
    <mesh ref={meshRef} name="gerstner-water" geometry={geometry} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} fog wireframe={wireframe} />
    </mesh>
  );
}
