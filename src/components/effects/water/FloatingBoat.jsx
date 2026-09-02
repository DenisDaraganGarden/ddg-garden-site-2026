import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import { Bvh } from '@react-three/drei';
import {
  BOAT_CUTOUT_STENCIL_REF,
  BOAT_MAX_PITCH,
  BOAT_MAX_ROLL,
  BOAT_NEUTRAL_Y,
  BOAT_PROBE_INTERVAL,
  BOAT_PROBE_OFFSETS,
  BOAT_TARGET_Y_MAX,
  BOAT_TARGET_Y_MIN,
  CURSOR_BOAT_IMPACT_DURATION,
  CURSOR_BOAT_IMPACT_RADIUS_FACTOR,
  DEFAULT_BOAT_ANCHOR,
  clamp,
  effectiveImpulseRadius,
  isDocumentCurrentlyVisible,
} from './constants';
import { useDragOnPlane } from './useDragOnPlane';
import { ENV_REFLECTION_SCALE, configureMaps, createLiftedTextureTint } from './pbrMaterial';
import {
  applyBoatDynamicsImpulse,
  BOAT_WAKE_INTERVAL,
  createBoatDynamicsState,
  resolveBoatImpact,
  resolveBoatWakeStrength,
  stepBoatDynamics,
} from './boatDynamics';
import { resolveBoatCockpitSeal } from './boatCockpitSeal';

// The boat floats: buoyancy probes read the height field, the hull follows it in
// pitch, roll and heave, and a stencil cutout keeps the cockpit dry.

