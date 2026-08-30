import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODE_COUNTS, SEAGULL_ASSET } from './seagullCatalog';
import { createFlightAgents, getWingPose, updateFlightAgents } from './seagullFlight';

const ROTATION_AXIS_X = new THREE.Vector3(1, 0, 0);
const ROTATION_AXIS_Z = new THREE.Vector3(0, 0, 1);
const rotationScratch = new THREE.Quaternion();

function collectBones(object) {
  const bones = {};
  object.traverse((child) => {
    if (child.isBone) bones[child.name] = child;
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

export default function SeagullFlock({ mode, paused, showRig, onStats }) {
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
    if (!paused) updateFlightAgents(agents, elapsed.current, safeDelta * 0.74, mode);

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      const agent = agents[index];
      const wing = getWingPose(agent);
      instance.object.position.copy(agent.position);
      instance.object.position.y += wing.heave;
      instance.object.quaternion.copy(agent.quaternion);

      applyBoneRotation(instance.bones['wing.shoulder.L'], instance.bind['wing.shoulder.L'], ROTATION_AXIS_X, wing.shoulder);
      applyBoneRotation(instance.bones['wing.shoulder.R'], instance.bind['wing.shoulder.R'], ROTATION_AXIS_X, -wing.shoulder);
      applyBoneRotation(instance.bones['wing.inner.L'], instance.bind['wing.inner.L'], ROTATION_AXIS_X, wing.inner);
      applyBoneRotation(instance.bones['wing.inner.R'], instance.bind['wing.inner.R'], ROTATION_AXIS_X, -wing.inner);
      applyBoneRotation(instance.bones['wing.outer.L'], instance.bind['wing.outer.L'], ROTATION_AXIS_Z, wing.outer);
      applyBoneRotation(instance.bones['wing.outer.R'], instance.bind['wing.outer.R'], ROTATION_AXIS_Z, -wing.outer);
      applyBoneRotation(instance.bones['wing.tip.L'], instance.bind['wing.tip.L'], ROTATION_AXIS_Z, wing.tip);
      applyBoneRotation(instance.bones['wing.tip.R'], instance.bind['wing.tip.R'], ROTATION_AXIS_Z, -wing.tip);
      applyBoneRotation(instance.bones.head, instance.bind.head, ROTATION_AXIS_X, -agent.bank * 0.32);
      applyBoneRotation(instance.bones['tail.L'], instance.bind['tail.L'], ROTATION_AXIS_Z, agent.bank * 0.18);
      applyBoneRotation(instance.bones['tail.R'], instance.bind['tail.R'], ROTATION_AXIS_Z, agent.bank * 0.18);
      applyParentSpaceBoneRotation(instance.bones['leg.L'], instance.bind['leg.L'], ROTATION_AXIS_Z, -1.08);
      applyParentSpaceBoneRotation(instance.bones['leg.R'], instance.bind['leg.R'], ROTATION_AXIS_Z, -1.08);
    }

    statsClock.current += safeDelta;
    if (statsClock.current > 0.35) {
      statsClock.current = 0;
      const states = agents.reduce((result, agent) => ({
        ...result,
        [agent.state]: (result[agent.state] ?? 0) + 1,
      }), {});
      onStats({
        birds: instances.length,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        flap: states.flap ?? 0,
        glide: states.glide ?? 0,
        thermal: states.thermal ?? 0,
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
