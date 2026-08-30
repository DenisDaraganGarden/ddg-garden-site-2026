import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  BOAT_LANDING_SPECS,
  createNormalizedSurfaceClone,
  projectLandingSites,
  SCULPTURE_LANDING_SPECS,
} from './seagullLandingSurfaces';

const FLOOR_Y = -1.14;

const SHOW_LANDING_MARKERS = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('rigcheck') === '1';

function applySurfaceMaterial(object, material) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.material = material;
    child.castShadow = false;
    child.receiveShadow = true;
  });
  return object;
}

function LandingSite({ spec, register, showMarker }) {
  return (
    <>
      <group
        ref={register}
        name={`seagull-landing-site-${spec.id}`}
        position={spec.position}
        quaternion={spec.quaternion}
      />
      {showMarker && (
        <group position={spec.markerPosition} quaternion={spec.markerQuaternion}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, 0]} renderOrder={6}>
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
      )}
    </>
  );
}

export default function SeagullLandingStage({ landingSitesRef }) {
  const boatSource = useGLTF('/models/boat/OBJ_boat2.0.glb').scene;
  const sculptureSource = useGLTF('/models/sculpture/sculpture.glb').scene;
  const boatGroup = useRef();
  const sculptureGroup = useRef();
  const siteObjects = useRef([]);

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

  const boat = useMemo(() => applySurfaceMaterial(
    createNormalizedSurfaceClone(boatSource, 0.0007, Math.PI),
    boatMaterial,
  ), [boatMaterial, boatSource]);
  const sculpture = useMemo(() => applySurfaceMaterial(
    createNormalizedSurfaceClone(sculptureSource, 0.075, 0),
    sculptureMaterial,
  ), [sculptureMaterial, sculptureSource]);
  const boatSites = useMemo(
    () => projectLandingSites(boat, BOAT_LANDING_SPECS),
    [boat],
  );
  const sculptureSites = useMemo(
    () => projectLandingSites(sculpture, SCULPTURE_LANDING_SPECS),
    [sculpture],
  );
  const specs = useMemo(
    () => [...boatSites, ...sculptureSites],
    [boatSites, sculptureSites],
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
        {boatSites.map((spec, index) => (
          <LandingSite
            key={spec.id}
            spec={spec}
            showMarker={SHOW_LANDING_MARKERS}
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
        {sculptureSites.map((spec, index) => (
          <LandingSite
            key={spec.id}
            spec={spec}
            showMarker={SHOW_LANDING_MARKERS}
            register={(object) => { siteObjects.current[boatSites.length + index] = object; }}
          />
        ))}
      </group>
    </group>
  );
}

useGLTF.preload('/models/boat/OBJ_boat2.0.glb');
useGLTF.preload('/models/sculpture/sculpture.glb');
