import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODE_COUNTS, SEAGULL_ASSET } from './seagullCatalog';
import {
  createFlightAgents,
  getWingPose,
  HOME_SEAGULL_WATER_Y,
  updateFlightAgents,
} from '../features/home-scene/creatures/seagullFlight.js';
import { scareLandingAgent } from '../features/home-scene/creatures/seagullLanding.js';
import SeagullFeathers from '../features/home-scene/creatures/SeagullFeathers.jsx';
import {
  advancePointerResponse,
  createPointerSample,
  measurePointerInteraction,
} from '../features/home-scene/creatures/seagullPointerInteraction.js';
import {
  advanceDownedSeagulls,
  createSeagullShootingRuntime,
  findSeagullShotTarget,
  fireSeagullShot,
  SEAGULL_DOWNED_STATE,
  seagullShootingStats,
} from '../features/home-scene/creatures/seagullShooting.js';
import {
  resolveSeagullShadowCasters,
  SEAGULL_SHADOW_LOD,
} from '../features/home-scene/creatures/seagullShadowLod.js';
import {
  resolveSeagullReflectionParticipants,
  SEAGULL_REFLECTION_LOD,
} from '../features/home-scene/creatures/seagullReflectionLod.js';

const ROTATION_AXIS_X = new THREE.Vector3(1, 0, 0);
const ROTATION_AXIS_Y = new THREE.Vector3(0, 1, 0);
const ROTATION_AXIS_Z = new THREE.Vector3(0, 0, 1);
const rotationScratch = new THREE.Quaternion();
const rotationScratchSecondary = new THREE.Quaternion();
const reflectionCameraForward = new THREE.Vector3();
const reflectionCameraRight = new THREE.Vector3();
const reflectionCameraUp = new THREE.Vector3();

function describeReflectionCamera(camera) {
  camera.getWorldDirection(reflectionCameraForward);
  reflectionCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  reflectionCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  return {
    position: camera.position,
    forward: reflectionCameraForward,
    right: reflectionCameraRight,
    up: reflectionCameraUp,
    fovDegrees: camera.fov,
    aspect: camera.aspect,
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  };
}

function collectBones(object) {
  const bones = {};
  object.traverse((child) => {
    if (!child.isBone) return;
    bones[child.name] = child;
    const authoredName = child.userData?.name;
    if (authoredName) bones[authoredName] = child;
  });
  return bones;
}

function applyBoneRotation(bone, bindQuaternion, axis, angle) {
  if (!bone || !bindQuaternion) return;
  rotationScratch.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(bindQuaternion).multiply(rotationScratch);
}

function applyParentSpaceBoneRotation(bone, bindQuaternion, axis, angle) {
  if (!bone || !bindQuaternion) return;
  rotationScratch.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(rotationScratch).multiply(bindQuaternion);
}

function applyWingRotation(bone, bindQuaternion, flapAngle, sweepAngle) {
  if (!bone || !bindQuaternion) return;
  rotationScratch.setFromAxisAngle(ROTATION_AXIS_Z, sweepAngle);
  rotationScratchSecondary.setFromAxisAngle(ROTATION_AXIS_X, flapAngle);
  bone.quaternion.copy(bindQuaternion).multiply(rotationScratch).multiply(rotationScratchSecondary);
}

