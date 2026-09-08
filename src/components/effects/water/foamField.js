import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { windVector } from './waterShading';
import { coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms } from './coastFrame';

// Foam as a state with memory instead of a function of the wave's phase. A
// field in a window that follows the camera: R is density, G is age, B is how
// wet the sand is, A is the run-up sheet itself — the field is also the swash,
// the beach's memory of the water: a bore's run-up sheet wets the sand and
// leaves lace at its edge, the sheet drains from the top of the beach down;
// on the sand foam is sucked in within seconds and what is left slides back
// down the slope, and the sand dries over a minute. Every tick
// the water carries the field with it (the wave's own horizontal motion plus a
// wind drift), the density decays with a lifetime, and new foam comes from the
// folding crests (the Gerstner Jacobian) and from the broken face of every live
// breaker. Outside the window the surface falls back to the analytic whitecap,
// which is all a horizon needs.

export const FOAM_BORE_SLOTS = 4;
const FOAM_RESOLUTION = 768;
const FORWARD = new THREE.Vector3();

// The bores the breaking waves deposit: q across the shore (metres from the
// waterline), strength, half width, and the run-up front on the sand (q of the
// water's edge, -100 when the wave has not landed). Owned by whoever draws both surfaces, so the ribbons
// write straight into the uniform the foam pass reads.
export const createFoamBores = () => Array.from({ length: FOAM_BORE_SLOTS }, () => new THREE.Vector4(0, 0, 1, -100));

