import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FISH_CATALOG, FISH_TEXTURES } from './fishCatalog';
import {
  createFishAgents,
  orientationForAgent,
  stepFishAgents,
} from './fishBoids';

const SPECIES_IDS = ['pike', 'perch', 'roach'];
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const targetQuaternion = new THREE.Quaternion();
const boneRotation = new THREE.Quaternion();

function useFishMaterials() {
  const urls = useMemo(
    () => SPECIES_IDS.flatMap((species) => [
      FISH_TEXTURES[species].albedo,
      FISH_TEXTURES[species].normal,
      FISH_TEXTURES[species].orm,
      FISH_TEXTURES[species].specular,
    ]),
    [],
  );
  const textures = useLoader(THREE.TextureLoader, urls);

  return useMemo(() => {
    const materials = {};
    SPECIES_IDS.forEach((species, speciesIndex) => {
      const [albedo, normal, orm, specular] = textures.slice(speciesIndex * 4, speciesIndex * 4 + 4);
      [albedo, normal, orm, specular].forEach((texture) => {
        texture.flipY = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
      });
      albedo.colorSpace = THREE.SRGBColorSpace;
      normal.colorSpace = THREE.NoColorSpace;
      orm.colorSpace = THREE.NoColorSpace;
      specular.colorSpace = THREE.NoColorSpace;
      const catalog = FISH_CATALOG[species];
      const body = new THREE.MeshPhysicalMaterial({
        name: `${species}_runtime_body`,
        color: 0xffffff,
        vertexColors: true,
        map: albedo,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.72, 0.72),
        roughness: 1,
        roughnessMap: orm,
        metalness: 0,
        metalnessMap: orm,
        specularIntensity: 1,
        specularIntensityMap: specular,
        specularColor: new THREE.Color('#e9f0e5'),
        clearcoat: catalog.clearcoat,
        clearcoatRoughness: 0.18,
        iridescence: catalog.iridescence,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [90, 240],
        ior: 1.39,
        envMapIntensity: 1.25,
      });
      const fins = new THREE.MeshPhysicalMaterial({
        name: `${species}_runtime_fins`,
        color: catalog.finColor,
        roughness: 0.43,
        metalness: 0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.26,
        envMapIntensity: 0.82,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      });
      materials[species] = { body, fins };
    });
    return materials;
  }, [textures]);
}

function collectRig(object, species) {
  const spine = [];
  const pectoral = [];
  object.traverse((child) => {
    if (child.isMesh) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => (
          material?.name?.includes('fins') ? species.fins : species.body
        ));
      } else {
        child.material = child.material?.name?.includes('fins') ? species.fins : species.body;
      }
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
    }
    if (child.isBone && child.name.includes('_spine_')) {
      spine.push(child);
    } else if (child.isBone && child.name.includes('_pectoral_')) {
      pectoral.push(child);
    }
  });
  spine.sort((a, b) => a.name.localeCompare(b.name));
  pectoral.sort((a, b) => a.name.localeCompare(b.name));
  const baseQuaternions = new Map();
  [...spine, ...pectoral].forEach((bone) => baseQuaternions.set(bone.uuid, bone.quaternion.clone()));
  return { spine, pectoral, baseQuaternions };
}

function animateRig(model, agent) {
  const catalog = FISH_CATALOG[agent.species];
  const speedRatio = Math.min(1, agent.velocity.length() / catalog.physics.maxSpeed);
  const amplitude = catalog.physics.waveAmplitude * (0.55 + speedRatio * 0.75);
  model.rig.spine.forEach((bone, index) => {
    const tailAmount = index / Math.max(1, model.rig.spine.length - 1);
    const angle = Math.sin(agent.phase - tailAmount * 1.45)
      * amplitude
      * tailAmount ** 1.55;
    boneRotation.setFromAxisAngle(Z_AXIS, angle);
    bone.quaternion.copy(model.rig.baseQuaternions.get(bone.uuid)).multiply(boneRotation);
  });
  model.rig.pectoral.forEach((bone, index) => {
    const side = index === 0 ? 1 : -1;
    const angle = side * (0.09 + Math.sin(agent.phase * 0.62 + index * Math.PI) * 0.16);
    boneRotation.setFromAxisAngle(X_AXIS, angle);
    bone.quaternion.copy(model.rig.baseQuaternions.get(bone.uuid)).multiply(boneRotation);
  });
}

