import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { buildSkyLut } from '../sky/skyModel.js';

// The bridge between the sky model and three: one detailed equirectangular
// texture, and one pre-filtered environment map built from a smaller copy of
// the same numeric sky. PMREM is a blur by definition, so feeding its expensive
// convolution the full display table adds startup cost without visible detail.
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

// A coarse table, built inline, so the very first frame already has a sky to
// sample. The worker's full-size table replaces it a moment later, while the
// loader is still on screen.
const PLACEHOLDER = Object.freeze({ width: 192, height: 96 });


// The scene's children suspend on the boat, the sculpture and the fish
// textures, so React throws away this component's first render and recomputes
// everything on the retry. Two entries - the placeholder and the real table -
// are all a single sky ever needs, and a slider that genuinely changes the sky
// changes the key too.
const lutCache = new Map();

function buildSkyLutCached(key, state, width, height) {
  const cached = lutCache.get(key);
  if (cached) {
    return cached;
  }

  const lut = buildSkyLut({ ...state, width, height });
  if (lutCache.size > 3) {
    lutCache.clear();
  }
  lutCache.set(key, lut);
  return lut;
}

let lutWorker = null;
let lutWorkerFailed = false;
let nextLutRequestId = 0;

function getLutWorker() {
  if (lutWorkerFailed || typeof Worker === 'undefined') {
    return null;
  }

  if (lutWorker === null) {
    try {
      lutWorker = new Worker(new URL('../sky/skyLut.worker.js', import.meta.url), { type: 'module' });
    } catch {
      // No worker here - an old browser, or a policy that blocks them. The
      // caller builds the table inline instead.
      lutWorkerFailed = true;
      return null;
    }
  }

  return lutWorker;
}
const downsampleRgb = (source, sourceWidth, sourceHeight, targetWidth, targetHeight) => {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return source;
  }

  const target = new Float32Array(targetWidth * targetHeight * 3);
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY0 = Math.floor(targetY * sourceHeight / targetHeight);
    const sourceY1 = Math.max(sourceY0 + 1, Math.floor((targetY + 1) * sourceHeight / targetHeight));

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX0 = Math.floor(targetX * sourceWidth / targetWidth);
      const sourceX1 = Math.max(sourceX0 + 1, Math.floor((targetX + 1) * sourceWidth / targetWidth));
      const targetIndex = (targetY * targetWidth + targetX) * 3;
      let samples = 0;

      for (let sourceY = sourceY0; sourceY < sourceY1; sourceY += 1) {
        for (let sourceX = sourceX0; sourceX < sourceX1; sourceX += 1) {
          const sourceIndex = (sourceY * sourceWidth + sourceX) * 3;
          target[targetIndex] += source[sourceIndex];
          target[targetIndex + 1] += source[sourceIndex + 1];
          target[targetIndex + 2] += source[sourceIndex + 2];
          samples += 1;
        }
      }

      target[targetIndex] /= samples;
      target[targetIndex + 1] /= samples;
      target[targetIndex + 2] /= samples;
    }
  }

  return target;
};

// Nearest-neighbour resample of an RGB float table. Used once, to spread the
// coarse placeholder over the full-size texture so that texture can exist
// from the first frame and be refilled in place when the real table lands.
const resampleRgbNearest = (source, sourceWidth, sourceHeight, targetWidth, targetHeight) => {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return source;
  }

  const target = new Float32Array(targetWidth * targetHeight * 3);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 3;
      const targetIndex = (y * targetWidth + x) * 3;
      target[targetIndex] = source[sourceIndex];
      target[targetIndex + 1] = source[sourceIndex + 1];
      target[targetIndex + 2] = source[sourceIndex + 2];
    }
  }

  return target;
};

