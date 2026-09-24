import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useEnvironment } from '@react-three/drei';
import { reflectionContext } from './reflectionContext';
import { createPass, createTarget, disposePass, restoreDefaultFramebuffer } from './renderTargets.js';

// The photographed environment of the HDRI modes. It lights the objects (as
// drei's <Environment> did), stands behind the scene when it is the backdrop,
// and in «Только HDRI» is the sky every water surface reflects
// (waterSceneBindings reads it from the reflection context).
//
// «Тон отражений» reaches it the way it reaches the painted sky: baked into a
// copy that the light and the sea read, never into the backdrop in view. At
// the neutral tone nothing is copied: the light is the file itself, exactly
// the path the scene has always had.

// The mean of the source block under each output texel. One tap makes the
// full-size tinted copy; 32 x 32 make the small one the water's irradiance
// pass integrates, where a half-degree sun would otherwise flicker in and out
// between its 96 x 48 samples as the panorama turns.
const BAKE_SHADER = /* glsl */`
  uniform sampler2D uSource;
  uniform vec2 uSourceSize;
  uniform float uTaps;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec2 block = floor(vUv * uSourceSize / uTaps) * uTaps;
    vec3 sum = vec3(0.0);
    for (int y = 0; y < 32; y++) {
      if (float(y) >= uTaps) break;
      for (int x = 0; x < 32; x++) {
        if (float(x) >= uTaps) break;
        sum += texture2D(uSource, (block + vec2(float(x), float(y)) + 0.5) / uSourceSize).rgb;
      }
    }
    gl_FragColor = vec4(sum / (uTaps * uTaps) * uTint, 1.0);
  }
`;
const SMALL_TAPS = 32;
// Same quiet window as the painted sky's table (skyEnvironment.js).
const TINT_SETTLE_MS = 140;

const panoramaTarget = (width, height, wrap) => {
  const target = createTarget(width, height, { type: THREE.HalfFloatType });
  target.texture.mapping = THREE.EquirectangularReflectionMapping;
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.wrapS = wrap;
  return target;
};

export default function PanoramaEnvironment({ url, level, backdrop, backdropLevel, rotation, tint, sea }) {
  const { gl, scene, invalidate } = useThree();
  const reflectionDataRef = useContext(reflectionContext);
  const source = useEnvironment({ files: url });
  useEffect(() => () => source.dispose(), [source]);

  const tintKey = tint.join(':');
  const [bakedTint, setBakedTint] = useState(tintKey);
  useEffect(() => {
    if (bakedTint === tintKey) return undefined;
    const timer = window.setTimeout(() => setBakedTint(tintKey), TINT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [bakedTint, tintKey]);

  const pass = useMemo(() => createPass(BAKE_SHADER, {
    uSource: { value: null },
    uSourceSize: { value: new THREE.Vector2(1, 1) },
    uTaps: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  }), []);
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const owned = useRef({ copy: null, light: null, small: null });
  useEffect(() => () => {
    disposePass(pass);
    pmrem.dispose();
    Object.values(owned.current).forEach((target) => target?.dispose());
  }, [pass, pmrem]);

  // What the light and the sea read: the file itself at the neutral tone, a
  // tinted copy (and its PMREM) otherwise; plus the small copy for the sea.
  const [baked, setBaked] = useState(null);
  useLayoutEffect(() => {
    const own = owned.current;
    const { width, height } = source.image;
    const tintValue = bakedTint.split(':').map(Number);
    const neutral = tintValue.every((value) => value === 1);
    const uniforms = pass.material.uniforms;
    const previous = gl.getRenderTarget();
    const bake = (target, taps) => {
      uniforms.uSource.value = source;
      uniforms.uSourceSize.value.set(width, height);
      uniforms.uTaps.value = taps;
      uniforms.uTint.value.fromArray(tintValue);
      gl.setRenderTarget(target);
      gl.render(pass.scene, pass.camera);
    };
    if (!neutral) {
      if (own.copy?.width !== width || own.copy?.height !== height) {
        // The PMREM's size follows the source's, so it is rebuilt with it.
        own.copy?.dispose();
        own.light?.dispose();
        own.light = null;
        own.copy = panoramaTarget(width, height, THREE.ClampToEdgeWrapping);
      }
      bake(own.copy, 1);
      own.light = pmrem.fromEquirectangular(own.copy.texture, own.light);
    } else {
      // Back at the neutral tone the file is the light again; the copy and its
      // PMREM would only hold memory (both are swapped out before any frame).
      own.copy?.dispose();
      own.light?.dispose();
      own.copy = null;
      own.light = null;
    }
    if (sea) {
      const [smallWidth, smallHeight] = [Math.max(1, width / SMALL_TAPS), Math.max(1, height / SMALL_TAPS)];
      if (own.small?.width !== smallWidth || own.small?.height !== smallHeight) {
        own.small?.dispose();
        own.small = panoramaTarget(smallWidth, smallHeight, THREE.RepeatWrapping);
      }
      bake(own.small, SMALL_TAPS);
    }
    if (previous) gl.setRenderTarget(previous);
    else restoreDefaultFramebuffer(gl);
    setBaked({
      environment: neutral ? source : own.light.texture,
      sky: neutral ? source : own.copy.texture,
      small: sea ? own.small.texture : null,
    });
  }, [bakedTint, gl, pass, pmrem, sea, source]);

  // drei's setEnvProps, with the backdrop and the light free to differ.
  useLayoutEffect(() => {
    if (!baked) return undefined;
    const previous = {
      environment: scene.environment,
      environmentIntensity: scene.environmentIntensity,
      environmentRotation: scene.environmentRotation.clone(),
      background: scene.background,
      backgroundIntensity: scene.backgroundIntensity,
      backgroundRotation: scene.backgroundRotation.clone(),
    };
    scene.environment = baked.environment;
    scene.environmentIntensity = level;
    scene.environmentRotation.set(0, rotation, 0);
    if (backdrop) {
      scene.background = source;
      scene.backgroundIntensity = backdropLevel;
      scene.backgroundRotation.set(0, rotation, 0);
    }
    const data = reflectionDataRef.current;
    data.skyPanorama = sea ? baked : null;
    // A paused editor draws on demand, and a settled tone arrives after the
    // settings change already had its frames: ask for two (the water reads
    // the reflection capture a frame late).
    invalidate(2);
    return () => {
      scene.environment = previous.environment;
      scene.environmentIntensity = previous.environmentIntensity;
      scene.environmentRotation.copy(previous.environmentRotation);
      scene.background = previous.background;
      scene.backgroundIntensity = previous.backgroundIntensity;
      scene.backgroundRotation.copy(previous.backgroundRotation);
      data.skyPanorama = null;
    };
  }, [backdrop, backdropLevel, baked, invalidate, level, reflectionDataRef, rotation, scene, sea, source]);

  return null;
}
