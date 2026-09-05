import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { setOpticsGeometryLod } from './opticsGeometryLod.js';

// The source meshes remain the close-up source of truth. The reduced index
// buffers are only selected once an object is both far away and small on the
// actual screen. Exit thresholds are deliberately more generous than entry
// thresholds so a slow orbit cannot make the detail shimmer between frames.
export const VISIBLE_GEOMETRY_LOD = Object.freeze({
  boat: Object.freeze({
    enterDistance: 28,
    exitDistance: 23,
    enterPixels: 150,
    exitPixels: 184,
  }),
  sculpture: Object.freeze({
    enterDistance: 42,
    exitDistance: 35,
    enterPixels: 168,
    exitPixels: 204,
  }),
});

export function projectedSphereDiameterPixels({ radius, distance, fovDegrees, viewportHeight }) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(distance) || distance <= 0) {
    return Infinity;
  }
  const focalLengthPixels = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5));
  return (radius * 2 * focalLengthPixels) / distance;
}

export function shouldUseVisibleGeometryLod({ wasReduced, distance, screenPixels, thresholds }) {
  if (!thresholds || !Number.isFinite(distance) || !Number.isFinite(screenPixels)) return false;
  if (wasReduced) {
    return distance > thresholds.exitDistance && screenPixels < thresholds.exitPixels;
  }
  return distance >= thresholds.enterDistance && screenPixels <= thresholds.enterPixels;
}

// Sampling at 6 Hz is sufficient for an object-scale change and avoids
// traversing animated GLTFs every render frame. The bounding sphere is read in
// world space, so authored scale/rotation and floating boat motion are covered.
export function useVisibleGeometryLod(rootRef, {
  enabled,
  kind,
  intervalSeconds = 1 / 6,
} = {}) {
  const { camera, size } = useThree();
  const accumulatorRef = useRef(intervalSeconds);
  const reducedRef = useRef(false);
  const boxRef = useRef(new THREE.Box3());
  const sphereRef = useRef(new THREE.Sphere());

  useEffect(() => {
    if (enabled) return undefined;
    setOpticsGeometryLod(rootRef.current, false);
    reducedRef.current = false;
    return undefined;
  }, [enabled, rootRef]);

  useEffect(() => () => {
    setOpticsGeometryLod(rootRef.current, false);
    reducedRef.current = false;
  }, [rootRef]);

  useFrame((_, delta) => {
    const root = rootRef.current;
    if (!root || !enabled || !camera.isPerspectiveCamera || document.visibilityState !== 'visible') {
      return;
    }

    accumulatorRef.current += Math.min(delta, 0.25);
    if (accumulatorRef.current < intervalSeconds) return;
    accumulatorRef.current = 0;

    root.updateWorldMatrix(true, true);
    boxRef.current.setFromObject(root);
    if (boxRef.current.isEmpty()) return;
    boxRef.current.getBoundingSphere(sphereRef.current);
    const distance = camera.position.distanceTo(sphereRef.current.center);
    const screenPixels = projectedSphereDiameterPixels({
      radius: sphereRef.current.radius,
      distance,
      fovDegrees: camera.fov,
      viewportHeight: size.height,
    });
    const nextReduced = shouldUseVisibleGeometryLod({
      wasReduced: reducedRef.current,
      distance,
      screenPixels,
      thresholds: VISIBLE_GEOMETRY_LOD[kind],
    });
    if (nextReduced === reducedRef.current) return;

    // The asset loads asynchronously. Keep the previous state until at least
    // one alternate index buffer is ready instead of reporting a phantom LOD.
    const changed = setOpticsGeometryLod(root, nextReduced);
    if (changed > 0) {
      reducedRef.current = nextReduced;
    }
  }, -3);
}
