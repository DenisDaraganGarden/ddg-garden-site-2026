import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODE_COUNTS, SEAGULL_ASSET } from './seagullCatalog';
import { createFlightAgents, getWingPose, updateFlightAgents } from './seagullFlight';
import { scareLandingAgent } from './seagullLanding';
import {
  advancePointerResponse,
  createPointerSample,
  measurePointerInteraction,
} from './seagullPointerInteraction';

const ROTATION_AXIS_X = new THREE.Vector3(1, 0, 0);
const ROTATION_AXIS_Y = new THREE.Vector3(0, 1, 0);
const ROTATION_AXIS_Z = new THREE.Vector3(0, 0, 1);
const rotationScratch = new THREE.Quaternion();
const rotationScratchSecondary = new THREE.Quaternion();

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
  const { gl: renderer } = useThree();
  const statsClock = useRef(0);
  const elapsed = useRef(0);
  const pointerTargetCount = useRef(0);
  const habitatPoints = useRef([]);
  const pointerState = useRef({
    active: false,
    ndc: new THREE.Vector2(),
  });
  const pointerDebugEnabled = useMemo(() => (
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('pointercheck')
  ), []);
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
    object.name = `seagull_${index + 1}`;
    object.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.material = material;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    const bones = collectBones(object);
    const bind = Object.fromEntries(
      Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()]),
    );
    const scale = mode === 'specimen' ? 1.42 : 0.92 + (index % 5) * 0.025;
    object.scale.setScalar(scale);
    return {
      object, bones, bind, scale,
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
  const inactivePointerSample = useMemo(() => createPointerSample(), []);
  const rigHelper = useMemo(() => {
    if (!instances[0]) return null;
    const helper = new THREE.SkeletonHelper(instances[0].object);
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
    const domElement = renderer.domElement;
    const resetPointer = () => {
      pointerState.current.active = false;
      domElement.style.cursor = '';
      delete domElement.dataset.seagullPointerTarget;
    };
    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch' || event.buttons !== 0) {
        resetPointer();
        return;
      }
      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        resetPointer();
        return;
      }
      pointerState.current.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
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
      resetPointer();
      delete domElement.dataset.seagullPointerDebug;
      if (typeof window !== 'undefined') delete window.__DDG_SEAGULL_POINTER__;
    };
  }, [renderer]);

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
        const sample = agent.index === focusedIndex
          ? agent.pointerSample
          : inactivePointerSample;
        if (!advancePointerResponse(agent, sample, safeDelta)) continue;
        scareLandingAgent(agent, elapsed.current, agent.pointerSample.away);
      }
      pointerTargetCount.current = focusedIndex >= 0 ? 1 : 0;
      if (focusedIndex >= 0) {
        renderer.domElement.style.cursor = 'crosshair';
        renderer.domElement.dataset.seagullPointerTarget = String(focusedIndex);
      } else {
        renderer.domElement.style.cursor = '';
        delete renderer.domElement.dataset.seagullPointerTarget;
      }

      updateFlightAgents(
        agents,
        elapsed.current,
        safeDelta * 0.74,
        mode,
        landingSitesRef?.current ?? [],
      );
    } else {
      pointerTargetCount.current = 0;
      renderer.domElement.style.cursor = '';
      delete renderer.domElement.dataset.seagullPointerTarget;
    }

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      const agent = agents[index];
      const wing = getWingPose(agent);
      instance.object.position.copy(agent.position);
      instance.object.quaternion.copy(agent.quaternion);

      applyWingRotation(instance.bones['wing.shoulder.L'], instance.bind['wing.shoulder.L'], wing.shoulder, -wing.fold);
      applyWingRotation(instance.bones['wing.shoulder.R'], instance.bind['wing.shoulder.R'], wing.shoulder, wing.fold);
      applyWingRotation(instance.bones['wing.inner.L'], instance.bind['wing.inner.L'], wing.inner, -wing.fold * 0.28);
      applyWingRotation(instance.bones['wing.inner.R'], instance.bind['wing.inner.R'], wing.inner, wing.fold * 0.28);
      applyWingRotation(instance.bones['wing.outer.L'], instance.bind['wing.outer.L'], wing.outer, -wing.fold * 0.08);
      applyWingRotation(instance.bones['wing.outer.R'], instance.bind['wing.outer.R'], wing.outer, wing.fold * 0.08);
      applyWingRotation(instance.bones['wing.tip.L'], instance.bind['wing.tip.L'], wing.tip, 0);
      applyWingRotation(instance.bones['wing.tip.R'], instance.bind['wing.tip.R'], wing.tip, 0);

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
      const states = agents.reduce((result, agent) => ({
        ...result,
        [agent.state]: (result[agent.state] ?? 0) + 1,
      }), {});
      const landingStates = agents.reduce((result, agent) => ({
        ...result,
        [agent.landingState ?? 'airborne']: (result[agent.landingState ?? 'airborne'] ?? 0) + 1,
      }), {});
      onStats({
        birds: instances.length,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        flap: states.flap ?? 0,
        glide: states.glide ?? 0,
        thermal: states.thermal ?? 0,
        perched: landingStates.perched ?? 0,
        approaching: (landingStates.approach ?? 0) + (landingStates.flare ?? 0) + (landingStates.settle ?? 0),
        takingOff: (landingStates.takeoff ?? 0) + (landingStates.rejoin ?? 0),
        airborne: landingStates.airborne ?? 0,
        cursorTargets: pointerTargetCount.current,
        startled: agents.reduce((sum, agent) => sum + agent.pointerStartleCount, 0),
        minHeight: Math.min(...agents.map((agent) => agent.physicalHeight)),
        maxHeight: Math.max(...agents.map((agent) => agent.physicalHeight)),
      });
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
    }
  });

  return (
    <group>
      {instances.map((instance) => (
        <primitive key={instance.object.uuid} object={instance.object} />
      ))}
      {showRig && rigHelper && <primitive object={rigHelper} />}
    </group>
  );
}

useGLTF.preload(SEAGULL_ASSET.model);
