import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Environment, useProgress } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import {
  getBaseHomeSceneSettings,
} from '../../features/home-scene/hooks/useHomeSceneSettings';
import { resolveLayout, resolveLayoutKey } from '../../features/home-scene/lib/layout';
import SceneCanvas from './SceneCanvas';
import {
  fullScreenVertexShader,
  normalFragmentShader,
  probeFragmentShader,
  seabedFragmentShader,
  seabedVertexShader,
  simulationFragmentShader,
  waterFragmentShader,
  waterVertexShader,
} from './shaders/waterRuntimeShaders';

const PUBLIC_CAMERA_POSITION = [0, 5.8, 8.9];
const DEFAULT_CLEAR_COLOR = '#000000';
const DRAWING_BUFFER_SIZE = new THREE.Vector2();
const DEFAULT_BOAT_ANCHOR = Object.freeze({ x: 2.1, z: -1.4 });
const DEFAULT_SCULPTURE_ANCHOR = Object.freeze({ x: 0.6, z: 1.2 });
const SCULPTURE_DRAG_EDGE_MARGIN = 0.35;
const BOAT_PROBE_OFFSETS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0.95),
  new THREE.Vector3(0, 0, -0.95),
  new THREE.Vector3(-0.42, 0, 0),
  new THREE.Vector3(0.42, 0, 0),
];
const DEBUG_VIEW_IDS = {
  beauty: 0,
  height: 1,
  normals: 2,
  caustics: 3,
  'seabed-depth': 4,
};
// HDRI presets we ship locally (no runtime CDN dependency in production). The published
// look uses `night`; other presets still fall back to drei's CDN for in-editor experiments.
const SELF_HOSTED_HDRI = {
  night: 'hdri/dikhololo_night_1k.hdr',
};
const QUALITY_TIER = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
});
const REFLECTION_CAMERA_POSITION_EPSILON_SQ = 0.00006;
const REFLECTION_CAMERA_ROTATION_EPSILON = 0.00008;
const REFLECTION_BOAT_POSITION_EPSILON_SQ = 0.00004;
const REFLECTION_BOAT_ROTATION_EPSILON = 0.00008;
const CURSOR_BOAT_IMPACT_DURATION = 1.35;
const CURSOR_BOAT_IMPACT_RADIUS_FACTOR = 5.2;
const BOAT_NEUTRAL_Y = 0.26;
const BOAT_TARGET_Y_MIN = 0.02;
const BOAT_TARGET_Y_MAX = 0.44;
const BOAT_MAX_PITCH = 0.24;
const BOAT_MAX_ROLL = 0.28;
// Buoyancy probes need a GPU->CPU pixel readback, which stalls the pipeline.
// Reading more often than the wave simulation updates is wasted work, so cap it.
const BOAT_PROBE_INTERVAL = 1 / 40;
let qualityTierCache = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const quaternionDelta = (a, b) => 1 - Math.abs(a.dot(b));

function detectQualityTier() {
  if (qualityTierCache) {
    return qualityTierCache;
  }

  if (typeof navigator === 'undefined') {
    qualityTierCache = QUALITY_TIER.high;
    return qualityTierCache;
  }

  const deviceMemory = typeof navigator.deviceMemory === 'number'
    ? navigator.deviceMemory
    : null;
  const hardwareConcurrency = typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;
  const isLowTier = (deviceMemory !== null && deviceMemory <= 4)
    || (hardwareConcurrency !== null && hardwareConcurrency <= 4);
  const isMediumTier = (deviceMemory !== null && deviceMemory <= 8)
    || (hardwareConcurrency !== null && hardwareConcurrency <= 8);

  if (isLowTier) {
    qualityTierCache = QUALITY_TIER.low;
    return qualityTierCache;
  }

  qualityTierCache = isMediumTier ? QUALITY_TIER.medium : QUALITY_TIER.high;
  return qualityTierCache;
}

function isTouchPrimaryDevice() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function buildRuntimeQualityProfile(mode, viewportWidth) {
  const tier = detectQualityTier();
  const isEditor = mode === 'editor';
  const isMobileDevice = viewportWidth < 768 || isTouchPrimaryDevice();

  if (isMobileDevice || tier === QUALITY_TIER.low) {
    return {
      isLowPower: true,
      simulationTargetFps: isEditor ? 32 : 28,
      simulationMaxResolution: 256,
      reflectionActiveFps: 14,
      reflectionIdleFps: 4,
      reflectionTextureSize: 256,
      waterMeshDensityCap: 160,
      shadowMapSize: 384,
      boatProbeInterval: 1 / 22,
    };
  }

  if (tier === QUALITY_TIER.medium) {
    return {
      isLowPower: false,
      simulationTargetFps: isEditor ? 38 : 34,
      simulationMaxResolution: 384,
      reflectionActiveFps: 18,
      reflectionIdleFps: 6,
      reflectionTextureSize: isEditor ? 448 : 352,
      waterMeshDensityCap: 208,
      shadowMapSize: 512,
      boatProbeInterval: 1 / 40,
    };
  }

  return {
    isLowPower: false,
    simulationTargetFps: isEditor ? 44 : 38,
    simulationMaxResolution: 512,
    reflectionActiveFps: 24,
    reflectionIdleFps: 8,
    reflectionTextureSize: isEditor ? 640 : 448,
    waterMeshDensityCap: 256,
    shadowMapSize: isEditor ? 896 : 640,
    boatProbeInterval: 1 / 40,
  };
}

function isDocumentCurrentlyVisible() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
}

function createTarget(width, height, options) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    ...options,
  });

  target.texture.wrapS = THREE.ClampToEdgeWrapping;
  target.texture.wrapT = THREE.ClampToEdgeWrapping;
  return target;
}

function createPass(fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: fullScreenVertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);

  scene.add(quad);
  return { material, scene, camera, quad };
}

function disposePass(pass) {
  pass.quad.geometry.dispose();
  pass.material.dispose();
}

function buildMoonDirection(settings) {
  const azimuth = THREE.MathUtils.degToRad(settings.moonAzimuth);
  const elevation = THREE.MathUtils.degToRad(settings.moonElevation);
  const direction = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );

  return direction.normalize();
}

function restoreDefaultFramebuffer(gl) {
  const drawingBufferSize = gl.getDrawingBufferSize(DRAWING_BUFFER_SIZE);

  gl.setRenderTarget(null);
  gl.setViewport(0, 0, drawingBufferSize.x, drawingBufferSize.y);
  gl.setScissor(0, 0, drawingBufferSize.x, drawingBufferSize.y);
  gl.setScissorTest(false);
}

const CAMERA_POSE_TARGET = new THREE.Vector3();
const LazyOrbitControls = React.lazy(() => import('@react-three/drei/core/OrbitControls.js').then((module) => ({
  default: module.OrbitControls,
})));

function WaterCameraRig({ mode, layout, onCameraRigApi, orbitRef }) {
  const { camera, gl } = useThree();
  const internalControlsRef = useRef();
  const controlsRef = orbitRef ?? internalControlsRef;
  const formatAxis = useCallback((value) => Number(value.toFixed(4)), []);
  const cameraTarget = layout?.cameraTarget ?? { x: 0, y: 0, z: 0 };

  useEffect(() => {
    if (!layout || camera.fov === layout.cameraFov) {
      return;
    }

    camera.fov = layout.cameraFov;
    camera.updateProjectionMatrix();
  }, [camera, layout?.cameraFov]);

  // Apply the active composition bucket's pose. Depends on the bucket's camera numbers
  // (not the object identity) so editing object positions doesn't snap the camera, and
  // free-orbiting in the editor isn't interrupted by unrelated setting changes.
  useLayoutEffect(() => {
    if (!layout) {
      return;
    }

    const { cameraPosition } = layout;
    camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    camera.near = 0.1;
    camera.far = 80;
    camera.fov = layout.cameraFov;
    CAMERA_POSE_TARGET.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.lookAt(CAMERA_POSE_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(CAMERA_POSE_TARGET);
      controlsRef.current.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controlsRef,
    layout?.cameraPosition?.x,
    layout?.cameraPosition?.y,
    layout?.cameraPosition?.z,
    cameraTarget.x,
    cameraTarget.y,
    cameraTarget.z,
    layout?.cameraFov,
  ]);

  useEffect(() => {
    if (mode !== 'editor') {
      return undefined;
    }

    const controls = controlsRef.current;
    const domElement = gl.domElement;

    if (!controls || !domElement) {
      return undefined;
    }

    const handleStart = () => {
      domElement.style.cursor = 'grabbing';
    };
    const handleEnd = () => {
      domElement.style.cursor = 'grab';
    };
    const preventContextMenu = (event) => {
      event.preventDefault();
    };

    domElement.style.cursor = 'grab';
    domElement.addEventListener('contextmenu', preventContextMenu);
    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);

    return () => {
      domElement.style.cursor = '';
      domElement.removeEventListener('contextmenu', preventContextMenu);
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
    };
  }, [controlsRef, gl, mode]);

  useEffect(() => {
    if (typeof onCameraRigApi !== 'function') {
      return undefined;
    }

    const capturePose = () => {
      const target = controlsRef.current?.target
        ?? CAMERA_POSE_TARGET.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);

      return {
        cameraPosition: {
          x: formatAxis(camera.position.x),
          y: formatAxis(camera.position.y),
          z: formatAxis(camera.position.z),
        },
        cameraTarget: {
          x: formatAxis(target.x),
          y: formatAxis(target.y),
          z: formatAxis(target.z),
        },
        cameraFov: Math.round(camera.fov),
      };
    };

    onCameraRigApi({ capturePose });

    return () => {
      onCameraRigApi(null);
    };
  }, [cameraTarget.x, cameraTarget.y, cameraTarget.z, camera, controlsRef, formatAxis, onCameraRigApi]);

  if (mode !== 'editor') {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <LazyOrbitControls
        ref={controlsRef}
        makeDefault
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        enablePan
        screenSpacePanning={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.5}
        maxDistance={2000}
        minPolarAngle={0.45}
        maxPolarAngle={1.35}
        target={[cameraTarget.x, cameraTarget.y, cameraTarget.z]}
      />
    </React.Suspense>
  );
}

