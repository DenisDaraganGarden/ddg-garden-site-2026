import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { coastShader, createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets';

// The water's knowledge of the coast. Every water surface that has to meet the
// shore — the open swell, the breakers, the foam field — reads the terrain's
// own coast frame (q across the shore from the waterline, s along it, the same
// GLSL twin the ground is built from), so the spit, the cape and the curve of
// the beach are the same for the sand and the sea.

export { BREAK_SAMPLES, breakLineMean, coastBreakLine } from './coastBreakLine.js';
// The shore depth map: the ground's height over the coast band, in coast
// coordinates, from 336 m out (past the spit's seaward shore) to 16 m inland.
// Heights are stored clamped to ±1 m — deeper reads as deep enough for every
// rule here, higher as land — at 0.34 m across and 0.8 m along the shore.
const SHORE_MAP = Object.freeze({ width: 2048, height: 1024, qMin: -336, qMax: 16 });

export const coastWaterShader = /* glsl */`
${coastShader}
// The swell dies toward the beach: a share of it goes where the breakers take
// over (uSwellFade.x, the break line), the rest in the last metre of depth.
uniform vec2 uSwellFade;
uniform sampler2D uShoreDepth;
uniform vec4 uShoreRange; // qMin, qMax, sMin, sMax of the map
uniform float uShoreReady;
vec2 coastPoint(float q, float s) {
  return coastLand() * (coastShore(s) + q) + coastAlong() * s;
}
// Ground height at a coast position, from the map: one fetch instead of the
// ground's own function, which is far too heavy per vertex, let alone per pixel.
float coastGround(vec2 qs) {
  if (uShoreReady < 0.5) return -1.0;
  vec2 uv = (qs - uShoreRange.xz) / (uShoreRange.yw - uShoreRange.xz);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.y > 1.0) return -1.0;
  if (uv.x > 1.0) return 1.0;
  return texture2D(uShoreDepth, uv).r * 2.0 - 1.0;
}
float coastSwellFade(vec2 qs) {
  if (uSwellFade.y <= 0.0) return 1.0;
  float qb = uSwellFade.x;
  return (1.0 - 0.65 * smoothstep(qb - uSwellFade.y, qb, qs.x)) * smoothstep(0.05, 0.9, -coastGround(qs));
}
`;

const shoreDepthFragment = /* glsl */`
  ${coastShader}
  uniform vec4 uShoreRange;
  varying vec2 vUv;
  void main() {
    vec2 qs = vec2(mix(uShoreRange.x, uShoreRange.y, vUv.x), mix(uShoreRange.z, uShoreRange.w, vUv.y));
    gl_FragColor = vec4(clamp(coastHeight(qs), -1.0, 1.0) * 0.5 + 0.5, 0.0, 0.0, 1.0);
  }
`;

export function createCoastWaterUniforms() {
  return {
    ...createCoastUniforms(),
    uSwellFade: { value: new THREE.Vector2(-10, 0) },
    uShoreDepth: { value: null },
    uShoreRange: { value: new THREE.Vector4(SHORE_MAP.qMin, SHORE_MAP.qMax, -800, 800) },
    uShoreReady: { value: 0 },
  };
}

// breakQ: where the swell hands over to the breakers (metres from the
// waterline, negative at sea); fadeWidth 0 leaves the swell alone.
export function syncCoastWaterUniforms(uniforms, coast, breakQ = -10, fadeWidth = 30) {
  if (!coast?.definition) { uniforms.uSwellFade.value.set(breakQ, 0); uniforms.uShoreReady.value = 0; return; }
  syncCoastUniforms(uniforms, coast.definition);
  uniforms.uSwellFade.value.set(breakQ, fadeWidth);
  tickShoreDepth(uniforms, coast);
}

// The map is rendered after the first frame; readers pick it up per frame.
export function tickShoreDepth(uniforms, coast) {
  const map = coast?.shoreDepth;
  uniforms.uShoreDepth.value = map?.texture ?? null;
  uniforms.uShoreReady.value = map?.texture ? 1 : 0;
  if (map) uniforms.uShoreRange.value.copy(map.range);
}

// The holder the scene shares: created outside the canvas, filled by ShoreDepthMap.
export const createShoreDepth = () => ({ texture: null, range: new THREE.Vector4(SHORE_MAP.qMin, SHORE_MAP.qMax, -800, 800) });

// Renders the shore depth map once per coast definition into coast.shoreDepth.
export function ShoreDepthMap({ coast }) {
  const { gl } = useThree();
  const definition = coast?.definition;
  const holder = coast?.shoreDepth;
  const map = useMemo(() => {
    if (!definition || !holder) return null;
    const target = createTarget(SHORE_MAP.width, SHORE_MAP.height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const pass = createPass(shoreDepthFragment, { ...createCoastUniforms(), uShoreRange: { value: new THREE.Vector4() } });
    return { target, pass };
  }, [definition, holder]);
  useEffect(() => {
    if (!map) return undefined;
    const half = definition.terrainLength * 0.5;
    holder.range.set(SHORE_MAP.qMin, SHORE_MAP.qMax, -half, half);
    syncCoastUniforms(map.pass.material.uniforms, definition);
    map.pass.material.uniforms.uShoreRange.value.copy(holder.range);
    gl.setRenderTarget(map.target);
    gl.render(map.pass.scene, map.pass.camera);
    restoreDefaultFramebuffer(gl);
    holder.texture = map.target.texture;
    return () => {
      if (holder.texture === map.target.texture) holder.texture = null;
      map.target.dispose();
      disposePass(map.pass);
    };
  }, [definition, gl, holder, map]);
  return null;
}


