import React, { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coastHeight, coastPoint } from '../../../terrain/terrainModel.js';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
import { createFoamFieldUniforms, foamFieldShader } from './foamField';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

// The water at the shore, on the beach's own grid. The open-water mesh is
// coarse where it meets the sand and its plane simply sank under the beach's
// polygons; this band — half a metre across, a metre along, from past the
// break line to eight metres up the beach — carries the ground under every
// vertex, so the water meets the sand exactly where the sand is, and the swash
// rides the sand as a film: where the foam field says a bore's run-up sheet
// covers the beach now, the surface is lifted onto the sand by the sheet's
// thickness and drains back down with it. The open-water mesh yields to this
// band past the seam.

const COLUMN = 0.5;
const ROW = 1;

function buildShoreBand(definition, sMin, sMax, qMin, qMax) {
  const cols = Math.round((qMax - qMin) / COLUMN) + 1;
  const rows = Math.round((sMax - sMin) / ROW) + 1;
  const positions = new Float32Array(cols * rows * 3);
  const coast = new Float32Array(cols * rows * 2);
  const ground = new Float32Array(cols * rows);
  let v = 0;
  for (let r = 0; r < rows; r += 1) {
    const s = sMin + r * ROW;
    for (let c = 0; c < cols; c += 1, v += 1) {
      const q = qMin + c * COLUMN;
      const { x, z } = coastPoint(q, s, definition);
      positions[v * 3] = x; positions[v * 3 + 2] = z;
      coast[v * 2] = q; coast[v * 2 + 1] = s;
      ground[v] = coastHeight(q, s, definition);
    }
  }
  const indices = new (cols * rows > 65535 ? Uint32Array : Uint16Array)((cols - 1) * (rows - 1) * 6);
  let i = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c, b = a + 1, d = a + cols;
      indices[i++] = a; indices[i++] = d; indices[i++] = b;
      indices[i++] = b; indices[i++] = d; indices[i++] = d + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aCoast', new THREE.BufferAttribute(coast, 2));
  geometry.setAttribute('aGround', new THREE.BufferAttribute(ground, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 4;
  return geometry;
}

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  ${coastWaterShader}
  ${foamFieldShader}
  attribute vec2 aCoast;
  attribute float aGround;
  uniform float uFilm;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vGround;
  varying float vFilm;
  varying float vFade;
  void main() {
    vec2 p = position.xz;
    float dist = distance(p, cameraPosition.xz);
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(aCoast);
    vec3 waveNormal;
    float jacobian;
    vec2 drift;
    vec3 world = gerstnerDisplace(p, fade, 0.5, waveNormal, jacobian, drift);
    // The swash: where the sheet covers the sand now, the water rides on it.
    float film = 0.0;
    if (uFoamMemory > 0.5) {
      vec2 uv = (p - uFoamWindow.xy) / (2.0 * uFoamWindow.z) + 0.5;
      if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) film = texture2D(uFoamField, uv).a;
    }
    film *= smoothstep(-0.02, 0.02, aGround);
    if (film > 0.02) world.y = max(world.y, aGround + 0.006 + uFilm * film);
    vWorld = world;
    vWaveNormal = waveNormal;
    vGround = aGround;
    vFilm = film;
    vFade = fade;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${waterShadingShader}
  ${gerstnerShader}
  ${coastWaterShader}
  ${foamFieldShader}
  uniform float uSeam;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vGround;
  varying float vFilm;
  varying float vFade;
  void main() {
    // Under the sand there is no water; past the seam the open-water mesh draws.
    float depth = vWorld.y - vGround;
    if (depth < 0.003) discard;
    if (coastLocal(vWorld.xz).x < uSeam) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    // The film lies on the sand: its normal is the sand's, not the swell's.
    vec3 n = normalize(mix(normalize(vWaveNormal), vec3(0.0, 1.0, 0.0), vFilm));
    n = waterRippleNormal(n, vWorld.xz, pixel, vFade * (1.0 - vFilm));
    vec3 memory = sampleFoamField(vWorld.xz);
    float bed = smoothstep(1.5, 0.0, depth) * 0.85 + 0.15 * (1.0 - smoothstep(0.0, 0.06, depth));
    vec3 color = shadeWater(vWorld, n, view, pixel, waterFlowUv(vWorld.xz), memory.x, memory.y, max(depth, 0.01), 0.0, bed);
    // Millimetres of water over the sand read as the wet sand itself, glossy.
    vec3 wetSand = uBedColor * 0.5 * (uFillIrradiance + uSunRadiance * 0.45) / WATER_PI;
    color = mix(color, wetSand, (1.0 - smoothstep(0.0, 0.05, depth)) * 0.7);
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// coast: { definition, band: { sMin, sMax, seam }, shoreDepth, foamField, breakQ }.
export default function ShoreWater({ settings, lighting, noise = null, coast, timeline = null }) {
  const activeNoise = useWaterNoise(noise);
  const band = coast.band;
  const geometry = useMemo(() => buildShoreBand(coast.definition, band.sMin, band.sMax, band.seam - 2, 8), [band.seam, band.sMax, band.sMin, coast.definition]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [uniforms] = useState(() => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createGerstnerUniforms(),
    ...createCoastWaterUniforms(),
    ...createFoamFieldUniforms(),
    ...createWaterShadingUniforms(),
    uFilm: { value: 0.03 },
    uSeam: { value: -24 },
  }));

  useEffect(() => {
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    syncCoastWaterUniforms(uniforms, coast, coast.breakQ ?? -10);
    uniforms.uSeam.value = band.seam;
    uniforms.uFilm.value = settings.swashFilm ?? 0.03;
  }, [band.seam, coast, lighting, settings, uniforms]);

  useFrame(({ clock }) => {
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
    uniforms.uGerstnerTime.value = time;
    tickWaterShadingUniforms(uniforms, time, activeNoise);
    tickShoreDepth(uniforms, coast);
    const field = coast.foamField;
    uniforms.uFoamField.value = field?.texture ?? null;
    uniforms.uFoamMemory.value = field?.texture ? 1 : 0;
    if (field) uniforms.uFoamWindow.value.copy(field.window);
  });

  return (
    <mesh name="shore-water" geometry={geometry} frustumCulled={false}>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} fog />
    </mesh>
  );
}
