import React, { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { createFoamFieldUniforms, foamFieldShader } from './foamField';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

// Foam with volume, built the way the painterly clouds are built. Denis's
// idea: the cloud engine already knows how to make a scattering medium look
// like matter — a 3D noise volume, a coverage field, a ray march with
// Beer/powder light and cheap taps toward the sun instead of a second march.
// Foam is the same medium, only low and fine: a layer of white froth lying on
// the water.
//
// It is not a slab in the air but a shell over the water: the surface's own
// mesh is raised by the foam's thickness here, and the pixel marches back down
// to the water. Density is the foam field's coverage times a vertical profile
// (packed against the water, eroded on top, so the masses read as rounded
// heaps) times the cloud noise; the field's age turns a fresh thick mass into
// flat lace. Beyond uFar the shell flattens and the surface's own painted foam
// takes over — the effect is fine, and at distance it has to dissolve into a
// flat brightening rather than sparkle.

const MARCH_STEPS = 14;

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  ${foamFieldShader}
  uniform float uHeight;
  uniform vec2 uFar;      // metres where the volume starts to flatten, and where it is gone
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vShell;
  varying float vAge;
  void main() {
    vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
    float dist = distance(p, cameraPosition.xz);
    float cell = waterCell(p);
    vec3 waveNormal;
    float jacobian;
    vec2 drift;
    vec3 world = gerstnerDisplace(p, 1.0, cell, waveNormal, jacobian, drift);
    vec3 field = sampleFoamField(p);
    // Fresh foam stands up; as it ages it settles into a flat sheet.
    float coverage = field.x * field.z;
    float shell = coverage * uHeight * (1.0 - 0.7 * field.y) * (1.0 - smoothstep(uFar.x, uFar.y, dist));
    vWorld = world + waveNormal * shell;
    vNormal = waveNormal;
    vShell = shell;
    vAge = field.y;
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  #define MARCH_STEPS ${MARCH_STEPS}
  ${gerstnerShader}
  ${waterShadingShader}
  ${foamFieldShader}
  uniform float uDensity;
  uniform float uDetail;
  uniform float uErosion;
  uniform float uSunTaps;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vShell;
  varying float vAge;

  // h: 1 at the top of the shell, 0 on the water.
  float foamDensityAt(vec3 p, float h, float coverage) {
    vec3 q = p * uDetail;
    q.xz += uWind * uTime * 0.12;
    // The volume tiles; a slice that slides with the world does not.
    float slice = gerstnerNoise(p.xz * 0.017) * 3.0;
    float mass = texture(uNoise, vec3(q.xz * 0.5, fract(q.y * 0.5 + slice))).r;
    float tear = texture(uNoise, vec3(q.xz * 1.63 + 0.31, fract(q.y * 1.63 + slice * 1.7))).b;
    // Packed against the water, eroded on top: rounded heaps, not a brick.
    float profile = 1.0 - smoothstep(0.15, 1.0, h);
    float d = mass * 0.75 + tear * 0.45 - uErosion * h - 0.25;
    return max(d, 0.0) * profile * coverage * uDensity;
  }

  void main() {
    if (vShell < 0.003 || uNoiseReady < 0.5) discard;
    // Coverage per pixel, not interpolated across the mesh's triangles: at a
    // grazing angle those triangles are metres wide and their edges showed as
    // a staircase through the foam.
    vec3 field = sampleFoamField(vWorld.xz);
    float coverage = field.x * field.z;
    if (coverage < 0.004) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = max(dot(normalize(vNormal), view), 0.25);
    float depth = vShell / facing;
    float stepLength = depth / float(MARCH_STEPS);
    vec3 sun = normalize(uSunDirection);
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < MARCH_STEPS; i++) {
      float travelled = (float(i) + 0.5) * stepLength;
      vec3 p = vWorld - view * travelled;
      float h = 1.0 - travelled / max(depth, 0.001);
      float density = foamDensityAt(p, h, coverage);
      if (density <= 0.002) continue;
      float alpha = 1.0 - exp(-density * stepLength * 22.0);
      // Two short taps toward the sun instead of a second march: enough for a
      // silver top and a cool shaded underside on a layer this thin.
      float shadow = 0.0;
      for (int tap = 1; tap <= 2; tap += 1) {
        if (float(tap) > uSunTaps) break;
        shadow += foamDensityAt(p + sun * (float(tap * tap) * vShell * 0.5), min(h + float(tap) * 0.3, 1.0), coverage);
      }
      float sunLight = exp(-shadow * vShell * 6.0);
      float powder = 1.0 - exp(-density * 3.2);
      vec3 lit = vec3(0.94, 0.95, 0.92)
        * (uFillIrradiance * (0.35 + 0.65 * h) + uSunRadiance * sunLight * (0.25 + 0.75 * powder))
        / WATER_PI * uFoamBrightness;
      light += transmittance * alpha * lit;
      transmittance *= 1.0 - alpha;
      if (transmittance < 0.02) break;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(light, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// geometry: the same mesh the water surface uses (it is displaced identically).
export default function FoamVolume({ settings, lighting, geometry, noise = null, foamField, timeline = null, followCamera = true }) {
  const activeNoise = useWaterNoise(noise);
  const meshRef = React.useRef();
  const [uniforms] = useState(() => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createGerstnerUniforms(),
    ...createWaterShadingUniforms(),
    ...createFoamFieldUniforms(),
    uHeight: { value: 0.35 },
    uFar: { value: new THREE.Vector2(120, 260) },
    uDensity: { value: 1 },
    uDetail: { value: 0.9 },
    uErosion: { value: 0.35 },
    uSunTaps: { value: 2 },
  }));

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [uniforms]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    uniforms.uHeight.value = settings.volumeHeight;
    uniforms.uDensity.value = settings.volumeDensity;
    uniforms.uDetail.value = settings.volumeDetail;
    uniforms.uErosion.value = settings.volumeErosion;
    uniforms.uFar.value.set(settings.volumeNear, settings.volumeFar);
  }, [lighting, settings, uniforms]);

  useFrame(({ camera, clock }) => {
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
    uniforms.uGerstnerTime.value = time;
    tickWaterShadingUniforms(uniforms, time, activeNoise);
    uniforms.uFoamField.value = foamField?.texture ?? null;
    uniforms.uFoamMemory.value = foamField?.texture ? 1 : 0;
    if (foamField?.texture) uniforms.uFoamWindow.value.copy(foamField.window);
    if (followCamera && meshRef.current) meshRef.current.position.set(camera.position.x, 0, camera.position.z);
  });

  return <mesh ref={meshRef} name="foam-volume" geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}
