import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCursorFlashlightRuntime } from './cursorFlashlightStore';

const FLASHLIGHT_COLOR = '#fff0d8';

export default function CursorSpotlight() {
  const { camera, gl } = useThree();
  const lightRef = useRef();
  const targetRef = useRef();
  const lastDebugStateRef = useRef('');
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const waterPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const updateDebugState = useCallback((state, beamDegrees) => {
    const debugKey = `${state}:${beamDegrees}`;
    if (debugKey === lastDebugStateRef.current) {
      return;
    }

    lastDebugStateRef.current = debugKey;
    gl.domElement.dataset.ddgCursorFlashlight = state;
    gl.domElement.dataset.ddgCursorFlashlightBeam = String(beamDegrees);
  }, [gl]);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }

    return () => {
      delete gl.domElement.dataset.ddgCursorFlashlight;
      delete gl.domElement.dataset.ddgCursorFlashlightBeam;
    };
  }, [gl]);

  useFrame(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    const runtime = getCursorFlashlightRuntime();

    if (!light || !target) {
      return;
    }

    if (!runtime.enabled || !runtime.pointerInsideFrame) {
      light.visible = false;
      updateDebugState(runtime.enabled ? 'outside' : 'off', runtime.beamDegrees);
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      light.visible = false;
      updateDebugState('outside', runtime.beamDegrees);
      return;
    }

    pointerNdc.set(
      ((runtime.clientX - rect.left) / rect.width) * 2 - 1,
      -(((runtime.clientY - rect.top) / rect.height) * 2 - 1),
    );

    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    raycaster.setFromCamera(pointerNdc, camera);

    const hitWaterPlane = raycaster.ray.intersectPlane(waterPlane, hitPoint);
    const planeDistance = hitWaterPlane ? camera.position.distanceTo(hitPoint) : Infinity;
    if (!hitWaterPlane || planeDistance > 40) {
      raycaster.ray.at(18, hitPoint);
    }

    const distanceToTarget = camera.position.distanceTo(hitPoint);
    light.visible = true;
    light.position.copy(camera.position);
    light.angle = THREE.MathUtils.degToRad(runtime.beamDegrees * 0.5);
    light.distance = Math.max(12, distanceToTarget + 5);
    light.intensity = Math.min(96, Math.max(18, distanceToTarget * distanceToTarget * 0.18));
    target.position.copy(hitPoint);
    target.updateMatrixWorld();
    updateDebugState('on', runtime.beamDegrees);
  });

  return (
    <>
      <spotLight
        ref={lightRef}
        name="cursor-flashlight"
        color={FLASHLIGHT_COLOR}
        intensity={0}
        angle={THREE.MathUtils.degToRad(17)}
        penumbra={0.72}
        distance={18}
        decay={2}
        castShadow={false}
        visible={false}
      />
      <object3D ref={targetRef} name="cursor-flashlight-target" />
    </>
  );
}
