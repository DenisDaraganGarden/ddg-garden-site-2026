import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { useDragOnPlane } from './useDragOnPlane';
import { DEFAULT_SCULPTURE_ANCHOR, SCULPTURE_DRAG_EDGE_MARGIN, clamp } from './constants';

// The sculpture stands on the seabed. It does not float, so its height is the base
// offset rather than anything the simulation decides.

export default function StaticSculpture({ settings, layout, mode, orbitRef, onSculpturePositionChange }) {
  const anchorRef = useRef();
  const sculptureAnchorRef = useRef(new THREE.Vector3(
    layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x,
    0,
    layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z,
  ));
  const setOrbitEnabled = useCallback((enabled) => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = enabled;
    }
  }, [orbitRef]);

  const seabedY = (-settings.waterDepthMeters) + settings.sculptureBottomOffset;
  const commitSculpturePosition = useCallback((position) => {
    if (typeof onSculpturePositionChange !== 'function' || !position) {
      return;
    }

    onSculpturePositionChange({
      x: Number(position.x.toFixed(4)),
      z: Number(position.z.toFixed(4)),
    });
  }, [onSculpturePositionChange]);
  const applySculptureAnchor = useCallback((x, z) => {
    const halfExtent = Math.max((settings.waterExtent * 0.5) - SCULPTURE_DRAG_EDGE_MARGIN, 0.1);
    const nextX = clamp(x, -halfExtent, halfExtent);
    const nextZ = clamp(z, -halfExtent, halfExtent);
    sculptureAnchorRef.current.set(nextX, 0, nextZ);

    if (anchorRef.current) {
      anchorRef.current.position.set(nextX, seabedY, nextZ);
    }
  }, [settings.waterExtent, seabedY]);

  const { isDraggingRef, dragHandlers } = useDragOnPlane({
    mode,
    anchorRef,
    fallbackAnchorRef: sculptureAnchorRef,
    planeHeight: seabedY,
    applyAnchor: applySculptureAnchor,
    commitPosition: commitSculpturePosition,
    setOrbitEnabled,
  });

  const sculptureMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(settings.sculptureColor),
    metalness: settings.sculptureMetalness,
    roughness: settings.sculptureRoughness,
    clearcoat: settings.sculptureClearcoat,
    clearcoatRoughness: settings.sculptureClearcoatRoughness,
    envMapIntensity: THREE.MathUtils.clamp(settings.envReflectionIntensity / 220, 0, 0.6),
    transmission: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  }), [
    settings.envReflectionIntensity,
    settings.sculptureClearcoat,
    settings.sculptureClearcoatRoughness,
    settings.sculptureColor,
    settings.sculptureMetalness,
    settings.sculptureRoughness,
  ]);

  useEffect(() => () => {
    sculptureMaterial.dispose();
  }, [sculptureMaterial]);

  useEffect(() => {
    const anchorX = layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x;
    const anchorZ = layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z;

    if (isDraggingRef.current) {
      return;
    }

    applySculptureAnchor(anchorX, anchorZ);
  }, [applySculptureAnchor, isDraggingRef, layout?.sculpturePosition?.x, layout?.sculpturePosition?.z, settings?.sculpturePosition?.x, settings?.sculpturePosition?.z]);

  useEffect(() => {
    if (!anchorRef.current) {
      return;
    }

    anchorRef.current.position.y = seabedY;
  }, [seabedY]);

  const obj = useLoader(OBJLoader, '/models/sculpture/sculpture.obj');
  const normalizedObj = useMemo(() => {
    const clone = obj.clone();
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());

    clone.position.set(-center.x, -bounds.min.y, -center.z);
    return clone;
  }, [obj]);
  const clonedObj = useMemo(() => {
    const clone = normalizedObj.clone();

    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.material = sculptureMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [normalizedObj, sculptureMaterial]);

  if (settings.debugView !== 'beauty') {
    return null;
  }

  return (
    <group
      ref={anchorRef}
      name="sculpture-anchor"
      rotation={[
        THREE.MathUtils.degToRad(settings.sculptureRotationX),
        THREE.MathUtils.degToRad(settings.sculptureRotationY),
        THREE.MathUtils.degToRad(settings.sculptureRotationZ),
      ]}
      scale={[settings.sculptureScale, settings.sculptureScale, settings.sculptureScale]}
      {...dragHandlers}
    >
      <group name="sculpture">
        <primitive object={clonedObj} />
      </group>
    </group>
  );
}
