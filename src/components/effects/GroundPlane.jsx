import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// A flat ground to start a scene from: one quad with a standard material that
// takes the scene's environment and receives the key light's shadows. Named
// `ground-plane` for the object registry (sceneObjects.js).
export default function GroundPlane({ settings, lighting }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ metalness: 0 }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.color.set(settings.planeColor);
    material.roughness = settings.planeRoughness;
    material.envMapIntensity = lighting?.environment?.reflection ?? 1;
    material.needsUpdate = false;
  }, [material, settings.planeColor, settings.planeRoughness, lighting?.environment?.reflection]);

  return (
    <mesh
      name="ground-plane"
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, settings.planeHeight, 0]}
      receiveShadow
    >
      <planeGeometry args={[settings.planeSize, settings.planeSize]} />
    </mesh>
  );
}
