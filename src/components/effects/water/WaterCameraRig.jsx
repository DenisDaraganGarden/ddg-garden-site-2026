import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitCameraFovToLayout } from '../../../features/home-scene/lib/layout';

// Owns the camera: applies the authored pose for the active composition bucket,
// fits the field of view to the frame, and in the editor hands back a capture
// function so the author can lock what they are looking at.

const CAMERA_POSE_TARGET = new THREE.Vector3();
const LazyOrbitControls = React.lazy(() => import('@react-three/drei/core/OrbitControls.js').then((module) => ({
  default: module.OrbitControls,
})));

export default function WaterCameraRig({ mode, layout, layoutKey, onCameraRigApi, orbitRef }) {
  const { camera, gl, size } = useThree();
  const internalControlsRef = useRef();
  const controlsRef = orbitRef ?? internalControlsRef;
  const formatAxis = useCallback((value) => Number(value.toFixed(4)), []);
  const cameraTarget = layout?.cameraTarget ?? { x: 0, y: 0, z: 0 };
  const cameraFov = layout?.cameraFov;
  const fittedCameraFov = fitCameraFovToLayout(
    cameraFov,
    size.width,
    size.height,
    layoutKey,
    layout?.frameInset,
  );

  useEffect(() => {
    if (typeof fittedCameraFov !== 'number' || camera.fov === fittedCameraFov) {
      return;
    }

    camera.fov = fittedCameraFov;
    camera.updateProjectionMatrix();
  }, [camera, fittedCameraFov]);

  // Apply the active composition bucket's pose. Depends on the bucket's camera numbers
  // (not the object identity) so editing object positions doesn't snap the camera, and
  // free-orbiting in the editor isn't interrupted by unrelated setting changes.
  useLayoutEffect(() => {
    if (!layout) {
      return;
    }

    const { cameraPosition } = layout;
    camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    camera.near = 0.1;
    camera.far = 80;
    camera.fov = fittedCameraFov;
    CAMERA_POSE_TARGET.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.lookAt(CAMERA_POSE_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(CAMERA_POSE_TARGET);
      controlsRef.current.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controlsRef,
    layout?.cameraPosition?.x,
    layout?.cameraPosition?.y,
    layout?.cameraPosition?.z,
    cameraTarget.x,
    cameraTarget.y,
    cameraTarget.z,
    fittedCameraFov,
  ]);

  useEffect(() => {
    if (mode !== 'editor') {
      return undefined;
    }

    const controls = controlsRef.current;
    const domElement = gl.domElement;

    if (!controls || !domElement) {
      return undefined;
    }

    const handleStart = () => {
      domElement.style.cursor = 'grabbing';
    };
    const handleEnd = () => {
      domElement.style.cursor = 'grab';
    };
    const preventContextMenu = (event) => {
      event.preventDefault();
    };

    domElement.style.cursor = 'grab';
    domElement.addEventListener('contextmenu', preventContextMenu);
    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);

    return () => {
      domElement.style.cursor = '';
      domElement.removeEventListener('contextmenu', preventContextMenu);
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
    };
  }, [controlsRef, gl, mode]);

  useEffect(() => {
    if (typeof onCameraRigApi !== 'function') {
      return undefined;
    }

    const capturePose = () => {
      const target = controlsRef.current?.target
        ?? CAMERA_POSE_TARGET.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);

      return {
        cameraPosition: {
          x: formatAxis(camera.position.x),
          y: formatAxis(camera.position.y),
          z: formatAxis(camera.position.z),
        },
        cameraTarget: {
          x: formatAxis(target.x),
          y: formatAxis(target.y),
          z: formatAxis(target.z),
        },
        cameraFov: Math.round(cameraFov ?? camera.fov),
      };
    };

    onCameraRigApi({ capturePose });

    return () => {
      onCameraRigApi(null);
    };
  }, [cameraFov, cameraTarget.x, cameraTarget.y, cameraTarget.z, camera, controlsRef, formatAxis, onCameraRigApi]);

  if (mode !== 'editor') {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <LazyOrbitControls
        ref={controlsRef}
        makeDefault
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        enablePan
        screenSpacePanning={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.5}
        maxDistance={2000}
        minPolarAngle={0.45}
        maxPolarAngle={1.35}
        target={[cameraTarget.x, cameraTarget.y, cameraTarget.z]}
      />
    </React.Suspense>
  );
}
