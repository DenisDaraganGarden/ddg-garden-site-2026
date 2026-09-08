import { seaRippleShader } from './seaRippleShader.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { buildRadialWaterGeometry } from './radialWaterGeometry';
import { coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
import { createFoamFieldUniforms, foamFieldShader, useFoamField } from './foamField';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { sceneDepthFragment, sceneDepthVertex } from '../shaders/sceneDepth';

// The open-water surface: one radial mesh under the camera, Gerstner trains in
// the vertex shader, and foam from the field with memory near the camera —
// beyond its window, whitecaps straight from the Jacobian, which is all the
// horizon needs.

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  ${coastWaterShader}
  ${seaRippleShader}
  varying vec3 vWorld;
  varying vec2 vSurface;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  void main() {
    vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
    float dist = distance(p, cameraPosition.xz);
    // The swell hands a share to the breakers at the break line and dies in
    // the last metre of depth: the same rule for the beach, the spit and the cape.
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(coastLocal(p));
    float cell = waterCell(p);
    vec3 waveNormal;
    float jacobian;
    vec2 drift;
    vec3 world = gerstnerDisplace(p, fade, cell, waveNormal, jacobian, drift);
    world.y += seaRippleDisplacement(world.xz);
    vWorld = world;
    vSurface = p;
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
  ${gerstnerShader}
  ${gerstnerPixelShader}
  ${waterShadingShader}
  ${foamFieldShader}
  ${coastWaterShader}
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  uniform vec3 uShoreBand; // sMin, sMax, seam q: inside, the shore water on the beach's grid draws the water past the seam
  uniform float uSeaFarVisible;
  uniform float uSeaNearExtent;
  varying vec3 vWorld;
  varying vec2 vSurface;
  varying vec3 vWaveNormal;
  varying float vJacobian;
  varying float vFade;
  varying float vCell;
  void main() {
    // The waterline, per pixel from the shore depth map: where the ground
    // reaches the surface there is no water drawn, so this mesh's coarse
    // triangles never fight the beach for depth and the beach's own fine mesh
    // is the shoreline.
    // Along the shore band the water on the beach's own grid takes over past
    // the seam; elsewhere the water ends where the map says five centimetres of
    // depth — closer to the waterline it would fight the beach's own triangles
    // for the edge, and the strip it leaves bare is the wet sand of the swash.
    vec2 qs = coastLocal(vWorld.xz);
    if (uSeaFarVisible < 0.5) {
      bool inPond = max(abs(vWorld.x), abs(vWorld.z)) <= uSeaNearExtent * 0.5;
      bool inShelf = uCoastShape.x > 0.5 && abs(qs.y) < uCoastDimensions.x * 0.5
        && qs.x > -coastOffshore() && qs.x < 16.0;
      if (!inPond && !inShelf) discard;
    }
    float ground = uShoreReady > 0.5 ? coastGround(qs) : -1.0;
    bool inBand = uShoreBand.y > uShoreBand.x && qs.y > uShoreBand.x && qs.y < uShoreBand.y;
    // A spit can stand on either side of the band seam. Land masking must
    // apply inside the band's alongshore interval as well as outside it.
    if ((inBand && qs.x > uShoreBand.z) || ground > 0.02) discard;
    // The sand shows through by Beer-Lambert; the map knows the ground to a
    // metre down, which at this turbidity is where the sand is gone anyway.
    float bed = uShoreReady > 0.5 ? exp(-max(-ground, 0.0) * uBedReach) * (1.0 - smoothstep(0.9, 1.0, -ground)) : 0.0;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = gerstnerSurfaceNormal(vSurface, vFade);
    float rippleWet = uShoreReady > 0.5 ? smoothstep(0.4, 0.8, -ground) : 1.0;
    n = waterRippleNormal(n, vWorld.xz, pixel, max(vFade, 0.45), rippleWet);
    float jacobian = vJacobian;
    // Whitecaps from the whole wave field, unfaded, in patches: foam shows to
    // the horizon even where the mesh no longer carries the wave.
    float crest = gerstnerWhitecaps(vWorld.xz, uFoamThreshold, uFoamSoftness);
    vec3 memory = sampleFoamField(vWorld.xz);
    float coverage = mix(crest * 0.9, memory.x, memory.z);
    // Beyond the window the whitecap has no age of its own; a middling one
    // keeps the lace the same on both sides of the window's edge.
    float age = mix(0.35, memory.y, memory.z);
    float lift = clamp(vWorld.y * 1.5, 0.0, 1.0) * (1.0 - jacobian * 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, waterFlowUv(vWorld.xz), coverage, age, 10.0, lift, bed);
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// coast: { definition, breakQ } — the terrain's coast frame and where the
// breakers take over; null leaves the swell running to the horizon everywhere.
// timeline: the scene's paused-aware clock (createSceneTimeline), advanced
// here for every water surface; without one the renderer's clock is used.
export default function GerstnerWaterSurface({ settings, lighting, noise = null, followCamera = true, wireframe = false, coast = null, foamBores = null, timeline = null, sceneBindings = null, farVisible = true, nearExtent = 82 }) {
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
    ...(sceneBindings ?? {}),
    uFoamThreshold: { value: 0.5 },
    uFoamSoftness: { value: 0.15 },
    uShoreBand: { value: new THREE.Vector3(0, 0, -24) },
    uSeaFarVisible: { value: 1 },
    uSeaNearExtent: { value: 82 },
  }));

  useEffect(() => {
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    uniforms.uFoamThreshold.value = settings.foamThreshold;
    uniforms.uFoamSoftness.value = settings.foamSoftness;
    syncCoastWaterUniforms(uniforms, coast, coast?.breakQ ?? -10, coast?.swellFadeWidth ?? 30);
    const band = coast?.band;
    uniforms.uShoreBand.value.set(band?.sMin ?? 0, band?.sMax ?? 0, band?.seam ?? -24);
    uniforms.uSeaFarVisible.value = farVisible ? 1 : 0;
    uniforms.uSeaNearExtent.value = nearExtent;
  }, [coast, farVisible, lighting, nearExtent, settings, uniforms]);

  // The water's clock runs before every water pass; it stands still with the scene.
  useFrame((_, delta) => { timeline?.advance(delta); }, -30);
  useFoamField(uniforms, { settings, bores: foamBores, coast, timeline });

  useFrame(({ clock, camera }) => {
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
    uniforms.uGerstnerTime.value = time;
    tickWaterShadingUniforms(uniforms, time, activeNoise);
    if (coast) tickShoreDepth(uniforms, coast);
    if (followCamera && meshRef.current) meshRef.current.position.set(camera.position.x, 0, camera.position.z);
  });

  return (
    <mesh ref={meshRef} name="gerstner-water" geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={sceneDepthVertex(vertexShader)}
        fragmentShader={sceneDepthFragment(fragmentShader)}
        fog
        wireframe={wireframe}
        stencilWrite
        stencilRef={BOAT_CUTOUT_STENCIL_REF}
        stencilFunc={THREE.NotEqualStencilFunc}
        stencilFail={THREE.KeepStencilOp}
        stencilZFail={THREE.KeepStencilOp}
        stencilZPass={THREE.KeepStencilOp}
      />
    </mesh>
  );
}
