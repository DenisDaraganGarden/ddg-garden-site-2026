import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Environment, OrbitControls } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import {
  getBaseHomeSceneSettings,
} from '../../features/home-scene/hooks/useHomeSceneSettings';
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
const MOBILE_CAMERA_POSITION = [0, 5.1, 7.3];
const DEFAULT_CLEAR_COLOR = '#000000';
const DRAWING_BUFFER_SIZE = new THREE.Vector2();
const BOAT_ANCHOR = new THREE.Vector3(2.1, 0, -1.4);
const BOAT_ANCHOR_ARRAY = BOAT_ANCHOR.toArray();
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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

function WaterCameraRig({ mode, settings }) {
  const { camera, size } = useThree();
  const controlsRef = useRef();

  useLayoutEffect(() => {
    const cameraPosition = size.width < 768 ? MOBILE_CAMERA_POSITION : PUBLIC_CAMERA_POSITION;

    camera.position.set(...cameraPosition);
    camera.fov = settings.cameraFov;
    camera.near = 0.1;
    camera.far = 80;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }, [camera, settings.cameraFov, size.width]);

  useFrame(() => {
    if (mode === 'editor' && controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, -20);

  if (mode !== 'editor') {
    return null;
  }

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={18}
      minPolarAngle={0.45}
      maxPolarAngle={1.35}
      target={[0, 0, 0]}
    />
  );
}

function useWaterRuntime(settings) {
  const { gl, size } = useThree();
  const stateRef = useRef(null);
  const normalTargetRef = useRef(null);
  const pointerStateRef = useRef({
    uv: new THREE.Vector2(0.5, 0.5),
    impulseUv: new THREE.Vector2(0.5, 0.5),
    impulseStrength: 0,
    hasImpulse: false,
    isInside: false,
  });
  const probeBufferRef = useRef(new Uint8Array(5 * 4));
  const probeResultsRef = useRef(Array.from(
    { length: 5 },
    () => ({ height: 0, normal: new THREE.Vector3(0, 1, 0) }),
  ));
  const isMobile = size.width < 768;
  const effectiveResolution = isMobile
    ? Math.min(settings.simulationResolution, 256)
    : settings.simulationResolution;

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
    const pointerState = pointerStateRef.current;
    const rippleRadiusUv = clamp(settings.rippleRadius / settings.waterExtent, 0.0025, 0.12);

    renderState.simulationPass.material.uniforms.uState.value = renderState.read.texture;
    renderState.simulationPass.material.uniforms.uResolution.value.set(effectiveResolution, effectiveResolution);
    renderState.simulationPass.material.uniforms.uPointerUv.value.copy(pointerState.impulseUv);
    renderState.simulationPass.material.uniforms.uImpulseActive.value = pointerState.hasImpulse ? 1 : 0;
    renderState.simulationPass.material.uniforms.uImpulseStrength.value = pointerState.impulseStrength;
    renderState.simulationPass.material.uniforms.uRippleRadius.value = rippleRadiusUv;
    renderState.simulationPass.material.uniforms.uRippleImpulse.value = settings.rippleImpulse;
    renderState.simulationPass.material.uniforms.uDamping.value = settings.rippleDamping;
    renderState.simulationPass.material.uniforms.uDelta.value = Math.min(delta, 1 / 20);
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
      clamp((z + halfExtent) / settings.waterExtent, 0.001, 0.999),
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

function WaterInteractionPlane({ settings, pointerStateRef }) {
  const resetPointerState = useCallback(() => {
    pointerStateRef.current.hasImpulse = false;
    pointerStateRef.current.impulseStrength = 0;
    pointerStateRef.current.isInside = false;
  }, [pointerStateRef]);

  const registerPointerImpulse = useCallback((uv, strength = 0.22) => {
    if (!uv) {
      return;
    }

    const pointerState = pointerStateRef.current;
    const delta = uv.clone().sub(pointerState.uv);
    const deltaStrength = clamp(delta.length() * 28, 0, 1);

    pointerState.uv.copy(uv);

    if (!pointerState.isInside) {
      pointerState.impulseUv.copy(uv);
      pointerState.isInside = true;
      return;
    }

    const impulseStrength = Math.max(strength, deltaStrength);

    if (impulseStrength <= 0.01) {
      return;
    }

    pointerState.impulseUv.copy(uv);
    pointerState.impulseStrength = clamp(impulseStrength, 0.08, 1);
    pointerState.hasImpulse = true;
  }, [pointerStateRef]);

  return (
    <mesh
      name="water-interaction-plane"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.05, 0]}
      onPointerEnter={(event) => {
        if (event.uv) {
          pointerStateRef.current.uv.copy(event.uv);
          pointerStateRef.current.impulseUv.copy(event.uv);
          pointerStateRef.current.isInside = true;
        }
      }}
      onPointerMove={(event) => {
        registerPointerImpulse(event.uv, 0);
      }}
      onPointerDown={(event) => {
        registerPointerImpulse(event.uv, 0.24);
      }}
      onPointerLeave={resetPointerState}
      onPointerOut={resetPointerState}
    >
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WaterLights({ settings, mode }) {
  const moonDirection = useMemo(() => buildMoonDirection(settings), [settings]);
  const shadowMapSize = mode === 'editor' ? 2048 : 1024;

  return (
    <>
      <ambientLight intensity={0.11} color="#202635" />
      <hemisphereLight intensity={0.26} color="#314762" groundColor="#020305" />
      <directionalLight
        position={moonDirection.clone().multiplyScalar(18).toArray()}
        intensity={settings.moonIntensity}
        color={settings.moonColor}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={36}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0002}
      />
      <Environment
        preset={settings.hdrPreset}
        background={false}
        environmentIntensity={settings.hdrExposure / 100}
        environmentRotation={[0, THREE.MathUtils.degToRad(settings.hdrRotation), 0]}
      />
    </>
  );
}

function WaterSurface({ settings, runtime }) {
  const materialRef = useRef();
  const { size } = useThree();
  const debugView = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  const meshDensity = size.width < 768
    ? Math.min(settings.waterMeshDensity, 192)
    : settings.waterMeshDensity;
  const moonDirection = useMemo(() => buildMoonDirection(settings), [settings]);
  const uniforms = useMemo(() => ({
    uState: { value: null },
    uNormalMap: { value: null },
    uWaveAmplitude: { value: settings.waveAmplitude },
    uWaveChoppiness: { value: settings.waveChoppiness },
    uWaveLength: { value: settings.waveLength },
    uEnvTint: { value: new THREE.Color(settings.envTint) },
    uMoonDirection: { value: moonDirection.clone() },
    uMoonColor: { value: new THREE.Color(settings.moonColor) },
    uMoonSpecularStrength: { value: settings.moonSpecularStrength },
    uMoonSpecularPower: { value: settings.moonSpecularPower },
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
  });

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
    uState: { value: null },
    uNormalMap: { value: null },
    uStateResolution: { value: new THREE.Vector2(settings.simulationResolution, settings.simulationResolution) },
    uMoonDirection: { value: moonDirection.clone() },
    uMoonColor: { value: new THREE.Color(settings.moonColor) },
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

  useFrame(() => {
    uniforms.uState.value = runtime.currentStateTargetRef.current?.texture ?? null;
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;
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

function FloatingBoat({ settings, runtime }) {
  const groupRef = useRef();
  const yawRef = useRef(THREE.MathUtils.degToRad(18));
  const targetVector = useRef(new THREE.Vector3());
  const boatMatrixRef = useRef(new THREE.Matrix4());
  const averageNormalRef = useRef(new THREE.Vector3());
  const probeWorldPointsRef = useRef(BOAT_PROBE_OFFSETS.map(() => new THREE.Vector3()));

  const boatMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: settings.boatColor,
    metalness: settings.boatMetalness,
    roughness: settings.boatRoughness,
    clearcoat: settings.boatClearcoat,
    clearcoatRoughness: settings.boatClearcoatRoughness,
    envMapIntensity: settings.envReflectionIntensity / 100,
  }), [
    settings.boatColor,
    settings.boatMetalness,
    settings.boatRoughness,
    settings.boatClearcoat,
    settings.boatClearcoatRoughness,
    settings.envReflectionIntensity,
  ]);

  useEffect(() => () => {
    boatMaterial.dispose();
  }, [boatMaterial]);

  useFrame((_, delta) => {
    if (!groupRef.current || settings.debugView !== 'beauty') {
      return;
    }

    boatMatrixRef.current.makeRotationY(yawRef.current);
    for (let index = 0; index < BOAT_PROBE_OFFSETS.length; index += 1) {
      probeWorldPointsRef.current[index]
        .copy(BOAT_PROBE_OFFSETS[index])
        .applyMatrix4(boatMatrixRef.current)
        .add(BOAT_ANCHOR);
    }

    const probes = runtime.sampleBoatProbes(probeWorldPointsRef.current);

    if (!probes) {
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

    const targetY = centerHeight + 0.18;
    const targetPitch = clamp(
      (Math.atan2(sternHeight - bowHeight, 1.9) * 0.7) + (normalPitch * 0.55),
      -0.28,
      0.28,
    );
    const targetRoll = clamp(
      (Math.atan2(rightHeight - leftHeight, 0.84) * 0.7) + (normalRoll * 0.55),
      -0.34,
      0.34,
    );

    targetVector.current.set(BOAT_ANCHOR.x, targetY, BOAT_ANCHOR.z);
    groupRef.current.position.lerp(targetVector.current, 1 - Math.exp(-delta * 4.5));
    groupRef.current.rotation.y = yawRef.current;
    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetPitch, 4.5, delta);
    groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, targetRoll, 4.5, delta);
  });

  const obj = useLoader(OBJLoader, '/models/boat/OBJ.obj');

  const clonedObj = useMemo(() => {
    const clone = obj.clone();
    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = boatMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    // Adjust scale and orientation if needed. 
    // Usually OBJs from free3D etc need some normalization.
    clone.scale.setScalar(settings.boatScale); 
    clone.rotateY(Math.PI); // Adjust if bow is pointing wrong way
    return clone;
  }, [obj, boatMaterial, settings.boatScale]);

  if (settings.debugView !== 'beauty') {
    return null;
  }

  return (
    <group ref={groupRef} name="boat" position={BOAT_ANCHOR_ARRAY}>
      <primitive object={clonedObj} />
    </group>
  );
}

function WaterRuntimeScene({ settings, mode }) {
  const runtime = useWaterRuntime(settings);
  const showDebugHelpers = mode === 'editor' && settings.debugView !== 'beauty';

  return (
    <>
      <color attach="background" args={['#040507']} />
      <WaterCameraRig mode={mode} settings={settings} />
      <WaterLights settings={settings} mode={mode} />
      <Seabed settings={settings} runtime={runtime} />
      <WaterSurface settings={settings} runtime={runtime} />
      <FloatingBoat settings={settings} runtime={runtime} />
      <WaterInteractionPlane settings={settings} pointerStateRef={runtime.pointerStateRef} />
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
      <WaterRuntimeScene settings={settings} mode={mode} />
    </SceneCanvas>
  );
};

export default WaterScene;
