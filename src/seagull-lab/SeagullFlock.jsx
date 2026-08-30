import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODE_COUNTS, SEAGULL_ASSET } from './seagullCatalog';
import { createFlightAgents, getWingPose, updateFlightAgents } from './seagullFlight';

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
  const statsClock = useRef(0);
  const elapsed = useRef(0);
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
    return { object, bones, bind };
  }), [count, gltf.scene, material, mode]);

  const agents = useMemo(() => createFlightAgents(count), [count]);
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

  useEffect(() => () => {
    rigHelper?.geometry?.dispose();
    if (Array.isArray(rigHelper?.material)) {
      rigHelper.material.forEach((helperMaterial) => helperMaterial.dispose());
    } else {
      rigHelper?.material?.dispose();
    }
  }, [rigHelper]);

  useFrame(({ gl }, delta) => {
    const safeDelta = Math.min(delta, 0.05);
    if (!paused) elapsed.current += safeDelta * 0.74;
    if (!paused) {
      updateFlightAgents(
        agents,
        elapsed.current,
        safeDelta * 0.74,
        mode,
        landingSitesRef?.current ?? [],
      );
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
        minHeight: Math.min(...agents.map((agent) => agent.physicalHeight)),
        maxHeight: Math.max(...agents.map((agent) => agent.physicalHeight)),
      });
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
