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

// Above this width the worker builds a half-size table first so the loader has
// something real to open on. Below it the full build is quick enough to wait for.
const PREVIEW_ABOVE = 1024;

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

    // Two passes, not one. Building the full table takes seconds of worker
    // time, and the loader has to wait for a table it can show - so the worker
    // builds a half-size one first, which the scene opens on, and the full one
    // replaces it a second later. Half to full is a step the bicubic filter
    // almost hides; placeholder to full is a visible snap.
    const stages = [];
    if (lutRequest.width > PREVIEW_ABOVE) {
      stages.push({
        width: Math.round(lutRequest.width / 2),
        height: Math.round(lutRequest.height / 2),
        final: false,
      });
    }
    stages.push({ width: lutRequest.width, height: lutRequest.height, final: true });

    const firstId = nextLutRequestId;
    nextLutRequestId += stages.length;
    let cancelled = false;

    const handleMessage = (event) => {
      const index = event.data?.id - firstId;
      if (!Number.isInteger(index) || index < 0 || index >= stages.length) {
        return;
      }

      if (cancelled || !event.data.lut) {
        return;
      }

      if (stages[index].final) {
        worker.removeEventListener('message', handleMessage);
        if (lutCache.size > 3) {
          lutCache.clear();
        }
        lutCache.set(lutRequest.key, event.data.lut);
      }

      setLut((current) => (
        current && current.width > event.data.lut.width ? current : event.data.lut
      ));
    };

    worker.addEventListener('message', handleMessage);
    stages.forEach((stage, index) => {
      worker.postMessage({
        id: firstId + index,
        state: { ...lutRequest.state, width: stage.width, height: stage.height },
      });
    });

    return () => {
      cancelled = true;
      worker.removeEventListener('message', handleMessage);
    };
  }, [lutRequest]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const nextTexture = configureSkyTexture(new THREE.DataTexture(
      toHalfFloatRgba(lut.data, lut.width, lut.height),
      lut.width,
      lut.height,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    ));

    const environmentWidth = Math.min(lut.width, 256);
    const environmentHeight = Math.min(lut.height, 128);
    const environmentRgb = downsampleRgb(
      lut.data,
      lut.width,
      lut.height,
      environmentWidth,
      environmentHeight,
    );
    const environmentTexture = configureSkyTexture(new THREE.DataTexture(
      toHalfFloatRgba(environmentRgb, environmentWidth, environmentHeight),
      environmentWidth,
      environmentHeight,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    ));

    if (!pmremRef.current) {
      pmremRef.current = new THREE.PMREMGenerator(gl);
      pmremRef.current.compileEquirectangularShader();
    }

    const previousTexture = textureRef.current;
    textureRef.current = nextTexture;
    setTexture(nextTexture);

    const nextTarget = pmremRef.current.fromEquirectangular(environmentTexture);
    environmentTexture.dispose();
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
    // True while the coarse inline table is what everything is sampling. The
    // loader waits on this: revealing the scene on a 192x96 sky and sharpening
    // it a second later reads as a glitch, not as loading.
    isPlaceholder: lut.width < Math.min(lutRequest.width, PREVIEW_ABOVE + 1),
    width: lut.width,
    height: lut.height,
    environmentWidth: Math.min(lut.width, 256),
    environmentHeight: Math.min(lut.height, 128),
    skyIrradiance: lut.skyIrradiance,
    directShare: lut.directShare,
    sunElevationDeg: lut.sunElevationDeg,
    sunVisibility: lut.sunVisibility,
    cloudCoverage: lut.cloudCoverage,
  };
}
