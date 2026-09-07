import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { buildRadialWaterGeometry } from './radialWaterGeometry';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

// The open-water surface: one radial mesh under the camera, Gerstner trains in
// the vertex shader, whitecaps where the Jacobian says the crest folds.

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  uniform float uCellFactor;
  uniform vec4 uShore; // origin.xz, shoreDir.xz
  uniform vec2 uShoreFade; // n where the swell starts to fade, fade width
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  void main() {
    vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
    float dist = distance(p, cameraPosition.xz);
    float fade = 1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist);
    if (uShoreFade.y > 0.0) fade *= 1.0 - 0.65 * smoothstep(uShoreFade.x - uShoreFade.y, uShoreFade.x, dot(p - uShore.xy, uShore.zw));
    float cell = dist * uCellFactor;
    vec3 waveNormal;
    float jacobian;
    vec3 world = gerstnerDisplace(p, fade, cell, waveNormal, jacobian);
    vWorld = world;
    vWaveNormal = waveNormal;
    vJacobian = jacobian;
    vFade = fade;
    vCell = cell;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${waterShadingShader}
  ${gerstnerShader}
  ${gerstnerPixelShader}
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = normalize(vWaveNormal);
    float fold;
    vec2 farSlope = gerstnerPixelSlope(vWorld.xz, vFade, vCell, fold);
    n = normalize(vec3(n.x - farSlope.x * n.y, n.y, n.z - farSlope.y * n.y));
    n = waterRippleNormal(n, vWorld.xz, pixel, vFade);
    float jacobian = vJacobian - fold;
    float crest = smoothstep(uFoamThreshold + uFoamSoftness, uFoamThreshold - uFoamSoftness, jacobian);
    float lift = clamp(vWorld.y * 1.5, 0.0, 1.0) * (1.0 - jacobian * 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, crest * 0.9, 10.0, lift);
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function GerstnerWaterSurface({ settings, lighting, noise = null, followCamera = true, wireframe = false, shore = null }) {
  const meshRef = useRef();
  const activeNoise = useWaterNoise(noise);
  const geometry = useMemo(
    () => buildRadialWaterGeometry({ rings: settings.meshRings, segments: settings.meshSegments }),
    [settings.meshRings, settings.meshSegments],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const [uniforms] = useState(() => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createGerstnerUniforms(),
    ...createWaterShadingUniforms(),
    uCellFactor: { value: 0.05 },
    uShore: { value: new THREE.Vector4(0, 0, 0, 1) },
    uShoreFade: { value: new THREE.Vector2(0, 0) },
    uFoamThreshold: { value: 0.5 },
    uFoamSoftness: { value: 0.15 },
  }));

  useEffect(() => {
    uniforms.uCellFactor.value = geometry.userData.cellFactor;
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    uniforms.uFoamThreshold.value = settings.foamThreshold;
    uniforms.uFoamSoftness.value = settings.foamSoftness;
    if (shore) {
      uniforms.uShore.value.set(shore.origin[0], shore.origin[1], shore.shoreDir[0], shore.shoreDir[1]);
      uniforms.uShoreFade.value.set(shore.fadeN, shore.fadeWidth);
    } else uniforms.uShoreFade.value.set(0, 0);
  }, [geometry, lighting, settings, shore, uniforms]);

  useFrame(({ clock, camera }) => {
    uniforms.uGerstnerTime.value = clock.elapsedTime;
    tickWaterShadingUniforms(uniforms, clock.elapsedTime, activeNoise);
    if (followCamera && meshRef.current) meshRef.current.position.set(camera.position.x, 0, camera.position.z);
  });

  return (
    <mesh ref={meshRef} name="gerstner-water" geometry={geometry} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} fog wireframe={wireframe} />
    </mesh>
  );
}
