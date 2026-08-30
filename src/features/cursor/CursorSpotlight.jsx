import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getCursorFlashlightRuntime,
  resetCursorFlashlightWorldRuntime,
  updateCursorFlashlightWorldRuntime,
} from './cursorFlashlightStore';

const FLASHLIGHT_COLOR = '#fff0d8';
const SOURCE_BELOW_CAMERA_METERS = 0.18;

export default function CursorSpotlight() {
  const { camera, gl } = useThree();
  const lightRef = useRef();
  const targetRef = useRef();
  const lastDebugStateRef = useRef('');
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const sourcePosition = useMemo(() => new THREE.Vector3(), []);
  const lightDirection = useMemo(() => new THREE.Vector3(), []);
  const waterPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const updateDebugState = useCallback((state, runtime) => {
    const debugKey = [
      state,
      runtime.beamDegrees,
      runtime.lightIntensity,
      runtime.lightSoftness,
    ].join(':');
    if (debugKey === lastDebugStateRef.current) {
      return;
    }

    lastDebugStateRef.current = debugKey;
    gl.domElement.dataset.ddgCursorFlashlight = state;
    gl.domElement.dataset.ddgCursorFlashlightBeam = String(runtime.beamDegrees);
    gl.domElement.dataset.ddgCursorFlashlightIntensity = String(runtime.lightIntensity);
    gl.domElement.dataset.ddgCursorFlashlightSoftness = String(runtime.lightSoftness);
  }, [gl]);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }

    gl.domElement.dataset.ddgCursorFlashlightOrigin = 'camera-below';
    gl.domElement.dataset.ddgCursorFlashlightMaterials = 'water-and-submerged';

    return () => {
      resetCursorFlashlightWorldRuntime();
      delete gl.domElement.dataset.ddgCursorFlashlight;
      delete gl.domElement.dataset.ddgCursorFlashlightBeam;
      delete gl.domElement.dataset.ddgCursorFlashlightIntensity;
      delete gl.domElement.dataset.ddgCursorFlashlightSoftness;
      delete gl.domElement.dataset.ddgCursorFlashlightOrigin;
      delete gl.domElement.dataset.ddgCursorFlashlightMaterials;
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
      resetCursorFlashlightWorldRuntime();
      updateDebugState(runtime.enabled ? 'outside' : 'off', runtime);
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      light.visible = false;
      resetCursorFlashlightWorldRuntime();
      updateDebugState('outside', runtime);
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

    // The source follows the camera but sits slightly below its optical centre.
    // It therefore feels handheld and never floats above the viewer by default.
    sourcePosition.copy(camera.position);
    sourcePosition.y -= SOURCE_BELOW_CAMERA_METERS;
    lightDirection.copy(hitPoint).sub(sourcePosition).normalize();

    const distanceToTarget = sourcePosition.distanceTo(hitPoint);
    const outerAngle = THREE.MathUtils.degToRad(runtime.beamDegrees * 0.5);
    const innerAngle = outerAngle * (1 - runtime.lightSoftness);
    const lightRange = Math.max(36, distanceToTarget + 18);
    const intensity = Math.min(96, Math.max(18, distanceToTarget * distanceToTarget * 0.18))
      * runtime.lightIntensity;
    light.visible = true;
    light.position.copy(sourcePosition);
    light.angle = outerAngle;
    light.penumbra = runtime.lightSoftness;
    light.distance = lightRange;
    light.intensity = intensity;
    target.position.copy(hitPoint);
    target.updateMatrixWorld();
    updateCursorFlashlightWorldRuntime({
      source: sourcePosition,
      direction: lightDirection,
      intensity,
      range: lightRange,
      innerCos: Math.cos(innerAngle),
      outerCos: Math.cos(outerAngle),
      hitsWater: Boolean(hitWaterPlane),
    });
    updateDebugState('on', runtime);
  }, -3);

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
