import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createCoastWaterUniforms, syncCoastWaterUniforms, coastWaterShader } from './coastFrame.js';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets.js';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves.js';

// A bounded data pass for caustics. It deliberately remains separate from the
// cursor-ripple target: the latter is the authoritative local simulation,
// while this one supplies the missing Gerstner carrier to bed receivers.
export const SEA_CAUSTIC_NORMAL_RESOLUTION = 256;
export const SEA_CAUSTIC_INVERSE_STEPS = 5;

export const createSeaCausticNormalsHolder = () => ({
  texture: null,
  extent: 1,
  resolution: 1,
  active: false,
});

const causticGerstnerShader = gerstnerShader.replaceAll('cameraPosition.xz', 'uSeaCausticCamera.xz');

const fragmentShader = /* glsl */`
  uniform vec3 uSeaCausticCamera;
  ${coastWaterShader}
  ${causticGerstnerShader}
  varying vec2 vUv;
  uniform vec2 uSeaCausticCenter;
  uniform float uSeaCausticExtent;
  uniform float uSeaCausticActive;
  uniform sampler2D uSeaCausticRippleState;
  uniform sampler2D uSeaCausticRippleNormal;
  uniform float uSeaCausticRippleActive;
  uniform float uSeaCausticRippleAmplitude;
  uniform float uSeaCausticRippleStrength;

  float seaCausticMapWeight(vec2 p) {
    vec2 uv = vec2(p.x / uSeaCausticExtent + 0.5, 0.5 - p.y / uSeaCausticExtent);
    vec2 lo = smoothstep(vec2(0.035), vec2(0.07), uv);
    vec2 hi = 1.0 - smoothstep(vec2(0.93), vec2(0.965), uv);
    return lo.x * lo.y * hi.x * hi.y;
  }

  float seaCausticFade(vec2 p) {
    return (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, distance(p, uSeaCausticCamera.xz))) * coastSwellFade(coastLocal(p));
  }

  void seaCausticSurface(vec2 visible, out vec3 normal, out float height) {
    vec2 p = visible;
    // The map is addressed in visible world XZ. Inverting the horizontal
    // Gerstner drift keeps its phase aligned with the rendered surface instead
    // of treating a displaced crest as if it stayed at its rest coordinate.
    for (int i = 0; i < ${SEA_CAUSTIC_INVERSE_STEPS}; i++) {
      vec3 scratchNormal; float scratchJacobian; vec2 scratchDrift;
      vec3 displaced = gerstnerDisplace(p, seaCausticFade(p), waterCell(p), scratchNormal, scratchJacobian, scratchDrift);
      p += visible - displaced.xz;
    }
    // The last evaluation supplies both normal and vertical displacement. Do
    // not run a seventh train sum just to read height after the normal.
    float jacobian; vec2 drift;
    vec3 displaced = gerstnerDisplace(p, seaCausticFade(p), waterCell(p), normal, jacobian, drift);
    height = displaced.y;
  }

  float seaCausticRippleHeight(vec2 p) {
    if (uSeaCausticRippleActive < 0.5) return 0.0;
    vec2 uv = vec2(p.x / uSeaCausticExtent + 0.5, 0.5 - p.y / uSeaCausticExtent);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
    float raw = texture2D(uSeaCausticRippleState, uv).r;
    float smoothHeight = texture2D(uSeaCausticRippleNormal, uv).a * 2.0 - 1.0;
    return mix(raw, smoothHeight, 0.84) * uSeaCausticRippleAmplitude * seaCausticMapWeight(p) * coastPondWeight(coastLocal(p));
  }

  vec3 seaCausticRippleNormal(vec3 n, vec2 visible) {
    if (uSeaCausticRippleActive < 0.5) return n;
    vec2 uv = vec2(visible.x / uSeaCausticExtent + 0.5, 0.5 - visible.y / uSeaCausticExtent);
    float inBounds = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    vec3 encoded = texture2D(uSeaCausticRippleNormal, clamp(uv, vec2(0.0), vec2(1.0))).rgb * 2.0 - 1.0;
    // This is the retained runtime section of waterRippleNormal: project the
    // world-XZ slope onto the Gerstner tangent plane, so cursor wakes ride a
    // carrier crest instead of flattening it.
    float wet = uCoastShape.x > 0.5 ? smoothstep(0.4, 0.8, -coastGround(coastLocal(visible))) : 1.0;
    vec3 slope = vec3(encoded.x, 0.0, encoded.z) * (0.16 * uSeaCausticRippleStrength * inBounds * seaCausticMapWeight(visible) * wet);
    slope -= n * dot(n, slope);
    return normalize(n + slope);
  }

  void main() {
    vec2 visible = uSeaCausticCenter + vec2(vUv.x - 0.5, 0.5 - vUv.y) * uSeaCausticExtent;
    if (uSeaCausticActive < 0.5) { gl_FragColor = vec4(0.5, 1.0, 0.5, 0.5); return; }
    vec3 n; float surfaceHeight;
    seaCausticSurface(visible, n, surfaceHeight);
    n = seaCausticRippleNormal(n, visible);
    float height = clamp(surfaceHeight + seaCausticRippleHeight(visible), -1.0, 1.0);
    gl_FragColor = vec4(n * 0.5 + 0.5, height * 0.5 + 0.5);
  }
`;

