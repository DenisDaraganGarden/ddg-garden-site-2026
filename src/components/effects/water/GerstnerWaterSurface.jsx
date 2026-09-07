import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { buildRadialWaterGeometry } from './radialWaterGeometry';
import { coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms } from './coastFrame';
import { createFoamFieldUniforms, foamFieldShader, useFoamField } from './foamField';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

// The open-water surface: one radial mesh under the camera, Gerstner trains in
// the vertex shader, and foam from the field with memory near the camera —
// beyond its window, whitecaps straight from the Jacobian, which is all the
// horizon needs.

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  ${coastWaterShader}
  uniform float uCellFactor;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  varying float vGround;
  void main() {
    vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
    float dist = distance(p, cameraPosition.xz);
    // The swell hands a share to the breakers at the break line and dies in
    // the last metre of depth: the same rule for the beach, the spit and the cape.
    vec2 qs = coastLocal(p);
    float ground = uSwellFade.y > 0.0 ? coastHeight(qs) : -100.0;
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(qs.x) * smoothstep(0.05, 0.9, -ground);
    float cell = dist * uCellFactor;
    vec3 waveNormal;
    float jacobian;
    vec2 drift;
    vec3 world = gerstnerDisplace(p, fade, cell, waveNormal, jacobian, drift);
    vGround = ground;
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
  ${foamFieldShader}
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  varying float vGround;
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
    vec3 memory = sampleFoamField(vWorld.xz);
    float coverage = mix(crest * 0.9, memory.x, memory.z);
    // Beyond the window the whitecap has no age of its own; a middling one
    // keeps the lace the same on both sides of the window's edge.
    float age = mix(0.35, memory.y, memory.z);
    float lift = clamp(vWorld.y * 1.5, 0.0, 1.0) * (1.0 - jacobian * 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, waterFlowUv(vWorld.xz), coverage, age, 10.0, lift);
    // Where the ground comes up to the surface the water thins out into the
    // wet sand: where this mesh and the ground would fight for the same depth
    // there is no water drawn, and the ground's own fine mesh is the shoreline.
    gl_FragColor = vec4(color, 1.0 - smoothstep(-0.07, 0.02, vGround));
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// coast: { definition, breakQ } — the terrain's coast frame and where the
// breakers take over; null leaves the swell running to the horizon everywhere.
export default function GerstnerWaterSurface({ settings, lighting, noise = null, followCamera = true, wireframe = false, coast = null, foamBores = null }) {
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
    ...createFoamFieldUniforms(),
    ...createCoastWaterUniforms(),
    uCellFactor: { value: 0.05 },
    uFoamThreshold: { value: 0.5 },
    uFoamSoftness: { value: 0.15 },
  }));

  useEffect(() => {
    uniforms.uCellFactor.value = geometry.userData.cellFactor;
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    uniforms.uFoamThreshold.value = settings.foamThreshold;
    uniforms.uFoamSoftness.value = settings.foamSoftness;
    syncCoastWaterUniforms(uniforms, coast, coast?.breakQ ?? -10);
  }, [coast, geometry, lighting, settings, uniforms]);

  useFoamField(uniforms, { settings, bores: foamBores, coast, noise: activeNoise });

  useFrame(({ clock, camera }) => {
    uniforms.uGerstnerTime.value = clock.elapsedTime;
    tickWaterShadingUniforms(uniforms, clock.elapsedTime, activeNoise);
    if (followCamera && meshRef.current) meshRef.current.position.set(camera.position.x, 0, camera.position.z);
  });

  return (
    <mesh ref={meshRef} name="gerstner-water" geometry={geometry} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} fog wireframe={wireframe} transparent={Boolean(coast)} />
    </mesh>
  );
}
