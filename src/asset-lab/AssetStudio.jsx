import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const STUDIO_BACKGROUND = '#f5f4f0';

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

function StudioCamera({ view }) {
  const { camera, size } = useThree();
  const controls = useRef();
  const flightView = view.startsWith('flight') || view === 'landing';

  useEffect(() => {
    const preset = CAMERA_VIEWS[view] ?? CAMERA_VIEWS.specimens;
    const viewport = size.width < size.height ? preset.portrait : preset.landscape;
    const position = new THREE.Vector3(...viewport.position);
    const target = new THREE.Vector3(...viewport.target);
    camera.position.copy(position);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, size.height, size.width, view]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={1.2}
      maxDistance={flightView ? 35 : 8.5}
      minPolarAngle={0.45}
      maxPolarAngle={Math.PI - 0.5}
    />
  );
}

export default function AssetStudio({ children, view = 'specimens' }) {
  const flightView = view.startsWith('flight') || view === 'landing';

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [3.65, 1.42, 4.9], fov: 32, near: 0.02, far: 40 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
      }}
    >
      <color attach="background" args={[STUDIO_BACKGROUND]} />
      <fog attach="fog" args={[STUDIO_BACKGROUND, flightView ? 32 : 6.2, flightView ? 48 : 10.5]} />
      <StudioEnvironment />
      <hemisphereLight args={['#f9fbff', '#b8afa1', 1.35]} />
      <directionalLight position={[3.4, 5.5, 4]} intensity={2.1} color="#fff7e9" />
      <directionalLight position={[-4, 0.7, -3]} intensity={1.05} color="#c4dbdf" />
      {children}
      <mesh position={[0, -1.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={flightView ? [18, 12] : [8, 6]} />
        <meshStandardMaterial color="#f0eee9" roughness={0.96} metalness={0} />
      </mesh>
      <StudioCamera view={view} />
    </Canvas>
  );
}
