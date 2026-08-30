import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getCursorFlashlightRuntime,
  resetCursorFlashlightWorldRuntime,
  updateCursorFlashlightWorldRuntime,
} from './cursorFlashlightStore';

const FLASHLIGHT_COLOR = '#fff0d8';

// three skips an invisible light entirely, and the light COUNT is part of the
// program cache key. Mounting these two hidden and showing them on the first
// pointer entry therefore recompiled every lit material in the scene at the
// moment the visitor first moved the mouse over the art, and re-uploaded their
// uniforms on every enter and leave after that. An intensity of zero is a black
// light: it stays in the count and adds exactly nothing to the image.
export default function CursorSpotlight() {
  const { camera, gl, scene } = useThree();
  const lightRef = useRef();
  const glintLightRef = useRef();
  const targetRef = useRef();
  const lastDebugStateRef = useRef('');
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const sourcePosition = useMemo(() => new THREE.Vector3(), []);
  const glintPosition = useMemo(() => new THREE.Vector3(), []);
  const lightDirection = useMemo(() => new THREE.Vector3(), []);
  const cameraRight = useMemo(() => new THREE.Vector3(), []);
  const cameraUp = useMemo(() => new THREE.Vector3(), []);
  const surfaceNormal = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const normalMatrix = useMemo(() => new THREE.Matrix3(), []);
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
    gl.domElement.dataset.ddgCursorFlashlightOrigin = 'camera-offset-clamped';
    gl.domElement.dataset.ddgCursorFlashlightMaterials = 'water-and-submerged';
    gl.domElement.dataset.ddgCursorFlashlightRig = 'key-glint';
    gl.domElement.dataset.ddgCursorFlashlightShadows = 'scene-key';

    return () => {
      resetCursorFlashlightWorldRuntime();
      delete gl.domElement.dataset.ddgCursorFlashlight;
      delete gl.domElement.dataset.ddgCursorFlashlightBeam;
      delete gl.domElement.dataset.ddgCursorFlashlightIntensity;
      delete gl.domElement.dataset.ddgCursorFlashlightSoftness;
      delete gl.domElement.dataset.ddgCursorFlashlightOrigin;
      delete gl.domElement.dataset.ddgCursorFlashlightMaterials;
      delete gl.domElement.dataset.ddgCursorFlashlightRig;
      delete gl.domElement.dataset.ddgCursorFlashlightHit;
      delete gl.domElement.dataset.ddgCursorFlashlightShadows;
    };
  }, [gl]);

  useFrame(() => {
    const light = lightRef.current;
    const glintLight = glintLightRef.current;
    const target = targetRef.current;
    const runtime = getCursorFlashlightRuntime();

    if (!light || !glintLight || !target) {
      return;
    }

    if (!runtime.enabled || !runtime.pointerInsideFrame) {
      light.intensity = 0;
      glintLight.intensity = 0;
      gl.domElement.dataset.ddgCursorFlashlightHit = 'none';
      resetCursorFlashlightWorldRuntime();
      updateDebugState(runtime.enabled ? 'outside' : 'off', runtime);
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      light.intensity = 0;
      glintLight.intensity = 0;
      gl.domElement.dataset.ddgCursorFlashlightHit = 'none';
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
    let planeDistance = hitWaterPlane ? camera.position.distanceTo(hitPoint) : Infinity;
    const solidRoots = [
      scene.getObjectByName('boat'),
      scene.getObjectByName('sculpture'),
    ].filter(Boolean);
    const solidHit = solidRoots.length > 0
      ? raycaster.intersectObjects(solidRoots, true)[0]
      : null;
    const aimedAtSolid = Boolean(solidHit && solidHit.distance <= planeDistance);

    if (aimedAtSolid) {
      hitPoint.copy(solidHit.point);
      planeDistance = solidHit.distance;
      if (solidHit.face?.normal && solidHit.object) {
        normalMatrix.getNormalMatrix(solidHit.object.matrixWorld);
        surfaceNormal.copy(solidHit.face.normal).applyNormalMatrix(normalMatrix).normalize();
      } else {
        surfaceNormal.set(0, 1, 0);
      }
    } else if (!hitWaterPlane || planeDistance > 40) {
      raycaster.ray.at(18, hitPoint);
      planeDistance = camera.position.distanceTo(hitPoint);
      surfaceNormal.set(0, 1, 0);
    } else {
      surfaceNormal.set(0, 1, 0);
    }

    // A small camera-space offset makes projected shadows and grazing highlights
    // visible instead of hiding them directly behind the viewed object. Clamp the
    // virtual lamp above the waterline: a fixed world-Y offset used to sink it at
    // low cameras and leave only the decorative screen-space halo.
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const keyOffset = THREE.MathUtils.clamp(planeDistance * 0.08, 0.55, 1.15);
    sourcePosition
      .copy(camera.position)
      .addScaledVector(cameraRight, -keyOffset)
      .addScaledVector(cameraUp, -keyOffset * 0.3);
    sourcePosition.y = Math.max(sourcePosition.y, 0.12);
    lightDirection.copy(hitPoint).sub(sourcePosition).normalize();

    const distanceToTarget = sourcePosition.distanceTo(hitPoint);
    const outerAngle = THREE.MathUtils.degToRad(runtime.beamDegrees * 0.5);
    const innerAngle = outerAngle * (1 - runtime.lightSoftness);
    const lightRange = Math.max(36, distanceToTarget + 18);
    const intensity = Math.min(96, Math.max(18, distanceToTarget * distanceToTarget * 0.18))
      * runtime.lightIntensity;
    light.position.copy(sourcePosition);
    light.angle = outerAngle;
    light.penumbra = runtime.lightSoftness;
    light.distance = lightRange;
    light.intensity = intensity;
    target.position.copy(hitPoint);
    target.updateMatrixWorld();

    // A short-range helper is the deliberate look-dev cheat: it sits just in
    // front of the hit surface and restores a controlled specular glint without
    // becoming a second broad pool of light or changing the scene geometry.
    const glintStandoff = THREE.MathUtils.clamp(planeDistance * 0.08, 0.55, 1.35);
    glintPosition
      .copy(hitPoint)
      .addScaledVector(raycaster.ray.direction, -glintStandoff)
      .addScaledVector(surfaceNormal, aimedAtSolid ? 0.16 : 0.08);
    glintLight.position.copy(glintPosition);
    glintLight.intensity = (aimedAtSolid ? 2.6 : 0.8) * runtime.lightIntensity;
    gl.domElement.dataset.ddgCursorFlashlightHit = aimedAtSolid ? 'solid' : 'water';
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
      />
      <pointLight
        ref={glintLightRef}
        name="cursor-flashlight-glint"
        color={FLASHLIGHT_COLOR}
        intensity={0}
        distance={4.5}
        decay={2}
        castShadow={false}
      />
      <object3D ref={targetRef} name="cursor-flashlight-target" />
    </>
  );
}
