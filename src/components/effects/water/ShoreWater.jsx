import { seaRippleShader } from './seaRippleShader.js';
import React, { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coastHeight, coastPoint } from '../../../terrain/terrainModel.js';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
import { createFoamFieldUniforms, foamFieldShader } from './foamField';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { sceneDepthFragment, sceneDepthVertex } from '../shaders/sceneDepth';

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
  const groundNormal = new Float32Array(cols * rows * 3);
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
  // The sand's normal from the heights just sampled — the swash film lies on
  // the sand, so it must catch the light the way the sand does, not as a level
  // mirror. Central differences inside, one-sided at the rim; no new samples.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = r * cols + c;
      const cLo = Math.max(c - 1, 0), cHi = Math.min(c + 1, cols - 1);
      const rLo = Math.max(r - 1, 0), rHi = Math.min(r + 1, rows - 1);
      const qLo = r * cols + cLo, qHi = r * cols + cHi;
      const sLo = rLo * cols + c, sHi = rHi * cols + c;
      const qx = positions[qHi * 3] - positions[qLo * 3];
      const qz = positions[qHi * 3 + 2] - positions[qLo * 3 + 2];
      const qy = ground[qHi] - ground[qLo];
      const sx = positions[sHi * 3] - positions[sLo * 3];
      const sz = positions[sHi * 3 + 2] - positions[sLo * 3 + 2];
      const sy = ground[sHi] - ground[sLo];
      // s is curved in world space: using only the fixed coast axes omitted
      // the coastline derivative and gave the wet sand a different normal.
      const x = sy * qz - sz * qy, y = sz * qx - sx * qz, z = sx * qy - sy * qx;
      const length = Math.hypot(x, y, z);
      groundNormal[v * 3] = x / length; groundNormal[v * 3 + 1] = y / length; groundNormal[v * 3 + 2] = z / length;
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
  geometry.setAttribute('aGroundNormal', new THREE.BufferAttribute(groundNormal, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 4;
  return geometry;
}

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  ${gerstnerShader}
  ${coastWaterShader}
  ${seaRippleShader}
  ${foamFieldShader}
  attribute vec2 aCoast;
  attribute float aGround;
  attribute vec3 aGroundNormal;
  uniform float uFilm;
  varying vec3 vWorld;
  varying vec2 vSurface;
  varying vec3 vWaveNormal;
  varying vec3 vGroundNormal;
  varying float vGround;
  varying float vFilm;
  varying float vFade;
  varying float vCell;
  varying float vLevel;
  varying float vJacobian;
  void main() {
    vec2 p = position.xz;
    float dist = distance(p, cameraPosition.xz);
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(aCoast);
    vec3 waveNormal;
    float jacobian;
    vec2 drift;
    // The same cell as the open water past the seam, not this band's own
    // half metre: two waters that meet must compute one swell there.
    float cell = waterCell(p);
    vec3 world = gerstnerDisplace(p, fade, cell, waveNormal, jacobian, drift);
    world.y += seaRippleDisplacement(world.xz);
    // The swash: where the sheet covers the sand now, the water rides on it.
    float film = 0.0;
    if (uFoamMemory > 0.5) {
      vec2 uv = (p - uFoamWindow.xy) / (2.0 * uFoamWindow.z) + 0.5;
      if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) film = texture2D(uFoamField, uv).a;
    }
    film *= smoothstep(-0.02, 0.02, aGround);
    // The swell's own level, before the sand claims it: the fragment needs the
    // unclamped surface, because max() taken here — per vertex — is what turned
    // the water's edge into a staircase with this band's own metre-wide rows.
    // A trough may not dig below the bed — that is what punched the lattice of
    // holes that read as black spots. But the limit is on the trough's DEPTH,
    // never on the surface's height: clamping the level up to the ground
    // floated the water over the beach and drowned the spit. Where the ground
    // stands above still water the limit is zero, the surface stays at the
    // still line, and the fragment discards it as dry land.
    float rest = -aGround;
    world.y = max(world.y, -max(rest - 0.02, 0.0));
    vLevel = world.y;
    // No threshold on the sheet: a step tears the lift between neighbouring
    // vertices. The sheet's own taper is what thins the tongue's edge.
    // Dry vertices stay at sea level. Only an actual swash sheet may lift
    // them onto land; unconditional max(ground) made dry triangles climb it.
    float sheetLift = smoothstep(0.0, 0.02, film);
    world.y = mix(world.y, max(world.y, aGround + uFilm * film), sheetLift);
    vWorld = world;
    vSurface = p;
    vWaveNormal = waveNormal;
    vJacobian = jacobian;
    vGroundNormal = aGroundNormal;
    vGround = aGround;
    vFilm = film;
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
  ${coastWaterShader}
  ${foamFieldShader}
  uniform float uSeam;
  uniform float uFilm;
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  varying vec3 vWorld;
  varying vec2 vSurface;
  varying vec3 vWaveNormal;
  varying vec3 vGroundNormal;
  varying float vGround;
  varying float vFilm;
  varying float vFade;
  varying float vCell;
  varying float vLevel;
  varying float vJacobian;
  void main() {
    // Past the seam the open-water mesh draws this water.
    if (coastLocal(vWorld.xz).x < uSeam) discard;
    // The water's edge, per pixel. The bed comes from the shore depth map — a
    // smooth field, not this band's chords — and the sheet from the foam field,
    // so the tongue running up the sand is cut by the water that is there and
    // not by the row of vertices nearest to it.
    vec2 fuv = (vWorld.xz - uFoamWindow.xy) / (2.0 * uFoamWindow.z) + 0.5;
    float sheet = uFoamMemory > 0.5 && all(greaterThan(fuv, vec2(0.0))) && all(lessThan(fuv, vec2(1.0))) ? texture2D(uFoamField, fuv).a * uFilm : 0.0;
    // The map is 34 cm across and clamped to a metre; the vertex attribute is
    // the ground's own function. Where they disagree the HIGHER wins, or the
    // water is drawn over sand the map failed to notice — which is what
    // flooded the beach and the spit.
    float bed = uShoreReady > 0.5 ? max(coastGround(coastLocal(vWorld.xz)), vGround) : vGround;
    // Land is decided by the BED against the still line, never by the wave.
    // Testing the instantaneous surface against the bed punched a hole wherever
    // a trough happened to sit lower than the bed the fragment read — and since
    // troughs come in a lattice, so did the holes: those were the black spots.
    // A sea has water wherever its floor is below sea level; a wave cannot take
    // the water away.
    if (bed > 0.02 && sheet <= 0.001) discard;
    float depth = max(max(vLevel - bed, sheet), 0.004);
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = gerstnerSurfaceNormal(vSurface, vFade);
    // The film lies on the sand: its normal is the sand's, not the swell's.
    n = normalize(mix(n, normalize(vGroundNormal), vFilm));
    float rippleWet = uShoreReady > 0.5 ? smoothstep(0.4, 0.8, -bed) : 1.0;
    n = waterRippleNormal(n, vWorld.xz, pixel, max(vFade, 0.45) * (1.0 - vFilm), rippleWet);
    // Exactly the open water's foam: the same whitecap measure, the same
    // crossfade into the field's window, the same age and the same crest lift.
    // Anything else and this band reads as a rectangle of another shader laid
    // on the sea — which is precisely what it did.
    float crest = gerstnerWhitecaps(vWorld.xz, uFoamThreshold, uFoamSoftness);
    vec3 memory = sampleFoamField(vWorld.xz);
    float coverage = mix(crest * 0.9, memory.x, memory.z);
    float age = mix(0.35, memory.y, memory.z);
    float lift = clamp((vWorld.y - vLevel + 0.2) * 1.5, 0.0, 1.0) * (1.0 - vJacobian * 0.5) * (1.0 - vFilm);
    // The sand under the water by Beer-Lambert: at the edge the water is the
    // wet sand itself under a gloss, deeper it is the water's own body.
    vec3 color = shadeWater(vWorld, n, view, pixel, waterFlowUv(vWorld.xz), coverage, age, 10.0, lift, exp(-depth * uBedReach));
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// coast: { definition, band: { sMin, sMax, seam }, shoreDepth, foamField, breakQ }.
export default function ShoreWater({ settings, lighting, noise = null, coast, timeline = null, wireframe = false, sceneBindings = null }) {
  const activeNoise = useWaterNoise(noise);
  const band = coast.band;
  const geometry = useMemo(() => buildShoreBand(coast.definition, band.sMin, band.sMax, band.seam - 2, 12), [band.seam, band.sMax, band.sMin, coast.definition]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [uniforms] = useState(() => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createGerstnerUniforms(),
    ...createCoastWaterUniforms(),
    ...createFoamFieldUniforms(),
    ...createWaterShadingUniforms(),
    ...(sceneBindings ?? {}),
    uFilm: { value: 0.03 },
    uSeam: { value: -24 },
    uFoamThreshold: { value: 0.55 },
    uFoamSoftness: { value: 0.15 },
  }));

  useEffect(() => {
    syncGerstnerUniforms(uniforms, settings);
    syncWaterShadingUniforms(uniforms, settings, lighting);
    syncCoastWaterUniforms(uniforms, coast, coast.breakQ ?? -10, coast.swellFadeWidth ?? 30);
    uniforms.uSeam.value = band.seam;
    uniforms.uFilm.value = settings.swashFilm ?? 0.03;
    uniforms.uFoamThreshold.value = settings.foamThreshold;
    uniforms.uFoamSoftness.value = settings.foamSoftness;
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
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={sceneDepthVertex(vertexShader)}
        fragmentShader={sceneDepthFragment(fragmentShader)}
        fog
        wireframe={wireframe}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
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
