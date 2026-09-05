import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HOME_SEAGULL_COUNTS, SEAGULL_ASSET } from './seagullAsset.js';
import { createFlightAgents, getWingPose, updateFlightAgents } from './seagullFlight.js';
import { scareLandingAgent } from './seagullLanding.js';
import SeagullFeathers from './SeagullFeathers.jsx';
import {
  advancePointerResponse,
  createPointerSample,
  measurePointerInteraction,
} from './seagullPointerInteraction.js';
import {
  advanceDownedSeagulls,
  createSeagullShootingRuntime,
  findSeagullShotTarget,
  fireSeagullShot,
  SEAGULL_DOWNED_STATE,
  seagullShootingStats,
} from './seagullShooting.js';
import {
  resolveSeagullShadowCasters,
  SEAGULL_SHADOW_LOD,
} from './seagullShadowLod.js';
import {
  resolveSeagullReflectionParticipants,
  SEAGULL_REFLECTION_LOD,
} from './seagullReflectionLod.js';
import {
  resolveSeagullRenderLods,
  SEAGULL_RENDER_LOD,
} from './seagullRenderLod.js';
import SeagullDistantSprites from './SeagullDistantSprites.jsx';

const ROTATION_AXIS_X = new THREE.Vector3(1, 0, 0);
const ROTATION_AXIS_Y = new THREE.Vector3(0, 1, 0);
const ROTATION_AXIS_Z = new THREE.Vector3(0, 0, 1);
const rotationScratch = new THREE.Quaternion();
const rotationScratchSecondary = new THREE.Quaternion();
const reflectionCameraForward = new THREE.Vector3();
const reflectionCameraRight = new THREE.Vector3();
const reflectionCameraUp = new THREE.Vector3();
const projectedScratch = new THREE.Vector3();

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
    if (child.userData?.name) bones[child.userData.name] = child;
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
  bone.quaternion.copy(bindQuaternion)
    .multiply(rotationScratch)
    .multiply(rotationScratchSecondary);
}