// Mount once inside SeaWaterActive and hand the holder to all caustic receivers.
// The target is fixed in the retained interaction square so it preserves the old
// caustic coverage while replacing its water normal with the active sea.
export function SeaCausticNormals({ holder, settings, sceneSettings, coast = null, runtime }) {
  const { gl } = useThree();
  const target = useMemo(() => createTarget(SEA_CAUSTIC_NORMAL_RESOLUTION, SEA_CAUSTIC_NORMAL_RESOLUTION, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  }), []);
  const pass = useMemo(() => createPass(fragmentShader, {
    ...createCoastWaterUniforms(),
    ...createGerstnerUniforms(),
    uSeaCausticCamera: { value: new THREE.Vector3() },
    uSeaCausticCenter: { value: new THREE.Vector2(0, 0) },
    uSeaCausticExtent: { value: 24 },
    uSeaCausticActive: { value: 0 },
    uSeaCausticRippleState: { value: null },
    uSeaCausticRippleNormal: { value: null },
    uSeaCausticRippleActive: { value: 0 },
    uSeaCausticRippleAmplitude: { value: 0 },
    uSeaCausticRippleStrength: { value: 0 },
  }), []);

  useEffect(() => {
    holder.texture = target.texture;
    holder.extent = Math.max(Number(sceneSettings?.waterExtent) || 24, 0.001);
    holder.resolution = SEA_CAUSTIC_NORMAL_RESOLUTION;
    holder.active = false;
    return () => {
      if (holder.texture === target.texture) {
        holder.texture = null;
        holder.active = false;
      }
    };
  }, [holder, sceneSettings?.waterExtent, target]);
  useEffect(() => () => {
    target.dispose();
    disposePass(pass);
  }, [pass, target]);

  useFrame(({ camera, clock }) => {
    const uniforms = pass.material.uniforms;
    const extent = Math.max(Number(sceneSettings?.waterExtent) || 24, 0.001);
    syncCoastWaterUniforms(uniforms, coast, coast?.breakQ ?? 0, coast?.swellFadeWidth ?? 0);
    syncGerstnerUniforms(uniforms, settings);
    uniforms.uGerstnerTime.value = clock.elapsedTime;
    uniforms.uSeaCausticCamera.value.copy(camera.position);
    uniforms.uSeaCausticExtent.value = extent;
    const rippleNormal = runtime?.normalTargetRef?.current?.texture ?? null;
    const rippleState = runtime?.currentStateTargetRef?.current?.texture ?? null;
    uniforms.uSeaCausticRippleState.value = rippleState;
    uniforms.uSeaCausticRippleNormal.value = rippleNormal;
    uniforms.uSeaCausticRippleActive.value = rippleNormal && rippleState ? 1 : 0;
    uniforms.uSeaCausticRippleAmplitude.value = Math.max(Number(sceneSettings?.waveAmplitude) || 0, 0);
    uniforms.uSeaCausticRippleStrength.value = THREE.MathUtils.clamp(Number(sceneSettings?.normalStrength) || 0, 0, 3);
    uniforms.uSeaCausticActive.value = settings.enabled === false ? 0 : 1;

    gl.setRenderTarget(target);
    gl.render(pass.scene, pass.camera);
    restoreDefaultFramebuffer(gl);
    holder.texture = target.texture;
    holder.extent = extent;
    holder.resolution = SEA_CAUSTIC_NORMAL_RESOLUTION;
    holder.active = uniforms.uSeaCausticActive.value > 0.5;
  }, -9);

  return null;
}