function useWaterRuntime(settings, qualityProfile) {
  const { gl } = useThree();
  const stateRef = useRef(null);
  const normalTargetRef = useRef(null);
  const pointerStateRef = useRef({
    uv: new THREE.Vector2(0.5, 0.5),
    impulseUv: new THREE.Vector2(0.5, 0.5),
    impulseStrength: 0,
    hasImpulse: false,
    isInside: false,
    recentWorldPoint: new THREE.Vector3(0, 0, 0),
    recentImpulseStrength: 0,
    recentImpulseTime: -Infinity,
  });
  const simulationAccumulatorRef = useRef(0);
  const probeBufferRef = useRef(new Uint8Array(5 * 4));
  const probeResultsRef = useRef(Array.from(
    { length: 5 },
    () => ({ height: 0, normal: new THREE.Vector3(0, 1, 0) }),
  ));
  const effectiveResolution = Math.min(
    settings.simulationResolution,
    qualityProfile.simulationMaxResolution,
  );

  const renderState = useMemo(() => {
    const read = createTarget(effectiveResolution, effectiveResolution, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const write = createTarget(effectiveResolution, effectiveResolution, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const normal = createTarget(effectiveResolution, effectiveResolution, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const probe = createTarget(5, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const simulationPass = createPass(simulationFragmentShader, {
      uState: { value: read.texture },
      uResolution: { value: new THREE.Vector2(effectiveResolution, effectiveResolution) },
      uPointerUv: { value: new THREE.Vector2(0.5, 0.5) },
      uImpulseActive: { value: 0 },
      uImpulseStrength: { value: 0 },
      uRippleRadius: { value: settings.rippleRadius },
      uRippleImpulse: { value: settings.rippleImpulse },
      uDamping: { value: settings.rippleDamping },
      uDelta: { value: 1 / 60 },
      uTime: { value: 0 },
      uAmbientWaveIntensity: { value: settings.ambientWaveIntensity },
      uAmbientWaveSpeed: { value: settings.ambientWaveSpeed },
      uWaveLength: { value: settings.waveLength },
    });
    const normalPass = createPass(normalFragmentShader, {
      uState: { value: read.texture },
      uResolution: { value: new THREE.Vector2(effectiveResolution, effectiveResolution) },
      uNormalStrength: { value: settings.normalStrength },
      uNormalBlur: { value: settings.normalBlur },
      uWaveLength: { value: settings.waveLength },
    });
    const probePass = createPass(probeFragmentShader, {
      uState: { value: read.texture },
      uNormalMap: { value: normal.texture },
      uProbeUv: {
        value: [
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
        ],
      },
    });

    stateRef.current = read;
    normalTargetRef.current = normal;

    return {
      read,
      write,
      normal,
      probe,
      simulationPass,
      normalPass,
      probePass,
    };
  }, [
    settings.ambientWaveIntensity,
    settings.ambientWaveSpeed,
    effectiveResolution,
    settings.normalBlur,
    settings.normalStrength,
    settings.rippleDamping,
    settings.rippleImpulse,
    settings.rippleRadius,
    settings.waveLength,
  ]);

  useEffect(() => () => {
    renderState.read.dispose();
    renderState.write.dispose();
    renderState.normal.dispose();
    renderState.probe.dispose();
    disposePass(renderState.simulationPass);
    disposePass(renderState.normalPass);
    disposePass(renderState.probePass);
  }, [renderState]);

  useEffect(() => {
    const previousClearColor = new THREE.Color();
    const previousClearAlpha = gl.getClearAlpha();

    gl.getClearColor(previousClearColor);

    gl.setClearColor(DEFAULT_CLEAR_COLOR, 1);
    gl.setRenderTarget(renderState.read);
    gl.clear(true, false, false);
    gl.setRenderTarget(renderState.write);
    gl.clear(true, false, false);
    gl.setRenderTarget(renderState.normal);
    gl.clear(true, false, false);
    gl.setRenderTarget(renderState.probe);
    gl.clear(true, false, false);
    gl.setRenderTarget(null);
    gl.setClearColor(previousClearColor, previousClearAlpha);
  }, [gl, renderState]);

  useFrame((_, delta) => {
    if (!isDocumentCurrentlyVisible()) {
      simulationAccumulatorRef.current = 0;
      return;
    }

    const targetStep = 1 / Math.max(qualityProfile.simulationTargetFps, 1);
    simulationAccumulatorRef.current += delta;

    if (simulationAccumulatorRef.current < targetStep) {
      return;
    }

    const simulationDelta = Math.min(simulationAccumulatorRef.current, 1 / 20);
    simulationAccumulatorRef.current = 0;
    const pointerState = pointerStateRef.current;
    const rippleRadiusUv = clamp(settings.rippleRadius / settings.waterExtent, 0.0025, 0.12);

    renderState.simulationPass.material.uniforms.uState.value = renderState.read.texture;
    renderState.simulationPass.material.uniforms.uResolution.value.set(effectiveResolution, effectiveResolution);
    renderState.simulationPass.material.uniforms.uPointerUv.value.copy(pointerState.impulseUv);
    renderState.simulationPass.material.uniforms.uImpulseActive.value = pointerState.hasImpulse ? 1 : 0;
    renderState.simulationPass.material.uniforms.uImpulseStrength.value = pointerState.impulseStrength;
    renderState.simulationPass.material.uniforms.uRippleRadius.value = rippleRadiusUv;
    renderState.simulationPass.material.uniforms.uRippleImpulse.value = settings.rippleImpulse * 1.9;
    renderState.simulationPass.material.uniforms.uDamping.value = settings.rippleDamping;
    renderState.simulationPass.material.uniforms.uDelta.value = simulationDelta;
    renderState.simulationPass.material.uniforms.uTime.value = _.clock.elapsedTime;
    renderState.simulationPass.material.uniforms.uAmbientWaveIntensity.value = settings.ambientWaveIntensity;
    renderState.simulationPass.material.uniforms.uAmbientWaveSpeed.value = settings.ambientWaveSpeed;
    renderState.simulationPass.material.uniforms.uWaveLength.value = settings.waveLength;

    gl.setRenderTarget(renderState.write);
    gl.render(renderState.simulationPass.scene, renderState.simulationPass.camera);

    const previousRead = renderState.read;
    renderState.read = renderState.write;
    renderState.write = previousRead;
    stateRef.current = renderState.read;

    renderState.normalPass.material.uniforms.uState.value = renderState.read.texture;
    renderState.normalPass.material.uniforms.uResolution.value.set(effectiveResolution, effectiveResolution);
    renderState.normalPass.material.uniforms.uNormalStrength.value = settings.normalStrength;
    renderState.normalPass.material.uniforms.uNormalBlur.value = settings.normalBlur;
    renderState.normalPass.material.uniforms.uWaveLength.value = settings.waveLength;

    gl.setRenderTarget(renderState.normal);
    gl.render(renderState.normalPass.scene, renderState.normalPass.camera);
    restoreDefaultFramebuffer(gl);

    normalTargetRef.current = renderState.normal;
    pointerState.hasImpulse = false;
    pointerState.impulseStrength = 0;
  }, -10);

  const worldToUv = useCallback((x, z) => {
    const halfExtent = settings.waterExtent * 0.5;

    return new THREE.Vector2(
      clamp((x + halfExtent) / settings.waterExtent, 0.001, 0.999),
      clamp((halfExtent - z) / settings.waterExtent, 0.001, 0.999),
    );
  }, [settings.waterExtent]);

  const sampleBoatProbes = useCallback((worldPoints) => {
    if (!stateRef.current || !normalTargetRef.current || worldPoints.length !== 5) {
      return null;
    }

    worldPoints.forEach((point, index) => {
      renderState.probePass.material.uniforms.uProbeUv.value[index].copy(worldToUv(point.x, point.z));
    });

    renderState.probePass.material.uniforms.uState.value = stateRef.current.texture;
    renderState.probePass.material.uniforms.uNormalMap.value = normalTargetRef.current.texture;

    gl.setRenderTarget(renderState.probe);
    gl.render(renderState.probePass.scene, renderState.probePass.camera);
    gl.readRenderTargetPixels(renderState.probe, 0, 0, 5, 1, probeBufferRef.current);
    restoreDefaultFramebuffer(gl);

    for (let index = 0; index < 5; index += 1) {
      const offset = index * 4;
      const probeResult = probeResultsRef.current[index];

      probeResult.height = ((probeBufferRef.current[offset] / 255) * 2) - 1;
      probeResult.normal.set(
        ((probeBufferRef.current[offset + 1] / 255) * 2) - 1,
        ((probeBufferRef.current[offset + 3] / 255) * 2) - 1,
        ((probeBufferRef.current[offset + 2] / 255) * 2) - 1,
      ).normalize();
    }

    return probeResultsRef.current;
  }, [gl, renderState, worldToUv]);

  return {
    currentStateTargetRef: stateRef,
    normalTargetRef,
    pointerStateRef,
    sampleBoatProbes,
  };
}

function WaterInteractionPlane({ settings, pointerStateRef, sampleBoatProbes, enableSurfaceRefine = true }) {
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcPointerRef = useRef(new THREE.Vector2());
  const rayHitPointRef = useRef(new THREE.Vector3());
  const projectedUvRef = useRef(new THREE.Vector2(0.5, 0.5));
  const deltaUvRef = useRef(new THREE.Vector2());
  const waterPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const surfacePlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const surfaceProbePointsRef = useRef([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);

  const resetPointerState = useCallback(() => {
    pointerStateRef.current.hasImpulse = false;
    pointerStateRef.current.impulseStrength = 0;
    pointerStateRef.current.isInside = false;
  }, [pointerStateRef]);

  const worldPointToUv = useCallback((point) => {
    if (!point) {
      return null;
    }

    const halfExtent = settings.waterExtent * 0.5;
    if (Math.abs(point.x) > halfExtent || Math.abs(point.z) > halfExtent) {
      return null;
    }

    projectedUvRef.current.set(
      clamp((point.x + halfExtent) / settings.waterExtent, 0.001, 0.999),
      clamp((halfExtent - point.z) / settings.waterExtent, 0.001, 0.999),
    );

    return projectedUvRef.current;
  }, [settings.waterExtent]);

  const screenPointToHit = useCallback((clientX, clientY) => {
    const domElement = gl.domElement;
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    ndcPointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );

    raycasterRef.current.setFromCamera(ndcPointerRef.current, camera);
    const ray = raycasterRef.current.ray;
    const hit = ray.intersectPlane(waterPlaneRef.current, rayHitPointRef.current);
    if (!hit) {
      return null;
    }

    // Refine the hit against the actual displaced water surface, so the impulse lands
    // under the cursor even at grazing / zoomed camera angles (parallax fix). We read the
    // wave height under the first guess and re-aim at that height (two cheap iterations).
    if (enableSurfaceRefine && typeof sampleBoatProbes === 'function' && settings.waveAmplitude > 0.0001) {
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const probePoints = surfaceProbePointsRef.current;
        for (let index = 0; index < probePoints.length; index += 1) {
          probePoints[index].copy(rayHitPointRef.current);
        }

        const probes = sampleBoatProbes(probePoints);
        if (!probes) {
          break;
        }

        surfacePlaneRef.current.constant = -(probes[0].height * settings.waveAmplitude);
        if (!ray.intersectPlane(surfacePlaneRef.current, rayHitPointRef.current)) {
          break;
        }
      }
    }

    const uv = worldPointToUv(rayHitPointRef.current);
    if (!uv) {
      return null;
    }

    return rayHitPointRef.current;
  }, [camera, gl, worldPointToUv, sampleBoatProbes, settings.waveAmplitude, enableSurfaceRefine]);

  const registerPointerImpulse = useCallback((uv, worldPoint, baseStrength = 0.22) => {
    if (!uv) {
      return;
    }

    const pointerState = pointerStateRef.current;
    const wasInside = pointerState.isInside;
    const deltaStrength = wasInside
      ? clamp(deltaUvRef.current.copy(uv).sub(pointerState.uv).length() * 28, 0, 1)
      : 0;

    pointerState.uv.copy(uv);

    if (!wasInside) {
      pointerState.impulseUv.copy(uv);
      pointerState.isInside = true;

      if (baseStrength <= 0.01) {
        return;
      }
    }

    const impulseStrength = Math.max(baseStrength, deltaStrength);

    if (impulseStrength <= 0.01) {
      return;
    }

    pointerState.impulseUv.copy(uv);
    pointerState.impulseStrength = clamp(impulseStrength, 0.18, 1);
    pointerState.hasImpulse = true;
    pointerState.isInside = true;

    if (worldPoint) {
      pointerState.recentWorldPoint.copy(worldPoint);
    }
    pointerState.recentImpulseStrength = pointerState.impulseStrength;
    pointerState.recentImpulseTime = performance.now() * 0.001;
  }, [pointerStateRef]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const hitPoint = screenPointToHit(event.clientX, event.clientY);
      if (!hitPoint) {
        resetPointerState();
        return;
      }

      const isLeftPressed = (event.buttons & 1) === 1;
      const interactionStrength = isLeftPressed ? 0.68 : 0.32;
      registerPointerImpulse(projectedUvRef.current, hitPoint, interactionStrength);
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }

      const hitPoint = screenPointToHit(event.clientX, event.clientY);
      if (!hitPoint) {
        return;
      }
      registerPointerImpulse(projectedUvRef.current, hitPoint, 0.92);
    };

    const handlePointerLeave = () => {
      resetPointerState();
    };

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
    domElement.addEventListener('pointerup', handlePointerLeave, { passive: true });
    domElement.addEventListener('pointercancel', handlePointerLeave, { passive: true });
    domElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerLeave);
      domElement.removeEventListener('pointercancel', handlePointerLeave);
      domElement.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [gl, registerPointerImpulse, resetPointerState, screenPointToHit]);

  return (
    <mesh
      name="water-interaction-plane"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.05, 0]}
      visible={false}
    >
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

