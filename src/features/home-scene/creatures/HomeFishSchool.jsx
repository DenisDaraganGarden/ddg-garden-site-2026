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
  disposeFishBatch,
} from './fish/fishRendering.js';

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

function buildHabitat(settings, sampleSurfaceY) {
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
  runtime,
  qualityProfile,
  mode = 'public',
}) {
  const pike = useGLTF(FISH_CATALOG.pike.glb);
  const perch = useGLTF(FISH_CATALOG.perch.glb);
  const roach = useGLTF(FISH_CATALOG.roach.glb);
  const loadedTextures = useTexture(textureUrls());
  const { gl, scene } = useThree();
  const {
    fishDepthBand,
    seabedReliefStrength,
    waterDepthMeters,
    waterExtent,
    waveAmplitude,
  } = settings;
  const batchMatrix = useMemo(() => new THREE.Object3D(), []);
  const targetOrientation = useMemo(() => new THREE.Quaternion(), []);
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
  }, sampleSurfaceY), [
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
  const behaviorAccumulator = useRef(0);
  const behaviorElapsed = useRef(0);
  const obstacleElapsed = useRef(FISH_OBSTACLE_REFRESH_SECONDS);
  const surfaceProbeElapsed = useRef(FISH_SURFACE_PROBE_SECONDS);
  const surfaceProbeCursor = useRef(0);
  const diagnosticsElapsed = useRef(FISH_DIAGNOSTICS_REFRESH_SECONDS);
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

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgFishRequested = String(quality.requestedCount);
    dataset.ddgFishCount = String(quality.effectiveCount);
    dataset.ddgFishBatches = String(batches.length);
    dataset.ddgFishTier = quality.tier;
    dataset.ddgFishOptics = 'refraction-only';
    dataset.ddgFishRig = 'instanced-procedural-spine-fin';

    return () => {
      delete dataset.ddgFishRequested;
      delete dataset.ddgFishCount;
      delete dataset.ddgFishBatches;
      delete dataset.ddgFishTier;
      delete dataset.ddgFishOptics;
      delete dataset.ddgFishRig;
      delete dataset.ddgFishDiagnostics;
      if (typeof window !== 'undefined') {
        delete window.__DDG_FISH__;
        delete window.render_fish_to_text;
      }
    };
  }, [batches.length, gl, quality]);

  useFrame(({ clock }, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const safeDelta = Math.min(delta, 0.05);
    const behaviorStep = 1 / Math.max(qualityProfile.fishBehaviorFps ?? 24, 1);

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
        batchMatrix.scale.setScalar(agent.scale);
        batchMatrix.updateMatrix();
        batch.mesh.setMatrixAt(index, batchMatrix.matrix);

        const speedRatio = Math.min(1.35, agent.velocity.length() / catalog.physics.maxSpeed);
        batch.flex.setX(index, 0.62 + speedRatio * 0.62);
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.flex.needsUpdate = true;
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
      userData={{ ddgDynamicRefraction: agents.length > 0 }}
    >
      {batches.map(({ mesh }) => <primitive key={mesh.uuid} object={mesh} />)}
    </group>
  );
}

FISH_SPECIES_ORDER.forEach((species) => useGLTF.preload(FISH_CATALOG[species].glb));
