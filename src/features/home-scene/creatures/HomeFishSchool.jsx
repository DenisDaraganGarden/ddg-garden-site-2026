import { syncCoastUniforms } from '../../../terrain/terrainShader.js';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  createFishAgents,
  measureFishRuntime,
  orientationForFish,
  resolveFishQuality,
  stepFishAgents,
} from './fish/fishBehavior.js';
import {
  FISH_CATALOG,
  FISH_SPECIES_ORDER,
  FISH_TEXTURES,
} from './fish/fishCatalog.js';
import { createFishHabitat } from './fish/fishHabitat.js';
import {
  configureFishTextures,
  createFishBatch,
  createFishContactShadowBatch,
  disposeFishBatch,
  disposeFishContactShadowBatch,
} from './fish/fishRendering.js';
import { resolveFishContactShadow } from './fish/fishContactShadows.js';
import {
  advanceFishCursorResponse,
  createFishCursorInteractionState,
} from './fish/fishPointerInteraction.js';
import { buildHomeSceneLighting } from '../../../components/effects/homeSceneLighting.js';

const FISH_OBSTACLE_REFRESH_SECONDS = 0.2;
const FISH_SURFACE_PROBE_SECONDS = 0.125;
const FISH_DIAGNOSTICS_REFRESH_SECONDS = 0.25;

function textureUrls() {
  return FISH_SPECIES_ORDER.flatMap((species) => [
    FISH_TEXTURES[species].albedo,
    FISH_TEXTURES[species].normal,
    FISH_TEXTURES[species].orm,
    FISH_TEXTURES[species].specular,
  ]);
}

function buildTextureSets(textures) {
  return Object.fromEntries(FISH_SPECIES_ORDER.map((species, index) => [
    species,
    {
      albedo: textures[index * 4],
      normal: textures[index * 4 + 1],
      orm: textures[index * 4 + 2],
      specular: textures[index * 4 + 3],
    },
  ]));
}

function buildHabitat(settings, sampleSurfaceY, sampleBottomY) {
  const surfaceCeiling = -Math.abs(settings.waveAmplitude ?? 0.04);
  const crestCeiling = Math.abs(settings.waveAmplitude ?? 0.04);
  const bottomEnvelope = -(settings.waterDepthMeters ?? 1.25)
    + Math.abs(settings.seabedReliefStrength ?? 0.6) * 0.5;
  const availableDepth = Math.max(0.42, surfaceCeiling - bottomEnvelope);
  const minimumBand = Math.min(0.42, availableDepth);
  const depthBand = THREE.MathUtils.clamp(settings.fishDepthBand ?? 0.72, 0, 1);
  const bandHeight = minimumBand + (availableDepth - minimumBand) * depthBand;
  const halfExtent = Math.max(1.4, (settings.waterExtent ?? 34) * 0.5 - 0.8);
  const radiusX = Math.min(5.2, halfExtent);
  const radiusZ = Math.min(3.25, halfExtent);

  return createFishHabitat({
    min: [-radiusX, surfaceCeiling - bandHeight, -radiusZ],
    max: [radiusX, crestCeiling, radiusZ],
    margin: [0.62, 0.15, 0.5],
    waterY: surfaceCeiling,
    sampleSurfaceY,
    sampleBottomY,
    surfaceClearance: 0.035,
    bottomClearance: 0.055,
  });
}

function captureObstacle(scene, name, id, bounds) {
  const object = scene.getObjectByName(name);
  if (!object?.visible || !object.parent) return null;

  object.updateWorldMatrix(true, true);
  bounds.setFromObject(object, true);
  if (bounds.isEmpty()) return null;
  return {
    id,
    min: bounds.min.clone(),
    max: bounds.max.clone(),
    clearance: id === 'boat' ? 0.22 : 0.18,
  };
}

