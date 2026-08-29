import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { buildSkyLut } from '../sky/skyModel.js';

// The bridge between the sky model and three: one equirectangular texture, and
// one pre-filtered environment map built from that same texture.
//
// Because the image-based light IS a blur of the sky the viewer sees, they
// cannot disagree. That was the previous system's structural problem: an HDR
// file supplied the reflections while four hand-picked hex colours stood in for
// the same sky inside the custom shaders, and keeping the two in agreement was
// somebody's manual job forever.
//
// For a published scene at a fixed hour this runs exactly once, at load. It is
// CPU work plus about a dozen tiny draws, and it replaces a blocking 1.7 MB HDR
// fetch that held the whole route at a Suspense fallback.

const toHalfFloatRgba = (rgb, width, height) => {
  const texels = width * height;
  const data = new Uint16Array(texels * 4);

  for (let i = 0; i < texels; i += 1) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(rgb[i * 3]);
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(rgb[i * 3 + 1]);
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(rgb[i * 3 + 2]);
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }

  return data;
};

/**
 * Returns { texture, environment, skyIrradiance, directShare } and keeps
 * scene.environment pointing at the pre-filtered version.
 *
 * `state` is whatever buildSkyLut takes; `resolution` shrinks the table on weak
 * devices. The sky model itself never scales down - it is CPU work that runs
 * once, so a phone gets the same sky as a desktop, only sampled coarser.
 */
export function useSkyEnvironment(state, {
  width = 256,
  height = 128,
  enabled = true,
  applyToScene = true,
} = {}) {
  const { gl, scene } = useThree();
  const textureRef = useRef(null);
  const pmremRef = useRef(null);
  const targetRef = useRef(null);

  // Rebuilding is the expensive half, so it keys on the sky's own inputs rather
  // than the settings object identity, which changes on every slider anywhere in
  // the editor. One string is cheaper to compare than twelve numbers and reads
  // as one thing: the state of the sky.
  const skyKey = [
    width,
    height,
    ...(state.keyDirection ?? []),
    ...(state.keyRadiance ?? []),
    state.skyTurbidity,
    state.cloudCover,
    ...(state.groundAlbedo ?? []),
  ].join(':');

  const lut = useMemo(
    () => buildSkyLut({ ...state, width, height }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skyKey],
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const texture = new THREE.DataTexture(
      toHalfFloatRgba(lut.data, lut.width, lut.height),
      lut.width,
      lut.height,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    if (!pmremRef.current) {
      pmremRef.current = new THREE.PMREMGenerator(gl);
      pmremRef.current.compileEquirectangularShader();
    }

    const previousTexture = textureRef.current;
    textureRef.current = texture;

    let previousTarget = null;
    if (applyToScene) {
      const target = pmremRef.current.fromEquirectangular(texture);
      previousTarget = targetRef.current;
      targetRef.current = target;
      scene.environment = target.texture;
      // The sky's own radiance carries the level; a second gain here would make
      // every material quadratic in one slider.
      scene.environmentIntensity = 1;
    }

    previousTarget?.dispose();
    previousTexture?.dispose();

    return undefined;
  }, [applyToScene, enabled, gl, lut, scene]);

  useEffect(() => () => {
    targetRef.current?.dispose();
    textureRef.current?.dispose();
    pmremRef.current?.dispose();
    targetRef.current = null;
    textureRef.current = null;
    pmremRef.current = null;
  }, []);

  return {
    texture: textureRef.current,
    skyIrradiance: lut.skyIrradiance,
    directShare: lut.directShare,
    sunElevationDeg: lut.sunElevationDeg,
  };
}
