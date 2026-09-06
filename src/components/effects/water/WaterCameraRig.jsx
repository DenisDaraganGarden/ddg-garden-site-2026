import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitCameraFovToLayout } from '../../../features/home-scene/lib/layout';

// Owns the camera: applies the authored pose for the active composition bucket,
// fits the field of view to the frame, and in the editor hands back a capture
// function so the author can lock what they are looking at.

const CAMERA_POSE_TARGET = new THREE.Vector3();
const LazyOrbitControls = React.lazy(() => import('@react-three/drei/core/OrbitControls.js').then((module) => ({
  default: module.OrbitControls,
})));
const FREE_CAMERA_NEAR = 0.01;
const FREE_CAMERA_FAR = 10000;
const FRAME_CAMERA_NEAR = FREE_CAMERA_NEAR;
const FRAME_CAMERA_FAR = FREE_CAMERA_FAR;
const FREE_CAMERA_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
]);

// freeCamera turns the viewport camera into a plain working camera: no authored
// pose re-applied under the hand, no field of view fitted to the frame, and no
// polar limits, so it can look straight up or straight down. It is the control
// case for anything that looks like a camera problem - if a symptom survives it,
// the composition rig is not the cause.
export default function WaterCameraRig({
  mode,
  layout,
  layoutKey,
  onCameraRigApi,
  orbitRef,
  freeCamera = false,
  poseKey,
}) {
  const { camera, gl, size, scene, invalidate } = useThree();
  const internalControlsRef = useRef();
  const controlsRef = orbitRef ?? internalControlsRef;
  const cameraInitializedRef = useRef(false);
  const appliedFreePoseKeyRef = useRef(null);
  const pendingControlsTargetRef = useRef(false);
  const pressedKeysRef = useRef(new Set());
  const movementVectorsRef = useRef({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    movement: new THREE.Vector3(),
  });
  const formatAxis = useCallback((value) => Number(value.toFixed(4)), []);
  const cameraPositionX = layout?.cameraPosition?.x;
  const cameraPositionY = layout?.cameraPosition?.y;
  const cameraPositionZ = layout?.cameraPosition?.z;
  const hasCameraPosition = [cameraPositionX, cameraPositionY, cameraPositionZ]
    .every((value) => Number.isFinite(value));
  const cameraTarget = layout?.cameraTarget ?? { x: 0, y: 0, z: 0 };
  const cameraFov = layout?.cameraFov;
  const fittedCameraFov = freeCamera ? cameraFov : fitCameraFovToLayout(
    cameraFov,
    size.width,
    size.height,
    layoutKey,
    layout?.frameInset,
  );

  const applyLayoutPose = useCallback((fitToFrame = !freeCamera) => {
    if (!hasCameraPosition) {
      return false;
    }

    const nextFov = fitToFrame ? fittedCameraFov : cameraFov;
    camera.position.set(cameraPositionX, cameraPositionY, cameraPositionZ);
    camera.near = fitToFrame ? FRAME_CAMERA_NEAR : FREE_CAMERA_NEAR;
    camera.far = fitToFrame ? FRAME_CAMERA_FAR : FREE_CAMERA_FAR;
    if (typeof nextFov === 'number') {
      camera.fov = nextFov;
    }
    CAMERA_POSE_TARGET.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.lookAt(CAMERA_POSE_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(CAMERA_POSE_TARGET);
      controlsRef.current.update();
      pendingControlsTargetRef.current = false;
    } else {
      pendingControlsTargetRef.current = true;
    }

    return true;
  }, [
    camera,
    cameraFov,
    cameraPositionX,
    cameraPositionY,
    cameraPositionZ,
    cameraTarget.x,
    cameraTarget.y,
    cameraTarget.z,
    controlsRef,
    fittedCameraFov,
    freeCamera,
    hasCameraPosition,
  ]);

  // Apply the active composition bucket's pose. Depends on the bucket's camera numbers
  // (not the object identity) so editing object positions doesn't snap the camera, and
  // free-orbiting in the editor isn't interrupted by unrelated setting changes.
  useLayoutEffect(() => {
    if (!hasCameraPosition) {
      return;
    }

    if (freeCamera) {
      if (!cameraInitializedRef.current || appliedFreePoseKeyRef.current !== poseKey) {
        applyLayoutPose(false);
        cameraInitializedRef.current = true;
        appliedFreePoseKeyRef.current = poseKey;
        return;
      }

      camera.near = FREE_CAMERA_NEAR;
      camera.far = FREE_CAMERA_FAR;
      if (typeof cameraFov === 'number') {
        camera.fov = cameraFov;
      }
      camera.updateProjectionMatrix();
      return;
    }

    applyLayoutPose(true);
    cameraInitializedRef.current = true;
    appliedFreePoseKeyRef.current = poseKey;
  }, [
    applyLayoutPose,
    camera,
    cameraFov,
    freeCamera,
    hasCameraPosition,
    poseKey,
  ]);

  const moveFreeCamera = useCallback((delta) => {
    const controls = controlsRef.current;
    const pressedKeys = pressedKeysRef.current;

    if (mode !== 'editor' || !freeCamera || !controls || pressedKeys.size === 0) {
      return false;
    }

    const forwardInput = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
    const rightInput = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
    const upInput = Number(pressedKeys.has('KeyE')) - Number(pressedKeys.has('KeyQ'));

    if (forwardInput === 0 && rightInput === 0 && upInput === 0) {
      return false;
    }

    const vectors = movementVectorsRef.current;
    camera.getWorldDirection(vectors.forward);
    vectors.right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    vectors.movement
      .set(0, 0, 0)
      .addScaledVector(vectors.forward, forwardInput)
      .addScaledVector(vectors.right, rightInput)
      .addScaledVector(vectors.up, upInput)
      .normalize();

    const targetDistance = camera.position.distanceTo(controls.target);
    const adaptiveSpeed = THREE.MathUtils.clamp(targetDistance * 0.8, 1.5, 120);
    const boosted = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
    const travel = adaptiveSpeed * (boosted ? 4 : 1) * Math.min(delta, 0.05);

    camera.position.addScaledVector(vectors.movement, travel);
    controls.target.addScaledVector(vectors.movement, travel);
    camera.updateMatrixWorld();
    controls.update();
    return true;
  }, [camera, controlsRef, freeCamera, mode]);

  // Keyboard flight is scoped to a focused editor canvas. Clicking a slider or
  // another control immediately returns the letter keys to the UI instead of
  // moving the camera behind the author's hand.
  useEffect(() => {
    const domElement = gl.domElement;
    const pressedKeys = pressedKeysRef.current;
    pressedKeys.clear();

    if (mode !== 'editor' || !freeCamera || !domElement) {
      return undefined;
    }

    const previousTabIndex = domElement.getAttribute('tabindex');
    const previousAriaLabel = domElement.getAttribute('aria-label');
    const handlePointerDown = () => {
      domElement.focus({ preventScroll: true });
    };
    // Flight runs on its own clock. With animation paused the canvas renders
    // on demand and useFrame never ticks, so each step asks for its own frame.
    let flightFrame = 0;
    let flightLast = 0;
    const flightStep = (now) => {
      const delta = flightLast ? (now - flightLast) / 1000 : 1 / 60;
      flightLast = now;
      if (moveFreeCamera(delta)) {
        invalidate();
      }
      flightFrame = pressedKeys.size > 0 ? requestAnimationFrame(flightStep) : 0;
    };
    const startFlight = () => {
      if (!flightFrame) {
        flightLast = performance.now();
        flightFrame = requestAnimationFrame(flightStep);
      }
    };
    const handleKeyDown = (event) => {
      if (!FREE_CAMERA_KEYS.has(event.code)) {
        return;
      }

      pressedKeys.add(event.code);
      domElement.dataset.ddgCameraLastKey = event.code;
      if (!event.repeat) {
        // A quick tap can begin and end between two 120 Hz frames. Give it one
        // deterministic step; a held key continues in the flight loop.
        if (moveFreeCamera(1 / 60)) {
          invalidate();
        }
        startFlight();
      }
      event.preventDefault();
    };
    const handleKeyUp = (event) => {
      pressedKeys.delete(event.code);
    };
    const clearPressedKeys = () => pressedKeys.clear();

    domElement.tabIndex = 0;
    domElement.setAttribute('aria-label', 'Free scene camera viewport');
    domElement.dataset.ddgCameraMode = 'free';
    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearPressedKeys);

    return () => {
      cancelAnimationFrame(flightFrame);
      pressedKeys.clear();
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearPressedKeys);

      if (previousTabIndex === null) {
        domElement.removeAttribute('tabindex');
      } else {
        domElement.setAttribute('tabindex', previousTabIndex);
      }
      if (previousAriaLabel === null) {
        domElement.removeAttribute('aria-label');
      } else {
        domElement.setAttribute('aria-label', previousAriaLabel);
      }
      delete domElement.dataset.ddgCameraLastKey;
      delete domElement.dataset.ddgCameraMode;
    };
  }, [freeCamera, gl, invalidate, mode, moveFreeCamera]);

  useFrame(() => {
    const controls = controlsRef.current;

    if (controls && pendingControlsTargetRef.current) {
      controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      controls.update();
      pendingControlsTargetRef.current = false;
    }
  });

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
        // Capture the projection that is actually being viewed. In particular,
        // do not round narrow/Fractional lenses: at 1° a rounded value is a
        // material change to the authored composition after a save/reload.
        cameraFov: formatAxis(camera.fov),
      };
    };

    const restorePose = () => applyLayoutPose(!freeCamera);

    // Inspection poses do not edit the authored camera or its scene snapshot.
    const previewPose = ({ cameraPosition, cameraTarget, cameraFov: previewFov }) => {
      camera.position.set(cameraPosition.x,cameraPosition.y,cameraPosition.z);
      CAMERA_POSE_TARGET.set(cameraTarget.x,cameraTarget.y,cameraTarget.z);
      camera.lookAt(CAMERA_POSE_TARGET);
      if(Number.isFinite(previewFov))camera.fov=previewFov;
      camera.updateProjectionMatrix();camera.updateMatrixWorld();
      if(controlsRef.current){controlsRef.current.target.copy(CAMERA_POSE_TARGET);controlsRef.current.update();}
      gl.domElement.dataset.ddgCameraPose = JSON.stringify(capturePose());
      invalidate();
    };
    // Frames a scene object by name where it is right now: from the shore side
    // with the sea behind it, or straight down. Nothing happens if it is hidden.
    const frameObject = (name, { above = false } = {}) => {
      const object = scene.getObjectByName(name);
      if (!object) {
        return false;
      }
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) {
        return false;
      }
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
      const distance = (radius * 1.6) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
      const offset = new THREE.Vector3(-center.x, 0, -center.z);
      if (offset.lengthSq() < 1e-6) {
        offset.set(1, 0, 1);
      }
      offset.normalize();
      if (above) {
        offset.set(0.001, 1, 0);
      } else {
        offset.y = 0.35;
      }
      offset.normalize().multiplyScalar(distance);
      previewPose({ cameraPosition: center.clone().add(offset), cameraTarget: center, cameraFov: camera.fov });
      return true;
    };
    onCameraRigApi({ capturePose, restorePose, previewPose, frameObject });

    return () => {
      onCameraRigApi(null);
    };
  }, [
    applyLayoutPose,
    cameraFov,
    cameraTarget.x,
    cameraTarget.y,
    cameraTarget.z,
    camera,
    controlsRef,
    formatAxis,
    freeCamera,
    gl,
    invalidate,
    onCameraRigApi,
    scene,
  ]);

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
        enableDamping
        dampingFactor={0.08}
        minDistance={freeCamera ? FREE_CAMERA_NEAR : 0.5}
        maxDistance={freeCamera ? Number.POSITIVE_INFINITY : 2000}
        zoomToCursor={freeCamera}
        screenSpacePanning={freeCamera}
        minPolarAngle={freeCamera ? 0 : 0.45}
        maxPolarAngle={freeCamera ? Math.PI : 1.35}
        target={freeCamera ? undefined : [cameraTarget.x, cameraTarget.y, cameraTarget.z]}
      />
    </React.Suspense>
  );
}