export default function HomeFishSchool({
  settings,
  terrainQuery,
  runtime,
  qualityProfile,
  mode = 'public',
}) {
  const pike = useGLTF(FISH_CATALOG.pike.glb);
  const perch = useGLTF(FISH_CATALOG.perch.glb);
  const roach = useGLTF(FISH_CATALOG.roach.glb);
  const loadedTextures = useTexture(textureUrls());
  const { camera, gl, scene, size } = useThree();
  const {
    fishDepthBand,
    seabedReliefStrength,
    waterDepthMeters,
    waterExtent,
    waveAmplitude,
  } = settings;
  const batchMatrix = useMemo(() => new THREE.Object3D(), []);
  const shadowMatrix = useMemo(() => new THREE.Object3D(), []);
  const targetOrientation = useMemo(() => new THREE.Quaternion(), []);
  const shadowForward = useMemo(() => new THREE.Vector3(), []);
  const obstacleBounds = useMemo(() => new THREE.Box3(), []);
  const surfaceProbePoint = useMemo(() => new THREE.Vector3(), []);
  const surfaceSamples = useRef([]);
  const surfaceFallback = -Math.abs(waveAmplitude ?? 0.04);
  const sampleSurfaceY = useCallback((x, z) => {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const sample of surfaceSamples.current) {
      if (!sample.ready) continue;
      const distance = (sample.x - x) ** 2 + (sample.z - z) ** 2;
      if (distance < nearestDistance) {
        nearest = sample;
        nearestDistance = distance;
      }
    }
    return nearest?.worldY ?? surfaceFallback;
  }, [surfaceFallback]);
  const textureSets = useMemo(() => buildTextureSets(loadedTextures), [loadedTextures]);
  const templates = useMemo(() => ({
    pike: pike.scene,
    perch: perch.scene,
    roach: roach.scene,
  }), [perch.scene, pike.scene, roach.scene]);
  const habitat = useMemo(() => buildHabitat({
    fishDepthBand,
    seabedReliefStrength,
    waterDepthMeters,
    waterExtent,
    waveAmplitude,
  }, sampleSurfaceY, terrainQuery?.heightAt), [
    terrainQuery,
    fishDepthBand,
    seabedReliefStrength,
    waterDepthMeters,
    waterExtent,
    waveAmplitude,
    sampleSurfaceY,
  ]);
  const quality = useMemo(() => resolveFishQuality({
    requestedCount: settings.fishCount,
    qualityProfile,
  }), [qualityProfile, settings.fishCount]);
  const agents = useMemo(() => {
    const created = createFishAgents({
      requestedCount: quality.effectiveCount,
      qualityProfile: { fishMaxInstances: quality.effectiveCount },
      habitat,
    });
    created.forEach((agent) => {
      agent.renderPosition = agent.position.clone();
      agent.renderOrientation = agent.orientation.clone();
    });
    return created;
  }, [habitat, quality.effectiveCount]);
  const batches = useMemo(() => FISH_SPECIES_ORDER.flatMap((species) => {
    const speciesAgents = agents.filter((agent) => agent.species === species);
    if (speciesAgents.length === 0) return [];
    return [createFishBatch(
      FISH_CATALOG[species],
      templates[species],
      textureSets[species],
      speciesAgents,
    )];
  }), [agents, templates, textureSets]);
  const contactShadows = useMemo(
    () => createFishContactShadowBatch(agents.length),
    [agents.length],
  );
  const contactShadowStates = useMemo(
    () => agents.map(() => ({})),
    [agents],
  );
  const fishLighting = useMemo(
    () => buildHomeSceneLighting(settings),
    [settings],
  );
  const behaviorAccumulator = useRef(0);
  const behaviorElapsed = useRef(0);
  const obstacleElapsed = useRef(FISH_OBSTACLE_REFRESH_SECONDS);
  const surfaceProbeElapsed = useRef(FISH_SURFACE_PROBE_SECONDS);
  const surfaceProbeCursor = useRef(0);
  const diagnosticsElapsed = useRef(FISH_DIAGNOSTICS_REFRESH_SECONDS);
  const cursorElapsed = useRef(0);
  const pointerState = useRef({ active: false, ndc: new THREE.Vector2() });
  const cursorInteraction = useRef(createFishCursorInteractionState());
  const cursorDiagnostics = useRef({
    focusId: null,
    focusInfluence: 0,
    directTargets: 0,
    propagatedTargets: 0,
    waveCount: 0,
    waveAge: null,
  });
  const debugEnabled = useMemo(() => (
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('fishcheck')
  ), []);

  useEffect(() => {
    FISH_SPECIES_ORDER.forEach((species) => configureFishTextures(
      gl,
      textureSets[species],
    ));
  }, [gl, textureSets]);

  useEffect(() => {
    const spanX = Math.max(0.2, (habitat.max.x - habitat.min.x) * 0.28);
    const spanZ = Math.max(0.2, (habitat.max.z - habitat.min.z) * 0.28);
    surfaceSamples.current = [
      { x: 0, z: 0, worldY: surfaceFallback, ready: false },
      { x: -spanX, z: -spanZ, worldY: surfaceFallback, ready: false },
      { x: spanX, z: -spanZ, worldY: surfaceFallback, ready: false },
      { x: -spanX, z: spanZ, worldY: surfaceFallback, ready: false },
      { x: spanX, z: spanZ, worldY: surfaceFallback, ready: false },
    ];
    surfaceProbeCursor.current = 0;
  }, [habitat, surfaceFallback]);

  useEffect(() => () => batches.forEach(disposeFishBatch), [batches]);
  useEffect(() => () => disposeFishContactShadowBatch(contactShadows), [contactShadows]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) return undefined;
    const resetPointer = () => { pointerState.current.active = false; };
    const updatePointer = (event) => {
      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      pointerState.current.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      return true;
    };
    const handlePointerMove = (event) => {
      // Observational only: water, site links, clicks and the flashlight keep
      // their own pointer paths and this listener never captures or cancels.
      if (event.pointerType === 'touch' || event.buttons !== 0 || !updatePointer(event)) {
        resetPointer();
        return;
      }
      pointerState.current.active = true;
    };
    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerdown', resetPointer, { passive: true });
    domElement.addEventListener('pointerup', resetPointer, { passive: true });
    domElement.addEventListener('pointercancel', resetPointer, { passive: true });
    domElement.addEventListener('pointerleave', resetPointer, { passive: true });
    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerdown', resetPointer);
      domElement.removeEventListener('pointerup', resetPointer);
      domElement.removeEventListener('pointercancel', resetPointer);
      domElement.removeEventListener('pointerleave', resetPointer);
    };
  }, [gl]);

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgFishRequested = String(quality.requestedCount);
    dataset.ddgFishCount = String(quality.effectiveCount);
    dataset.ddgFishBatches = String(batches.length);
    dataset.ddgFishTier = quality.tier;
    dataset.ddgFishOptics = 'refraction-only';
    dataset.ddgFishRig = 'instanced-procedural-spine-fin';
    dataset.ddgFishContactShadows = `${agents.length}:refraction-contact-decals`;

    return () => {
      delete dataset.ddgFishRequested;
      delete dataset.ddgFishCount;
      delete dataset.ddgFishBatches;
      delete dataset.ddgFishTier;
      delete dataset.ddgFishOptics;
      delete dataset.ddgFishRig;
      delete dataset.ddgFishContactShadows;
      delete dataset.ddgFishDiagnostics;
      if (typeof window !== 'undefined') {
        delete window.__DDG_FISH__;
        delete window.render_fish_to_text;
      }
    };
  }, [agents.length, batches.length, gl, quality]);

  useFrame(({ clock }, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const safeDelta = Math.min(delta, 0.05);
    const behaviorStep = 1 / Math.max(qualityProfile.fishBehaviorFps ?? 24, 1);
    cursorElapsed.current += safeDelta;

    surfaceProbeElapsed.current += safeDelta;
    if (
      surfaceProbeElapsed.current >= FISH_SURFACE_PROBE_SECONDS
      && qualityProfile.useGpuBoatProbes
      && typeof runtime?.sampleWaterSurface === 'function'
      && surfaceSamples.current.length > 0
    ) {
      surfaceProbeElapsed.current = 0;
      const sample = surfaceSamples.current[
        surfaceProbeCursor.current % surfaceSamples.current.length
      ];
      surfaceProbeCursor.current += 1;
      surfaceProbePoint.set(sample.x, 0, sample.z);
      const result = runtime.sampleWaterSurface(surfaceProbePoint);
      if (result) {
        // One rotating probe, never one synchronous GPU read per fish. A small
        // lag allowance keeps dorsal fins submerged between cached samples.
        sample.worldY = result.worldY - Math.max(0.012, Math.abs(waveAmplitude) * 0.35);
        sample.ready = true;
      }
    }

    obstacleElapsed.current += safeDelta;
    if (obstacleElapsed.current >= FISH_OBSTACLE_REFRESH_SECONDS) {
      obstacleElapsed.current = 0;
      habitat.obstacles = [
        captureObstacle(scene, 'boat-anchor', 'boat', obstacleBounds),
        captureObstacle(scene, 'sculpture-anchor', 'sculpture', obstacleBounds),
      ].filter(Boolean);
    }

    // Build one cursor ray, then project the fish; there are no raycasts
    // against individual fish or against water geometry. This runs before the
    // fixed behavior step so its per-agent threat fields are consumed in-frame.
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const interaction = cursorInteraction.current;
    interaction.pointerActive = settings.fishPointerInteraction !== false
      && pointerState.current.active;
    interaction.pointerNdc = pointerState.current.ndc;
    interaction.viewport = size;
    cursorDiagnostics.current = advanceFishCursorResponse(
      agents,
      interaction,
      cursorElapsed.current,
      safeDelta,
      camera,
    );

    behaviorAccumulator.current += safeDelta;
    let behaviorSteps = 0;
    while (behaviorAccumulator.current >= behaviorStep && behaviorSteps < 2) {
      behaviorAccumulator.current -= behaviorStep;
      behaviorElapsed.current += behaviorStep;
      stepFishAgents(agents, behaviorStep, behaviorElapsed.current, {
        habitat,
        schooling: settings.fishSchooling,
        activity: settings.fishActivity,
      });
      behaviorSteps += 1;
    }

    const smoothing = 1 - Math.exp(-safeDelta * 12);
    for (const batch of batches) {
      const catalog = FISH_CATALOG[batch.mesh.userData.ddgFishBatch];
      batch.material.userData.ddgFishUniforms.uFishTime.value = clock.elapsedTime;
      batch.material.userData.ddgFishUniforms.uFishActivity.value = THREE.MathUtils.clamp(
        settings.fishActivity ?? 0.55,
        0,
        1,
      );

      batch.agents.forEach((agent, index) => {
        agent.renderPosition.lerp(agent.position, smoothing);
        orientationForFish(agent, targetOrientation);
        agent.renderOrientation.slerp(
          targetOrientation,
          1 - Math.exp(-safeDelta * catalog.physics.turnRate),
        );
        batchMatrix.position.copy(agent.renderPosition);
        batchMatrix.quaternion.copy(agent.renderOrientation);
        batchMatrix.scale.setScalar(agent.hasWater===false?0:agent.scale);
        batchMatrix.updateMatrix();
        batch.mesh.setMatrixAt(index, batchMatrix.matrix);

        const speedRatio = Math.min(1.35, agent.velocity.length() / catalog.physics.maxSpeed);
        batch.flex.setX(index, 0.62 + speedRatio * 0.62);
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.flex.needsUpdate = true;
    }

    const shadowUniforms = contactShadows.material.userData.ddgFishContactShadowUniforms;
    syncCoastUniforms(shadowUniforms,settings);
    shadowUniforms.uWaterExtent.value = settings.waterExtent;
    shadowUniforms.uWaterDepth.value = settings.waterDepthMeters;
    shadowUniforms.uReliefStrength.value = settings.seabedReliefStrength;
    shadowUniforms.uReliefScale.value = settings.seabedReliefScale;
    const contactShadowsEnabled = fishLighting.shadow.enabled
      && fishLighting.shadow.intensity > 0
      && fishLighting.key.sceneIntensity > 0
      && settings.debugView === 'beauty';
    contactShadows.mesh.visible = contactShadowsEnabled;

    if (contactShadowsEnabled) {
      agents.forEach((agent, index) => {
        const catalog = FISH_CATALOG[agent.species];
        shadowForward.set(1, 0, 0).applyQuaternion(agent.renderOrientation);
        const shadow = resolveFishContactShadow({
          sampleBottomY: terrainQuery?.heightAt,
          position: agent.renderPosition,
          forward: shadowForward,
          catalog,
          lightDirection: fishLighting.key.direction,
          waterExtent: settings.waterExtent,
          waterDepthMeters: settings.waterDepthMeters,
          seabedReliefStrength: settings.seabedReliefStrength,
          seabedReliefScale: settings.seabedReliefScale,
          scale: agent.scale,
        }, contactShadowStates[index]);
        shadowMatrix.position.set(shadow.x, 0, shadow.z);
        shadowMatrix.rotation.set(0, shadow.yaw, 0);
        shadowMatrix.scale.set(shadow.length, 1, shadow.width);
        shadowMatrix.updateMatrix();
        contactShadows.mesh.setMatrixAt(index, shadowMatrix.matrix);
        contactShadows.opacity.setX(index, agent.hasWater===false?0:shadow.opacity);
      });
      contactShadows.mesh.instanceMatrix.needsUpdate = true;
      contactShadows.opacity.needsUpdate = true;
    }

    diagnosticsElapsed.current += safeDelta;
    if (diagnosticsElapsed.current < FISH_DIAGNOSTICS_REFRESH_SECONDS) return;
    diagnosticsElapsed.current = 0;
    const runtimeMetrics = measureFishRuntime(agents, {
      requestedCount: settings.fishCount,
      qualityProfile,
    });
    const diagnostics = {
      coordinateSystem: 'world +Y up; water y=0; models swim toward local +X',
      mode,
      behaviorFps: qualityProfile.fishBehaviorFps,
      optics: 'existing water refraction target; excluded from planar reflection',
      surfaceTracking: qualityProfile.useGpuBoatProbes
        ? 'five cached probes, one GPU sample at 8 Hz'
        : 'conservative deepest-wave ceiling',
      habitat: {
        min: habitat.min.toArray(),
        max: habitat.max.toArray(),
        obstacles: habitat.obstacles.map(({ id }) => id),
      },
      cursor: {
        active: settings.fishPointerInteraction !== false && pointerState.current.active,
        raycastsPerFish: 0,
        ...cursorDiagnostics.current,
      },
      ...runtimeMetrics,
    };
    gl.domElement.dataset.ddgFishDiagnostics = JSON.stringify(diagnostics);
    if (debugEnabled && typeof window !== 'undefined') {
      window.__DDG_FISH__ = diagnostics;
      window.render_fish_to_text = () => JSON.stringify(window.__DDG_FISH__ ?? null);
    }
  }, -1);

  return (
    <group
      name="river-fish-school"
      userData={{
        ddgDynamicRefraction: agents.length > 0,
        ddgFishContactShadows: 'refraction-contact-decals',
      }}
    >
      <primitive object={contactShadows.mesh} />
      {batches.map(({ mesh }) => <primitive key={mesh.uuid} object={mesh} />)}
    </group>
  );
}

FISH_SPECIES_ORDER.forEach((species) => useGLTF.preload(FISH_CATALOG[species].glb));
