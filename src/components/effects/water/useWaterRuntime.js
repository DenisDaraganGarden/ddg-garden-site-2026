import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createPass,
  createTarget,
  disposePass,
  restoreDefaultFramebuffer,
} from './renderTargets';
import {
  DEFAULT_CLEAR_COLOR,
  clamp,
  isDocumentCurrentlyVisible,
  resolveRuntimeSimulationResolution,
} from './constants';
import {
  normalFragmentShader,
  probeFragmentShader,
  simulationFragmentShader,
} from '../shaders/waterRuntimeShaders';
import {
  enqueueWaterImpulse,
  takeNextWaterImpulse,
  WATER_IMPULSE_QUEUE_LIMIT,
} from './waterImpulseQueue';

// The wave simulation: a ping-pong height field advanced on the GPU, plus the
// derived normal and probe passes the rest of the scene reads from.

const WATER_SURFACE_SAMPLE_CACHE_MS = 50;

export function useWaterRuntime(settings, qualityProfile, mode) {
  const { gl } = useThree();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stateRef = useRef(null);
  const normalTargetRef = useRef(null);
  // External actors (a falling bird, for example) must not overwrite the cursor's
  // one-frame input slot. The simulation only supports one impulse per tick, so a
  // short FIFO gives those actors a bounded, deterministic path into that slot.
  const impulseQueueRef = useRef([]);
  const pointerStateRef = useRef({
    uv: new THREE.Vector2(0.5, 0.5),
    impulseUv: new THREE.Vector2(0.5, 0.5),
    impulseStrength: 0,
    impulseWorldPoint: new THREE.Vector3(0, 0, 0),
    hasImpulse: false,
    isInside: false,
    recentWorldPoint: new THREE.Vector3(0, 0, 0),
    recentImpulseStrength: 0,
    recentImpulseTime: -Infinity,
    recentImpulseSerial: 0,
    recentImpulseSource: 'none',
  });
  const simulationAccumulatorRef = useRef(0);
  const probeBufferRef = useRef(new Uint8Array(5 * 4));
  const probeReadState = useRef({ pending: false, hasData: false });
  const probeResultsRef = useRef(Array.from(
    { length: 5 },
    () => ({ height: 0, normal: new THREE.Vector3(0, 1, 0) }),
  ));
  const surfaceSamplePointsRef = useRef(Array.from(
    { length: 5 },
    () => new THREE.Vector3(),
  ));
  const surfaceSampleCacheRef = useRef({
    x: Infinity,
    z: Infinity,
    sampledAt: -Infinity,
    result: {
      height: 0,
      worldY: 0,
      normal: new THREE.Vector3(0, 1, 0),
    },
  });
  const effectiveResolution = resolveRuntimeSimulationResolution(
    settings.simulationResolution,
    mode,
    qualityProfile.simulationMaxResolution,
  );
  const worldToUv = useCallback((x, z) => {
    const halfExtent = settings.waterExtent * 0.5;

    return new THREE.Vector2(
      clamp((x + halfExtent) / settings.waterExtent, 0.001, 0.999),
      clamp((halfExtent - z) / settings.waterExtent, 0.001, 0.999),
    );
  }, [settings.waterExtent]);

  const emitWaterImpulse = useCallback((worldPoint, {
    strength = 0.8,
    source = 'external',
    affectsBoat = true,
    priority = 0,
  } = {}) => {
    if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.z)) {
      return false;
    }

    const halfExtent = settings.waterExtent * 0.5;
    if (Math.abs(worldPoint.x) > halfExtent || Math.abs(worldPoint.z) > halfExtent) {
      return false;
    }

    const impulseStrength = clamp(Number(strength) || 0, 0.01, 1);
    if (impulseStrength <= 0.01) {
      return false;
    }

    return enqueueWaterImpulse(impulseQueueRef.current, {
      uv: worldToUv(worldPoint.x, worldPoint.z),
      worldPoint: new THREE.Vector3(worldPoint.x, worldPoint.y || 0, worldPoint.z),
      strength: impulseStrength,
      source,
      affectsBoat: Boolean(affectsBoat),
      priority,
    }, WATER_IMPULSE_QUEUE_LIMIT);
  }, [settings.waterExtent, worldToUv]);

  const renderState = useMemo(() => {
    const runtimeSettings = settingsRef.current;
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
      uRippleRadius: { value: runtimeSettings.rippleRadius },
      uRippleImpulse: { value: runtimeSettings.rippleImpulse },
      uDamping: { value: runtimeSettings.rippleDamping },
      uDelta: { value: 1 / 60 },
      uTime: { value: 0 },
      uAmbientWaveIntensity: { value: runtimeSettings.ambientWaveIntensity },
      uAmbientWaveSpeed: { value: runtimeSettings.ambientWaveSpeed },
      uWaveLength: { value: runtimeSettings.waveLength },
    });
    const normalPass = createPass(normalFragmentShader, {
      uState: { value: read.texture },
      uResolution: { value: new THREE.Vector2(effectiveResolution, effectiveResolution) },
      uNormalStrength: { value: runtimeSettings.normalStrength },
      uNormalBlur: { value: runtimeSettings.normalBlur },
      uWaveLength: { value: runtimeSettings.waveLength },
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
  // GPU render targets and full-screen passes only depend on their resolution.
  // Artistic settings are refreshed on the existing uniforms in useFrame below.
  // Recreating these resources for every slider event caused large interaction
  // stalls and looked like a VRAM leak while dragging controls.
  }, [effectiveResolution]);

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
    const cursorImpulseActive = pointerState.hasImpulse;
    const cursorImpulse = cursorImpulseActive ? {
      uv: pointerState.impulseUv,
      worldPoint: pointerState.impulseWorldPoint,
      strength: pointerState.impulseStrength,
      source: 'cursor',
      affectsBoat: true,
      priority: 5,
    } : null;
    const { event: activeImpulse, usedDirect } = takeNextWaterImpulse(
      impulseQueueRef.current,
      cursorImpulse,
    );
    const rippleRadiusUv = clamp(settings.rippleRadius / settings.waterExtent, 0.0025, 0.12);

    if (activeImpulse?.affectsBoat && activeImpulse.worldPoint) {
      // The boat only sees an impulse after the simulation accepted it. A serial
      // makes every event one-shot; boat wakes deliberately opt out so they
      // cannot push the hull that created them.
      pointerState.recentWorldPoint.copy(activeImpulse.worldPoint);
      pointerState.recentImpulseStrength = activeImpulse.strength;
      pointerState.recentImpulseTime = performance.now() * 0.001;
      pointerState.recentImpulseSerial += 1;
      pointerState.recentImpulseSource = activeImpulse.source ?? 'external';
    }

    renderState.simulationPass.material.uniforms.uState.value = renderState.read.texture;
    renderState.simulationPass.material.uniforms.uResolution.value.set(effectiveResolution, effectiveResolution);
    renderState.simulationPass.material.uniforms.uPointerUv.value.copy(activeImpulse?.uv ?? pointerState.impulseUv);
    renderState.simulationPass.material.uniforms.uImpulseActive.value = activeImpulse ? 1 : 0;
    renderState.simulationPass.material.uniforms.uImpulseStrength.value = activeImpulse?.strength ?? 0;
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
    if (usedDirect) {
      pointerState.hasImpulse = false;
      pointerState.impulseStrength = 0;
    }
  }, -10);

  const decodeProbeBuffer = useCallback(() => {
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
  }, []);

  // A synchronous readback stalls the CPU until the GPU has drained everything
  // already queued - reflection, refraction, the whole frame. The boat pays it
  // 20 times a second, the fish 8, and every seagull shot down onto the water
  // adds 12 more; that sum is exactly the stutter reported while shooting.
  // The physics on the other side of this call is spring-filtered and already
  // tolerates the 50 ms probe interval, so a result that is one fence late is
  // indistinguishable - and a fenced read costs the CPU nothing.
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

    if (gl.capabilities.isWebGL2) {
      if (!probeReadState.current.pending) {
        probeReadState.current.pending = true;
        gl.readRenderTargetPixelsAsync(renderState.probe, 0, 0, 5, 1, probeBufferRef.current)
          .then(() => {
            decodeProbeBuffer();
            probeReadState.current.hasData = true;
          })
          .catch(() => {})
          .finally(() => {
            probeReadState.current.pending = false;
          });
      }
      restoreDefaultFramebuffer(gl);
      // The first call has nothing to hand back yet; every caller already
      // treats null as "keep what you had".
      return probeReadState.current.hasData ? probeResultsRef.current : null;
    }

    // WebGL1 has no fence to wait on, so the stall is the only way to read.
    gl.readRenderTargetPixels(renderState.probe, 0, 0, 5, 1, probeBufferRef.current);
    restoreDefaultFramebuffer(gl);
    decodeProbeBuffer();
    return probeResultsRef.current;
  }, [decodeProbeBuffer, gl, renderState, worldToUv]);

  const sampleWaterSurface = useCallback((worldPoint) => {
    if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.z)) {
      return null;
    }

    const halfExtent = settings.waterExtent * 0.5;
    if (Math.abs(worldPoint.x) > halfExtent || Math.abs(worldPoint.z) > halfExtent) {
      return null;
    }

    const now = performance.now();
    const cache = surfaceSampleCacheRef.current;
    const unchangedPosition = Math.abs(cache.x - worldPoint.x) < 0.01
      && Math.abs(cache.z - worldPoint.z) < 0.01;
    if (unchangedPosition && (now - cache.sampledAt) < WATER_SURFACE_SAMPLE_CACHE_MS) {
      return cache.result;
    }

    // The probe pass is fixed at five texels. Repeating the same point lets a
    // caller ask for one surface sample without allocating a second GPU pathway.
    const points = surfaceSamplePointsRef.current;
    for (let index = 0; index < points.length; index += 1) {
      points[index].set(worldPoint.x, worldPoint.y || 0, worldPoint.z);
    }
    const probes = sampleBoatProbes(points);
    if (!probes) {
      return null;
    }

    cache.x = worldPoint.x;
    cache.z = worldPoint.z;
    cache.sampledAt = now;
    cache.result.height = probes[0].height;
    // The visible water mesh applies this same vertical scale. Its base plane is
    // currently world y=0; a future translated surface can add its world origin.
    cache.result.worldY = probes[0].height * settings.waveAmplitude;
    cache.result.normal.copy(probes[0].normal);
    return cache.result;
  }, [sampleBoatProbes, settings.waterExtent, settings.waveAmplitude]);

  return {
    currentStateTargetRef: stateRef,
    normalTargetRef,
    pointerStateRef,
    emitWaterImpulse,
    sampleBoatProbes,
    sampleWaterSurface,
    effectiveResolution,
  };
}
