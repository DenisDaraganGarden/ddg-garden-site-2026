import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import StudioWaterReflection from './StudioWaterReflection';
import SceneLight from './SceneLight';
import { useLabLightMode } from './labLighting';

const STUDIO_BACKGROUND = '#f5f4f0';
const STUDIO_SHADOWS = { type: THREE.PCFShadowMap };

const CAMERA_VIEWS = {
  school: {
    landscape: { position: [3.1, 0.98, 4.05], target: [0, -0.02, 0] },
    portrait: { position: [4.35, 1.45, 5.7], target: [0.3, -0.1, 0] },
  },
  specimens: {
    landscape: { position: [1.15, 0.34, 3.25], target: [-0.04, 0, 0] },
    portrait: { position: [2, 0.55, 6.2], target: [-0.34, 0.22, 0] },
  },
  flight: {
    landscape: { position: [7.2, 3.1, 8.8], target: [0, 0.5, 0] },
    portrait: { position: [15.5, 6.6, 18.8], target: [0, 0.5, 0] },
  },
  landing: {
    landscape: { position: [8.6, 4.2, 10.4], target: [0, 0.35, 0] },
    portrait: { position: [13.8, 7.2, 17.2], target: [0, 0.45, 0] },
  },
  'flight-specimen': {
    landscape: { position: [1.6, 0.9, 3.4], target: [0, 0.02, 0] },
    portrait: { position: [2.3, 1.45, 4.45], target: [0, 0.04, 0] },
  },
  'stone-full': {
    landscape: { position: [3.5, 1.45, 4.05], target: [0, 0.08, 0] },
    portrait: { position: [3.55, 1.58, 4.3], target: [0, 0.05, 0] },
  },
  'stone-macro': {
    landscape: { position: [2.5, 1.0, 2.82], target: [-0.15, 0.02, 0.02] },
    portrait: { position: [3.15, 1.38, 3.8], target: [-0.12, 0.05, 0] },
  },
  'stone-top': {
    landscape: { position: [0.45, 5.25, 0.3], target: [0, -0.05, 0] },
    portrait: { position: [0.55, 6.8, 0.38], target: [0, -0.05, 0] },
  },
};

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04).texture;
    scene.environment = environment;
    return () => {
      if (scene.environment === environment) {
        scene.environment = null;
      }
      room.dispose();
      environment.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  return null;
}

function StudioCamera({ view, cameraViews = CAMERA_VIEWS, limits }) {
  const { camera, size } = useThree();
  const controls = useRef();
  const flightView = view.startsWith('flight') || view === 'landing';
  const stoneView = view.startsWith('stone');

  useEffect(() => {
    const preset = cameraViews[view] ?? CAMERA_VIEWS.specimens;
    const viewport = size.width < size.height ? preset.portrait : preset.landscape;
    const position = new THREE.Vector3(...viewport.position);
    const target = new THREE.Vector3(...viewport.target);
    camera.position.copy(position);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, cameraViews, size.height, size.width, view]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={limits?.minDistance ?? (stoneView ? 0.72 : 1.2)}
      maxDistance={limits?.maxDistance ?? (flightView ? 35 : (stoneView ? 11 : 8.5))}
      minPolarAngle={limits?.minPolarAngle ?? (stoneView ? 0.08 : 0.45)}
      maxPolarAngle={limits?.maxPolarAngle ?? (Math.PI - 0.5)}
    />
  );
}

export default function AssetStudio({
  children,
  view = 'specimens',
  waterReflection = false,
  lightingPreset = 'default',
  cameraViews,
  cameraLimits,
  floorY = -1.14,
  floorVisible = true,
  waterY = -1.14,
  lighting,
  exposure = 1.04,
  environmentIntensity = 1,
  paused = false,
  inactive = false,
  cameraFar = 40,
  fogRange,
  pixelRatio = [1, 1.5],
  background = STUDIO_BACKGROUND,
  // The collection's own knobs on the scene light (time of day, cloud cover).
  sceneOverrides,
  shadowRadius = 9,
}) {
  const flightView = view.startsWith('flight') || view === 'landing';
  const stoneLighting = lightingPreset === 'black-stone';
  // One switch for the whole laboratory (LabNav): the home scene's sky, sun
  // and image-based light, or the white studio. A collection that hands in a
  // whole lighting solution (the tanker at night) is shown under it either way.
  const sceneMode = useLabLightMode() === 'scene' || Boolean(lighting);
  const overridesKey = JSON.stringify(sceneOverrides ?? null);
  const overrides = useMemo(() => (overridesKey === 'null' ? undefined : JSON.parse(overridesKey)), [overridesKey]);

  return (
    <Canvas
      frameloop={inactive ? 'never' : paused ? 'demand' : 'always'}
      shadows={STUDIO_SHADOWS}
      dpr={pixelRatio}
      camera={{ position: [3.65, 1.42, 4.9], fov: 32, near: 0.02, far: cameraFar }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
      }}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, fogRange?.[0] ?? (cameraViews ? 28 : (flightView ? 32 : 6.2)), fogRange?.[1] ?? (cameraViews ? 40 : (flightView ? 48 : 10.5))]} />
      <StudioExposure exposure={exposure} environmentIntensity={sceneMode ? undefined : environmentIntensity} />
      {sceneMode ? (
        <SceneLight lighting={lighting} overrides={overrides} shadowRadius={shadowRadius} environmentIntensity={environmentIntensity} />
      ) : (
        <>
          <StudioEnvironment />
          <hemisphereLight args={['#f9fbff', '#b8afa1', stoneLighting ? 0.34 : 1.35]} />
          <directionalLight
            position={[3.4, 5.5, 4]}
            intensity={stoneLighting ? 1.7 : 2.1}
            color="#fff7e9"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-shadowRadius}
            shadow-camera-right={shadowRadius}
            shadow-camera-top={shadowRadius}
            shadow-camera-bottom={-shadowRadius}
            shadow-bias={-0.00035}
            shadow-normalBias={0.01}
            shadow-radius={2.5}
          />
          <directionalLight position={[-4, 0.7, -3]} intensity={stoneLighting ? 0.26 : 1.05} color="#c4dbdf" />
        </>
      )}
      {children}
      {waterReflection ? (
        <StudioWaterReflection
          waterY={waterY}
          width={flightView ? 18 : 8}
          depth={flightView ? 12 : 6}
        />
      ) : floorVisible ? (
        <mesh
          position={[0, floorY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          {/* Under the scene's sky the ground runs to the horizon and fades into
              the fog; the studio keeps its small plate. */}
          <planeGeometry args={sceneMode ? [3000, 3000] : flightView ? [18, 12] : [8, 6]} />
          <meshStandardMaterial color="#f0eee9" roughness={0.96} metalness={0} />
        </mesh>
      ) : null}
      <StudioCamera view={view} cameraViews={cameraViews} limits={cameraLimits} />
    </Canvas>
  );
}

function StudioExposure({ exposure, environmentIntensity }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = exposure;
    // Under the scene light the sky's own level sets the environment (SceneLight).
    if (environmentIntensity !== undefined) scene.environmentIntensity = environmentIntensity;
  }, [environmentIntensity, exposure, gl, scene]);
  return null;
}
