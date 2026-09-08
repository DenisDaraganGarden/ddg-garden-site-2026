import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets';
import { createGerstnerUniforms, gerstnerPixelShader, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { windVector } from './waterShading';
import { BREAK_SAMPLES, coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms } from './coastFrame';
import { surfPeelSpan } from './surfProfile';

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

export const FOAM_BORE_SLOTS = 7;
export const FOAM_BORE_LINE_WIDTH = BREAK_SAMPLES + 1;
const FOAM_RESOLUTION = 768;
const FORWARD = new THREE.Vector3();

// The bores the breaking waves deposit: q across the shore (metres from the
// waterline), strength, half width, and the run-up front on the sand (q of the
// water's edge, -100 when the wave has not landed). Owned by whoever draws both surfaces, so the ribbons
// write straight into the uniform the foam pass reads.
export const createFoamBores = () => {
  const bores = Array.from({ length: FOAM_BORE_SLOTS }, () => new THREE.Vector4(0, 0, 1, -100));
  bores.breakLines = Array.from({ length: FOAM_BORE_SLOTS }, () => new Float32Array(FOAM_BORE_LINE_WIDTH));
  bores.breakVisible = Array.from({ length: FOAM_BORE_SLOTS }, () => new Float32Array(FOAM_BORE_LINE_WIDTH));
  bores.breakMeans = new Float32Array(FOAM_BORE_SLOTS);
  bores.lineRevision = 0;
  return bores;
};

// What the terrain reads: the field's texture and window, filled every tick.
export const createFoamFieldHolder = () => ({ texture: null, window: new THREE.Vector3(0, 0, 1) });

// Density left after dt seconds, given the time it takes to fall to 1/e.
export const foamDecay = (life, dt) => Math.exp(-Math.max(dt, 0) / Math.max(Number(life) || 0, 0.05));

// A frozen surf view is an inspection of one collapsed wave. Its foam has to
// be reproducible too: a camera move may re-register the world-space field,
// but may not keep advancing a new tail behind an immobile lip.
export const foamFreezeKey = (settings = {}) => [
  // Carrier and foam-state inputs all change the source. A frozen inspection
  // must reseed when any one changes, rather than preserving a max-density
  // trace made by an earlier threshold, deposit, wind, or wave shape.
  settings.wavelength, settings.amplitude, settings.steepness, settings.speed,
  settings.windDirection, settings.windPatches, settings.sets, settings.gusts, settings.crossWaves,
  settings.fadeStart, settings.fadeEnd, settings.foamMemory, settings.foamThreshold,
  settings.foamSoftness, settings.foamDeposit, settings.foamLife,
  settings.foamDry, settings.foamDrift, settings.foamSwirl, settings.foamWindow,
  settings.surfPhase, settings.surfHeight, settings.surfWidth, settings.surfBreakDistance,
  settings.surfBreakLength, settings.surfBoreLength, settings.surfPeel,
  settings.surfRefraction, settings.surfRunup, settings.surfSpeed, settings.surfLift,
  settings.surfJet, settings.surfSheet, settings.surfRoller, settings.surfRollerDensity,
].map((value) => Number.isFinite(Number(value)) ? Number(value) : 0).join('|');

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
  uniform float uSwirl;
  uniform vec4 uBore[FOAM_BORES];
  // The crest the bores came from: s of its start, its peel, its length, and
  // the breaker's width. A bore is one number per wave, but the crest that drew
  // it is peeled along the shore and wanders, so the sample is moved into the
  // crest's frame before it is compared.
  uniform vec4 uBoreFrame;
  uniform float uBorePeelSpan; // local breaker event, independent of coast length
  uniform sampler2D uBoreLine; // R break q, G visibility, B ribbon mean; 49 x 7
  uniform float uBoreRefraction;
  uniform float uBoreRunup;   // how far up the beach the water is allowed to go
  vec3 boreLineAt(int slot, float along) {
    float x = clamp(along, 0.0, 1.0) * float(${BREAK_SAMPLES});
    float i0 = floor(x);
    float i1 = min(i0 + 1.0, float(${BREAK_SAMPLES}));
    float row = (float(slot) + 0.5) / float(FOAM_BORES);
    vec3 a = texture2D(uBoreLine, vec2((i0 + 0.5) / float(${FOAM_BORE_LINE_WIDTH}), row)).rgb;
    vec3 b = texture2D(uBoreLine, vec2((i1 + 0.5) / float(${FOAM_BORE_LINE_WIDTH}), row)).rgb;
    float t = x - i0;
    return mix(a, b, t * t * (3.0 - 2.0 * t));
  }
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
    // Crossing seas turn the foam: a divergence-free curl of the hashed noise,
    // strong only where the sea is steep — a storm swirls, a calm does not.
    float e = 1.5;
    float curlA = gerstnerNoise(world * 0.045 + uGerstnerTime * 0.01);
    float curlX = gerstnerNoise(vec2(world.x, world.y + e) * 0.045 + uGerstnerTime * 0.01) - gerstnerNoise(vec2(world.x, world.y - e) * 0.045 + uGerstnerTime * 0.01);
    float curlZ = gerstnerNoise(vec2(world.x + e, world.y) * 0.045 + uGerstnerTime * 0.01) - gerstnerNoise(vec2(world.x - e, world.y) * 0.045 + uGerstnerTime * 0.01);
    vec2 swirl = vec2(curlX, -curlZ) * uSwirl * (0.4 + 0.6 * curlA);
    vec2 velocity = orbital + uDrift + swirl;
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
    float qBoreBase = q + alongCrest * uBorePeelSpan * uBoreFrame.y - coastCrestWiggle(qs.y, uBoreFrame.w);
    // Off the ends of the crest there is no bore at all.
    float onCrest = step(uBoreFrame.x - 12.0, qs.y) * step(qs.y, uBoreFrame.x + crestLength + 12.0);
    state.x *= sand ? uSandDecay : uDecay;
    state.y = min(state.y + uAgeStep, 1.0);
    state.z = sand ? wetPrev * uDryDecay : 1.0;
    // The sheet drains from the top of the beach first: a second near the
    // waterline, a fifth of one six metres up.
    // The sheet means "a run-up tongue lies on the sand HERE, now". Over water
    // it is nothing: setting it to one there made the shore band lift a film of
    // water onto every grain of beach the coarse depth map had mistaken for
    // sea — which is what flooded the shore and the spit.
    state.w = sand ? state.w * exp(-uDelta / max(0.2, 1.1 - 0.9 * clamp(q / 6.0, 0.0, 1.0))) : 0.0;
    float fresh = sand ? 0.0 : gerstnerWhitecaps(world, uThreshold, uSoftness) * uDeposit;
    for (int i = 0; i < FOAM_BORES; i++) {
      vec4 bore = uBore[i];
      if (bore.y <= 0.0001) continue;
      vec3 line = boreLineAt(i, alongCrest);
      // The loft centre at this section is refraction*line +
      // (1-refraction)*mean. Move it back to the scalar mean frame where the
      // bore record lives; without this, the foam visibly peeled away from a
      // curved/isobath-following crest.
      float qBore = qBoreBase - uBoreRefraction * (line.x - line.z);
      float endTaper = smoothstep(0.0, 0.04, alongCrest) * (1.0 - smoothstep(0.96, 1.0, alongCrest));
      // A collapse leaves a broken, offshore trail, not a full-coast contour.
      // Its tear pattern lives in fixed coast coordinates, seeded only by the
      // slot index. Never include bore.x here: that current crest position
      // would carry the same material stamp along with every wave.
      vec2 traceP = vec2(qs.y * 0.071 + float(i) * 17.3, qBore * 0.163 + float(i) * 4.1);
      float macro = gerstnerNoise(traceP);
      float detail = gerstnerNoise(traceP * 2.37 + vec2(17.3, 4.1));
      // The trail is sustained in dense patches, with tears rather than empty
      // repeated bands. Age and advection then erode it naturally downstream.
      float trace = mix(0.42, 1.0, smoothstep(0.34, 0.68, macro * 0.68 + detail * 0.32));
      float ragged = bore.z * (0.52 + 0.96 * macro);
      float behind = max(bore.x - qBore, 0.0);
      float ahead = max(qBore - bore.x, 0.0);
      float tail = 1.0 - smoothstep(ragged * 0.15, ragged * 3.2, behind);
      float front = 1.0 - smoothstep(0.0, ragged * 0.32, ahead);
      float across = tail * front;
      fresh = max(fresh, onCrest * line.y * endTaper * bore.y * uDeposit * across * trace);
      // The run-up sheet: the sand up to the front is under water and wet, the
      // front leaves lace. It is a sheet on the beach, so it starts at the
      // waterline — without that bound every grain of the spit, which has no
      // surf of its own, was wet for ever.
      if (sand && onCrest * line.y * endTaper > 0.5 && bore.w > -50.0 && qBore < bore.w && qBore > -2.0 && q > -2.0 && q < uBoreRunup) {
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
      uSwirl: { value: 0 },
      ...createCoastWaterUniforms(),
      uBore: { value: createFoamBores() },
      uBoreFrame: { value: new THREE.Vector4(0, 0, 1, 9) },
      uBorePeelSpan: { value: 1 },
      uBoreLine: { value: null },
      uBoreRefraction: { value: 0 },
      uBoreRunup: { value: 6 },
    });
    const lineData = new Float32Array(FOAM_BORE_LINE_WIDTH * FOAM_BORE_SLOTS * 4);
    const lineTexture = new THREE.DataTexture(lineData, FOAM_BORE_LINE_WIDTH, FOAM_BORE_SLOTS, THREE.RGBAFormat, THREE.FloatType);
    lineTexture.minFilter = THREE.NearestFilter;
    lineTexture.magFilter = THREE.NearestFilter;
    lineTexture.wrapS = THREE.ClampToEdgeWrapping;
    lineTexture.wrapT = THREE.ClampToEdgeWrapping;
    lineTexture.needsUpdate = true;
    pass.material.uniforms.uBoreLine.value = lineTexture;
    return { read, write, pass, lineData, lineTexture, lineRevision: -1, lastTime: null, freezeKey: null, freezeTime: null };
  }, []);

  useEffect(() => () => {
    field.read.dispose();
    field.write.dispose();
    field.lineTexture.dispose();
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
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
    const frozen = Boolean(settings.surfFreeze);
    // The line can change without a slider change when the coast definition
    // or the height-derived isobath refreshes. It is part of a frozen source.
    const nextFreezeKey = frozen ? `${foamFreezeKey(settings)}|${bores?.lineRevision ?? 0}` : null;
    if (frozen && field.freezeKey !== nextFreezeKey) {
      // A phase change asks for another still frame, not a residue of the
      // previous stage. Clear both sides before seeding the new trace.
      gl.setRenderTarget(field.read);
      gl.clear(true, false, false);
      gl.setRenderTarget(field.write);
      gl.clear(true, false, false);
      restoreDefaultFramebuffer(gl);
      uniforms.uHasPrev.value = 0;
      field.freezeKey = nextFreezeKey;
      field.freezeTime = time;
      field.lastTime = time;
    } else if (!frozen && field.freezeKey !== null) {
      // A live carrier must not inherit the deliberately static inspection
      // trace. Restart from this frame's physical source and resume advection.
      gl.setRenderTarget(field.read);
      gl.clear(true, false, false);
      gl.setRenderTarget(field.write);
      gl.clear(true, false, false);
      restoreDefaultFramebuffer(gl);
      uniforms.uHasPrev.value = 0;
      field.freezeKey = null;
      field.freezeTime = null;
      field.lastTime = time;
    }
    // Demand frames while paused can update a slider or camera. Their wall
    // delta is not simulation time: foam must remain still with the waves.
    const elapsed = field.lastTime === null ? delta : time - field.lastTime;
    field.lastTime = time;
    const step = frozen ? 0 : Math.min(Math.max(elapsed, 0), 1 / 20);
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
    uniforms.uGerstnerTime.value = frozen ? field.freezeTime : time;
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
    uniforms.uSwirl.value = Number(settings.foamSwirl) || 0;
    uniforms.uDrift.value.fromArray(windVector(settings.windDirection)).multiplyScalar(Number(settings.foamDrift) || 0);
    syncCoastWaterUniforms(uniforms, coast, coast?.breakQ ?? -10, 0);
    if (bores) uniforms.uBore.value = bores;
    else uniforms.uBore.value.forEach((bore) => bore.set(0, 0, 1, -100));
    // Inspection removes peel from the loft; its wet trail must use the same
    // transform. A full-coast skew made foam slide away from the new local lip.
    uniforms.uBoreFrame.value.set(coast?.along0 ?? 0, settings.surfFreeze ? 0 : (settings.surfPeel ?? 0), coast?.length ?? 1, settings.surfWidth ?? 9);
    uniforms.uBorePeelSpan.value = surfPeelSpan(settings);
    uniforms.uBoreRefraction.value = THREE.MathUtils.clamp(Number(settings.surfRefraction) || 0, 0, 1);
    if (bores && field.lineRevision !== bores.lineRevision) {
      for (let row = 0; row < FOAM_BORE_SLOTS; row += 1) {
        const line = bores.breakLines?.[row];
        const visible = bores.breakVisible?.[row];
        const mean = bores.breakMeans?.[row] ?? 0;
        for (let column = 0; column < FOAM_BORE_LINE_WIDTH; column += 1) {
          const index = (row * FOAM_BORE_LINE_WIDTH + column) * 4;
          field.lineData[index] = line?.[column] ?? 0;
          field.lineData[index + 1] = visible?.[column] ?? 0;
          field.lineData[index + 2] = mean;
          field.lineData[index + 3] = 1;
        }
      }
      field.lineTexture.needsUpdate = true;
      field.lineRevision = bores.lineRevision;
    }
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
