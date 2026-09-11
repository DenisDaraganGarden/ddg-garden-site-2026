import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BOAT_MODEL_URL } from '../components/effects/water/boatModel';
import {
  BOAT_LANDING_SPECS,
  createNormalizedSurfaceClone,
  projectLandingSites,
  SCULPTURE_LANDING_SPECS,
} from '../features/home-scene/creatures/seagullLandingSurfaces.js';
import { HOME_SEAGULL_WATER_Y } from '../features/home-scene/creatures/seagullFlight.js';
import { createTerrainLandingSites } from '../terrain/terrainLanding.js';

// The lab water is the scene's datum, so routes and downed physics need no offset.
const FLOOR_Y = HOME_SEAGULL_WATER_Y;

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
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.0008, 0]}
            renderOrder={6}
            userData={{ ddgNoWaterReflection: true }}
          >
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

// Полоса суши для режима «Территория»: у студии нет рельефа, поэтому берег —
// ступенька на половине площадки, с камнем-валуном. Отвечает на тот же вопрос
// surfaceAt, что и настоящая земля, так что места для посадки считает тот же
// код, что и в сцене, — это и есть смысл режима.
const LAND_EDGE_X = 1.2;
const LAND_HEIGHT = 0.42;
const LAND_ROCK = { x: 4.2, z: -1.6, radius: 0.55, height: 0.62 };
const landQuery = {
  surfaceAt: (x, z) => {
    if (Math.hypot(x - LAND_ROCK.x, z - LAND_ROCK.z) < LAND_ROCK.radius) {
      return { height: LAND_HEIGHT + LAND_ROCK.height, normal: { x: 0, y: 1, z: 0 }, habitat: 'rock' };
    }
    if (x < LAND_EDGE_X) return { height: -0.5, normal: { x: 0, y: 1, z: 0 }, habitat: 'water' };
    return { height: LAND_HEIGHT, normal: { x: 0, y: 1, z: 0 }, habitat: 'beach' };
  },
};

function LandSlab({ landingSitesRef, perch, register, showMarkers }) {
  const root = useRef();
  const [sites, setSites] = React.useState([]);
  const perchKey = JSON.stringify(perch);
  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return undefined;
    const created = createTerrainLandingSites(group, landQuery, { ...JSON.parse(perchKey), centerX: 4, centerZ: 0 });
    setSites(created);
    register(created);
    return () => {
      created.forEach((site) => site.object.parent?.remove(site.object));
      register([]);
      setSites([]);
    };
  }, [perchKey, register, landingSitesRef]);
  return (
    <group ref={root} name="landing-preview-land">
      <mesh position={[LAND_EDGE_X + 5, FLOOR_Y + LAND_HEIGHT * 0.5, 0]} receiveShadow>
        <boxGeometry args={[10, LAND_HEIGHT, 8]} />
        <meshStandardMaterial color="#e6dfcf" roughness={0.95} />
      </mesh>
      <mesh position={[LAND_ROCK.x, FLOOR_Y + LAND_HEIGHT + LAND_ROCK.height * 0.5, LAND_ROCK.z]} castShadow receiveShadow>
        <cylinderGeometry args={[LAND_ROCK.radius, LAND_ROCK.radius * 1.15, LAND_ROCK.height, 18]} />
        <meshStandardMaterial color="#8d8a80" roughness={0.9} />
      </mesh>
      {showMarkers ? sites.map((site) => (
        <mesh key={site.id} position={[site.position[0], site.position[1] + 0.004, site.position[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
          <ringGeometry args={[0.05, 0.075, 24]} />
          <meshBasicMaterial color={site.surface === 'rock' ? '#7f8cc9' : '#c84b43'} transparent opacity={0.8} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )) : null}
    </group>
  );
}

export default function SeagullLandingStage({ landingSitesRef, land = false, perch = null }) {
  const boatSource = useGLTF(BOAT_MODEL_URL).scene;
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

  // Места с суши приходят отдельно и позже: их добавляет полоса, а объекты —
  // как раньше. Список один, стая его читает как есть.
  const landSites = useRef([]);
  const publish = React.useCallback(() => {
    const objectSites = specs
      .map((spec, index) => ({
        ...spec,
        object: siteObjects.current[index],
        collisionObject: index < boatSites.length ? boat : sculpture,
      }))
      .filter((site) => site.object);
    landingSitesRef.current = [...(perch?.objects === false ? [] : objectSites), ...landSites.current];
  }, [boat, boatSites.length, landingSitesRef, perch?.objects, sculpture, specs]);
  const registerLand = React.useCallback((sites) => { landSites.current = sites; publish(); }, [publish]);

  useLayoutEffect(() => {
    publish();
    return () => {
      landingSitesRef.current = [];
    };
  }, [landingSitesRef, publish]);

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
      {land ? <LandSlab landingSitesRef={landingSitesRef} perch={perch ?? {}} register={registerLand} showMarkers /> : null}
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

useGLTF.preload(BOAT_MODEL_URL);
useGLTF.preload('/models/sculpture/sculpture.glb');
