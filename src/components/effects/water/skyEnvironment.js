import { useEffect, useMemo, useRef, useState } from 'react';
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

// The scene's children suspend on the boat, the sculpture and the fish
// textures, so React throws away this component's first render and recomputes
// every useMemo on the retry. At the desktop table size that is a second and a
// half of noise paid twice, back to back, with the loader on screen. One entry
// is enough: there is a single sky in the app, and a slider that genuinely
// changes it changes the key too.
let lastLut = null;

function buildSkyLutOnce(request) {
  if (lastLut?.key === request.key) {
    return lastLut.lut;
  }

  const lut = buildSkyLut({
    ...request.state,
    width: request.width,
    height: request.height,
  });
  lastLut = { key: request.key, lut };
  return lut;
}

/**
 * Returns both the equirectangular sky texture and its pre-filtered PMREM.
 * This hook deliberately never writes scene.environment: WaterLights is the
 * sole owner of that global slot, so editor renders cannot race sky and HDRI.
 *
 * `state` is whatever buildSkyLut takes; `resolution` shrinks the table on weak
 * devices. The sky model itself never scales down - it is CPU work that runs
 * once, so a phone gets the same sky as a desktop, only sampled coarser.
 */
export function useSkyEnvironment(state, {
  width = 256,
  height = 128,
  enabled = true,
} = {}) {
  const { gl } = useThree();
  // State, not a ref: the texture is built in an effect, so a ref would leave
  // every consumer that reads it during render holding the null from the first
  // pass forever. That is exactly what kept the sky dome from ever mounting -
  // the water, which reads it per frame, got the texture and the visible sky
  // did not.
  const [texture, setTexture] = useState(null);
  const [environment, setEnvironment] = useState(null);
  const textureRef = useRef(null);
  const pmremRef = useRef(null);
  const targetRef = useRef(null);
  const staleTargetsRef = useRef([]);

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
    state.cloudPreset,
    state.cloudHorizon,
    state.cloudDensity,
    state.cloudScale,
    state.cloudSunOcclusion,
    ...(state.groundAlbedo ?? []),
  ].join(':');

  // Cloud look-dev can produce dozens of slider events per second. A 1536px
  // desktop LUT is still cheap as one authored commit, but rebuilding it and
  // its PMREM for every intermediate thumb position would turn that one-time
  // cost into a stall. Hold the last coherent request for a short quiet window.
  const [lutRequest, setLutRequest] = useState(() => ({
    key: skyKey,
    state,
    width,
    height,
  }));

  useEffect(() => {
    if (lutRequest.key === skyKey) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setLutRequest({ key: skyKey, state, width, height });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [height, lutRequest.key, skyKey, state, width]);

  const lut = useMemo(() => buildSkyLutOnce(lutRequest), [lutRequest]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const nextTexture = new THREE.DataTexture(
      toHalfFloatRgba(lut.data, lut.width, lut.height),
      lut.width,
      lut.height,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    nextTexture.mapping = THREE.EquirectangularReflectionMapping;
    nextTexture.colorSpace = THREE.LinearSRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    nextTexture.wrapS = THREE.RepeatWrapping;
    nextTexture.wrapT = THREE.ClampToEdgeWrapping;
    nextTexture.generateMipmaps = false;
    nextTexture.needsUpdate = true;

    if (!pmremRef.current) {
      pmremRef.current = new THREE.PMREMGenerator(gl);
      pmremRef.current.compileEquirectangularShader();
    }

    const previousTexture = textureRef.current;
    textureRef.current = nextTexture;
    setTexture(nextTexture);

    const nextTarget = pmremRef.current.fromEquirectangular(nextTexture);
    if (targetRef.current) {
      staleTargetsRef.current.push(targetRef.current);
    }
    targetRef.current = nextTarget;
    setEnvironment(nextTarget.texture);
    previousTexture?.dispose();

    return undefined;
  }, [enabled, gl, lut]);

  // The Environment owner switches to the new PMREM during the layout phase of
  // this render. Dispose old targets only afterwards, never while the scene may
  // still be sampling them for the current frame.
  useEffect(() => {
    staleTargetsRef.current.forEach((target) => target.dispose());
    staleTargetsRef.current = [];
  }, [environment]);

  useEffect(() => () => {
    targetRef.current?.dispose();
    textureRef.current?.dispose();
    pmremRef.current?.dispose();
    staleTargetsRef.current.forEach((target) => target.dispose());
    staleTargetsRef.current = [];
    targetRef.current = null;
    textureRef.current = null;
    pmremRef.current = null;
  }, []);

  return {
    texture,
    environment,
    width: lut.width,
    height: lut.height,
    skyIrradiance: lut.skyIrradiance,
    directShare: lut.directShare,
    sunElevationDeg: lut.sunElevationDeg,
    sunVisibility: lut.sunVisibility,
    cloudCoverage: lut.cloudCoverage,
  };
}