const reflectionCameraPosition = new THREE.Vector3();
const mainCameraTargetPosition = new THREE.Vector3();
const reflectionTargetPosition = new THREE.Vector3();
const waterSurfaceWorldPosition = new THREE.Vector3();
const reflectionBoatPosition = new THREE.Vector3();
const reflectionBoatQuaternion = new THREE.Quaternion();
const reflectionSculpturePosition = new THREE.Vector3();
const reflectionSculptureQuaternion = new THREE.Quaternion();
const reflectionPreviousClearColor = new THREE.Color();

function WaterReflections({
  children,
  textureSize = 512,
  enabled = true,
  activeFps = 30,
  idleFps = 12,
}) {
  const { gl, scene, camera } = useThree();
  const reflectionTarget = useMemo(() => new THREE.WebGLRenderTarget(textureSize, textureSize, {
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  }), [textureSize]);

  const reflectionCamera = useMemo(() => new THREE.PerspectiveCamera(), []);
  const reflectionData = useRef({ texture: null, matrix: new THREE.Matrix4() });
  const sceneObjectsRef = useRef({
    waterSurface: null,
    seabed: null,
    interactionPlane: null,
    boatAnchor: null,
    sculptureAnchor: null,
  });
  const reflectionTimingRef = useRef({
    initialized: false,
    lastRenderTime: -Infinity,
    cameraPosition: new THREE.Vector3(),
    cameraQuaternion: new THREE.Quaternion(),
    boatPosition: new THREE.Vector3(),
    boatQuaternion: new THREE.Quaternion(),
    sculpturePosition: new THREE.Vector3(),
    sculptureQuaternion: new THREE.Quaternion(),
  });

  useEffect(() => () => {
    reflectionTarget.dispose();
  }, [reflectionTarget]);

  useEffect(() => {
    if (enabled) {
      return;
    }

    reflectionData.current.texture = null;
    reflectionTimingRef.current.initialized = false;
    reflectionTimingRef.current.lastRenderTime = -Infinity;
  }, [enabled]);

  useFrame(({ clock }) => {
    if (!enabled || !reflectionCamera || !reflectionTarget || !isDocumentCurrentlyVisible()) {
      return;
    }

    const sceneObjects = sceneObjectsRef.current;
    const reflectionTiming = reflectionTimingRef.current;

    if (!sceneObjects.waterSurface) {
      sceneObjects.waterSurface = scene.getObjectByName('water-surface');
    }
    if (!sceneObjects.seabed) {
      sceneObjects.seabed = scene.getObjectByName('seabed');
    }
    if (!sceneObjects.interactionPlane) {
      sceneObjects.interactionPlane = scene.getObjectByName('water-interaction-plane');
    }
    if (!sceneObjects.boatAnchor) {
      sceneObjects.boatAnchor = scene.getObjectByName('boat-anchor');
    }
    if (!sceneObjects.sculptureAnchor) {
      sceneObjects.sculptureAnchor = scene.getObjectByName('sculpture-anchor');
    }

    const waterSurface = sceneObjects.waterSurface;
    const seabed = sceneObjects.seabed;
    const interactionPlane = sceneObjects.interactionPlane;
    const boatAnchor = sceneObjects.boatAnchor;
    const sculptureAnchor = sceneObjects.sculptureAnchor;

    if (!waterSurface) {
      return;
    }

    const now = clock.elapsedTime;
    let isMoving = true;

    if (boatAnchor) {
      boatAnchor.getWorldPosition(reflectionBoatPosition);
      boatAnchor.getWorldQuaternion(reflectionBoatQuaternion);
    }
    if (sculptureAnchor) {
      sculptureAnchor.getWorldPosition(reflectionSculpturePosition);
      sculptureAnchor.getWorldQuaternion(reflectionSculptureQuaternion);
    }

    if (reflectionTiming.initialized) {
      const cameraMoved = camera.position.distanceToSquared(reflectionTiming.cameraPosition) > REFLECTION_CAMERA_POSITION_EPSILON_SQ
        || quaternionDelta(camera.quaternion, reflectionTiming.cameraQuaternion) > REFLECTION_CAMERA_ROTATION_EPSILON;
      const boatMoved = boatAnchor
        ? (
          reflectionBoatPosition.distanceToSquared(reflectionTiming.boatPosition) > REFLECTION_BOAT_POSITION_EPSILON_SQ
          || quaternionDelta(reflectionBoatQuaternion, reflectionTiming.boatQuaternion) > REFLECTION_BOAT_ROTATION_EPSILON
        )
        : false;
      const sculptureMoved = sculptureAnchor
        ? (
          reflectionSculpturePosition.distanceToSquared(reflectionTiming.sculpturePosition) > REFLECTION_BOAT_POSITION_EPSILON_SQ
          || quaternionDelta(reflectionSculptureQuaternion, reflectionTiming.sculptureQuaternion) > REFLECTION_BOAT_ROTATION_EPSILON
        )
        : false;

      isMoving = cameraMoved || boatMoved || sculptureMoved;
    }

    const minInterval = 1 / Math.max(isMoving ? activeFps : idleFps, 1);
    if ((now - reflectionTiming.lastRenderTime) < minInterval) {
      return;
    }

    reflectionTiming.initialized = true;
    reflectionTiming.lastRenderTime = now;
    reflectionTiming.cameraPosition.copy(camera.position);
    reflectionTiming.cameraQuaternion.copy(camera.quaternion);
    if (boatAnchor) {
      reflectionTiming.boatPosition.copy(reflectionBoatPosition);
      reflectionTiming.boatQuaternion.copy(reflectionBoatQuaternion);
    }
    if (sculptureAnchor) {
      reflectionTiming.sculpturePosition.copy(reflectionSculpturePosition);
      reflectionTiming.sculptureQuaternion.copy(reflectionSculptureQuaternion);
    }

    waterSurface.getWorldPosition(waterSurfaceWorldPosition);
    const mirrorY = waterSurfaceWorldPosition.y;

    // 1. Sync mirror camera with main camera
    reflectionCamera.fov = camera.fov;
    reflectionCamera.aspect = camera.aspect;
    reflectionCamera.near = camera.near;
    reflectionCamera.far = camera.far;
    reflectionCamera.updateProjectionMatrix();

    // 2. Mirror camera across water plane.
    reflectionCameraPosition.copy(camera.position);
    reflectionCameraPosition.y = (mirrorY * 2) - reflectionCameraPosition.y;

    camera.getWorldDirection(mainCameraTargetPosition);
    mainCameraTargetPosition.add(camera.position);
    reflectionTargetPosition.copy(mainCameraTargetPosition);
    reflectionTargetPosition.y = (mirrorY * 2) - reflectionTargetPosition.y;

    reflectionCamera.position.copy(reflectionCameraPosition);
    reflectionCamera.up.copy(camera.up);
    reflectionCamera.up.y *= -1;
    reflectionCamera.lookAt(reflectionTargetPosition);
    reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.matrixWorldInverse.copy(reflectionCamera.matrixWorld).invert();

    // 3. Update reflection data for surface
    reflectionData.current.texture = reflectionTarget.texture;
    reflectionData.current.matrix.copy(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);

    // 4. Render
    if (waterSurface) waterSurface.visible = false;
    if (seabed) seabed.visible = false;
    if (interactionPlane) interactionPlane.visible = false;

    const previousClearAlpha = gl.getClearAlpha();
    gl.getClearColor(reflectionPreviousClearColor);
    gl.setClearColor(DEFAULT_CLEAR_COLOR, 0);
    gl.setRenderTarget(reflectionTarget);
    gl.clear(true, true, true);
    gl.render(scene, reflectionCamera);
    gl.setRenderTarget(null);
    gl.setClearColor(reflectionPreviousClearColor, previousClearAlpha);

    if (waterSurface) waterSurface.visible = true;
    if (seabed) seabed.visible = true;
    if (interactionPlane) interactionPlane.visible = true;
  }, -1);

  return (
    <reflectionContext.Provider value={reflectionData}>
      {children}
    </reflectionContext.Provider>
  );
}

