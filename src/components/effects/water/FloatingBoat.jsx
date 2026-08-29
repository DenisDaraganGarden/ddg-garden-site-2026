import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';
import { BOAT_CUTOUT_STENCIL_REF, BOAT_MAX_PITCH, BOAT_MAX_ROLL, BOAT_NEUTRAL_Y, BOAT_PROBE_INTERVAL, BOAT_PROBE_OFFSETS, BOAT_TARGET_Y_MAX, BOAT_TARGET_Y_MIN, CURSOR_BOAT_IMPACT_DURATION, CURSOR_BOAT_IMPACT_RADIUS_FACTOR, DEFAULT_BOAT_ANCHOR, clamp, isDocumentCurrentlyVisible } from './constants';
import { useDragOnPlane } from './useDragOnPlane';
import { ENV_REFLECTION_SCALE, configureMaps } from './pbrMaterial';

// The boat floats: buoyancy probes read the height field, the hull follows it in
// pitch, roll and heave, and a stencil cutout keeps the cockpit dry.

export default function FloatingBoat({
  settings,
  lighting,
  layout,
  runtime,
  mode,
  orbitRef,
  onBoatPositionChange,
  probeInterval = BOAT_PROBE_INTERVAL,
  useGpuProbes = true,
}) {
  const anchorRef = useRef();
  const boatRef = useRef();
  const boatAnchorRef = useRef(new THREE.Vector3(
    layout?.boatPosition?.x ?? settings?.boatPosition?.x ?? DEFAULT_BOAT_ANCHOR.x,
    0,
    layout?.boatPosition?.z ?? settings?.boatPosition?.z ?? DEFAULT_BOAT_ANCHOR.z,
  ));
  const targetVector = useRef(new THREE.Vector3());
  const boatMatrixRef = useRef(new THREE.Matrix4());
  const averageNormalRef = useRef(new THREE.Vector3());
  const cursorToBoatRef = useRef(new THREE.Vector2());
  const probeAccumulatorRef = useRef(0);
  const lastProbesRef = useRef(null);
  const boatProbeOffsetsRef = useRef(BOAT_PROBE_OFFSETS.map((offset) => offset.clone()));
  const boatProbeSpansRef = useRef({ longitudinal: 1.9, lateral: 0.84 });
  const probeWorldPointsRef = useRef(BOAT_PROBE_OFFSETS.map(() => new THREE.Vector3()));
  const commitBoatPosition = useCallback((position) => {
    if (typeof onBoatPositionChange !== 'function' || !position) {
      return;
    }

    onBoatPositionChange({
      x: Number(position.x.toFixed(4)),
      z: Number(position.z.toFixed(4)),
    });
  }, [onBoatPositionChange]);
  const applyBoatAnchor = useCallback((x, z) => {
    const halfExtent = settings.waterExtent * 0.5;
    const nextX = clamp(x, -halfExtent, halfExtent);
    const nextZ = clamp(z, -halfExtent, halfExtent);
    boatAnchorRef.current.set(nextX, 0, nextZ);

    if (anchorRef.current) {
      anchorRef.current.position.set(nextX, 0, nextZ);
    }
  }, [settings.waterExtent]);
  const setOrbitEnabled = useCallback((enabled) => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = enabled;
    }
  }, [orbitRef]);

  const { isDraggingRef, dragHandlers } = useDragOnPlane({
    mode,
    anchorRef,
    fallbackAnchorRef: boatAnchorRef,
    planeHeight: 0,
    applyAnchor: applyBoatAnchor,
    commitPosition: commitBoatPosition,
    setOrbitEnabled,
  });

  const { gl } = useThree();
  const boatTextures = useLoader(THREE.TextureLoader, [
    '/models/boat/boat_basecolor.webp',
    '/models/boat/boat_roughness.webp',
    '/models/boat/boat_bump.webp',
  ]);

  const { woodMaterial, metalMaterial } = useMemo(() => {
    const [baseColorMap, roughnessMap, bumpMap] = boatTextures;
    const envReflection = lighting.environment.reflection * ENV_REFLECTION_SCALE.boat;

    configureMaps(gl, { color: [baseColorMap], data: [roughnessMap, bumpMap] });

    // Wood hull/oars: PBR maps authored in 3ds Max (no more flat-graphite override).
    const wood = new THREE.MeshStandardMaterial({
      map: baseColorMap,
      // `color` is a real albedo tint: white keeps the authored map, while the
      // published near-black value produces the current charred-black boat.
      color: new THREE.Color(settings.boatColor),
      roughnessMap,
      roughness: settings.boatRoughness,
      metalness: THREE.MathUtils.clamp(settings.boatMetalness, 0, 0.3),
      bumpMap,
      bumpScale: 0.4,
      envMapIntensity: envReflection,
      side: THREE.DoubleSide,
    });

    // Black metal: oar fittings / brackets (OBJ_wire_metall).
    const metal = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0b0b0d'),
      metalness: 0.85,
      roughness: 0.42,
      envMapIntensity: envReflection,
      side: THREE.DoubleSide,
    });

    return { woodMaterial: wood, metalMaterial: metal };
  }, [
    boatTextures,
    gl,
    lighting,
    settings.boatColor,
    settings.boatMetalness,
    settings.boatRoughness,
  ]);

  useEffect(() => () => {
    woodMaterial.dispose();
    metalMaterial.dispose();
  }, [woodMaterial, metalMaterial]);

  useEffect(() => {
    const anchorX = layout?.boatPosition?.x ?? settings?.boatPosition?.x ?? DEFAULT_BOAT_ANCHOR.x;
    const anchorZ = layout?.boatPosition?.z ?? settings?.boatPosition?.z ?? DEFAULT_BOAT_ANCHOR.z;

    if (isDraggingRef.current) {
      return;
    }

    applyBoatAnchor(anchorX, anchorZ);
  }, [applyBoatAnchor, isDraggingRef, layout?.boatPosition?.x, layout?.boatPosition?.z, settings?.boatPosition?.x, settings?.boatPosition?.z]);
  useFrame(({ clock }, delta) => {
    if (!boatRef.current || !isDocumentCurrentlyVisible()) {
      return;
    }

    const boatAnchor = anchorRef.current?.position ?? boatAnchorRef.current;
    boatAnchorRef.current.copy(boatAnchor);
    const boatHeightOffset = settings.boatHeightOffset ?? 0;
    const boatYawRadians = THREE.MathUtils.degToRad(settings.boatYaw ?? 18);

    if (!useGpuProbes) {
      // Avoid synchronous GPU->CPU readback on phones. The public effect only
      // needs believable buoyancy, so two phase-shifted waves are sufficient.
      const phase = clock.elapsedTime + boatAnchor.x * 0.37 - boatAnchor.z * 0.29;
      const amplitude = Math.min(settings.waveAmplitude, 0.12);
      const targetY = clamp(
        BOAT_NEUTRAL_Y + boatHeightOffset
          + Math.sin(phase * 0.83) * amplitude * 0.42
          + Math.sin(phase * 1.71 + 1.4) * amplitude * 0.18,
        BOAT_TARGET_Y_MIN + boatHeightOffset,
        BOAT_TARGET_Y_MAX + boatHeightOffset,
      );
      const targetPitch = Math.sin(phase * 0.71 + 0.6) * amplitude * 0.58;
      const targetRoll = Math.sin(phase * 0.94 - 0.8) * amplitude * 0.72;

      targetVector.current.set(0, targetY, 0);
      boatRef.current.position.lerp(targetVector.current, 1 - Math.exp(-delta * 3.4));
      boatRef.current.rotation.y = boatYawRadians;
      boatRef.current.rotation.x = THREE.MathUtils.damp(boatRef.current.rotation.x, targetPitch, 3.4, delta);
      boatRef.current.rotation.z = THREE.MathUtils.damp(boatRef.current.rotation.z, targetRoll, 3.4, delta);
      return;
    }

    boatMatrixRef.current.makeRotationY(boatYawRadians);
    const boatProbeOffsets = boatProbeOffsetsRef.current;
    for (let index = 0; index < boatProbeOffsets.length; index += 1) {
      probeWorldPointsRef.current[index]
        .copy(boatProbeOffsets[index])
        .applyMatrix4(boatMatrixRef.current)
        .add(boatAnchor);
    }

    // Throttle the expensive probe readback; reuse the last sample between reads.
    probeAccumulatorRef.current += delta;
    let probes = lastProbesRef.current;
    if (probeAccumulatorRef.current >= probeInterval || !probes) {
      probeAccumulatorRef.current = 0;
      const sampled = runtime.sampleBoatProbes(probeWorldPointsRef.current);
      if (sampled) {
        probes = sampled;
        lastProbesRef.current = sampled;
      }
    }

    if (!probes) {
      boatRef.current.position.y = THREE.MathUtils.damp(
        boatRef.current.position.y,
        BOAT_NEUTRAL_Y + boatHeightOffset,
        4.2,
        delta,
      );
      boatRef.current.rotation.x = THREE.MathUtils.damp(boatRef.current.rotation.x, 0, 4.2, delta);
      boatRef.current.rotation.z = THREE.MathUtils.damp(boatRef.current.rotation.z, 0, 4.2, delta);
      boatRef.current.rotation.y = boatYawRadians;
      return;
    }

    // Use the same height scale as the visible water. The old 3.8x multiplier
    // made the hull move ahead of the surface and read as delayed animation.
    const buoyancyGain = settings.waveAmplitude * 1.15;
    const centerHeight = probes[0].height * buoyancyGain;
    const bowHeight = probes[1].height * buoyancyGain;
    const sternHeight = probes[2].height * buoyancyGain;
    const leftHeight = probes[3].height * buoyancyGain;
    const rightHeight = probes[4].height * buoyancyGain;
    averageNormalRef.current.set(0, 0, 0);
    for (let index = 0; index < probes.length; index += 1) {
      averageNormalRef.current.add(probes[index].normal);
    }
    averageNormalRef.current.normalize();
    const averageNormal = averageNormalRef.current;
    const normalPitch = Math.atan2(-averageNormal.z, Math.max(averageNormal.y, 0.25));
    const normalRoll = Math.atan2(averageNormal.x, Math.max(averageNormal.y, 0.25));

    let targetY = centerHeight + BOAT_NEUTRAL_Y + boatHeightOffset;
    let targetPitch = clamp(
      (Math.atan2(sternHeight - bowHeight, boatProbeSpansRef.current.longitudinal) * 0.7)
        + (normalPitch * 0.55),
      -0.28,
      0.28,
    );
    let targetRoll = clamp(
      (Math.atan2(rightHeight - leftHeight, boatProbeSpansRef.current.lateral) * 0.7)
        + (normalRoll * 0.55),
      -0.34,
      0.34,
    );

    const pointerState = runtime.pointerStateRef.current;
    if (pointerState && Number.isFinite(pointerState.recentImpulseTime)) {
      const impactAge = (performance.now() * 0.001) - pointerState.recentImpulseTime;
      if (impactAge >= 0 && impactAge <= CURSOR_BOAT_IMPACT_DURATION) {
        cursorToBoatRef.current.set(
          boatAnchor.x - pointerState.recentWorldPoint.x,
          boatAnchor.z - pointerState.recentWorldPoint.z,
        );

        const cursorDistance = cursorToBoatRef.current.length();
        const influenceRadius = Math.max(settings.rippleRadius * CURSOR_BOAT_IMPACT_RADIUS_FACTOR, 1.25);
        const proximity = clamp(1 - (cursorDistance / influenceRadius), 0, 1);
        const timeFade = Math.exp(-impactAge * 3.0);
        const cursorImpact = proximity * timeFade * pointerState.recentImpulseStrength;

        if (cursorImpact > 0.001) {
          const invLength = cursorDistance > 0.0001 ? 1 / cursorDistance : 0;
          const directionX = cursorToBoatRef.current.x * invLength;
          const directionZ = cursorToBoatRef.current.y * invLength;
          const oscillation = Math.sin(impactAge * 17.5) * cursorImpact * 0.1;

          targetY += cursorImpact * 0.2;
          targetPitch = clamp(targetPitch + (directionZ * cursorImpact * 0.2) + (oscillation * 0.8), -0.32, 0.32);
          targetRoll = clamp(targetRoll + (-directionX * cursorImpact * 0.24) + (oscillation * 0.8), -0.36, 0.36);
        }
      }
    }

    targetY = clamp(targetY, BOAT_TARGET_Y_MIN + boatHeightOffset, BOAT_TARGET_Y_MAX + boatHeightOffset);
    targetPitch = clamp(targetPitch, -BOAT_MAX_PITCH, BOAT_MAX_PITCH);
    targetRoll = clamp(targetRoll, -BOAT_MAX_ROLL, BOAT_MAX_ROLL);

    targetVector.current.set(0, targetY, 0);
    boatRef.current.position.lerp(targetVector.current, 1 - Math.exp(-delta * 4.5));
    boatRef.current.rotation.y = boatYawRadians;
    boatRef.current.rotation.x = THREE.MathUtils.damp(boatRef.current.rotation.x, targetPitch, 4.5, delta);
    boatRef.current.rotation.z = THREE.MathUtils.damp(boatRef.current.rotation.z, targetRoll, 4.5, delta);
  }, -5);

  const obj = useLoader(OBJLoader, '/models/boat/OBJ_boat2.0.obj');

  const clonedObj = useMemo(() => {
    const clone = obj.clone();
    const pickMaterial = (material) => (
      material && material.name === 'OBJ_wire_metall' ? metalMaterial : woodMaterial
    );
    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      // Keep the model's own (custom) normals — do NOT recompute.
      child.material = Array.isArray(child.material)
        ? child.material.map(pickMaterial)
        : pickMaterial(child.material);
      child.castShadow = true;
      child.receiveShadow = true;
    });
    clone.scale.setScalar(settings.boatScale);
    clone.rotateY(Math.PI); // bow orientation — fine-tune via boatYaw if needed
    return clone;
  }, [obj, woodMaterial, metalMaterial, settings.boatScale]);

  // Auto-fit the cutout to the hull: take the largest sub-mesh footprint (the hull, not the
  // thin oars) in boat-local space, so the cap self-centres and self-sizes — no manual offset.
  const hullFootprint = useMemo(() => {
    clonedObj.updateMatrixWorld(true);
    const meshBox = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    const best = { center: new THREE.Vector3(0, 0, 0), size: new THREE.Vector3(0.84, 0.4, 1.9), area: -1 };

    clonedObj.traverse((child) => {
      if (!child.isMesh || !child.geometry) {
        return;
      }
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) {
        return;
      }
      meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
      meshBox.getSize(size);
      const area = size.x * size.z;
      if (area > best.area) {
        best.area = area;
        meshBox.getCenter(center);
        best.center.copy(center);
        best.size.copy(size);
      }
    });

    return { center: best.center.clone(), size: best.size.clone() };
  }, [clonedObj]);

  useLayoutEffect(() => {
    const offsets = boatProbeOffsetsRef.current;
    const centerX = hullFootprint.center.x;
    const centerZ = hullFootprint.center.z;
    const halfLength = Math.max(hullFootprint.size.z * 0.36, 0.65);
    const halfWidth = Math.max(hullFootprint.size.x * 0.32, 0.26);

    offsets[0].set(centerX, 0, centerZ);
    offsets[1].set(centerX, 0, centerZ + halfLength);
    offsets[2].set(centerX, 0, centerZ - halfLength);
    offsets[3].set(centerX - halfWidth, 0, centerZ);
    offsets[4].set(centerX + halfWidth, 0, centerZ);
    boatProbeSpansRef.current.longitudinal = halfLength * 2;
    boatProbeSpansRef.current.lateral = halfWidth * 2;
  }, [hullFootprint]);

  const cutoutShape = useMemo(() => {
    const shape = new THREE.Shape();

    // Normalized waterline footprint: widest through the cockpit and tapered
    // quickly at both ends. This avoids the dry halo produced by an ellipse.
    shape.moveTo(0, 0.5);
    shape.bezierCurveTo(0.16, 0.44, 0.46, 0.18, 0.5, -0.06);
    shape.bezierCurveTo(0.47, -0.3, 0.23, -0.47, 0, -0.5);
    shape.bezierCurveTo(-0.23, -0.47, -0.47, -0.3, -0.5, -0.06);
    shape.bezierCurveTo(-0.46, 0.18, -0.16, 0.44, 0, 0.5);

    return shape;
  }, []);

  const cutoutActive = settings.boatCutoutFitWidth > 0.05 && settings.boatCutoutFitLength > 0.05;
  const cutoutDebug = Boolean(settings.boatCutoutDebug);
  const capScaleX = Math.max(hullFootprint.size.x * settings.boatCutoutFitWidth, 0.01);
  const capScaleZ = Math.max(hullFootprint.size.z * settings.boatCutoutFitLength, 0.01);
  const cutoutYawRadians = THREE.MathUtils.degToRad(settings.boatYaw ?? 18);

  return (
    <>
      <group
        ref={anchorRef}
        name="boat-anchor"
      {...dragHandlers}
      >
        {/* Keep the stencil at the actual water plane and rotate only around Y.
            Pitch/roll/heave belong to the hull; applying them to the flat mask
            made the dry area drift across the cockpit as the boat moved. */}
        <group
          name="boat-cutout"
          position={[0, 0.012, 0]}
          rotation={[0, cutoutYawRadians, 0]}
        >
          <mesh
            name="boat-cutout-cap"
            visible={cutoutActive}
            position={[hullFootprint.center.x, 0, hullFootprint.center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[capScaleX, capScaleZ, 1]}
            renderOrder={cutoutDebug ? 30 : -1}
          >
            <shapeGeometry args={[cutoutShape, 24]} />
            <meshBasicMaterial
              color={cutoutDebug ? '#ff00ff' : '#ffffff'}
              side={THREE.DoubleSide}
              transparent={cutoutDebug}
              opacity={cutoutDebug ? 0.55 : 1}
              colorWrite={cutoutDebug}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
              stencilWrite={!cutoutDebug}
              stencilRef={BOAT_CUTOUT_STENCIL_REF}
              stencilFunc={THREE.AlwaysStencilFunc}
              stencilZPass={THREE.ReplaceStencilOp}
            />
          </mesh>
        </group>
        <group ref={boatRef} name="boat">
          <primitive object={clonedObj} />
        </group>
      </group>
    </>
  );
}
