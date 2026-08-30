import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

const FLOOR_Y = -1.14;

const BOAT_SITES = Object.freeze([
  { id: 'boat-bow', surface: 'boat', position: [0.02, 0.83, 1.45], rotationY: -Math.PI / 2 },
  { id: 'boat-stern', surface: 'boat', position: [-0.02, 0.8, -1.3], rotationY: Math.PI / 2 },
  { id: 'boat-port-seat', surface: 'boat', position: [-0.48, 0.81, 0.56], rotationY: 0.12 },
  { id: 'boat-starboard-seat', surface: 'boat', position: [0.45, 0.81, 0.56], rotationY: Math.PI - 0.12 },
]);

const SCULPTURE_SITES = Object.freeze([
  { id: 'sculpture-crown', surface: 'sculpture', position: [0.4, 2.36, 0.315], rotationY: Math.PI },
  { id: 'sculpture-ridge', surface: 'sculpture', position: [-0.005, 2.16, 0.494], rotationY: -2.4 },
  { id: 'sculpture-left-crest', surface: 'sculpture', position: [-0.697, 1.88, 0.015], rotationY: -0.55 },
  { id: 'sculpture-right-crest', surface: 'sculpture', position: [0.784, 1.74, -0.231], rotationY: 2.45 },
]);

function normalizedClone(source, scale, rotationY, material) {
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(clone);
  const center = bounds.getCenter(new THREE.Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.material = material;
    child.castShadow = false;
    child.receiveShadow = true;
  });
  const wrapper = new THREE.Group();
  wrapper.add(clone);
  wrapper.scale.setScalar(scale);
  wrapper.rotation.y = rotationY;
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function LandingSite({ spec, register }) {
  return (
    <group
      ref={register}
      name={`seagull-landing-site-${spec.id}`}
      position={spec.position}
      rotation={[0, spec.rotationY, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} renderOrder={6}>
        <ringGeometry args={[0.026, 0.042, 24]} />
        <meshBasicMaterial
          color="#c84b43"
          transparent
          opacity={0.72}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export default function SeagullLandingStage({ landingSitesRef }) {
  const boatSource = useGLTF('/models/boat/OBJ_boat2.0.glb').scene;
  const sculptureSource = useGLTF('/models/sculpture/sculpture.glb').scene;
  const boatGroup = useRef();
  const sculptureGroup = useRef();
  const siteObjects = useRef([]);
  const specs = useMemo(() => [...BOAT_SITES, ...SCULPTURE_SITES], []);

  const boatMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#343735',
    metalness: 0.04,
    roughness: 0.64,
    clearcoat: 0.18,
    clearcoatRoughness: 0.58,
    envMapIntensity: 0.62,
    side: THREE.DoubleSide,
  }), []);
  const sculptureMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#777974',
    metalness: 0.02,
    roughness: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.68,
    envMapIntensity: 0.54,
    side: THREE.DoubleSide,
  }), []);

  const boat = useMemo(
    () => normalizedClone(boatSource, 0.0007, Math.PI, boatMaterial),
    [boatMaterial, boatSource],
  );
  const sculpture = useMemo(
    () => normalizedClone(sculptureSource, 0.075, 0, sculptureMaterial),
    [sculptureMaterial, sculptureSource],
  );

  useLayoutEffect(() => {
    landingSitesRef.current = specs
      .map((spec, index) => ({ ...spec, object: siteObjects.current[index] }))
      .filter((site) => site.object);
    return () => {
      landingSitesRef.current = [];
    };
  }, [landingSitesRef, specs]);

  useEffect(() => () => {
    boatMaterial.dispose();
    sculptureMaterial.dispose();
  }, [boatMaterial, sculptureMaterial]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (boatGroup.current) {
      boatGroup.current.position.y = FLOOR_Y + Math.sin(time * 0.72) * 0.024;
      boatGroup.current.rotation.x = Math.sin(time * 0.58 + 0.7) * 0.018;
      boatGroup.current.rotation.z = Math.sin(time * 0.81 - 0.4) * 0.022;
    }
    if (sculptureGroup.current) {
      sculptureGroup.current.position.x = 2.15 + Math.sin(time * 0.17 + 0.4) * 0.045;
      sculptureGroup.current.position.y = FLOOR_Y + Math.sin(time * 0.24 + 1.1) * 0.018;
      sculptureGroup.current.position.z = -0.08 + Math.sin(time * 0.13) * 0.035;
      sculptureGroup.current.rotation.x = 0.07 + Math.sin(time * 0.19) * 0.025;
      sculptureGroup.current.rotation.y = 0.18 + Math.sin(time * 0.15 + 0.8) * 0.08;
      sculptureGroup.current.rotation.z = -0.14 + Math.sin(time * 0.21 - 0.5) * 0.035;
    }
  }, -4);

  return (
    <group name="seagull-landing-stage">
      <group ref={boatGroup} name="landing-preview-boat" position={[-2.05, FLOOR_Y, 0.1]}>
        <primitive object={boat} />
        {BOAT_SITES.map((spec, index) => (
          <LandingSite
            key={spec.id}
            spec={spec}
            register={(object) => { siteObjects.current[index] = object; }}
          />
        ))}
      </group>
      <group
        ref={sculptureGroup}
        name="landing-preview-sculpture"
        position={[2.15, FLOOR_Y, -0.08]}
        rotation={[0.07, 0.18, -0.14]}
      >
        <primitive object={sculpture} />
        {SCULPTURE_SITES.map((spec, index) => (
          <LandingSite
            key={spec.id}
            spec={spec}
            register={(object) => { siteObjects.current[BOAT_SITES.length + index] = object; }}
          />
        ))}
      </group>
    </group>
  );
}

useGLTF.preload('/models/boat/OBJ_boat2.0.glb');
useGLTF.preload('/models/sculpture/sculpture.glb');