const reflectionContext = React.createContext({ current: { texture: null, matrix: new THREE.Matrix4() } });

// Stencil ref written by the boat hull cap; the water surface skips pixels stamped with it.
const BOAT_CUTOUT_STENCIL_REF = 1;

function WaterLights({ settings, mode, qualityProfile }) {
  const moonDirection = useMemo(() => buildMoonDirection(settings), [settings]);
  const canRunHighShadowCost = (qualityProfile?.shadowMapSize ?? 0) >= 640;
  const shadowsEnabled = settings.shadowsEnabled !== false
    && settings.debugView === 'beauty'
    && (mode === 'editor' || canRunHighShadowCost);
  const shadowMapSize = qualityProfile?.shadowMapSize ?? (mode === 'editor' ? 1024 : 768);
  const localHdriFile = SELF_HOSTED_HDRI[settings.hdrPreset];
  const environmentSource = localHdriFile
    ? { files: `${import.meta.env.BASE_URL}${localHdriFile}` }
    : { preset: settings.hdrPreset };

  return (
    <>
      <ambientLight intensity={settings.ambientIntensity} color={settings.ambientColor} />
      <hemisphereLight
        intensity={settings.hemisphereIntensity}
        color={settings.hemisphereSkyColor}
        groundColor={settings.hemisphereGroundColor}
      />
      <directionalLight
        position={moonDirection.clone().multiplyScalar(18).toArray()}
        intensity={settings.moonIntensity}
        color={settings.moonColor}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={36}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={settings.shadowBias}
        shadow-normalBias={0.02}
        shadow-radius={settings.shadowRadius}
      />
      <Environment
        {...environmentSource}
        background={Boolean(settings.showHdriBackground)}
        environmentIntensity={settings.hdrExposure / 100}
        environmentRotation={[0, THREE.MathUtils.degToRad(settings.hdrRotation), 0]}
      />
    </>
  );
}

