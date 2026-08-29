import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { DEFAULT_SCULPTURE_ANCHOR, SCULPTURE_DRAG_EDGE_MARGIN, clamp } from './constants';

// The sculpture stands on the seabed. It does not float, so its height is the base
// offset rather than anything the simulation decides.

export default function StaticSculpture({ settings, layout, mode, orbitRef, onSculpturePositionChange }) {
  const anchorRef = useRef();
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragHitPointRef = useRef(new THREE.Vector3());
  const dragOffsetRef = useRef(new THREE.Vector3());
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
  }, [applySculptureAnchor, layout?.sculpturePosition?.x, layout?.sculpturePosition?.z, settings?.sculpturePosition?.x, settings?.sculpturePosition?.z]);

  useEffect(() => {
    if (!anchorRef.current) {
      return;
    }

    anchorRef.current.position.y = seabedY;
  }, [seabedY]);

  const handleSculpturePointerDown = useCallback((event) => {
    if (mode !== 'editor' || event.button !== 0 || !event.shiftKey) {
      return;
    }

    dragPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -seabedY);
    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    event.target.setPointerCapture?.(event.pointerId);
    isDraggingRef.current = true;
    dragPointerIdRef.current = event.pointerId;
    setOrbitEnabled(false);

    const currentAnchor = anchorRef.current?.position ?? sculptureAnchorRef.current;
    dragOffsetRef.current.set(
      currentAnchor.x - dragHitPoint.x,
      0,
      currentAnchor.z - dragHitPoint.z,
    );
  }, [mode, seabedY, setOrbitEnabled]);

  const handleSculpturePointerMove = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) {
      return;
    }

    const dragHitPoint = dragHitPointRef.current;

    if (!event.ray?.intersectPlane(dragPlaneRef.current, dragHitPoint)) {
      return;
    }

    event.stopPropagation();
    applySculptureAnchor(
      dragHitPoint.x + dragOffsetRef.current.x,
      dragHitPoint.z + dragOffsetRef.current.z,
    );
  }, [applySculptureAnchor]);

  const finishSculptureDrag = useCallback((event) => {
    if (!isDraggingRef.current) {
      return;
    }

    event?.stopPropagation?.();
    setOrbitEnabled(true);

    if (dragPointerIdRef.current !== null && event?.target?.releasePointerCapture) {
      event.target.releasePointerCapture(dragPointerIdRef.current);
    }

    isDraggingRef.current = false;
    dragPointerIdRef.current = null;
    commitSculpturePosition(anchorRef.current?.position ?? sculptureAnchorRef.current);
  }, [commitSculpturePosition, setOrbitEnabled]);

  useEffect(() => () => {
    setOrbitEnabled(true);
  }, [setOrbitEnabled]);

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
      onPointerDown={handleSculpturePointerDown}
      onPointerMove={handleSculpturePointerMove}
      onPointerUp={finishSculptureDrag}
      onPointerCancel={finishSculptureDrag}
      onLostPointerCapture={finishSculptureDrag}
    >
      <group name="sculpture">
        <primitive object={clonedObj} />
      </group>
    </group>
  );
}
