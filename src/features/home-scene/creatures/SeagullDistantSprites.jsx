import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createSeagullDistantSilhouetteAlpha } from './seagullDistantSilhouette.js';

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const matrixScratch = new THREE.Matrix4();
const scaleScratch = new THREE.Vector3();
const positionScratch = new THREE.Vector3();
const billboardRotation = new THREE.Quaternion();

function createSilhouetteMaterial() {
  const alphaMap = new THREE.DataTexture(
    createSeagullDistantSilhouetteAlpha(),
    64,
    64,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  alphaMap.colorSpace = THREE.NoColorSpace;
  alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.magFilter = THREE.LinearFilter;
  alphaMap.generateMipmaps = false;
  alphaMap.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: '#c8c6bb',
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.38,
    depthWrite: false,
    alphaMap,
  });
  return { material, alphaMap };
}

// A single instanced, camera-facing flock layer for birds which no longer
// occupy enough pixels to justify a skinned model. It is intentionally hidden
// from water captures: sub-pixel distant gulls cannot make a readable planar
// reflection, while the near full rigs retain the physical reflection budget.
export default function SeagullDistantSprites({ agents, spriteIds }) {
  const meshRef = useRef();
  const { camera } = useThree();
  const silhouette = useMemo(createSilhouetteMaterial, []);
  const count = agents.length;

  useEffect(() => () => {
    silhouette.material.dispose();
    silhouette.alphaMap.dispose();
  }, [silhouette]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    billboardRotation.copy(camera.quaternion);
    for (let index = 0; index < count; index += 1) {
      const agent = agents[index];
      // renderModes is a Map(index -> 'full' | 'sprite'), not a Set. Using
      // `.has()` here overlaid a card on every full-rig bird as well.
      if (spriteIds.current?.get(agent.index) !== 'sprite' || agent.shotState === 'removed') {
        mesh.setMatrixAt(index, HIDDEN_MATRIX);
        continue;
      }
      const flap = Math.sin(agent.phase ?? 0) * 0.14;
      const scale = (agent.modelScale ?? 1) * 1.12;
      positionScratch.copy(agent.position);
      scaleScratch.set(scale * (1 + flap), scale * 0.76, scale);
      matrixScratch.compose(positionScratch, billboardRotation, scaleScratch);
      mesh.setMatrixAt(index, matrixScratch);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      frustumCulled={false}
      userData={{ ddgNoWaterReflection: true, ddgSeagullDistantSprites: true }}
    >
      <planeGeometry args={[1.25, 0.72]} />
      <primitive attach="material" object={silhouette.material} />
    </instancedMesh>
  );
}