const BOAT_WAKE_PROBE_INDICES = Object.freeze([1, 2, 3, 4]);

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
  onWorldPositionChange,
  isWorldPositionReportingActive,
  onLandingSurfaceReady,
}) {
  const anchorRef = useRef();
  const boatRef = useRef();
  const boatAnchorRef = useRef(new THREE.Vector3(
    layout?.boatPosition?.x ?? settings?.boatPosition?.x ?? DEFAULT_BOAT_ANCHOR.x,
    0,
    layout?.boatPosition?.z ?? settings?.boatPosition?.z ?? DEFAULT_BOAT_ANCHOR.z,
  ));
  const boatMatrixRef = useRef(new THREE.Matrix4());
  const audioWorldPositionRef = useRef(new THREE.Vector3());
  const averageNormalRef = useRef(new THREE.Vector3());
  const probeAccumulatorRef = useRef(0);
  const lastProbesRef = useRef(null);
  const dynamicsRef = useRef(createBoatDynamicsState());
  const targetPoseRef = useRef({ heave: 0, pitch: 0, roll: 0 });
  const lastImpactSerialRef = useRef(0);
  const lastCursorImpactAtRef = useRef(-Infinity);
  const wakeAccumulatorRef = useRef(0);
  const wakePointCursorRef = useRef(0);
  const wakeCountRef = useRef(0);
  const wakeWorldPointRef = useRef(new THREE.Vector3());
  const cockpitSealRef = useRef();
  const cockpitSealProjectionRef = useRef(new THREE.Vector3());
  const diagnosticsFrameRef = useRef(0);
  const dynamicsLimitsRef = useRef({
    heave: [BOAT_TARGET_Y_MIN, BOAT_TARGET_Y_MAX],
    pitch: [-BOAT_MAX_PITCH, BOAT_MAX_PITCH],
    roll: [-BOAT_MAX_ROLL, BOAT_MAX_ROLL],
  });
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
    const wood = new THREE.MeshPhysicalMaterial({
      map: baseColorMap,
      color: createLiftedTextureTint(settings.boatColor),
      roughnessMap,
      roughness: settings.boatRoughness,
      metalness: THREE.MathUtils.clamp(settings.boatMetalness, 0, 0.3),
      bumpMap,
      bumpScale: 0.4,
      clearcoat: settings.boatClearcoat,
      clearcoatRoughness: settings.boatClearcoatRoughness,
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
    settings.boatClearcoat,
    settings.boatClearcoatRoughness,
    settings.boatMetalness,
    settings.boatRoughness,
  ]);

  useEffect(() => () => {
    woodMaterial.dispose();
    metalMaterial.dispose();
  }, [woodMaterial, metalMaterial]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return undefined;
    }

    gl.domElement.dataset.ddgBoatDynamics = 'spring-v2';
    return () => {
      delete gl.domElement.dataset.ddgBoatDynamics;
      delete gl.domElement.dataset.ddgBoatPhysics;
      delete window.__DDG_BOAT__;
    };
  }, [gl]);

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
    const targetPose = targetPoseRef.current;

    boatMatrixRef.current.makeRotationY(boatYawRadians);
    const boatProbeOffsets = boatProbeOffsetsRef.current;
    for (let index = 0; index < boatProbeOffsets.length; index += 1) {
      probeWorldPointsRef.current[index]
        .copy(boatProbeOffsets[index])
        .applyMatrix4(boatMatrixRef.current)
        .add(boatAnchor);
    }

    if (!useGpuProbes) {
      // Avoid synchronous GPU->CPU readback on phones. The public effect only
      // needs believable buoyancy, so two phase-shifted waves are sufficient.
      const phase = clock.elapsedTime + boatAnchor.x * 0.37 - boatAnchor.z * 0.29;
      const amplitude = Math.min(settings.waveAmplitude, 0.12);
      targetPose.heave = clamp(
        BOAT_NEUTRAL_Y + boatHeightOffset
          + Math.sin(phase * 0.83) * amplitude * 0.42
          + Math.sin(phase * 1.71 + 1.4) * amplitude * 0.18,
        BOAT_TARGET_Y_MIN + boatHeightOffset,
        BOAT_TARGET_Y_MAX + boatHeightOffset,
      );
      targetPose.pitch = Math.sin(phase * 0.71 + 0.6) * amplitude * 0.58;
      targetPose.roll = Math.sin(phase * 0.94 - 0.8) * amplitude * 0.72;
    } else {
      // GPU readback is intentionally slower than the render loop. Filtering its
      // target before the spring prevents the 8-bit samples from becoming steps.
      probeAccumulatorRef.current += delta;
      let probes = lastProbesRef.current;
      if (probeAccumulatorRef.current >= probeInterval || !probes) {
        probeAccumulatorRef.current = 0;
        const sampled = runtime.sampleBoatProbes(probeWorldPointsRef.current, 'boat');
        if (sampled) {
          probes = sampled;
          lastProbesRef.current = sampled;
        }
      }

      if (!probes) {
        targetPose.heave = BOAT_NEUTRAL_Y + boatHeightOffset;
        targetPose.pitch = 0;
        targetPose.roll = 0;
      } else {
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

        targetPose.heave = centerHeight + BOAT_NEUTRAL_Y + boatHeightOffset;
        targetPose.pitch = (Math.atan2(
          sternHeight - bowHeight,
          boatProbeSpansRef.current.longitudinal,
        ) * 0.7) + (normalPitch * 0.55);
        targetPose.roll = (Math.atan2(
          rightHeight - leftHeight,
          boatProbeSpansRef.current.lateral,
        ) * 0.7) + (normalRoll * 0.55);
      }
    }

    targetPose.heave = clamp(
      targetPose.heave,
      BOAT_TARGET_Y_MIN + boatHeightOffset,
      BOAT_TARGET_Y_MAX + boatHeightOffset,
    );
    targetPose.pitch = clamp(targetPose.pitch, -BOAT_MAX_PITCH, BOAT_MAX_PITCH);
    targetPose.roll = clamp(targetPose.roll, -BOAT_MAX_ROLL, BOAT_MAX_ROLL);

    const pointerState = runtime.pointerStateRef.current;
    const impactSerial = pointerState?.recentImpulseSerial ?? 0;
    if (impactSerial !== lastImpactSerialRef.current) {
      lastImpactSerialRef.current = impactSerial;
      const now = performance.now() * 0.001;
      const impactAge = now - pointerState.recentImpulseTime;
      const source = pointerState.recentImpulseSource ?? 'external';
      const cursorRateLimited = source === 'cursor'
        && now - lastCursorImpactAtRef.current < 0.09;

      if (
        !cursorRateLimited
        && impactAge >= 0
        && impactAge <= CURSOR_BOAT_IMPACT_DURATION
      ) {
        const impact = resolveBoatImpact({
          // The GLB origin is offset from the hull by more than a metre. Use the
          // centre buoyancy probe so the visible boat, not its authoring pivot,
          // is what the cursor actually pushes.
          boatX: probeWorldPointsRef.current[0].x,
          boatZ: probeWorldPointsRef.current[0].z,
          pointX: pointerState.recentWorldPoint.x,
          pointZ: pointerState.recentWorldPoint.z,
          strength: pointerState.recentImpulseStrength,
          radius: Math.max(
            effectiveImpulseRadius(settings) * CURSOR_BOAT_IMPACT_RADIUS_FACTOR,
            1.15,
          ),
          source,
          boatYaw: boatYawRadians,
        });

        if (impact.energy > 0.005) {
          applyBoatDynamicsImpulse(dynamicsRef.current, impact);
          if (source === 'cursor') lastCursorImpactAtRef.current = now;
        }
      }
    }

    const limits = dynamicsLimitsRef.current;
    limits.heave[0] = BOAT_TARGET_Y_MIN + boatHeightOffset;
    limits.heave[1] = BOAT_TARGET_Y_MAX + boatHeightOffset;
    stepBoatDynamics(dynamicsRef.current, targetPose, delta, limits);
    const dynamics = dynamicsRef.current;

    boatRef.current.position.set(0, dynamics.heave, 0);
    boatRef.current.rotation.set(dynamics.pitch, boatYawRadians, dynamics.roll);

    if (cockpitSealRef.current) {
      boatRef.current.updateMatrix();
      const sealProjection = cockpitSealProjectionRef.current
        .set(cockpitSeal.centerX, cockpitSeal.localY, cockpitSeal.centerZ)
        .applyMatrix4(boatRef.current.matrix);
      cockpitSealRef.current.position.set(sealProjection.x, 0.012, sealProjection.z);
      cockpitSealRef.current.rotation.y = boatYawRadians;
    }

    wakeAccumulatorRef.current += delta;
    if (wakeAccumulatorRef.current >= BOAT_WAKE_INTERVAL) {
      const wakeStrength = resolveBoatWakeStrength(dynamics);
      if (wakeStrength > 0) {
        const pointIndex = BOAT_WAKE_PROBE_INDICES[
          wakePointCursorRef.current % BOAT_WAKE_PROBE_INDICES.length
        ];
        wakePointCursorRef.current += 1;
        // Start outside the buoyancy footprint. The wake still belongs to the
        // shared water, but its initial crest cannot jump the probe that made it.
        const wakePoint = wakeWorldPointRef.current
          .copy(probeWorldPointsRef.current[pointIndex])
          .sub(probeWorldPointsRef.current[0])
          .multiplyScalar(1.6)
          .add(probeWorldPointsRef.current[0]);
        if (runtime.emitWaterImpulse(wakePoint, {
          strength: wakeStrength,
          source: 'boat-wake',
          affectsBoat: false,
          priority: -1,
        })) {
          wakeCountRef.current += 1;
        }
        wakeAccumulatorRef.current = 0;
      } else {
        wakeAccumulatorRef.current = BOAT_WAKE_INTERVAL;
      }
    }

    if (
      import.meta.env.DEV
      && typeof window !== 'undefined'
      && diagnosticsFrameRef.current++ % 6 === 0
    ) {
      const diagnostics = {
        model: 'spring-v2',
        position: { y: dynamics.heave },
        rotation: { pitch: dynamics.pitch, roll: dynamics.roll },
        velocity: {
          heave: dynamics.heaveVelocity,
          pitch: dynamics.pitchVelocity,
          roll: dynamics.rollVelocity,
        },
        target: { ...targetPose },
        externalEnergy: dynamics.externalEnergy,
        wakeCount: wakeCountRef.current,
        lastImpactSource: pointerState?.recentImpulseSource ?? 'none',
      };
      window.__DDG_BOAT__ = diagnostics;
      gl.domElement.dataset.ddgBoatPhysics = JSON.stringify(diagnostics);
    }
  }, -5);

  // Run after buoyancy so the sound follows the hull visitors actually see,
  // including heave. The callback writes to Web Audio directly and never enters
  // React state or the camera editor.
  useFrame(() => {
    if (
      !boatRef.current
      || typeof onWorldPositionChange !== 'function'
      || (
        typeof isWorldPositionReportingActive === 'function'
        && !isWorldPositionReportingActive()
      )
    ) {
      return;
    }

    boatRef.current.updateWorldMatrix(true, false);
    boatRef.current.getWorldPosition(audioWorldPositionRef.current);
    onWorldPositionChange(
      audioWorldPositionRef.current.x,
      audioWorldPositionRef.current.y,
      audioWorldPositionRef.current.z,
    );
  }, -4);

  const obj = useLoader(GLTFLoader, '/models/boat/OBJ_boat2.0.glb').scene;

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

  useLayoutEffect(() => {
    if (typeof onLandingSurfaceReady !== 'function' || !boatRef.current) {
      return undefined;
    }

    // `boat` carries the live heave/pitch/roll. Landing anchors must be its
    // children, not only children of the static drag anchor.
    onLandingSurfaceReady({
      surface: 'boat',
      root: boatRef.current,
      collisionObject: boatRef.current,
      revision: clonedObj,
    });

    return () => onLandingSurfaceReady({ surface: 'boat', root: null, collisionObject: null });
  }, [clonedObj, onLandingSurfaceReady]);

  // Find the hull footprint in boat-local space. The dry seal uses only the
  // cockpit centre; the hull itself already provides the exterior waterline.
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
  const cockpitSeal = useMemo(() => resolveBoatCockpitSeal(hullFootprint, {
    fitWidth: settings.boatCutoutFitWidth,
    fitLength: settings.boatCutoutFitLength,
  }), [hullFootprint, settings.boatCutoutFitLength, settings.boatCutoutFitWidth]);

  return (
    <>
      <group
        ref={anchorRef}
        name="boat-anchor"
        {...dragHandlers}
      >
        <group ref={boatRef} name="boat">
          {/* The flashlight raycasts this hull every frame the pointer is over
              it. Without a bounds tree that is 70,662 triangles tested one at a
              time; with one it is a handful. drei builds it once, on mount. */}
          <Bvh>
            <primitive object={clonedObj} />
          </Bvh>
        </group>
        {/* A narrow horizontal seal follows the cockpit's projected centre but
            never tilts into a visible dry plane. The hull supplies its outline. */}
        <group
          ref={cockpitSealRef}
          name="boat-cockpit-seal-anchor"
          position={[cockpitSeal.centerX, 0.012, cockpitSeal.centerZ]}
          rotation={[0, THREE.MathUtils.degToRad(settings.boatYaw ?? 18), 0]}
        >
          <mesh
            name="boat-cockpit-seal"
            visible={cutoutActive}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[cockpitSeal.width, cockpitSeal.length, 1]}
            renderOrder={cutoutDebug ? 30 : 0.5}
          >
            <shapeGeometry args={[cutoutShape, 24]} />
            <meshBasicMaterial
              color={cutoutDebug ? '#ff00ff' : '#ffffff'}
              side={THREE.DoubleSide}
              transparent={cutoutDebug}
              opacity={cutoutDebug ? 0.55 : 1}
              colorWrite={cutoutDebug}
              depthTest
              depthWrite={false}
              toneMapped={false}
              stencilWrite={!cutoutDebug}
              stencilRef={BOAT_CUTOUT_STENCIL_REF}
              stencilFunc={THREE.AlwaysStencilFunc}
              stencilZPass={THREE.ReplaceStencilOp}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}
