import React, { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import {
  createBlackStoneMaterial,
  createBlackStoneUniforms,
  updateBlackStoneUniforms,
} from '../components/effects/water/blackStoneMaterial';

const FLOOR_Y = -1.14;
const DISPLAY_HEIGHT_METERS = 2.35;
const DISPLAY_ROTATION = new THREE.Euler(
  THREE.MathUtils.degToRad(-51),
  THREE.MathUtils.degToRad(-31),
  THREE.MathUtils.degToRad(4),
  'XYZ',
);

function countGeometry(scene) {
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;

  scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    meshes += 1;
    const position = child.geometry.getAttribute('position');
    vertices += position?.count ?? 0;
    triangles += child.geometry.index
      ? child.geometry.index.count / 3
      : (position?.count ?? 0) / 3;
  });

  return {
    meshes,
    triangles: Math.round(triangles),
    vertices,
  };
}

function prepareSculpture(source, material) {
  const sculpture = source.clone(true);
  sculpture.rotation.copy(DISPLAY_ROTATION);
  sculpture.updateMatrixWorld(true);

  const rotatedBounds = new THREE.Box3().setFromObject(sculpture);
  const rotatedSize = rotatedBounds.getSize(new THREE.Vector3());
  const scale = DISPLAY_HEIGHT_METERS / Math.max(rotatedSize.y, 0.001);
  sculpture.scale.setScalar(scale);
  sculpture.updateMatrixWorld(true);

  const displayBounds = new THREE.Box3().setFromObject(sculpture);
  const displayCenter = displayBounds.getCenter(new THREE.Vector3());
  sculpture.position.x -= displayCenter.x;
  sculpture.position.y += FLOOR_Y - displayBounds.min.y;
  sculpture.position.z -= displayCenter.z;
  sculpture.updateMatrixWorld(true);

  sculpture.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  const finalBounds = new THREE.Box3().setFromObject(sculpture);
  const finalSize = finalBounds.getSize(new THREE.Vector3());

  return {
    sculpture,
    metrics: {
      ...countGeometry(sculpture),
      width: finalSize.x,
      height: finalSize.y,
      depth: finalSize.z,
    },
  };
}

export default function BlackStoneSculpture({ parameters, diagnostic, onMetrics }) {
  const source = useLoader(GLTFLoader, '/models/sculpture/sculpture.glb').scene;
  const uniforms = useMemo(
    () => createBlackStoneUniforms(),
    [],
  );
  const material = useMemo(() => createBlackStoneMaterial(uniforms), [uniforms]);
  const prepared = useMemo(() => prepareSculpture(source, material), [material, source]);

  useEffect(() => {
    updateBlackStoneUniforms(uniforms, parameters, diagnostic);
  }, [diagnostic, parameters, uniforms]);

  useEffect(() => {
    onMetrics?.(prepared.metrics);
  }, [onMetrics, prepared.metrics]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <group
      name="black-stone-sculpture"
      userData={{ surface: 'procedural-black-stone' }}
    >
      <primitive object={prepared.sculpture} />
    </group>
  );
}

useLoader.preload(GLTFLoader, '/models/sculpture/sculpture.glb');