// What the terrain reads: the field's texture and window, filled every tick.
export const createFoamFieldHolder = () => ({ texture: null, window: new THREE.Vector3(0, 0, 1) });

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
  // Fades over the window's rim; plain clamps, since smoothstep with reversed edges is undefined in GLSL.
  float weight = clamp(min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) / 0.06, 0.0, 1.0);
  if (weight <= 0.0) return vec3(0.0);
  return vec3(texture2D(uFoamField, uv).rg, weight);
}
`;

const updateFragmentShader = /* glsl */`
  #define FOAM_BORES ${FOAM_BORE_SLOTS}
  ${gerstnerShader}
  ${gerstnerPixelShader}
  ${coastWaterShader}
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec3 uWindow;      // centre.xz, half size
  uniform vec3 uPrevWindow;
  uniform float uHasPrev;
  uniform float uDelta;
  uniform float uDecay;
  uniform float uSandDecay;
  uniform float uDryDecay;
  uniform float uAgeStep;
  uniform float uCell;
  uniform vec2 uDrift;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uDeposit;
  uniform vec4 uBore[FOAM_BORES];
  // The crest the bores came from: s of its start, its peel, its length, and
  // the breaker's width. A bore is one number per wave, but the crest that drew
  // it is peeled along the shore and wanders, so the sample is moved into the
  // crest's frame before it is compared.
  uniform vec4 uBoreFrame;
  uniform float uBoreRunup;   // how far up the beach the water is allowed to go
  void main() {
    vec2 world = uWindow.xy + (vUv - 0.5) * 2.0 * uWindow.z;
    vec3 waveNormal;
    float jacobian;
    vec2 orbital;
    // ponytail: the wave is sampled at the texel's own position, not at the
    // undisplaced point that lands there, so foam sits a fraction of a
    // wavelength off the exact crest. Invert the displacement if it ever shows.
    gerstnerDisplace(world, 1.0, uCell, waveNormal, jacobian, orbital);
    // On the sand the foam is carried back down the slope by the backwash.
    vec2 qs = coastLocal(world);
    float ground = coastGround(qs);
    bool sand = ground > -0.01;
    vec2 velocity = orbital + uDrift;
    if (sand) {
      vec2 slope = vec2(coastGround(qs + vec2(0.5, 0.0)) - coastGround(qs - vec2(0.5, 0.0)), coastGround(qs + vec2(0.0, 0.5)) - coastGround(qs - vec2(0.0, 0.5)));
      vec2 down = -(slope.x * coastLand() + slope.y * coastAlong()) * 30.0;
      float speed = length(down);
      velocity = speed > 1.5 ? down * (1.5 / speed) : down;
    }
    // Advection: read the field where this water was a tick ago. The same
    // fetch re-registers the window when the camera moves.
    vec2 from = world - velocity * uDelta;
    vec2 prevUv = (from - uPrevWindow.xy) / (2.0 * uPrevWindow.z) + 0.5;
    vec4 state = vec4(0.0);
    if (uHasPrev > 0.5 && all(greaterThan(prevUv, vec2(0.0))) && all(lessThan(prevUv, vec2(1.0)))) {
      state = texture2D(uPrev, prevUv);
    }
    // The sand's memory does not travel. Foam on top of it is carried down the
    // slope by the backwash, but the dark of a wetted beach stays where the
    // water was: read that channel at this texel's own place.
    vec2 stillUv = (world - uPrevWindow.xy) / (2.0 * uPrevWindow.z) + 0.5;
    float wetPrev = uHasPrev > 0.5 && all(greaterThan(stillUv, vec2(0.0))) && all(lessThan(stillUv, vec2(1.0))) ? texture2D(uPrev, stillUv).b : 0.0;
    float q = qs.x;
    // Into the crest's frame: the peel skews the front along the shore and the
    // same wander scallops it, so the wet line is the line the wave drew.
    float crestLength = max(uBoreFrame.z, 1.0);
    float alongCrest = clamp((qs.y - uBoreFrame.x) / crestLength, 0.0, 1.0);
    float qBore = q + alongCrest * crestLength * uBoreFrame.y - coastCrestWiggle(qs.y, uBoreFrame.w);
    // Off the ends of the crest there is no bore at all.
    float onCrest = step(uBoreFrame.x - 12.0, qs.y) * step(qs.y, uBoreFrame.x + crestLength + 12.0);
    state.x *= sand ? uSandDecay : uDecay;
    state.y = min(state.y + uAgeStep, 1.0);
    state.z = sand ? wetPrev * uDryDecay : 1.0;
    // The sheet drains from the top of the beach first: a second near the
    // waterline, a fifth of one six metres up.
    state.w = sand ? state.w * exp(-uDelta / max(0.2, 1.1 - 0.9 * clamp(q / 6.0, 0.0, 1.0))) : 1.0;
    float fresh = sand ? 0.0 : gerstnerWhitecaps(world, uThreshold, uSoftness) * uDeposit;
    for (int i = 0; i < FOAM_BORES; i++) {
      vec4 bore = uBore[i];
      fresh = max(fresh, onCrest * bore.y * uDeposit * (1.0 - smoothstep(bore.z * 0.3, bore.z, abs(qBore - bore.x))));
      // The run-up sheet: the sand up to the front is under water and wet, the
      // front leaves lace. It is a sheet on the beach, so it starts at the
      // waterline — without that bound every grain of the spit, which has no
      // surf of its own, was wet for ever.
      if (sand && onCrest > 0.5 && bore.w > -50.0 && qBore < bore.w && qBore > -2.0 && q < uBoreRunup) {
        state.z = 1.0;
        // The tongue is thin at its edge and thickens behind it: a slab of one
        // constant thickness with a vertical wall is not a run-up.
        state.w = max(state.w, clamp((bore.w - qBore) * 0.5, 0.0, 1.0));
        fresh = max(fresh, bore.y * 0.8 * (1.0 - smoothstep(0.1, 0.7, bore.w - qBore)));
      }
    }
    // Fresh foam wins and is young again; what it does not cover keeps its age.
    state.y = mix(state.y, 0.0, step(state.x, fresh));
    state.x = min(max(state.x, fresh), 1.0);
    gl_FragColor = state;
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
// timeline: the scene's paused-aware clock; without one the renderer's clock is used.
export function useFoamField(targetUniforms, { settings, bores, coast = null, timeline = null }) {
  const { gl } = useThree();
  const field = useMemo(() => {
    const options = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
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
      uSandDecay: { value: 1 },
      uDryDecay: { value: 1 },
      uAgeStep: { value: 0 },
      uCell: { value: 0.1 },
      uDrift: { value: new THREE.Vector2() },
      uThreshold: { value: 0.5 },
      uSoftness: { value: 0.15 },
      uDeposit: { value: 1 },
      ...createCoastWaterUniforms(),
      uBore: { value: createFoamBores() },
      uBoreFrame: { value: new THREE.Vector4(0, 0, 1, 9) },
      uBoreRunup: { value: 6 },
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
      if (coast?.foamField) coast.foamField.texture = null;
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
    uniforms.uGerstnerTime.value = timeline ? timeline.elapsed : clock.elapsedTime;
    uniforms.uPrev.value = field.read.texture;
    uniforms.uDelta.value = step;
    uniforms.uDecay.value = foamDecay(settings.foamLife, step);
    uniforms.uSandDecay.value = foamDecay(2, step);
    uniforms.uDryDecay.value = foamDecay(settings.foamDry ?? 40, step);
    uniforms.uAgeStep.value = step / Math.max(Number(settings.foamLife) || 0, 0.05);
    uniforms.uCell.value = (2 * half) / FOAM_RESOLUTION;
    uniforms.uThreshold.value = settings.foamThreshold;
    uniforms.uSoftness.value = settings.foamSoftness;
    uniforms.uDeposit.value = settings.foamDeposit;
    uniforms.uDrift.value.fromArray(windVector(settings.windDirection)).multiplyScalar(Number(settings.foamDrift) || 0);
    syncCoastWaterUniforms(uniforms, coast, coast?.breakQ ?? -10, 0);
    if (bores) uniforms.uBore.value = bores;
    else uniforms.uBore.value.forEach((bore) => bore.set(0, 0, 1, -100));
    uniforms.uBoreFrame.value.set(coast?.along0 ?? 0, settings.surfPeel ?? 0, coast?.length ?? 1, settings.surfWidth ?? 9);
    uniforms.uBoreRunup.value = settings.surfRunup ?? 6;

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
    if (coast?.foamField) { coast.foamField.texture = field.read.texture; coast.foamField.window.copy(uniforms.uWindow.value); }
  }, -20);
}