export default function SeagullFlock({ mode, paused, showRig, landingSitesRef, onStats }) {
  const gltf = useGLTF(SEAGULL_ASSET.model);
  const textures = useTexture(SEAGULL_ASSET.textures);
  const { camera, gl: renderer, size } = useThree();
  const statsClock = useRef(0);
  const shadowClock = useRef(SEAGULL_SHADOW_LOD.updateIntervalSeconds);
  const shadowCasterIds = useRef(new Set());
  const reflectionClock = useRef(SEAGULL_REFLECTION_LOD.updateIntervalSeconds);
  const reflectionParticipantIds = useRef(new Set());
  const elapsed = useRef(0);
  const interactionElapsed = useRef(0);
  const pointerTargetCount = useRef(0);
  const shotTargetIndex = useRef(-1);
  const featherField = useRef();
  const shotGesture = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startedAt: 0,
  });
  const habitatPoints = useRef([]);
  const pointerState = useRef({
    active: false,
    ndc: new THREE.Vector2(),
  });
  const pointerDebugEnabled = useMemo(() => (
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('pointercheck')
  ), []);
  const shootingDebugEnabled = useMemo(() => (
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('shotcheck')
  ), []);
  const renderShootingState = useMemo(
    () => () => JSON.stringify(window.__DDG_SEAGULL_SHOOTING__),
    [],
  );
  const count = MODE_COUNTS[mode] ?? MODE_COUNTS.flight;

  useEffect(() => {
    textures.albedo.colorSpace = THREE.SRGBColorSpace;
    textures.normal.colorSpace = THREE.NoColorSpace;
    textures.orm.colorSpace = THREE.NoColorSpace;
    textures.specular.colorSpace = THREE.NoColorSpace;
    Object.values(textures).forEach((texture) => {
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });
  }, [textures]);

  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b8bcb9',
    map: textures.albedo,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughness: 0.9,
    roughnessMap: textures.orm,
    metalness: 0,
    metalnessMap: textures.orm,
    specularIntensity: 0.4,
    specularIntensityMap: textures.specular,
    ior: 1.46,
    clearcoat: 0.045,
    clearcoatRoughness: 0.48,
    sheen: 0.14,
    sheenColor: new THREE.Color('#dfe4e4'),
    sheenRoughness: 0.82,
    envMapIntensity: 0.58,
    side: THREE.DoubleSide,
  }), [textures]);

  const instances = useMemo(() => Array.from({ length: count }, (_, index) => {
    const object = cloneSkeleton(gltf.scene);
    const shadowMeshes = [];
    object.name = `seagull_${index + 1}`;
    object.userData.ddgSeagullRoot = true;
    object.userData.ddgReflectInWater = false;
    object.userData.ddgReflectionDynamic = false;
    object.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.material = material;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      shadowMeshes.push(child);
    });
    const bones = collectBones(object);
    const bind = Object.fromEntries(
      Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()]),
    );
    const scale = mode === 'specimen' ? 1.42 : 0.92 + (index % 5) * 0.025;
    object.scale.setScalar(scale);
    return {
      object, bones, bind, scale, shadowMeshes, castsShadow: false,
    };
  }), [count, gltf.scene, material, mode]);

  const agents = useMemo(() => {
    const created = createFlightAgents(count);
    created.forEach((agent, index) => {
      agent.modelScale = instances[index]?.scale ?? 1;
      agent.pointerSample = createPointerSample();
    });
    return created;
  }, [count, instances]);
  const shootingRuntime = useMemo(
    () => createSeagullShootingRuntime(`${mode}:${count}`),
    [count, mode],
  );
  const inactivePointerSample = useMemo(() => createPointerSample(), []);
  const rigHelper = useMemo(() => {
    if (!instances[0]) return null;
    const helper = new THREE.SkeletonHelper(instances[0].object);
    helper.name = 'seagull-rig-helper';
    helper.userData.ddgNoWaterReflection = true;
    helper.material.color.set('#b04335');
    helper.material.depthTest = false;
    helper.renderOrder = 5;
    return helper;
  }, [instances]);

  useEffect(() => () => {
    for (const instance of instances) {
      instance.object.traverse((child) => {
        if (child.isSkinnedMesh) child.skeleton?.dispose();
      });
    }
  }, [instances]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    shadowCasterIds.current = new Set();
    shadowClock.current = SEAGULL_SHADOW_LOD.updateIntervalSeconds;
    reflectionParticipantIds.current = new Set();
    reflectionClock.current = SEAGULL_REFLECTION_LOD.updateIntervalSeconds;
  }, [instances]);

  useEffect(() => {
    const domElement = renderer.domElement;
    const resetPointer = () => {
      pointerState.current.active = false;
      shotTargetIndex.current = -1;
      domElement.style.cursor = '';
      delete domElement.dataset.seagullPointerTarget;
      delete domElement.dataset.seagullShotTarget;
    };
    const writePointerNdc = (event) => {
      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      pointerState.current.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      return true;
    };
    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch' || event.buttons !== 0) {
        resetPointer();
        return;
      }
      if (!writePointerNdc(event)) {
        resetPointer();
        return;
      }
      pointerState.current.active = true;
    };
    const handleShotPointerDown = (event) => {
      if (shootingDebugEnabled) {
        domElement.dataset.seagullShotGesture = JSON.stringify({
          phase: 'down',
          button: event.button,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
        });
      }
      if (
        event.button !== 0
        || event.pointerType === 'touch'
        || paused
        || mode === 'specimen'
      ) {
        shotGesture.current.active = false;
        return;
      }
      shotGesture.current.active = true;
      shotGesture.current.pointerId = event.pointerId;
      shotGesture.current.startX = event.clientX;
      shotGesture.current.startY = event.clientY;
      shotGesture.current.startedAt = performance.now();
    };
    const handleShotPointerUp = (event) => {
      const gesture = { ...shotGesture.current };
      shotGesture.current.active = false;
      const distance = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      const duration = performance.now() - gesture.startedAt;
      if (shootingDebugEnabled) {
        domElement.dataset.seagullShotGesture = JSON.stringify({
          phase: 'up',
          active: gesture.active,
          button: event.button,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          distance,
          duration,
        });
      }
      if (
        !gesture.active
        || gesture.pointerId !== event.pointerId
        || event.button !== 0
        || event.pointerType === 'touch'
        || paused
        || mode === 'specimen'
        || distance > 6
        || duration > 520
        || !writePointerNdc(event)
      ) return;
      const target = findSeagullShotTarget(
        agents,
        camera,
        size,
        pointerState.current.ndc,
        landingSitesRef?.current ?? [],
      );
      if (!target) {
        if (shootingDebugEnabled) {
          const unobstructedTarget = findSeagullShotTarget(
            agents,
            camera,
            size,
            pointerState.current.ndc,
            [],
          );
          domElement.dataset.seagullShotGesture = JSON.stringify({
            phase: 'miss',
            x: event.clientX,
            y: event.clientY,
            distance,
            duration,
            unobstructedTarget: unobstructedTarget?.index ?? -1,
          });
        }
        return;
      }
      const shot = fireSeagullShot(
        shootingRuntime,
        agents,
        target.index,
        target.rayDirection,
        interactionElapsed.current,
      );
      if (shot.kind === 'hit') {
        featherField.current?.burst(shot.position, shot.velocity, 11, shot.seed);
      }
      if (shootingDebugEnabled) {
        domElement.dataset.seagullShotGesture = JSON.stringify({
          phase: shot.kind,
          index: target.index,
          distance,
          duration,
        });
      }
      pointerState.current.active = false;
      shotTargetIndex.current = -1;
      domElement.style.cursor = '';
      delete domElement.dataset.seagullPointerTarget;
      delete domElement.dataset.seagullShotTarget;
    };

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerdown', handleShotPointerDown, { passive: true });
    domElement.addEventListener('pointerup', handleShotPointerUp, { passive: true });
    domElement.addEventListener('pointerdown', resetPointer, { passive: true });
    domElement.addEventListener('pointerup', resetPointer, { passive: true });
    domElement.addEventListener('pointercancel', resetPointer, { passive: true });
    domElement.addEventListener('pointerleave', resetPointer, { passive: true });
    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerdown', handleShotPointerDown);
      domElement.removeEventListener('pointerup', handleShotPointerUp);
      domElement.removeEventListener('pointerdown', resetPointer);
      domElement.removeEventListener('pointerup', resetPointer);
      domElement.removeEventListener('pointercancel', resetPointer);
      domElement.removeEventListener('pointerleave', resetPointer);
      resetPointer();
      delete domElement.dataset.seagullPointerDebug;
      delete domElement.dataset.seagullShootingDebug;
      delete domElement.dataset.seagullShotGesture;
      if (typeof window !== 'undefined') {
        delete window.__DDG_SEAGULL_POINTER__;
        delete window.__DDG_SEAGULL_SHOOTING__;
        if (window.render_game_to_text === renderShootingState) {
          delete window.render_game_to_text;
        }
      }
    };
  }, [agents, camera, landingSitesRef, mode, paused, renderer, renderShootingState, shootingDebugEnabled, shootingRuntime, size]);

  useEffect(() => () => {
    rigHelper?.geometry?.dispose();
    if (Array.isArray(rigHelper?.material)) {
      rigHelper.material.forEach((helperMaterial) => helperMaterial.dispose());
    } else {
      rigHelper?.material?.dispose();
    }
  }, [rigHelper]);

  useFrame(({ camera, gl, size }, delta) => {
    const safeDelta = Math.min(delta, 0.05);
    if (!paused) elapsed.current += safeDelta * 0.74;
    if (!paused) interactionElapsed.current += safeDelta;
    if (!paused) {
      const points = habitatPoints.current;
      let pointCount = 0;
      for (const site of landingSitesRef?.current ?? []) {
        if (!site?.object?.parent) continue;
        points[pointCount] ??= new THREE.Vector3();
        site.object.getWorldPosition(points[pointCount]);
        pointCount += 1;
      }
      points.length = pointCount;

      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      let focusedIndex = -1;
      let focusedInfluence = 0.025;
      for (const agent of agents) {
        if (agent.shotState) {
          agent.pointerSample.influence = 0;
          continue;
        }
        const sample = measurePointerInteraction(
          agent.pointerSample,
          agent,
          camera,
          size,
          pointerState.current.ndc,
          pointerState.current.active,
          points,
        );
        if (sample.influence > focusedInfluence) {
          focusedInfluence = sample.influence;
          focusedIndex = agent.index;
        }
      }

      for (const agent of agents) {
        if (agent.shotState) continue;
        const sample = agent.index === focusedIndex
          ? agent.pointerSample
          : inactivePointerSample;
        if (!advancePointerResponse(agent, sample, safeDelta)) continue;
        scareLandingAgent(agent, elapsed.current, agent.pointerSample.away);
      }
      pointerTargetCount.current = focusedIndex >= 0 ? 1 : 0;
      const shotTarget = mode === 'specimen' || !pointerState.current.active
        ? null
        : findSeagullShotTarget(
          agents,
          camera,
          size,
          pointerState.current.ndc,
          landingSitesRef?.current ?? [],
        );
      shotTargetIndex.current = shotTarget?.index ?? -1;
      if (shotTarget) {
        renderer.domElement.style.cursor = 'crosshair';
        renderer.domElement.dataset.seagullShotTarget = String(shotTarget.index);
      } else {
        delete renderer.domElement.dataset.seagullShotTarget;
      }
      if (focusedIndex >= 0) {
        renderer.domElement.style.cursor = 'crosshair';
        renderer.domElement.dataset.seagullPointerTarget = String(focusedIndex);
      } else {
        if (!shotTarget) renderer.domElement.style.cursor = '';
        delete renderer.domElement.dataset.seagullPointerTarget;
      }

      const impactEvents = advanceDownedSeagulls(
        shootingRuntime,
        agents,
        interactionElapsed.current,
        safeDelta,
        landingSitesRef?.current ?? [],
      );
      for (const event of impactEvents) {
        featherField.current?.burst(
          event.position,
          event.velocity,
          event.kind === 'water-impact' ? 6 : 4,
          event.seed,
        );
      }

      updateFlightAgents(
        agents,
        elapsed.current,
        safeDelta * 0.74,
        mode,
        landingSitesRef?.current ?? [],
        interactionElapsed.current,
      );

      shadowClock.current += safeDelta;
      if (shadowClock.current >= SEAGULL_SHADOW_LOD.updateIntervalSeconds) {
        shadowClock.current = 0;
        shadowCasterIds.current = resolveSeagullShadowCasters(agents, {
          waterY: HOME_SEAGULL_WATER_Y,
          maxCasters: mode === 'specimen' ? 1 : SEAGULL_SHADOW_LOD.maximumLabCasters,
          receiverPoints: points,
          previousCasterIds: shadowCasterIds.current,
        });
      }

      reflectionClock.current += safeDelta;
      if (reflectionClock.current >= SEAGULL_REFLECTION_LOD.updateIntervalSeconds) {
        reflectionClock.current = 0;
        const reflection = resolveSeagullReflectionParticipants(agents, {
          camera: describeReflectionCamera(camera),
          viewport: size,
          waterY: HOME_SEAGULL_WATER_Y,
          isMobile: Math.min(size.width, size.height) < 540,
          maxParticipants: mode === 'specimen'
            ? 1
            : SEAGULL_REFLECTION_LOD.maximumLabParticipants,
          previousParticipantIds: reflectionParticipantIds.current,
        });
        reflectionParticipantIds.current = reflection.participantIds;
      }
    } else {
      pointerTargetCount.current = 0;
      shotTargetIndex.current = -1;
      renderer.domElement.style.cursor = '';
      delete renderer.domElement.dataset.seagullPointerTarget;
      delete renderer.domElement.dataset.seagullShotTarget;
    }

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      const agent = agents[index];
      const wing = getWingPose(agent);
      const castsShadow = shadowCasterIds.current.has(agent.index);
      const reflectsInWater = reflectionParticipantIds.current.has(agent.index);
      if (instance.castsShadow !== castsShadow) {
        instance.castsShadow = castsShadow;
        for (const mesh of instance.shadowMeshes) {
          mesh.castShadow = castsShadow;
          mesh.receiveShadow = castsShadow;
        }
      }
      instance.object.userData.ddgReflectInWater = reflectsInWater;
      instance.object.userData.ddgReflectionDynamic = reflectsInWater && !paused;
      instance.object.visible = agent.shotState !== SEAGULL_DOWNED_STATE.REMOVED;
      instance.object.position.copy(agent.position);
      instance.object.quaternion.copy(agent.quaternion);

      applyWingRotation(instance.bones['wing.shoulder.L'], instance.bind['wing.shoulder.L'], wing.shoulderL ?? wing.shoulder, -wing.fold);
      applyWingRotation(instance.bones['wing.shoulder.R'], instance.bind['wing.shoulder.R'], wing.shoulderR ?? wing.shoulder, wing.fold);
      applyWingRotation(instance.bones['wing.inner.L'], instance.bind['wing.inner.L'], wing.innerL ?? wing.inner, -wing.fold * 0.28);
      applyWingRotation(instance.bones['wing.inner.R'], instance.bind['wing.inner.R'], wing.innerR ?? wing.inner, wing.fold * 0.28);
      applyWingRotation(instance.bones['wing.outer.L'], instance.bind['wing.outer.L'], wing.outerL ?? wing.outer, -wing.fold * 0.08);
      applyWingRotation(instance.bones['wing.outer.R'], instance.bind['wing.outer.R'], wing.outerR ?? wing.outer, wing.fold * 0.08);
      applyWingRotation(instance.bones['wing.tip.L'], instance.bind['wing.tip.L'], wing.tipL ?? wing.tip, 0);
      applyWingRotation(instance.bones['wing.tip.R'], instance.bind['wing.tip.R'], wing.tipR ?? wing.tip, 0);

      const tucked = 1 - wing.legDeploy;
      applyWingRotation(instance.bones['leg.upper.L'], instance.bind['leg.upper.L'], 0, tucked * 0.3 + wing.legCompression * 0.25);
      applyWingRotation(instance.bones['leg.upper.R'], instance.bind['leg.upper.R'], tucked * 0.1, tucked * 0.2 + wing.legCompression * 0.25);
      applyBoneRotation(instance.bones['leg.lower.L'], instance.bind['leg.lower.L'], ROTATION_AXIS_Z, tucked * 1.6 + wing.legCompression * 0.58);
      applyBoneRotation(instance.bones['leg.lower.R'], instance.bind['leg.lower.R'], ROTATION_AXIS_Z, tucked * 1.6 + wing.legCompression * 0.58);
      applyBoneRotation(instance.bones['foot.L'], instance.bind['foot.L'], ROTATION_AXIS_Z, -tucked * 0.2 - wing.legCompression * 0.2);
      applyBoneRotation(instance.bones['foot.R'], instance.bind['foot.R'], ROTATION_AXIS_Z, -tucked * 0.2 - wing.legCompression * 0.2);
      applyBoneRotation(instance.bones['toes.L'], instance.bind['toes.L'], ROTATION_AXIS_Z, tucked * 0.16 - wing.toeGrip * 0.3);
      applyBoneRotation(instance.bones['toes.R'], instance.bind['toes.R'], ROTATION_AXIS_Z, tucked * 0.16 - wing.toeGrip * 0.3);
      applyBoneRotation(instance.bones['tail.L'], instance.bind['tail.L'], ROTATION_AXIS_X, -wing.tailSpread * 0.24);
      applyBoneRotation(instance.bones['tail.R'], instance.bind['tail.R'], ROTATION_AXIS_X, -wing.tailSpread * 0.24);
      applyParentSpaceBoneRotation(instance.bones.head, instance.bind.head, ROTATION_AXIS_Y, wing.headLook);
    }

    statsClock.current += safeDelta;
    if (statsClock.current > 0.35) {
      statsClock.current = 0;
      const states = agents.reduce((result, agent) => {
        if (agent.shotState) return result;
        result[agent.state] = (result[agent.state] ?? 0) + 1;
        return result;
      }, {});
      const landingStates = agents.reduce((result, agent) => {
        if (agent.shotState) return result;
        const state = agent.landingState ?? 'airborne';
        result[state] = (result[state] ?? 0) + 1;
        return result;
      }, {});
      const shooting = seagullShootingStats(
        shootingRuntime,
        agents,
        interactionElapsed.current,
      );
      const reflectionCalls = Number(renderer.domElement.dataset.ddgLabReflectionCalls);
      const reflectionTriangles = Number(renderer.domElement.dataset.ddgLabReflectionTriangles);
      const reflectedBirds = reflectionParticipantIds.current.size;
      const excludedBirds = Math.max(0, instances.length - reflectedBirds);
      const estimatedMainCalls = Number.isFinite(reflectionCalls)
        ? reflectionCalls + excludedBirds + 3
        : gl.info.render.calls;
      const estimatedMainTriangles = Number.isFinite(reflectionTriangles)
        ? reflectionTriangles + excludedBirds * SEAGULL_ASSET.web.triangles + 148
        : gl.info.render.triangles;
      const currentStats = {
        birds: instances.length,
        calls: estimatedMainCalls,
        triangles: estimatedMainTriangles,
        flap: states.flap ?? 0,
        glide: states.glide ?? 0,
        thermal: states.thermal ?? 0,
        perched: landingStates.perched ?? 0,
        approaching: (landingStates.approach ?? 0) + (landingStates.flare ?? 0) + (landingStates.settle ?? 0),
        takingOff: (landingStates.takeoff ?? 0) + (landingStates.rejoin ?? 0),
        airborne: landingStates.airborne ?? 0,
        cursorTargets: pointerTargetCount.current,
        shadowCasters: shadowCasterIds.current.size,
        reflectionParticipants: reflectionParticipantIds.current.size,
        startled: agents.reduce((sum, agent) => sum + agent.pointerStartleCount, 0),
        minHeight: Math.min(...agents.map((agent) => agent.physicalHeight)),
        maxHeight: Math.max(...agents.map((agent) => agent.physicalHeight)),
        ...shooting,
      };
      onStats(currentStats);
      if (pointerDebugEnabled && typeof window !== 'undefined') {
        const pointerDiagnostics = {
          active: pointerState.current.active,
          targetIndex: Number(renderer.domElement.dataset.seagullPointerTarget ?? -1),
          birds: agents.map((agent) => ({
            index: agent.index,
            landingState: agent.landingState ?? 'airborne',
            influence: agent.pointerSample.influence,
            visibleBodyPixels: agent.pointerSample.visibleBodyPixels,
            screenX: agent.pointerSample.screenX,
            screenY: agent.pointerSample.screenY,
            habitatDistanceMeters: agent.pointerSample.habitatDistanceMeters,
            startled: agent.pointerStartleCount,
          })),
        };
        window.__DDG_SEAGULL_POINTER__ = pointerDiagnostics;
        renderer.domElement.dataset.seagullPointerDebug = JSON.stringify(pointerDiagnostics);
      }
      if (shootingDebugEnabled && typeof window !== 'undefined') {
        const shootingDiagnostics = {
          coordinateSystem: 'canvas pixels from top-left; world +Y is up',
          time: interactionElapsed.current,
          targetIndex: shotTargetIndex.current,
          shadowCasters: [...shadowCasterIds.current],
          reflectionParticipants: [...reflectionParticipantIds.current],
          ...shooting,
          birds: agents.map((agent) => ({
            index: agent.index,
            screenX: agent.pointerSample.screenX,
            screenY: agent.pointerSample.screenY,
            visibleBodyPixels: agent.pointerSample.visibleBodyPixels,
            flightState: agent.state,
            landingState: agent.landingState ?? 'airborne',
            shotState: agent.shotState ?? null,
            fearStrength: agent.shotFearStrength ?? 0,
            position: agent.position.toArray(),
            velocity: agent.velocity.toArray(),
          })),
        };
        window.__DDG_SEAGULL_SHOOTING__ = shootingDiagnostics;
        if (
          typeof window.render_game_to_text !== 'function'
          || window.render_game_to_text === renderShootingState
        ) {
          window.render_game_to_text = renderShootingState;
        }
        renderer.domElement.dataset.seagullShootingDebug = JSON.stringify(shootingDiagnostics);
      }
    }
  });

  return (
    <group name="seagull-flock">
      {instances.map((instance) => (
        <primitive key={instance.object.uuid} object={instance.object} />
      ))}
      <SeagullFeathers ref={featherField} />
      {showRig && rigHelper && <primitive object={rigHelper} />}
    </group>
  );
}

useGLTF.preload(SEAGULL_ASSET.model);