const configureSkyTexture = (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

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
  const environmentTextureRef = useRef(null);
  const pmremRef = useRef(null);
  const targetRef = useRef(null);
  const targetSizeRef = useRef({ width: 0, height: 0 });
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

  // Cloud look-dev can produce dozens of slider events per second. The table
  // itself is built on a worker now, but its half-float packing, its upload and
  // its PMREM are not, and paying those for every intermediate thumb position
  // is a stall. Hold the last coherent request for a short quiet window.
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

  // The placeholder is synchronous on purpose: without a table there is no sky
  // texture, and SkyDome and the far water both refuse to mount without one.
  const [lut, setLut] = useState(() => buildSkyLutCached(
    `${lutRequest.key}#placeholder`,
    lutRequest.state,
    PLACEHOLDER.width,
    PLACEHOLDER.height,
  ));

  useEffect(() => {
    const cached = lutCache.get(lutRequest.key);
    if (cached) {
      setLut(cached);
      return undefined;
    }

    const worker = getLutWorker();

    if (!worker) {
      setLut(buildSkyLutCached(
        lutRequest.key,
        lutRequest.state,
        lutRequest.width,
        lutRequest.height,
      ));
      return undefined;
    }

    // One pass, deliberately. A second, larger table arriving after the reveal
    // means a second texture and a second PMREM target minutes into a session,
    // and the runtime-stability contract wants the resource counts to reach a
    // plateau and stay there. The loader waits for this one instead.
    const id = nextLutRequestId;
    nextLutRequestId += 1;
    let settled = false;
    let watchdog = 0;

    const detach = () => {
      settled = true;
      window.clearTimeout(watchdog);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    // The loader waits for this table and has no other way out, so a worker
    // that reports an error, fails to load, or never answers hands the build
    // back to the main thread instead of leaving the site on the loader.
    const fallbackInline = () => {
      if (settled) {
        return;
      }
      detach();
      setLut(buildSkyLutCached(
        lutRequest.key,
        lutRequest.state,
        lutRequest.width,
        lutRequest.height,
      ));
    };
    function handleError() {
      lutWorkerFailed = true;
      fallbackInline();
    }
    function handleMessage(event) {
      if (event.data?.id !== id || settled) {
        return;
      }

      if (!event.data.lut) {
        fallbackInline();
        return;
      }

      detach();
      if (lutCache.size > 3) {
        lutCache.clear();
      }
      lutCache.set(lutRequest.key, event.data.lut);
      setLut(event.data.lut);
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    // Generous: a slow phone builds the full table in several seconds, and a
    // second build on the main thread must not race a worker that is merely late.
    watchdog = window.setTimeout(fallbackInline, 20000);
    worker.postMessage({
      id,
      state: {
        ...lutRequest.state,
        width: lutRequest.width,
        height: lutRequest.height,
      },
    });

    return () => {
      detach();
    };
  }, [lutRequest]);

  // The GPU objects are allocated once, at the requested size, and refilled
  // after that. A camera cut to a different sky used to create a texture and
  // a PMREM target and drop the old pair; with four skies in the slideshow the
  // resource counts never settled, and on a software renderer the cut was
  // mostly that churn. Now the table is written into the same texture, and
  // PMREM renders into the same target.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const rgb = resampleRgbNearest(lut.data, lut.width, lut.height, width, height);
    const rgba = toHalfFloatRgba(rgb, width, height);
    let skyTexture = textureRef.current;

    if (!skyTexture || skyTexture.image.width !== width || skyTexture.image.height !== height) {
      const previousTexture = skyTexture;
      skyTexture = configureSkyTexture(new THREE.DataTexture(
        rgba,
        width,
        height,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
      ));
      textureRef.current = skyTexture;
      setTexture(skyTexture);
      previousTexture?.dispose();
    } else {
      skyTexture.image.data.set(rgba);
      skyTexture.needsUpdate = true;
    }

    const environmentWidth = Math.min(width, 256);
    const environmentHeight = Math.min(height, 128);
    const environmentRgb = downsampleRgb(rgb, width, height, environmentWidth, environmentHeight);
    const environmentRgba = toHalfFloatRgba(environmentRgb, environmentWidth, environmentHeight);
    let environmentTexture = environmentTextureRef.current;

    if (
      !environmentTexture
      || environmentTexture.image.width !== environmentWidth
      || environmentTexture.image.height !== environmentHeight
    ) {
      environmentTexture?.dispose();
      environmentTexture = configureSkyTexture(new THREE.DataTexture(
        environmentRgba,
        environmentWidth,
        environmentHeight,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
      ));
      environmentTextureRef.current = environmentTexture;
    } else {
      environmentTexture.image.data.set(environmentRgba);
      environmentTexture.needsUpdate = true;
    }

    if (!pmremRef.current) {
      pmremRef.current = new THREE.PMREMGenerator(gl);
      pmremRef.current.compileEquirectangularShader();
    }

    const target = targetRef.current;
    const targetFits = target
      && targetSizeRef.current.width === environmentWidth
      && targetSizeRef.current.height === environmentHeight;

    if (targetFits) {
      // Same target, new contents: whoever holds its texture keeps it.
      pmremRef.current.fromEquirectangular(environmentTexture, target);
    } else {
      const nextTarget = pmremRef.current.fromEquirectangular(environmentTexture);
      targetSizeRef.current = { width: environmentWidth, height: environmentHeight };
      if (target) {
        staleTargetsRef.current.push(target);
      }
      targetRef.current = nextTarget;
      setEnvironment(nextTarget.texture);
    }

    return undefined;
  }, [enabled, gl, height, lut, width]);

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
    environmentTextureRef.current?.dispose();
    environmentTextureRef.current = null;
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
    // True while the coarse inline table is what everything is sampling. The
    // loader waits on this: revealing the scene on a 192x96 sky and sharpening
    // it a second later reads as a glitch, not as loading.
    isPlaceholder: lut.width < lutRequest.width,
    width: lut.width,
    height: lut.height,
    environmentWidth: Math.min(width, 256),
    environmentHeight: Math.min(height, 128),
    skyIrradiance: lut.skyIrradiance,
    directShare: lut.directShare,
    sunElevationDeg: lut.sunElevationDeg,
    sunVisibility: lut.sunVisibility,
    cloudCoverage: lut.cloudCoverage,
  };
}