function WaterSurface({ settings, runtime, qualityProfile }) {
  const materialRef = useRef();
  const reflectionDataRef = React.useContext(reflectionContext);
  const debugView = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  const meshDensity = Math.min(
    settings.waterMeshDensity,
    qualityProfile?.waterMeshDensityCap ?? settings.waterMeshDensity,
  );
  const moonDirection = useMemo(() => buildMoonDirection(settings), [settings]);
  const uniforms = useMemo(() => ({
    uState: { value: null },
    uNormalMap: { value: null },
    uReflectionTexture: { value: null },
    uReflectionActive: { value: 0 },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uWaveAmplitude: { value: settings.waveAmplitude },
    uWaveChoppiness: { value: settings.waveChoppiness },
    uWaveLength: { value: settings.waveLength },
    uEnvTint: { value: new THREE.Color(settings.envTint) },
    uMoonDirection: { value: moonDirection.clone() },
    uMoonColor: { value: new THREE.Color(settings.moonColor) },
    uMoonSpecularStrength: { value: settings.moonSpecularStrength },
    uMoonSpecularPower: { value: settings.moonSpecularPower },
    uBoatReflectionIntensity: { value: settings.boatReflectionIntensity },
    uWaterDepth: { value: settings.waterDepthMeters },
    uWaterTurbidity: { value: settings.waterTurbidity },
    uDebugView: { value: debugView },
  }), [
    debugView,
    moonDirection,
    settings.envTint,
    settings.moonColor,
    settings.moonSpecularPower,
    settings.moonSpecularStrength,
    settings.boatReflectionIntensity,
    settings.waterDepthMeters,
    settings.waterTurbidity,
    settings.waveAmplitude,
    settings.waveChoppiness,
    settings.waveLength,
  ]);

  useEffect(() => {
    uniforms.uWaveAmplitude.value = settings.waveAmplitude;
    uniforms.uWaveChoppiness.value = settings.waveChoppiness;
    uniforms.uWaveLength.value = settings.waveLength;
    uniforms.uEnvTint.value.set(settings.envTint);
    uniforms.uMoonDirection.value.copy(moonDirection);
    uniforms.uMoonColor.value.set(settings.moonColor);
    uniforms.uMoonSpecularStrength.value = settings.moonSpecularStrength;
    uniforms.uMoonSpecularPower.value = settings.moonSpecularPower;
    uniforms.uBoatReflectionIntensity.value = settings.boatReflectionIntensity;
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uDebugView.value = DEBUG_VIEW_IDS[settings.debugView] ?? 0;

    if (materialRef.current) {
      materialRef.current.envMapIntensity = settings.envReflectionIntensity / 100;
    }
  }, [
    moonDirection,
    settings.debugView,
    settings.envReflectionIntensity,
    settings.envTint,
    settings.moonColor,
    settings.moonSpecularPower,
    settings.moonSpecularStrength,
    settings.boatReflectionIntensity,
    settings.waterDepthMeters,
    settings.waterTurbidity,
    settings.waveAmplitude,
    settings.waveChoppiness,
    settings.waveLength,
    uniforms,
  ]);

  useFrame(() => {
    if (!materialRef.current) {
      return;
    }

    uniforms.uState.value = runtime.currentStateTargetRef.current?.texture ?? null;
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;
    const reflectionTexture = reflectionDataRef.current.texture;
    uniforms.uReflectionActive.value = reflectionTexture ? 1 : 0;
    uniforms.uReflectionTexture.value = reflectionTexture;
    uniforms.uReflectionMatrix.value.copy(reflectionDataRef.current.matrix);
  });

  // Stencil test: skip water pixels stamped by the boat hull cap (the cutout mask).
  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) {
      return;
    }
    material.stencilWrite = true;
    material.stencilRef = BOAT_CUTOUT_STENCIL_REF;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    material.stencilFail = THREE.KeepStencilOp;
    material.stencilZFail = THREE.KeepStencilOp;
    material.stencilZPass = THREE.KeepStencilOp;
    material.needsUpdate = true;
  }, [settings.debugView]);

  return (
    <mesh name="water-surface" rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, meshDensity, meshDensity]} />
      <CustomShaderMaterial
        ref={materialRef}
        baseMaterial={THREE.MeshPhysicalMaterial}
        transparent={settings.debugView === 'beauty'}
        depthWrite={settings.debugView !== 'beauty'}
        side={THREE.DoubleSide}
        color="#0b1119"
        roughness={0.1}
        metalness={0.06}
        clearcoat={1}
        clearcoatRoughness={0.08}
        transmission={settings.debugView === 'beauty' ? 0.32 : 0}
        thickness={1.6}
        ior={1.333}
        envMapIntensity={settings.envReflectionIntensity / 100}
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function Seabed({ settings, runtime }) {
  const materialRef = useRef();
  const { gl } = useThree();
  const debugView = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  const moonDirection = useMemo(() => buildMoonDirection(settings), [settings]);
  const texture = useLoader(THREE.TextureLoader, '/textures/seabed/seabed_texture.webp');

  useLayoutEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  }, [gl, texture]);

  const uniforms = useMemo(() => ({
    uNormalMap: { value: null },
    uStateResolution: { value: new THREE.Vector2(settings.simulationResolution, settings.simulationResolution) },
    uMoonDirection: { value: moonDirection.clone() },
    uMoonColor: { value: new THREE.Color(settings.moonColor) },
    uTime: { value: 0 },
    uWaterDepth: { value: settings.waterDepthMeters },
    uCausticsIntensity: { value: settings.causticsIntensity },
    uCausticsScale: { value: settings.causticsScale },
    uCausticsSharpness: { value: settings.causticsSharpness },
    uReliefStrength: { value: settings.seabedReliefStrength },
    uReliefScale: { value: settings.seabedReliefScale },
    uSeabedTexture: { value: null },
    uSeabedTextureScale: { value: settings.seabedTextureScale },
    uSeabedSaturation: { value: settings.seabedSaturation },
    uSeabedBrightness: { value: settings.seabedBrightness },
    uWaterTurbidity: { value: settings.waterTurbidity },
    uDebugView: { value: debugView },
  }), [
    debugView,
    moonDirection,
    settings.causticsIntensity,
    settings.causticsScale,
    settings.causticsSharpness,
    settings.moonColor,
    settings.seabedReliefScale,
    settings.seabedReliefStrength,
    settings.seabedSaturation,
    settings.seabedBrightness,
    settings.seabedTextureScale,
    settings.simulationResolution,
    settings.waterDepthMeters,
    settings.waterTurbidity,
  ]);

  useEffect(() => {
    uniforms.uMoonDirection.value.copy(moonDirection);
    uniforms.uMoonColor.value.set(settings.moonColor);
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uCausticsIntensity.value = settings.causticsIntensity;
    uniforms.uCausticsScale.value = settings.causticsScale;
    uniforms.uCausticsSharpness.value = settings.causticsSharpness;
    uniforms.uReliefStrength.value = settings.seabedReliefStrength;
    uniforms.uReliefScale.value = settings.seabedReliefScale;
    uniforms.uSeabedTexture.value = texture;
    uniforms.uSeabedTextureScale.value = settings.seabedTextureScale;
    uniforms.uSeabedSaturation.value = settings.seabedSaturation;
    uniforms.uSeabedBrightness.value = settings.seabedBrightness;
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uDebugView.value = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  }, [
    debugView,
    moonDirection,
    settings.causticsIntensity,
    settings.causticsScale,
    settings.causticsSharpness,
    settings.debugView,
    settings.moonColor,
    settings.seabedBrightness,
    settings.seabedReliefScale,
    settings.seabedReliefStrength,
    settings.seabedSaturation,
    settings.seabedTextureScale,
    settings.waterDepthMeters,
    settings.waterTurbidity,
    texture,
    uniforms,
  ]);

  useFrame((state) => {
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uStateResolution.value.set(
      runtime.currentStateTargetRef.current?.width ?? settings.simulationResolution,
      runtime.currentStateTargetRef.current?.height ?? settings.simulationResolution,
    );
  });

  return (
    <mesh
      name="seabed"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -settings.waterDepthMeters, 0]}
      receiveShadow
      renderOrder={0}
    >
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, 192, 192]} />
      <CustomShaderMaterial
        ref={materialRef}
        baseMaterial={THREE.MeshStandardMaterial}
        color="#11161d"
        roughness={0.9}
        metalness={0.02}
        vertexShader={seabedVertexShader}
        fragmentShader={seabedFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function FloatingBoat({ settings, layout, runtime, mode, orbitRef, onBoatPositionChange, probeInterval = BOAT_PROBE_INTERVAL }) {
  const anchorRef = useRef();
  const boatRef = useRef();
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragHitPointRef = useRef(new THREE.Vector3());
  const dragOffsetRef = useRef(new THREE.Vector3());
  const boatAnchorRef = useRef(new THREE.Vector3(
    layout?.boatPosition?.x ?? settings?.boatPosition?.x ?? DEFAULT_BOAT_ANCHOR.x,
    0,
    layout?.boatPosition?.z ?? settings?.boatPosition?.z ?? DEFAULT_BOAT_ANCHOR.z,
  ));
  const targetVector = useRef(new THREE.Vector3());
  const boatMatrixRef = useRef(new THREE.Matrix4());
  const averageNormalRef = useRef(new THREE.Vector3());
  const cursorToBoatRef = useRef(new THREE.Vector2());
  const probeAccumulatorRef = useRef(0);
  const lastProbesRef = useRef(null);
  const probeWorldPointsRef = useRef(BOAT_PROBE_OFFSETS.map(() => new THREE.Vector3()));
  const commitBoatPosition = useCallback((position) => {
    if (typeof onBoatPositionChange !== 'function' || !position) {
      return;
    }

    onBoatPositionChange({
      x: Number(position.x.toFixed(4)),
      z: Number(position.z.toFixed(4)),
    });
  }, [onBoatPositionChange]);
  const applyBoatAnchor = useCallback((x, z) => {
    const halfExtent = settings.waterExtent * 0.5;
    const nextX = clamp(x, -halfExtent, halfExtent);
    const nextZ = clamp(z, -halfExtent, halfExtent);
    boatAnchorRef.current.set(nextX, 0, nextZ);

    if (anchorRef.current) {
      anchorRef.current.position.set(nextX, 0, nextZ);
    }
  }, [settings.waterExtent]);
  const setOrbitEnabled = useCallback((enabled) => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = enabled;
    }
  }, [orbitRef]);

  const boatTextures = useLoader(THREE.TextureLoader, [
    '/models/boat/boat_basecolor.webp',
    '/models/boat/boat_roughness.webp',
    '/models/boat/boat_bump.webp',
  ]);

  const { woodMaterial, metalMaterial } = useMemo(() => {
    const [baseColorMap, roughnessMap, bumpMap] = boatTextures;
    const envReflection = THREE.MathUtils.clamp(settings.envReflectionIntensity / 260, 0.08, 0.48);

    baseColorMap.colorSpace = THREE.SRGBColorSpace;
    [baseColorMap, roughnessMap, bumpMap].forEach((texture) => {
      texture.anisotropy = 8;
    });

    // Wood hull/oars: PBR maps authored in 3ds Max (no more flat-graphite override).
    const wood = new THREE.MeshStandardMaterial({
      map: baseColorMap,
      roughnessMap,
      roughness: 1.0,
      metalness: THREE.MathUtils.clamp(settings.boatMetalness, 0, 0.3),
      bumpMap,
      bumpScale: 0.4,
      envMapIntensity: envReflection,
      side: THREE.DoubleSide,
    });

    // Black metal: oar fittings / brackets (OBJ_wire_metall).
    const metal = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0b0b0d'),
      metalness: 0.85,
      roughness: 0.42,
      envMapIntensity: envReflection,
      side: THREE.DoubleSide,
    });

    return { woodMaterial: wood, metalMaterial: metal };
  }, [boatTextures, settings.boatMetalness, settings.envReflectionIntensity]);

  useEffect(() => () => {
    woodMaterial.dispose();
    metalMaterial.dispose();
  }, [woodMaterial, metalMaterial]);

  useEffect(() => {
    const anchorX = layout?.boatPosition?.x ?? settings?.boatPosition?.x ?? DEFAULT_BOAT_ANCHOR.x;
    const anchorZ = layout?.boatPosition?.z ?? settings?.boatPosition?.z ?? DEFAULT_BOAT_ANCHOR.z;

    if (isDraggingRef.current) {
      return;
    }

    applyBoatAnchor(anchorX, anchorZ);
  }, [applyBoatAnchor, layout?.boatPosition?.x, layout?.boatPosition?.z, settings?.boatPosition?.x, settings?.boatPosition?.z]);
  const handleBoatPointerDown = useCallback((event) => {
    if (mode !== 'editor' || event.button !== 0 || !event.shiftKey) {
      return;
    }

    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    event.target.setPointerCapture?.(event.pointerId);

    isDraggingRef.current = true;
    dragPointerIdRef.current = event.pointerId;
    setOrbitEnabled(false);

    const currentAnchor = anchorRef.current?.position ?? boatAnchorRef.current;
    dragOffsetRef.current.set(
      currentAnchor.x - dragHitPoint.x,
      0,
      currentAnchor.z - dragHitPoint.z,
    );
  }, [mode, setOrbitEnabled]);
  const handleBoatPointerMove = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) {
      return;
    }

    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    applyBoatAnchor(
      dragHitPoint.x + dragOffsetRef.current.x,
      dragHitPoint.z + dragOffsetRef.current.z,
    );
  }, [applyBoatAnchor]);
  const finishBoatDrag = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    event?.stopPropagation?.();
    setOrbitEnabled(true);

    if (dragPointerIdRef.current !== null && event?.target?.releasePointerCapture) {
      event.target.releasePointerCapture(dragPointerIdRef.current);
    }

    isDraggingRef.current = false;
    dragPointerIdRef.current = null;
    commitBoatPosition(anchorRef.current?.position ?? boatAnchorRef.current);
  }, [commitBoatPosition, setOrbitEnabled]);

  useEffect(() => () => {
    setOrbitEnabled(true);
  }, [setOrbitEnabled]);

  useFrame((_, delta) => {
    if (!boatRef.current || settings.debugView !== 'beauty' || !isDocumentCurrentlyVisible()) {
      return;
    }

    const boatAnchor = anchorRef.current?.position ?? boatAnchorRef.current;
    boatAnchorRef.current.copy(boatAnchor);
    const boatHeightOffset = settings.boatHeightOffset ?? 0;
    const boatYawRadians = THREE.MathUtils.degToRad(settings.boatYaw ?? 18);
    boatMatrixRef.current.makeRotationY(boatYawRadians);
    for (let index = 0; index < BOAT_PROBE_OFFSETS.length; index += 1) {
      probeWorldPointsRef.current[index]
        .copy(BOAT_PROBE_OFFSETS[index])
        .applyMatrix4(boatMatrixRef.current)
        .add(boatAnchor);
    }

    // Throttle the expensive probe readback; reuse the last sample between reads.
    probeAccumulatorRef.current += delta;
    let probes = lastProbesRef.current;
    if (probeAccumulatorRef.current >= probeInterval || !probes) {
      probeAccumulatorRef.current = 0;
      const sampled = runtime.sampleBoatProbes(probeWorldPointsRef.current);
      if (sampled) {
        probes = sampled;
        lastProbesRef.current = sampled;
      }
    }

    if (!probes) {
      boatRef.current.position.y = THREE.MathUtils.damp(
        boatRef.current.position.y,
        BOAT_NEUTRAL_Y + boatHeightOffset,
        4.2,
        delta,
      );
      boatRef.current.rotation.x = THREE.MathUtils.damp(boatRef.current.rotation.x, 0, 4.2, delta);
      boatRef.current.rotation.z = THREE.MathUtils.damp(boatRef.current.rotation.z, 0, 4.2, delta);
      boatRef.current.rotation.y = boatYawRadians;
      return;
    }

    const buoyancyGain = Math.max(settings.waveAmplitude * 3.8, 0.12);
    const centerHeight = probes[0].height * buoyancyGain;
    const bowHeight = probes[1].height * buoyancyGain;
    const sternHeight = probes[2].height * buoyancyGain;
    const leftHeight = probes[3].height * buoyancyGain;
    const rightHeight = probes[4].height * buoyancyGain;
    averageNormalRef.current.set(0, 0, 0);
    for (let index = 0; index < probes.length; index += 1) {
      averageNormalRef.current.add(probes[index].normal);
    }
    averageNormalRef.current.normalize();
    const averageNormal = averageNormalRef.current;
    const normalPitch = Math.atan2(-averageNormal.z, Math.max(averageNormal.y, 0.25));
    const normalRoll = Math.atan2(averageNormal.x, Math.max(averageNormal.y, 0.25));

    let targetY = centerHeight + BOAT_NEUTRAL_Y + boatHeightOffset;
    let targetPitch = clamp(
      (Math.atan2(sternHeight - bowHeight, 1.9) * 0.7) + (normalPitch * 0.55),
      -0.28,
      0.28,
    );
    let targetRoll = clamp(
      (Math.atan2(rightHeight - leftHeight, 0.84) * 0.7) + (normalRoll * 0.55),
      -0.34,
      0.34,
    );

    const pointerState = runtime.pointerStateRef.current;
    if (pointerState && Number.isFinite(pointerState.recentImpulseTime)) {
      const impactAge = (performance.now() * 0.001) - pointerState.recentImpulseTime;
      if (impactAge >= 0 && impactAge <= CURSOR_BOAT_IMPACT_DURATION) {
        cursorToBoatRef.current.set(
          boatAnchor.x - pointerState.recentWorldPoint.x,
          boatAnchor.z - pointerState.recentWorldPoint.z,
        );

        const cursorDistance = cursorToBoatRef.current.length();
        const influenceRadius = Math.max(settings.rippleRadius * CURSOR_BOAT_IMPACT_RADIUS_FACTOR, 1.25);
        const proximity = clamp(1 - (cursorDistance / influenceRadius), 0, 1);
        const timeFade = Math.exp(-impactAge * 3.0);
        const cursorImpact = proximity * timeFade * pointerState.recentImpulseStrength;

        if (cursorImpact > 0.001) {
          const invLength = cursorDistance > 0.0001 ? 1 / cursorDistance : 0;
          const directionX = cursorToBoatRef.current.x * invLength;
          const directionZ = cursorToBoatRef.current.y * invLength;
          const oscillation = Math.sin(impactAge * 17.5) * cursorImpact * 0.1;

          targetY += cursorImpact * 0.2;
          targetPitch = clamp(targetPitch + (directionZ * cursorImpact * 0.2) + (oscillation * 0.8), -0.32, 0.32);
          targetRoll = clamp(targetRoll + (-directionX * cursorImpact * 0.24) + (oscillation * 0.8), -0.36, 0.36);
        }
      }
    }

    targetY = clamp(targetY, BOAT_TARGET_Y_MIN + boatHeightOffset, BOAT_TARGET_Y_MAX + boatHeightOffset);
    targetPitch = clamp(targetPitch, -BOAT_MAX_PITCH, BOAT_MAX_PITCH);
    targetRoll = clamp(targetRoll, -BOAT_MAX_ROLL, BOAT_MAX_ROLL);

    targetVector.current.set(0, targetY, 0);
    boatRef.current.position.lerp(targetVector.current, 1 - Math.exp(-delta * 4.5));
    boatRef.current.rotation.y = boatYawRadians;
    boatRef.current.rotation.x = THREE.MathUtils.damp(boatRef.current.rotation.x, targetPitch, 4.5, delta);
    boatRef.current.rotation.z = THREE.MathUtils.damp(boatRef.current.rotation.z, targetRoll, 4.5, delta);
  });

  const obj = useLoader(OBJLoader, '/models/boat/OBJ_boat2.0.obj');

  const clonedObj = useMemo(() => {
    const clone = obj.clone();
    const pickMaterial = (material) => (
      material && material.name === 'OBJ_wire_metall' ? metalMaterial : woodMaterial
    );
    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      // Keep the model's own (custom) normals — do NOT recompute.
      child.material = Array.isArray(child.material)
        ? child.material.map(pickMaterial)
        : pickMaterial(child.material);
      child.castShadow = true;
      child.receiveShadow = true;
    });
    clone.scale.setScalar(settings.boatScale);
    clone.rotateY(Math.PI); // bow orientation — fine-tune via boatYaw if needed
    return clone;
  }, [obj, woodMaterial, metalMaterial, settings.boatScale]);

  // Auto-fit the cutout to the hull: take the largest sub-mesh footprint (the hull, not the
  // thin oars) in boat-local space, so the cap self-centres and self-sizes — no manual offset.
  const hullFootprint = useMemo(() => {
    clonedObj.updateMatrixWorld(true);
    const meshBox = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    const best = { center: new THREE.Vector3(0, 0, 0), size: new THREE.Vector3(0.84, 0.4, 1.9), area: -1 };

    clonedObj.traverse((child) => {
      if (!child.isMesh || !child.geometry) {
        return;
      }
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) {
        return;
      }
      meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
      meshBox.getSize(size);
      const area = size.x * size.z;
      if (area > best.area) {
        best.area = area;
        meshBox.getCenter(center);
        best.center.copy(center);
        best.size.copy(size);
      }
    });

    return { center: best.center.clone(), size: best.size.clone() };
  }, [clonedObj]);

  if (settings.debugView !== 'beauty') {
    return null;
  }

  const cutoutActive = settings.boatCutoutFitWidth > 0.05 && settings.boatCutoutFitLength > 0.05;
  const cutoutDebug = Boolean(settings.boatCutoutDebug);
  const capScaleX = Math.max(hullFootprint.size.x * settings.boatCutoutFitWidth, 0.01);
  const capScaleZ = Math.max(hullFootprint.size.z * settings.boatCutoutFitLength, 0.01);

  return (
    <>
      <group
        ref={anchorRef}
        name="boat-anchor"
        onPointerDown={handleBoatPointerDown}
        onPointerMove={handleBoatPointerMove}
        onPointerUp={finishBoatDrag}
        onPointerCancel={finishBoatDrag}
        onLostPointerCapture={finishBoatDrag}
      >
        <group ref={boatRef} name="boat">
          <primitive object={clonedObj} />
          {/* Hull cap: stamps the stencil buffer so the water surface skips the boat's
              footprint. Parented to the boat, so it follows pitch/roll/heave exactly.
              Debug mode paints it magenta on top instead of masking. */}
          <mesh
            name="boat-cutout-cap"
            visible={cutoutActive}
            position={[hullFootprint.center.x, hullFootprint.center.y, hullFootprint.center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[capScaleX, capScaleZ, 1]}
            renderOrder={cutoutDebug ? 30 : 2}
          >
            <circleGeometry args={[0.5, 64]} />
            <meshBasicMaterial
              color={cutoutDebug ? '#ff00ff' : '#ffffff'}
              side={THREE.DoubleSide}
              transparent={cutoutDebug}
              opacity={cutoutDebug ? 0.55 : 1}
              colorWrite={cutoutDebug}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
              stencilWrite={!cutoutDebug}
              stencilRef={BOAT_CUTOUT_STENCIL_REF}
              stencilFunc={THREE.AlwaysStencilFunc}
              stencilZPass={THREE.ReplaceStencilOp}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}

function StaticSculpture({ settings, layout, mode, orbitRef, onSculpturePositionChange }) {
  const anchorRef = useRef();
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragHitPointRef = useRef(new THREE.Vector3());
  const dragOffsetRef = useRef(new THREE.Vector3());
  const sculptureAnchorRef = useRef(new THREE.Vector3(
    layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x,
    0,
    layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z,
  ));
  const setOrbitEnabled = useCallback((enabled) => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = enabled;
    }
  }, [orbitRef]);
  const seabedY = (-settings.waterDepthMeters) + settings.sculptureBottomOffset;
  const commitSculpturePosition = useCallback((position) => {
    if (typeof onSculpturePositionChange !== 'function' || !position) {
      return;
    }

    onSculpturePositionChange({
      x: Number(position.x.toFixed(4)),
      z: Number(position.z.toFixed(4)),
    });
  }, [onSculpturePositionChange]);
  const applySculptureAnchor = useCallback((x, z) => {
    const halfExtent = Math.max((settings.waterExtent * 0.5) - SCULPTURE_DRAG_EDGE_MARGIN, 0.1);
    const nextX = clamp(x, -halfExtent, halfExtent);
    const nextZ = clamp(z, -halfExtent, halfExtent);
    sculptureAnchorRef.current.set(nextX, 0, nextZ);

    if (anchorRef.current) {
      anchorRef.current.position.set(nextX, seabedY, nextZ);
    }
  }, [settings.waterExtent, seabedY]);

  const sculptureMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(settings.sculptureColor),
    metalness: settings.sculptureMetalness,
    roughness: settings.sculptureRoughness,
    clearcoat: settings.sculptureClearcoat,
    clearcoatRoughness: settings.sculptureClearcoatRoughness,
    envMapIntensity: THREE.MathUtils.clamp(settings.envReflectionIntensity / 220, 0.08, 0.6),
    transmission: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  }), [
    settings.envReflectionIntensity,
    settings.sculptureClearcoat,
    settings.sculptureClearcoatRoughness,
    settings.sculptureColor,
    settings.sculptureMetalness,
    settings.sculptureRoughness,
  ]);

  useEffect(() => () => {
    sculptureMaterial.dispose();
  }, [sculptureMaterial]);

  useEffect(() => {
    const anchorX = layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x;
    const anchorZ = layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z;

    if (isDraggingRef.current) {
      return;
    }

    applySculptureAnchor(anchorX, anchorZ);
  }, [applySculptureAnchor, layout?.sculpturePosition?.x, layout?.sculpturePosition?.z, settings?.sculpturePosition?.x, settings?.sculpturePosition?.z]);

  useEffect(() => {
    if (!anchorRef.current) {
      return;
    }

    anchorRef.current.position.y = seabedY;
  }, [seabedY]);

  const handleSculpturePointerDown = useCallback((event) => {
    if (mode !== 'editor' || event.button !== 0 || !event.shiftKey) {
      return;
    }

    dragPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -seabedY);
    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    event.target.setPointerCapture?.(event.pointerId);
    isDraggingRef.current = true;
    dragPointerIdRef.current = event.pointerId;
    setOrbitEnabled(false);

    const currentAnchor = anchorRef.current?.position ?? sculptureAnchorRef.current;
    dragOffsetRef.current.set(
      currentAnchor.x - dragHitPoint.x,
      0,
      currentAnchor.z - dragHitPoint.z,
    );
  }, [mode, seabedY, setOrbitEnabled]);

  const handleSculpturePointerMove = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) {
      return;
    }

    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    applySculptureAnchor(
      dragHitPoint.x + dragOffsetRef.current.x,
      dragHitPoint.z + dragOffsetRef.current.z,
    );
  }, [applySculptureAnchor]);

  const finishSculptureDrag = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    event?.stopPropagation?.();
    setOrbitEnabled(true);

    if (dragPointerIdRef.current !== null && event?.target?.releasePointerCapture) {
      event.target.releasePointerCapture(dragPointerIdRef.current);
    }

    isDraggingRef.current = false;
    dragPointerIdRef.current = null;
    commitSculpturePosition(anchorRef.current?.position ?? sculptureAnchorRef.current);
  }, [commitSculpturePosition, setOrbitEnabled]);

  useEffect(() => () => {
    setOrbitEnabled(true);
  }, [setOrbitEnabled]);

  const obj = useLoader(OBJLoader, '/models/sculpture/sculpture.obj');
  const normalizedObj = useMemo(() => {
    const clone = obj.clone();
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());

    clone.position.set(-center.x, -bounds.min.y, -center.z);
    return clone;
  }, [obj]);
  const clonedObj = useMemo(() => {
    const clone = normalizedObj.clone();

    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.material = sculptureMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [normalizedObj, sculptureMaterial]);

  if (settings.debugView !== 'beauty') {
    return null;
  }

  return (
    <group
      ref={anchorRef}
      name="sculpture-anchor"
      rotation={[
        THREE.MathUtils.degToRad(settings.sculptureRotationX),
        THREE.MathUtils.degToRad(settings.sculptureRotationY),
        THREE.MathUtils.degToRad(settings.sculptureRotationZ),
      ]}
      scale={[settings.sculptureScale, settings.sculptureScale, settings.sculptureScale]}
      onPointerDown={handleSculpturePointerDown}
      onPointerMove={handleSculpturePointerMove}
      onPointerUp={finishSculptureDrag}
      onPointerCancel={finishSculptureDrag}
      onLostPointerCapture={finishSculptureDrag}
    >
      <group name="sculpture">
        <primitive object={clonedObj} />
      </group>
    </group>
  );
}