export default function FishSchool({ mode, paused, showRig, onStats }) {
  const pikeGltf = useGLTF(FISH_CATALOG.pike.glb);
  const perchGltf = useGLTF(FISH_CATALOG.perch.glb);
  const roachGltf = useGLTF(FISH_CATALOG.roach.glb);
  const templates = useMemo(() => ({
    pike: pikeGltf.scene,
    perch: perchGltf.scene,
    roach: roachGltf.scene,
  }), [pikeGltf.scene, perchGltf.scene, roachGltf.scene]);
  const materials = useFishMaterials();
  const agents = useMemo(() => createFishAgents(mode), [mode]);
  const lastStatsUpdate = useRef(0);

  const models = useMemo(() => agents.map((agent) => {
    const object = cloneSkeleton(templates[agent.species]);
    object.name = `fish_${agent.species}_${agent.id}`;
    const rig = collectRig(object, materials[agent.species]);
    object.scale.setScalar(agent.scale);
    return { agent, object, rig };
  }), [agents, materials, templates]);

  useEffect(() => () => {
    models.forEach(({ object }) => object.traverse((child) => {
      if (child.isSkinnedMesh) {
        child.skeleton?.dispose();
      }
    }));
  }, [models]);

  const helpers = useMemo(() => {
    if (!showRig) {
      return [];
    }
    return SPECIES_IDS.map((species) => models.find((model) => model.agent.species === species))
      .filter(Boolean)
      .map((model) => {
        const helper = new THREE.SkeletonHelper(model.object);
        helper.name = `${model.agent.species}_rig_helper`;
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.vertexColors = false;
        helper.material.opacity = 1;
        helper.material.color.set(model.agent.species === 'pike' ? '#d52d38' : '#176d9a');
        helper.renderOrder = 20;
        return helper;
      });
  }, [models, showRig]);

  useEffect(() => () => {
    helpers.forEach((helper) => {
      helper.geometry.dispose();
      helper.material.dispose();
    });
  }, [helpers]);

  useFrame(({ clock, gl }, delta) => {
    const elapsed = clock.getElapsedTime();
    stepFishAgents(agents, delta, elapsed, paused);
    for (const model of models) {
      const { agent, object } = model;
      object.position.copy(agent.position);
      orientationForAgent(agent, targetQuaternion);
      const turnRate = FISH_CATALOG[agent.species].physics.turnRate;
      agent.orientation.slerp(targetQuaternion, 1 - Math.exp(-turnRate * Math.min(delta, 1 / 30)));
      object.quaternion.copy(agent.orientation);
      animateRig(model, agent);
    }

    if (elapsed - lastStatsUpdate.current > 0.5) {
      lastStatsUpdate.current = elapsed;
      let meshes = 0;
      let visibleMeshes = 0;
      models.forEach(({ object }) => object.traverse((child) => {
        if (child.isMesh) {
          meshes += 1;
          visibleMeshes += child.visible ? 1 : 0;
        }
      }));
      onStats?.({
        fish: agents.length,
        meshes,
        visibleMeshes,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        surface: agents.filter((agent) => agent.state === 'surface').length,
        bottom: agents.filter((agent) => agent.state === 'bottom').length,
      });
    }
  });

  return (
    <group name="river-fish-school">
      {models.map(({ agent, object }) => (
        <primitive key={agent.id} object={object} />
      ))}
      {helpers.map((helper) => (
        <primitive key={helper.uuid} object={helper} />
      ))}
    </group>
  );
}

SPECIES_IDS.forEach((species) => useGLTF.preload(FISH_CATALOG[species].glb));
