import React, { forwardRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RIDER_PARTS as PARTS } from './riderMesh';

// The rider as Denis sees him for now: square wooden sticks on the physics
// body's bones, a darker block at every joint — an architect's balsa model of
// a man, until a model of his own is hung on the same skeleton. One instanced
// mesh, one draw call; updateRiderModel writes it from the bodies each frame.

const RiderModel = forwardRef(function RiderModel({ visible = true }, ref) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const setColours = (mesh) => {
    if (!mesh || mesh.userData.coloured) return;
    PARTS.forEach(([, , colour], k) => mesh.setColorAt(k, colour));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.coloured = true;
  };
  return (
    <instancedMesh
      ref={(mesh) => {
        setColours(mesh);
        if (typeof ref === 'function') ref(mesh);
        else if (ref) ref.current = mesh;
      }}
      name="surfboard-rider"
      args={[geometry, material, PARTS.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      visible={visible}
    />
  );
});

export default RiderModel;
