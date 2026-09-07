import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { windVector } from './waterShading';

// Foam as a state with memory instead of a function of the wave's phase. An RG
// field in a window that follows the camera: R is density, G is age. Every tick
// the water carries the field with it (the wave's own horizontal motion plus a
// wind drift), the density decays with a lifetime, and new foam comes from the
// folding crests (the Gerstner Jacobian) and from the broken face of every live
// breaker. Outside the window the surface falls back to the analytic whitecap,
// which is all a horizon needs.

export const FOAM_BORE_SLOTS = 4;
const FOAM_RESOLUTION = 512;
const FORWARD = new THREE.Vector3();

// The bores the breaking waves deposit: distance along the shore normal,
// strength, half width. Owned by whoever draws both surfaces, so the ribbons
// write straight into the uniform the foam pass reads.
export const createFoamBores = () => Array.from({ length: FOAM_BORE_SLOTS }, () => new THREE.Vector4());

// Density left after dt seconds, given the time it takes to fall to 1/e.
export const foamDecay = (life, dt) => Math.exp(-Math.max(dt, 0) / Math.max(Number(life) || 0, 0.05));

// The window centre, snapped to the texel grid: a camera creeping forward by
// less than a texel must not move the field, or every frame resamples it and
// the foam blurs into soup.
export function foamWindowCenter(target, cameraX, cameraZ, halfSize, resolution = FOAM_RESOLUTION) {
  const texel = (2 * halfSize) / resolution;
  return target.set(Math.round(cameraX / texel) * texel, Math.round(cameraZ / texel) * texel, halfSize);
}

// Sampled by the water surfaces: density, age, and how much this point belongs
// to the window (0 at its edge, where the analytic whitecap takes over).
export const foamFieldShader = /* glsl */`
uniform sampler2D uFoamField;
uniform vec3 uFoamWindow;
uniform float uFoamMemory;
vec3 sampleFoamField(vec2 p) {
  if (uFoamMemory < 0.5) return vec3(0.0);
  vec2 uv = (p - uFoamWindow.xy) / (2.0 * uFoamWindow.z) + 0.5;
  vec2 edge = smoothstep(0.0, 0.06, uv) * smoothstep(1.0, 0.94, uv);
  float weight = min(edge.x, edge.y);
  if (weight <= 0.0) return vec3(0.0);
  return vec3(texture2D(uFoamField, uv).rg, weight);
}
`;

const updateFragmentShader = /* glsl */`
  #define FOAM_BORES ${FOAM_BORE_SLOTS}
  ${gerstnerShader}
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec3 uWindow;      // centre.xz, half size
  uniform vec3 uPrevWindow;
  uniform float uHasPrev;
  uniform float uDelta;
  uniform float uDecay;
  uniform float uAgeStep;
  uniform float uCell;
  uniform vec2 uDrift;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uDeposit;
  uniform vec4 uShore;       // origin.xz, shore direction.xz
  uniform vec4 uBore[FOAM_BORES];
  void main() {
    vec2 world = uWindow.xy + (vUv - 0.5) * 2.0 * uWindow.z;
    vec3 waveNormal;
    float jacobian;
    vec2 orbital;
    // ponytail: the wave is sampled at the texel's own position, not at the
    // undisplaced point that lands there, so foam sits a fraction of a
    // wavelength off the exact crest. Invert the displacement if it ever shows.
    gerstnerDisplace(world, 1.0, uCell, waveNormal, jacobian, orbital);
    // Advection: read the field where this water was a tick ago. The same
    // fetch re-registers the window when the camera moves.
    vec2 from = world - (orbital + uDrift) * uDelta;
    vec2 prevUv = (from - uPrevWindow.xy) / (2.0 * uPrevWindow.z) + 0.5;
    vec2 state = vec2(0.0);
    if (uHasPrev > 0.5 && all(greaterThan(prevUv, vec2(0.0))) && all(lessThan(prevUv, vec2(1.0)))) {
      state = texture2D(uPrev, prevUv).rg;
    }
    state.x *= uDecay;
    state.y = min(state.y + uAgeStep, 1.0);
    float fresh = smoothstep(uThreshold + uSoftness, uThreshold - uSoftness, jacobian) * uDeposit;
    float along = dot(world - uShore.xy, uShore.zw);
    for (int i = 0; i < FOAM_BORES; i++) {
      vec4 bore = uBore[i];
      fresh = max(fresh, bore.y * uDeposit * (1.0 - smoothstep(bore.z * 0.3, bore.z, abs(along - bore.x))));
    }
    // Fresh foam wins and is young again; what it does not cover keeps its age.
    state.y = mix(state.y, 0.0, step(state.x, fresh));
    state.x = min(max(state.x, fresh), 1.0);
    gl_FragColor = vec4(state, 0.0, 1.0);
  }
`;

