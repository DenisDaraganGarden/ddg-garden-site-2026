import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  createFishAgents,
  measureFishRuntime,
  stepFishAgents,
} from '../features/home-scene/creatures/fish/fishBehavior.js';
import {
  FISH_CATALOG,
  FISH_SPECIES_ORDER,
  FISH_TEXTURES,
} from '../features/home-scene/creatures/fish/fishCatalog.js';
import { createFishHabitat } from '../features/home-scene/creatures/fish/fishHabitat.js';
import {
  configureFishTextures,
  createFishBatch,
  disposeFishBatch,
  updateFishBatch,
} from '../features/home-scene/creatures/fish/fishRendering.js';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

// The school is the product's: behaviour, habitat rules, the instanced rig
// shader and the PBR material all come from features/home-scene/creatures/fish,
// and the counts, schooling and activity are the published editor values. The
// lab adds two studio tanks and a rig helper for inspection.
const PUBLISHED = getPublishedHomeSceneSettings();
const BEHAVIOR_STEP = 1 / 24;
const TANKS = {
  school: createFishHabitat({
    min: [-2.75, -1.0, -1.55], max: [2.75, 1.0, 1.55], margin: [0.58, 0.38, 0.45],
    waterY: 1.05, surfaceClearance: 0.035, bottomClearance: 0.055,
  }),
  specimens: createFishHabitat({
    min: [-0.95, -0.4, -0.55], max: [0.95, 0.42, 0.55], margin: [0.3, 0.16, 0.24],
    waterY: 0.46, surfaceClearance: 0.035, bottomClearance: 0.055,
  }),
};
const MODE_COUNTS = { school: PUBLISHED.fishCount, specimens: 3 };
const MODE_ACTIVITY = { school: PUBLISHED.fishActivity, specimens: 0.25 };
const TEXTURE_URLS = FISH_SPECIES_ORDER.flatMap((species) => [
  FISH_TEXTURES[species].albedo,
  FISH_TEXTURES[species].normal,
  FISH_TEXTURES[species].orm,
  FISH_TEXTURES[species].specular,
]);

export default function FishSchool({ mode, paused, showRig, onStats }) {
  const pike = useGLTF(FISH_CATALOG.pike.glb);
  const perch = useGLTF(FISH_CATALOG.perch.glb);
  const roach = useGLTF(FISH_CATALOG.roach.glb);
  const loadedTextures = useTexture(TEXTURE_URLS);
  const { gl } = useThree();
  const accumulator = useRef(0);
  const elapsed = useRef(0);
  const swimClock = useRef(0);
  const lastStats = useRef(0);
  const templates = useMemo(() => ({ pike: pike.scene, perch: perch.scene, roach: roach.scene }), [perch.scene, pike.scene, roach.scene]);
  const textureSets = useMemo(() => Object.fromEntries(FISH_SPECIES_ORDER.map((species, index) => [species, {
    albedo: loadedTextures[index * 4],
    normal: loadedTextures[index * 4 + 1],
    orm: loadedTextures[index * 4 + 2],
    specular: loadedTextures[index * 4 + 3],
  }])), [loadedTextures]);
  const habitat = TANKS[mode] ?? TANKS.school;
  const activity = MODE_ACTIVITY[mode] ?? MODE_ACTIVITY.school;
  const agents = useMemo(() => createFishAgents({
    requestedCount: MODE_COUNTS[mode] ?? MODE_COUNTS.school,
    qualityProfile: { fishMaxInstances: MODE_COUNTS.school },
    habitat,
  }), [habitat, mode]);
  const batches = useMemo(() => FISH_SPECIES_ORDER.flatMap((species) => {
    const speciesAgents = agents.filter((agent) => agent.species === species);
    if (speciesAgents.length === 0) return [];
    return [createFishBatch(FISH_CATALOG[species], templates[species], textureSets[species], speciesAgents)];
  }), [agents, templates, textureSets]);
  // Lab-only: the GLB skeleton drawn over the first fish of each species.
  const rig = useMemo(() => {
    if (!showRig) return [];
    return batches.map((batch) => {
      const species = batch.mesh.userData.ddgFishBatch;
      const object = cloneSkeleton(templates[species]);
      object.traverse((child) => { if (child.isMesh || child.isSkinnedMesh) child.visible = false; });
      const helper = new THREE.SkeletonHelper(object);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.vertexColors = false;
      helper.material.color.set(species === 'pike' ? '#d52d38' : '#176d9a');
      helper.renderOrder = 20;
      return { agent: batch.agents[0], object, helper };
    });
  }, [batches, showRig, templates]);

  useEffect(() => {
    FISH_SPECIES_ORDER.forEach((species) => configureFishTextures(gl, textureSets[species]));
  }, [gl, textureSets]);
  useEffect(() => () => batches.forEach(disposeFishBatch), [batches]);
  useEffect(() => () => rig.forEach(({ helper, object }) => {
    helper.geometry.dispose();
    helper.material.dispose();
    object.traverse((child) => { if (child.isSkinnedMesh) child.skeleton?.dispose(); });
  }), [rig]);

  useFrame(({ clock }, delta) => {
    const safeDelta = Math.min(delta, 0.05);
    if (!paused) {
      swimClock.current += safeDelta;
      accumulator.current += safeDelta;
      let steps = 0;
      while (accumulator.current >= BEHAVIOR_STEP && steps < 2) {
        accumulator.current -= BEHAVIOR_STEP;
        elapsed.current += BEHAVIOR_STEP;
        stepFishAgents(agents, BEHAVIOR_STEP, elapsed.current, {
          habitat, schooling: PUBLISHED.fishSchooling, activity,
        });
        steps += 1;
      }
    }
    for (const batch of batches) {
      updateFishBatch(batch, FISH_CATALOG[batch.mesh.userData.ddgFishBatch], {
        elapsed: swimClock.current, delta: paused ? 0 : safeDelta, activity,
      });
    }
    for (const { agent, object } of rig) {
      object.position.copy(agent.renderPosition ?? agent.position);
      object.quaternion.copy(agent.renderOrientation ?? agent.orientation);
      object.scale.setScalar(agent.scale);
    }
    if (clock.elapsedTime - lastStats.current > 0.5) {
      lastStats.current = clock.elapsedTime;
      const runtime = measureFishRuntime(agents);
      onStats?.({
        fish: runtime.total,
        batches: batches.length,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        surface: runtime.states.surface ?? 0,
        bottom: runtime.states.bottom ?? 0,
      });
    }
  });

  return (
    <group name="river-fish-school">
      {batches.map((batch) => <primitive key={batch.mesh.uuid} object={batch.mesh} />)}
      {rig.map(({ object, helper }) => (
        <React.Fragment key={helper.uuid}>
          <primitive object={object} />
          <primitive object={helper} />
        </React.Fragment>
      ))}
    </group>
  );
}

FISH_SPECIES_ORDER.forEach((species) => useGLTF.preload(FISH_CATALOG[species].glb));
