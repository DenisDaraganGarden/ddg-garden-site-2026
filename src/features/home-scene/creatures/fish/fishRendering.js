import * as THREE from 'three';

const FISH_SHADER_REVISION = 'ddg-instanced-fish-rig-v1';

function fishRigShaderHeader() {
  return /* glsl */ `
    attribute float aFishPhase;
    attribute float aFishFlex;
    attribute vec4 skinIndex;
    attribute vec4 skinWeight;
    uniform float uFishTime;
    uniform float uFishLength;
    uniform float uFishHalfLength;
    uniform float uFishAmplitude;
    uniform float uFishFrequency;
    uniform float uFishActivity;
    uniform vec2 uFishPectoralBones;

    float ddgFishBoneWeight(float boneIndex) {
      vec4 matchBone = vec4(
        1.0 - step(0.25, abs(skinIndex.x - boneIndex)),
        1.0 - step(0.25, abs(skinIndex.y - boneIndex)),
        1.0 - step(0.25, abs(skinIndex.z - boneIndex)),
        1.0 - step(0.25, abs(skinIndex.w - boneIndex))
      );
      return dot(matchBone, skinWeight);
    }
  `;
}

function fishRigNormalChunk() {
  return /* glsl */ `
    #include <beginnormal_vertex>
    float ddgNormalBody = clamp((uFishHalfLength - position.x) / uFishLength, 0.0, 1.0);
    float ddgNormalTail = pow(smoothstep(0.12, 1.0, ddgNormalBody), 1.55);
    float ddgNormalPhase = aFishPhase
      + uFishTime * uFishFrequency * mix(0.52, 1.28, uFishActivity)
      - ddgNormalBody * 6.15;
    float ddgBendAngle = cos(ddgNormalPhase)
      * uFishAmplitude * aFishFlex * ddgNormalTail * 1.85;
    float ddgBendCos = cos(ddgBendAngle);
    float ddgBendSin = sin(ddgBendAngle);
    objectNormal.xz = mat2(
      ddgBendCos, -ddgBendSin,
      ddgBendSin, ddgBendCos
    ) * objectNormal.xz;
  `;
}

function fishRigPositionChunk() {
  return /* glsl */ `
    #include <begin_vertex>
    float ddgBody = clamp((uFishHalfLength - position.x) / uFishLength, 0.0, 1.0);
    float ddgTail = pow(smoothstep(0.12, 1.0, ddgBody), 1.55);
    float ddgPhase = aFishPhase
      + uFishTime * uFishFrequency * mix(0.52, 1.28, uFishActivity)
      - ddgBody * 6.15;
    transformed.z += sin(ddgPhase)
      * uFishAmplitude * uFishLength * aFishFlex * ddgTail * 0.68;

    float ddgFinLeft = ddgFishBoneWeight(uFishPectoralBones.x);
    float ddgFinRight = ddgFishBoneWeight(uFishPectoralBones.y);
    float ddgFinBeat = sin(ddgPhase * 0.63 + 0.72);
    transformed.z += (ddgFinLeft - ddgFinRight)
      * ddgFinBeat * uFishLength * 0.045;
    transformed.y += (ddgFinLeft + ddgFinRight)
      * abs(ddgFinBeat) * uFishLength * 0.018;
  `;
}

export function configureFishTextures(gl, textures) {
  const maximumAnisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);
  const { albedo, normal, orm, specular } = textures;

  albedo.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  orm.colorSpace = THREE.NoColorSpace;
  specular.colorSpace = THREE.NoColorSpace;

  Object.values(textures).forEach((texture) => {
    texture.flipY = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = maximumAnisotropy;
    texture.needsUpdate = true;
  });
}

export function createFishGeometry(template, instanceCount) {
  let sourceMesh = null;
  template.traverse((object) => {
    if (!sourceMesh && object.isSkinnedMesh) sourceMesh = object;
  });
  if (!sourceMesh) throw new Error('Fish GLB is missing its skinned mesh.');

  const geometry = sourceMesh.geometry.clone();
  geometry.setAttribute(
    'aFishPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(instanceCount), 1),
  );
  geometry.setAttribute(
    'aFishFlex',
    new THREE.InstancedBufferAttribute(new Float32Array(instanceCount), 1),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createFishMaterial(catalog, textures) {
  const uniforms = {
    uFishTime: { value: 0 },
    uFishLength: { value: catalog.length },
    uFishHalfLength: { value: catalog.length * 0.5 },
    uFishAmplitude: { value: catalog.physics.waveAmplitude },
    uFishFrequency: { value: catalog.physics.waveFrequency },
    uFishActivity: { value: 0.55 },
    uFishPectoralBones: { value: new THREE.Vector2(...catalog.pectoralBones) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    name: `${catalog.id}-production-pbr`,
    color: '#ffffff',
    vertexColors: true,
    map: textures.albedo,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.72, 0.72),
    aoMap: textures.orm,
    aoMapIntensity: 0.72,
    roughness: 1,
    roughnessMap: textures.orm,
    metalness: 0,
    metalnessMap: textures.orm,
    specularIntensity: 1,
    specularIntensityMap: textures.specular,
    specularColor: new THREE.Color('#e9f0e5'),
    clearcoat: catalog.clearcoat,
    clearcoatRoughness: 0.18,
    iridescence: catalog.iridescence,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [90, 240],
    ior: 1.39,
    envMapIntensity: 1.05,
    side: THREE.DoubleSide,
  });

  material.userData.ddgFishUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${fishRigShaderHeader()}`)
      .replace('#include <beginnormal_vertex>', fishRigNormalChunk())
      .replace('#include <begin_vertex>', fishRigPositionChunk());
  };
  material.customProgramCacheKey = () => `${FISH_SHADER_REVISION}:${catalog.id}`;
  return material;
}

export function createFishBatch(catalog, template, textures, agents) {
  const geometry = createFishGeometry(template, agents.length);
  const material = createFishMaterial(catalog, textures);
  const mesh = new THREE.InstancedMesh(geometry, material, agents.length);

  mesh.name = `fish-${catalog.id}-batch`;
  mesh.count = agents.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  mesh.userData.ddgFishBatch = catalog.id;

  const phase = geometry.getAttribute('aFishPhase');
  const flex = geometry.getAttribute('aFishFlex');
  agents.forEach((agent, index) => {
    phase.setX(index, agent.wanderPhase);
    flex.setX(index, 1);
  });
  phase.needsUpdate = true;
  flex.needsUpdate = true;

  return { mesh, geometry, material, agents, flex };
}

export function disposeFishBatch(batch) {
  batch.geometry.dispose();
  batch.material.dispose();
}