function SceneReadyBeacon({ onSceneReady }) {
  const { active } = useProgress();
  const didNotifyRef = useRef(false);
  const stableFramesRef = useRef(0);

  useFrame(() => {
    if (typeof onSceneReady !== 'function' || didNotifyRef.current) {
      return;
    }

    if (active) {
      stableFramesRef.current = 0;
      return;
    }

    stableFramesRef.current += 1;
    if (stableFramesRef.current < 3) {
      return;
    }

    didNotifyRef.current = true;
    onSceneReady();
  });

  return null;
}

function WaterRuntimeScene({
  settings,
  mode,
  layoutOverride,
  onCameraRigApi,
  onBoatPositionChange,
  onSculpturePositionChange,
  onSceneReady,
}) {
  const { size } = useThree();
  const qualityProfile = useMemo(
    () => buildRuntimeQualityProfile(mode, size.width),
    [mode, size.width],
  );
  const runtime = useWaterRuntime(settings, qualityProfile);
  const orbitRef = useRef();
  const showDebugHelpers = mode === 'editor' && settings.debugView !== 'beauty';
  const reflectionsEnabled = settings.debugView === 'beauty'
    && settings.boatReflectionIntensity > 0.01
    && !qualityProfile.isLowPower;
  // Pick the composition bucket: editor forces the one being edited; the public site
  // derives it from the window orientation + the physical monitor aspect (chrome-independent).
  const hasWindow = typeof window !== 'undefined';
  const viewportWidth = hasWindow ? window.innerWidth : size.width;
  const viewportHeight = hasWindow ? window.innerHeight : size.height;
  const screenWidth = hasWindow && window.screen ? window.screen.width : viewportWidth;
  const screenHeight = hasWindow && window.screen ? window.screen.height : viewportHeight;
  const activeLayoutKey = layoutOverride
    ?? resolveLayoutKey(viewportWidth, viewportHeight, screenWidth, screenHeight);
  const activeLayout = resolveLayout(settings.layouts, activeLayoutKey);

  return (
    <>
      <color attach="background" args={['#040507']} />
      <WaterCameraRig
        mode={mode}
        layout={activeLayout}
        onCameraRigApi={onCameraRigApi}
        orbitRef={orbitRef}
      />
      <WaterReflections
        enabled={reflectionsEnabled}
        textureSize={qualityProfile.reflectionTextureSize}
        activeFps={qualityProfile.reflectionActiveFps}
        idleFps={qualityProfile.reflectionIdleFps}
      >
        <WaterLights settings={settings} mode={mode} qualityProfile={qualityProfile} />
        <Seabed settings={settings} runtime={runtime} />
        <WaterSurface settings={settings} runtime={runtime} qualityProfile={qualityProfile} />
        <FloatingBoat
          settings={settings}
          layout={activeLayout}
          runtime={runtime}
          mode={mode}
          orbitRef={orbitRef}
          onBoatPositionChange={onBoatPositionChange}
          probeInterval={qualityProfile.boatProbeInterval}
        />
        <StaticSculpture
          settings={settings}
          layout={activeLayout}
          mode={mode}
          orbitRef={orbitRef}
          onSculpturePositionChange={onSculpturePositionChange}
        />
        <WaterInteractionPlane
          settings={settings}
          pointerStateRef={runtime.pointerStateRef}
          sampleBoatProbes={runtime.sampleBoatProbes}
          enableSurfaceRefine={!qualityProfile.isLowPower}
        />
      </WaterReflections>
      <SceneReadyBeacon onSceneReady={onSceneReady} />
      {showDebugHelpers ? <axesHelper args={[2]} /> : null}
      {showDebugHelpers ? (
        <gridHelper
          args={[settings.waterExtent, 12, '#334a64', '#182230']}
          position={[0, -settings.waterDepthMeters, 0]}
        />
      ) : null}
    </>
  );
}

const WaterScene = ({
  settings: settingsProp,
  mode = 'public',
  sceneId = 'water-scene',
  testId,
  fallbackTestId,
  layoutOverride,
  onCameraRigApi,
  onBoatPositionChange,
  onSculpturePositionChange,
  onSceneReady,
}) => {
  const settings = settingsProp ?? getBaseHomeSceneSettings();

  return (
    <SceneCanvas
      sceneId={sceneId}
      mode={mode}
      testId={testId}
      fallbackTestId={fallbackTestId}
      settings={settings}
      camera={{ position: PUBLIC_CAMERA_POSITION, fov: settings.cameraFov }}
      style={{ background: '#040507' }}
    >
      <WaterRuntimeScene
        settings={settings}
        mode={mode}
        layoutOverride={layoutOverride}
        onCameraRigApi={onCameraRigApi}
        onBoatPositionChange={onBoatPositionChange}
        onSculpturePositionChange={onSculpturePositionChange}
        onSceneReady={onSceneReady}
      />
    </SceneCanvas>
  );
};

export default WaterScene;