function isMobileRuntime(mode, width) {
  if (mode !== 'editor' && width < 768) return true;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function applyRigPose(instance, wing) {
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

function withTerrainCollision(sites,query) {
  return query?.collisionObject ? [...sites,{collisionObject:query.collisionObject}] : sites;
}

export default function HomeSeagullFlock({
  settings,
  runtime,
  qualityProfile,
  landingSitesRef,
  terrainQuery,
  mode = 'public',
}) {
  const gltf = useGLTF(SEAGULL_ASSET.model);
  const textures = useTexture(SEAGULL_ASSET.textures);
  const { camera, gl, size } = useThree();
  const mobile = isMobileRuntime(mode, size.width);
  const count = Math.min(
    Math.max(1, Math.round(settings.seagullCount ?? HOME_SEAGULL_COUNTS.desktop)),
    mobile || qualityProfile.isLowPower
      ? HOME_SEAGULL_COUNTS.mobile
      : HOME_SEAGULL_COUNTS.desktop,
  );
  const elapsed = useRef(0);
  const interactionElapsed = useRef(0);
  const statsClock = useRef(0);
  const shadowClock = useRef(SEAGULL_SHADOW_LOD.updateIntervalSeconds);
  const reflectionClock = useRef(SEAGULL_REFLECTION_LOD.updateIntervalSeconds);
  const renderLodClock = useRef(SEAGULL_RENDER_LOD.updateIntervalSeconds);
  const renderModes = useRef(new Map());
  const waterProbeClock = useRef(0);
  const waterProbeCursor = useRef(0);
  const shadowCasterIds = useRef(new Set());
  const reflectionParticipantIds = useRef(new Set());
  const pointerTargetCount = useRef(0);
  const shotTargetIndex = useRef(-1);
  const featherField = useRef();
  const habitatPoints = useRef([]);
  const pointerState = useRef({ active: false, ndc: new THREE.Vector2() });
  const shotGesture = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startedAt: 0,
  });
  const lastWaterImpact = useRef(null);
  const debugEnabled = useMemo(() => (
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('seagullcheck')
  ), []);
  const renderDiagnostics = useMemo(
    () => () => JSON.stringify(window.__DDG_SEAGULLS__ ?? null),
    [],
  );

  useEffect(() => {
    textures.albedo.colorSpace = THREE.SRGBColorSpace;
    textures.normal.colorSpace = THREE.NoColorSpace;
    textures.orm.colorSpace = THREE.NoColorSpace;
    textures.specular.colorSpace = THREE.NoColorSpace;
    Object.values(textures).forEach((texture) => {
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);
      texture.needsUpdate = true;
    });
  }, [gl, textures]);

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
    const meshes = [];
    object.name = `seagull-${index + 1}`;
    object.userData.ddgSeagullRoot = true;
    object.userData.ddgReflectInWater = false;
    object.userData.ddgRefractInWater = false;
    object.userData.ddgReflectionDynamic = false;
    object.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.material = material;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      meshes.push(child);
    });
    const bones = collectBones(object);
    const bind = Object.fromEntries(
      Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()]),
    );
    const scale = 0.92 + (index % 5) * 0.025;
    object.scale.setScalar(scale);
    return { object, bones, bind, scale, meshes, castsShadow: false };
  }), [count, gltf.scene, material]);

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

  useEffect(() => () => {
    instances.forEach((instance) => {
      instance.object.traverse((child) => {
        if (child.isSkinnedMesh) child.skeleton?.dispose();
      });
    });
  }, [instances]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const domElement = gl.domElement;
    const resetPointer = () => {
      pointerState.current.active = false;
      shotTargetIndex.current = -1;
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
      if (event.pointerType === 'touch' || event.buttons !== 0 || !writePointerNdc(event)) {
        resetPointer();
        return;
      }
      pointerState.current.active = true;
    };
    const handlePointerDown = (event) => {
      if (
        event.button !== 0
        || event.pointerType === 'touch'
        || settings.seagullShootingEnabled === false
      ) {
        shotGesture.current.active = false;
        return;
      }
      shotGesture.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
      };
    };
    const handlePointerUp = (event) => {
      const gesture = { ...shotGesture.current };
      shotGesture.current.active = false;
      const distance = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      const duration = performance.now() - gesture.startedAt;
      if (
        !gesture.active
        || gesture.pointerId !== event.pointerId
        || event.button !== 0
        || event.pointerType === 'touch'
        || settings.seagullShootingEnabled === false
        || distance > 6
        || duration > 520
        || !writePointerNdc(event)
      ) return;

      const target = findSeagullShotTarget(
        agents,
        camera,
        size,
        pointerState.current.ndc,
        withTerrainCollision(landingSitesRef?.current ?? [],terrainQuery),
      );
      if (!target) return;
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
      resetPointer();
    };

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
    domElement.addEventListener('pointerup', handlePointerUp, { passive: true });
    domElement.addEventListener('pointercancel', resetPointer, { passive: true });
    domElement.addEventListener('pointerleave', resetPointer, { passive: true });
    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointercancel', resetPointer);
      domElement.removeEventListener('pointerleave', resetPointer);
      resetPointer();
    };
  }, [agents, camera, gl, landingSitesRef, settings.seagullShootingEnabled, shootingRuntime, size, terrainQuery]);

  useEffect(() => {
    const domElement = gl.domElement;
    domElement.dataset.ddgSeagulls = String(count);
    domElement.dataset.ddgSeagullRig = 'procedural-22-bone';
    domElement.dataset.ddgSeagullWater = 'impact-buoyancy-float';
    return () => {
      delete domElement.dataset.ddgSeagulls;
      delete domElement.dataset.ddgSeagullRig;
      delete domElement.dataset.ddgSeagullWater;
      delete domElement.dataset.ddgSeagullFloating;
      delete domElement.dataset.ddgSeagullShotTarget;
      delete domElement.dataset.ddgSeagullPointerTarget;
      delete domElement.dataset.ddgSeagullDiagnostics;
      if (typeof window !== 'undefined') {
        delete window.__DDG_SEAGULLS__;
        if (window.render_game_to_text === renderDiagnostics) {
          delete window.render_game_to_text;
        }
      }
    };
  }, [count, gl, renderDiagnostics]);

  useFrame((_state, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const safeDelta = Math.min(delta, 0.05);
    const activity = THREE.MathUtils.clamp(settings.seagullFlightActivity ?? 0.72, 0, 1);
    const motorScale = 0.42 + activity * 0.7;
    elapsed.current += safeDelta * motorScale;
    interactionElapsed.current += safeDelta;
    agents.landingDensity = settings.seagullLandingDensity ?? 0.38;

    const sites = landingSitesRef?.current ?? [];
    const collisionSites=withTerrainCollision(sites,terrainQuery);
    const points = habitatPoints.current;
    let pointCount = 0;
    for (const site of sites) {
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
        settings.seagullPointerInteraction !== false && pointerState.current.active,
        points,
      );
      if (sample.influence > focusedInfluence) {
        focusedInfluence = sample.influence;
        focusedIndex = agent.index;
      }
    }
    for (const agent of agents) {
      if (agent.shotState) continue;
      const sample = agent.index === focusedIndex ? agent.pointerSample : inactivePointerSample;
      if (advancePointerResponse(agent, sample, safeDelta)) {
        scareLandingAgent(agent, elapsed.current, agent.pointerSample.away);
      }
    }
    pointerTargetCount.current = focusedIndex >= 0 ? 1 : 0;

    const shotTarget = settings.seagullShootingEnabled === false || !pointerState.current.active
      ? null
      : findSeagullShotTarget(
        agents,
        camera,
        size,
        pointerState.current.ndc,
        collisionSites,
      );
    shotTargetIndex.current = shotTarget?.index ?? -1;
    if (shotTarget) gl.domElement.dataset.seagullShotTarget = String(shotTarget.index);
    else delete gl.domElement.dataset.seagullShotTarget;
    if (focusedIndex >= 0) gl.domElement.dataset.seagullPointerTarget = String(focusedIndex);
    else delete gl.domElement.dataset.seagullPointerTarget;

    waterProbeClock.current += safeDelta;
    if (waterProbeClock.current >= 1 / 12 && typeof runtime.sampleWaterSurface === 'function') {
      waterProbeClock.current = 0;
      const floating = agents.filter((agent) => agent.shotState === SEAGULL_DOWNED_STATE.WATER);
      if (floating.length > 0) {
        const agent = floating[waterProbeCursor.current % floating.length];
        waterProbeCursor.current += 1;
        const surface = runtime.sampleWaterSurface(agent.position);
        if (surface) {
          agent.shotWaterSurfaceY = surface.worldY;
          agent.shotWaterNormal ??= new THREE.Vector3(0, 1, 0);
          agent.shotWaterNormal.copy(surface.normal);
        }
      }
    }

    const impactEvents = advanceDownedSeagulls(
      shootingRuntime,
      agents,
      interactionElapsed.current,
      safeDelta,
      collisionSites,
      0,
    );
    for (const event of impactEvents) {
      featherField.current?.burst(
        event.position,
        event.velocity,
        event.kind === 'water-impact' ? 5 : 4,
        event.seed,
      );
      if (event.kind === 'water-impact') {
        const impulseAccepted = runtime.emitWaterImpulse?.(
          event.position,
          {
            strength: event.strength,
            source: 'gull-impact',
            affectsBoat: true,
            priority: 10,
          },
        ) ?? false;
        lastWaterImpact.current = {
          index: event.index,
          impulseAccepted,
          strength: event.strength,
          position: event.position.toArray(),
          time: interactionElapsed.current,
        };
      }
    }

    const landingMode = sites.length > 0 && (settings.seagullLandingDensity ?? 0.38) > 0.01
      ? 'landing'
      : 'flight';
    updateFlightAgents(
      agents,
      elapsed.current,
      safeDelta * motorScale,
      landingMode,
      sites,
      interactionElapsed.current,
      terrainQuery,
    );

    shadowClock.current += safeDelta;
    if (shadowClock.current >= SEAGULL_SHADOW_LOD.updateIntervalSeconds) {
      shadowClock.current = 0;
      shadowCasterIds.current = resolveSeagullShadowCasters(agents, {
        enabled: settings.shadowsEnabled !== false,
        isLowPower: qualityProfile.isLowPower,
        isMobile: mobile,
        waterY: 0,
        receiverPoints: points,
        previousCasterIds: shadowCasterIds.current,
      });
    }

    renderLodClock.current += safeDelta;
    if (renderLodClock.current >= SEAGULL_RENDER_LOD.updateIntervalSeconds) {
      renderLodClock.current = 0;
      renderModes.current = resolveSeagullRenderLods(agents, {
        camera: describeReflectionCamera(camera),
        viewport: size,
        previousModes: renderModes.current,
      }).modes;
    }

    reflectionClock.current += safeDelta;
    if (reflectionClock.current >= SEAGULL_REFLECTION_LOD.updateIntervalSeconds) {
      reflectionClock.current = 0;
      const reflection = resolveSeagullReflectionParticipants(
        agents.filter((agent) => renderModes.current.get(agent.index) !== 'sprite'),
        {
          enabled: settings.reflectionsEnabled !== false,
          quality: qualityProfile.reflectionTextureSize >= 700 ? 'high' : 'medium',
          isLowPower: qualityProfile.isLowPower,
          isMobile: mobile,
          camera: describeReflectionCamera(camera),
          viewport: size,
          waterY: 0,
          previousParticipantIds: reflectionParticipantIds.current,
        },
      );
      reflectionParticipantIds.current = reflection.participantIds;
    }

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      const agent = agents[index];
      const castsShadow = shadowCasterIds.current.has(agent.index);
      const reflectsInWater = reflectionParticipantIds.current.has(agent.index);
      if (instance.castsShadow !== castsShadow) {
        instance.castsShadow = castsShadow;
        instance.meshes.forEach((mesh) => {
          mesh.castShadow = castsShadow;
        });
      }
      instance.object.userData.ddgReflectInWater = reflectsInWater;
      instance.object.userData.ddgRefractInWater = agent.shotState === SEAGULL_DOWNED_STATE.WATER;
      instance.object.userData.ddgReflectionDynamic = reflectsInWater;
      instance.object.visible = agent.shotState !== SEAGULL_DOWNED_STATE.REMOVED
        && renderModes.current.get(agent.index) !== 'sprite';
      instance.object.position.copy(agent.position);
      instance.object.quaternion.copy(agent.quaternion);
      applyRigPose(instance, getWingPose(agent));
    }

    statsClock.current += safeDelta;
    if (statsClock.current < 0.25) return;
    statsClock.current = 0;
    const shooting = seagullShootingStats(
      shootingRuntime,
      agents,
      interactionElapsed.current,
    );
    const floating = agents.filter((agent) => (
      agent.shotState === SEAGULL_DOWNED_STATE.WATER
    )).length;
    const diagnostics = {
      coordinateSystem: 'canvas pixels from top-left; world +Y is up; water y=0',
      time: interactionElapsed.current,
      birds: count,
      camera: {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        fov: camera.fov,
      },
      targetIndex: shotTargetIndex.current,
      pointerTargets: pointerTargetCount.current,
      landingSites: sites.map((site) => site.id),
      shadowCasters: [...shadowCasterIds.current],
      reflectionParticipants: [...reflectionParticipantIds.current],
      renderLod: Object.fromEntries(renderModes.current),
      floating,
      lastWaterImpact: lastWaterImpact.current,
      ...shooting,
      agents: agents.map((agent) => {
        projectedScratch.copy(agent.position).project(camera);
        return {
          index: agent.index,
          screenX: (projectedScratch.x + 1) * size.width * 0.5,
          screenY: (1 - projectedScratch.y) * size.height * 0.5,
          position: agent.position.toArray(),
          flightState: agent.state,
          landingState: agent.landingState ?? 'airborne',
          shotState: agent.shotState ?? null,
          waterPhase: agent.shotWaterPhase ?? null,
        };
      }),
    };
    gl.domElement.dataset.ddgSeagullFloating = String(floating);
    if (debugEnabled && typeof window !== 'undefined') {
      window.__DDG_SEAGULLS__ = diagnostics;
      gl.domElement.dataset.ddgSeagullDiagnostics = JSON.stringify(diagnostics);
      window.render_game_to_text = renderDiagnostics;
    }
  });

  return (
    <group name="seagull-flock">
      {instances.map((instance) => (
        <primitive key={instance.object.uuid} object={instance.object} />
      ))}
      <SeagullDistantSprites agents={agents} spriteIds={renderModes} />
      <group userData={{ ddgNoWaterReflection: true }}>
        <SeagullFeathers ref={featherField} />
      </group>
    </group>
  );
}