export function createFoamFieldUniforms() {
  return {
    uFoamField: { value: null },
    uFoamWindow: { value: new THREE.Vector3(0, 0, 1) },
    uFoamMemory: { value: 0 },
  };
}

// Advances the field and points `targetUniforms` (a water surface's) at it.
// `bores` is the array the breaking waves write into, or null.
export function useFoamField(targetUniforms, { settings, bores, shore }) {
  const { gl } = useThree();
  const field = useMemo(() => {
    const options = { type: THREE.HalfFloatType, format: THREE.RGFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const read = createTarget(FOAM_RESOLUTION, FOAM_RESOLUTION, options);
    const write = createTarget(FOAM_RESOLUTION, FOAM_RESOLUTION, options);
    const pass = createPass(updateFragmentShader, {
      ...createGerstnerUniforms(),
      uPrev: { value: read.texture },
      uWindow: { value: new THREE.Vector3(0, 0, 30) },
      uPrevWindow: { value: new THREE.Vector3(0, 0, 30) },
      uHasPrev: { value: 0 },
      uDelta: { value: 1 / 60 },
      uDecay: { value: 1 },
      uAgeStep: { value: 0 },
      uCell: { value: 0.1 },
      uDrift: { value: new THREE.Vector2() },
      uThreshold: { value: 0.5 },
      uSoftness: { value: 0.15 },
      uDeposit: { value: 1 },
      uShore: { value: new THREE.Vector4(0, 0, 0, 1) },
      uBore: { value: createFoamBores() },
    });
    return { read, write, pass };
  }, []);

  useEffect(() => () => {
    field.read.dispose();
    field.write.dispose();
    disposePass(field.pass);
  }, [field]);

  useEffect(() => {
    gl.setRenderTarget(field.read);
    gl.clear(true, false, false);
    gl.setRenderTarget(field.write);
    gl.clear(true, false, false);
    restoreDefaultFramebuffer(gl);
    field.pass.material.uniforms.uHasPrev.value = 0;
  }, [field, gl]);

  useFrame(({ camera, clock }, delta) => {
    const uniforms = field.pass.material.uniforms;
    if (!settings.foamMemory) {
      targetUniforms.uFoamMemory.value = 0;
      uniforms.uHasPrev.value = 0;
      return;
    }
    const step = Math.min(Math.max(delta, 1 / 240), 1 / 20);
    const half = Math.max(Number(settings.foamWindow) || 1, 4) * 0.5;
    // Most of the window belongs in front of the camera: what is behind the
    // eye costs the same and is never seen.
    camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    const reach = FORWARD.lengthSq() > 1e-6 ? half * 0.6 : 0;
    FORWARD.normalize();
    uniforms.uPrevWindow.value.copy(uniforms.uWindow.value);
    foamWindowCenter(uniforms.uWindow.value, camera.position.x + FORWARD.x * reach, camera.position.z + FORWARD.z * reach, half);
    syncGerstnerUniforms(uniforms, settings);
    uniforms.uGerstnerTime.value = clock.elapsedTime;
    uniforms.uPrev.value = field.read.texture;
    uniforms.uDelta.value = step;
    uniforms.uDecay.value = foamDecay(settings.foamLife, step);
    uniforms.uAgeStep.value = step / Math.max(Number(settings.foamLife) || 0, 0.05);
    uniforms.uCell.value = (2 * half) / FOAM_RESOLUTION;
    uniforms.uThreshold.value = settings.foamThreshold;
    uniforms.uSoftness.value = settings.foamSoftness;
    uniforms.uDeposit.value = settings.foamDeposit;
    uniforms.uDrift.value.fromArray(windVector(settings.windDirection)).multiplyScalar(Number(settings.foamDrift) || 0);
    if (shore) uniforms.uShore.value.set(shore.origin[0], shore.origin[1], shore.shoreDir[0], shore.shoreDir[1]);
    if (bores) uniforms.uBore.value = bores;
    else uniforms.uBore.value.forEach((bore) => bore.set(0, 0, 1, 0));

    gl.setRenderTarget(field.write);
    gl.render(field.pass.scene, field.pass.camera);
    restoreDefaultFramebuffer(gl);
    const previous = field.read;
    field.read = field.write;
    field.write = previous;
    uniforms.uHasPrev.value = 1;

    targetUniforms.uFoamField.value = field.read.texture;
    targetUniforms.uFoamWindow.value.copy(uniforms.uWindow.value);
    targetUniforms.uFoamMemory.value = 1;
  }, -20);
}
