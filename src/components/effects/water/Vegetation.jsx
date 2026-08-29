import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { surfaceVegetationFragmentShader, surfaceVegetationVertexShader, underwaterAlgaeFragmentShader, underwaterAlgaeVertexShader } from '../shaders/vegetationShaders';
import { reflectionContext } from './reflectionContext';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

// Lily pads on the surface and algae below it. Both are instanced from a seeded
// scatter, so the same settings always produce the same meadow - an author moving
// a slider is adjusting one arrangement, not reshuffling it.

function createDeterministicRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPointInDisk(random, radius = 1) {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * radius;

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}

function createSurfaceVegetationGeometry(maxInstances) {
  const random = createDeterministicRandom(0x5ea1f00d);
  const baseGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  const scatter = new Float32Array(maxInstances * 2);
  const clustered = new Float32Array(maxInstances * 2);
  const scales = new Float32Array(maxInstances);
  const rotations = new Float32Array(maxInstances);
  const types = new Float32Array(maxInstances);
  const tones = new Float32Array(maxInstances);
  const phases = new Float32Array(maxInstances);
  const clusterCenters = Array.from({ length: 11 }, () => randomPointInDisk(random, 0.76));

  geometry.index = baseGeometry.index;
  geometry.setAttribute('position', baseGeometry.getAttribute('position'));
  geometry.setAttribute('uv', baseGeometry.getAttribute('uv'));

  for (let index = 0; index < maxInstances; index += 1) {
    const point = randomPointInDisk(random, 0.96);
    const center = clusterCenters[Math.floor(random() * clusterCenters.length)];
    const local = randomPointInDisk(random, 0.08 + random() * 0.2);
    const targetX = center.x + local.x;
    const targetY = center.y + local.y;
    const targetLength = Math.hypot(targetX, targetY);
    const targetScale = targetLength > 0.96 ? 0.96 / targetLength : 1;

    scatter[index * 2] = point.x;
    scatter[index * 2 + 1] = point.y;
    clustered[index * 2] = targetX * targetScale;
    clustered[index * 2 + 1] = targetY * targetScale;
    scales[index] = random();
    rotations[index] = random() * Math.PI * 2;
    types[index] = random();
    tones[index] = random();
    phases[index] = random() * Math.PI * 2;
  }

  geometry.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 2));
  geometry.setAttribute('aCluster', new THREE.InstancedBufferAttribute(clustered, 2));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1));
  geometry.setAttribute('aType', new THREE.InstancedBufferAttribute(types, 1));
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = maxInstances;

  return geometry;
}

function createUnderwaterAlgaeGeometry(maxInstances, segments = 8) {
  const random = createDeterministicRandom(0xa19ae5e1);
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = [];
  const uvs = [];
  const ribbonPlanes = [];

  const pushVertex = (x, y, plane) => {
    positions.push(x, y, 0);
    uvs.push(x + 0.5, y);
    ribbonPlanes.push(plane);
  };

  for (let plane = 0; plane < 2; plane += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const lower = segment / segments;
      const upper = (segment + 1) / segments;

      pushVertex(-0.5, lower, plane);
      pushVertex(0.5, lower, plane);
      pushVertex(0.5, upper, plane);
      pushVertex(-0.5, lower, plane);
      pushVertex(0.5, upper, plane);
      pushVertex(-0.5, upper, plane);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aRibbonPlane', new THREE.Float32BufferAttribute(ribbonPlanes, 1));

  const scatter = new Float32Array(maxInstances * 2);
  const clustered = new Float32Array(maxInstances * 2);
  const heights = new Float32Array(maxInstances);
  const widths = new Float32Array(maxInstances);
  const yaws = new Float32Array(maxInstances);
  const phases = new Float32Array(maxInstances);
  const tones = new Float32Array(maxInstances);
  const species = new Float32Array(maxInstances);
  const patchCenters = Array.from({ length: 19 }, () => randomPointInDisk(random, 0.82));

  for (let index = 0; index < maxInstances; index += 1) {
    const patch = patchCenters[Math.floor(random() * patchCenters.length)];
    const local = randomPointInDisk(random, 0.035 + random() * 0.16);
    const freePoint = randomPointInDisk(random, 0.97);
    const clusteredX = patch.x + local.x;
    const clusteredY = patch.y + local.y;
    const clusterLength = Math.hypot(clusteredX, clusteredY);
    const clusterFit = clusterLength > 0.97 ? 0.97 / clusterLength : 1;

    scatter[index * 2] = freePoint.x;
    scatter[index * 2 + 1] = freePoint.y;
    clustered[index * 2] = clusteredX * clusterFit;
    clustered[index * 2 + 1] = clusteredY * clusterFit;
    heights[index] = random();
    widths[index] = 0.62 + random() * 1.28;
    yaws[index] = random() * Math.PI * 2;
    phases[index] = random() * Math.PI * 2;
    tones[index] = random();
    species[index] = random();
  }

  geometry.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 2));
  geometry.setAttribute('aCluster', new THREE.InstancedBufferAttribute(clustered, 2));
  geometry.setAttribute('aHeight', new THREE.InstancedBufferAttribute(heights, 1));
  geometry.setAttribute('aWidth', new THREE.InstancedBufferAttribute(widths, 1));
  geometry.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaws, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1));
  geometry.setAttribute('aSpecies', new THREE.InstancedBufferAttribute(species, 1));
  geometry.instanceCount = maxInstances;

  return geometry;
}

export function SurfaceVegetation({ settings, runtime, qualityProfile, lighting }) {
  const materialRef = useRef();
  const reflectionDataRef = React.useContext(reflectionContext);
  const maxInstances = qualityProfile?.surfacePlantMaxInstances ?? 560;
  const leafTextures = useLoader(THREE.TextureLoader, [
    '/textures/lily/lily_atlas_albedo.png',
    '/textures/lily/lily_atlas_normal.png',
    '/textures/lily/lily_atlas_material.png',
  ]);
  const [leafAlbedoMap, leafNormalMap, leafMaterialMap] = useMemo(() => {
    leafTextures.forEach((texture) => {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8;
      texture.colorSpace = THREE.NoColorSpace;
      texture.needsUpdate = true;
    });
    return leafTextures;
  }, [leafTextures]);
  const geometry = useMemo(
    () => createSurfaceVegetationGeometry(maxInstances),
    [maxInstances],
  );
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  const uniforms = useMemo(() => ({
    uLeafAlbedoMap: { value: leafAlbedoMap },
    uLeafNormalMap: { value: leafNormalMap },
    uLeafMaterialMap: { value: leafMaterialMap },
    uState: { value: null },
    uNormalMap: { value: null },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uClustering: { value: 0 },
    uSize: { value: 0.18 },
    uWaterExtent: { value: 24 },
    uWaveAmplitude: { value: 0.05 },
    uWaveChoppiness: { value: 0.18 },
    uTime: { value: 0 },
    uReflectionTexture: { value: null },
    uReflectionActive: { value: 0 },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uColor: { value: new THREE.Color('#7f9d42') },
    uSaturation: { value: 1 },
    uSubsurfaceStrength: { value: 0.62 },
    uReflectionStrength: { value: 0.72 },
    uEnvironmentExposure: { value: 1 },
    uEnvironmentReflection: { value: 1 },
    uEnvironmentAmbientColor: { value: new THREE.Color('#30465b') },
    uEnvironmentDiffuse: { value: 1 },
    uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMoonColor: { value: new THREE.Color('#d9e4ff') },
    uMoonIntensity: { value: 1 },
  }), [leafAlbedoMap, leafMaterialMap, leafNormalMap]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    geometry.instanceCount = Math.round(
      THREE.MathUtils.clamp(settings.surfacePlantAmount, 0, 1) * maxInstances,
    );
  }, [geometry, maxInstances, settings.surfacePlantAmount]);

  useEffect(() => {
    uniforms.uCenter.value.set(settings.surfacePlantCenterX, settings.surfacePlantCenterZ);
    uniforms.uRadius.value = settings.surfacePlantRadius;
    uniforms.uClustering.value = settings.surfacePlantClustering;
    uniforms.uSize.value = settings.surfacePlantSize;
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uWaveAmplitude.value = settings.waveAmplitude;
    uniforms.uWaveChoppiness.value = settings.waveChoppiness;
    uniforms.uColor.value.set(settings.surfacePlantColor);
    uniforms.uSaturation.value = settings.surfacePlantSaturation;
    uniforms.uSubsurfaceStrength.value = settings.surfacePlantTranslucency;
    uniforms.uReflectionStrength.value = settings.surfacePlantReflection;
    uniforms.uEnvironmentExposure.value = lighting.environment.exposure;
    uniforms.uEnvironmentReflection.value = lighting.environment.reflection;
    uniforms.uEnvironmentAmbientColor.value.fromArray(lighting.environment.ambient.linear);
    uniforms.uEnvironmentDiffuse.value = lighting.environment.exposure;
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.color.linear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
  }, [lightDirection, lighting, settings, uniforms]);

  useFrame(({ clock }) => {
    uniforms.uState.value = runtime.currentStateTargetRef.current?.texture ?? null;
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;
    uniforms.uTime.value = clock.elapsedTime;
    const reflectionTexture = reflectionDataRef.current.texture;
    uniforms.uReflectionTexture.value = reflectionTexture;
    uniforms.uReflectionActive.value = reflectionTexture ? 1 : 0;
    uniforms.uReflectionMatrix.value.copy(reflectionDataRef.current.matrix);
  }, -2);

  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) {
      return;
    }

    material.stencilWrite = true;
    material.stencilRef = BOAT_CUTOUT_STENCIL_REF;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    material.stencilFail = THREE.KeepStencilOp;
    material.stencilZFail = THREE.KeepStencilOp;
    material.stencilZPass = THREE.KeepStencilOp;
    material.needsUpdate = true;
  }, [settings.debugView]);

  if (settings.debugView !== 'beauty') {
    return null;
  }

  return (
    <mesh
      name="surface-vegetation"
      geometry={geometry}
      renderOrder={2}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={surfaceVegetationVertexShader}
        fragmentShader={surfaceVegetationFragmentShader}
        uniforms={uniforms}
        transparent={false}
        depthWrite
        depthTest
        side={THREE.DoubleSide}
        toneMapped
        dithering
        alphaToCoverage
      />
    </mesh>
  );
}

export function UnderwaterAlgae({ settings, qualityProfile, lighting }) {
  const maxInstances = qualityProfile?.underwaterAlgaeMaxInstances ?? 240;
  const geometry = useMemo(
    () => createUnderwaterAlgaeGeometry(maxInstances),
    [maxInstances],
  );
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  const uniforms = useMemo(() => ({
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uLength: { value: 1 },
    uSway: { value: 0.5 },
    uPatchiness: { value: 0.5 },
    uSpeciesMix: { value: 0.5 },
    uFlowDirection: { value: new THREE.Vector2(1, 0) },
    uFlowStrength: { value: 0.7 },
    uWaterDepth: { value: 5 },
    uWaterExtent: { value: 24 },
    uReliefStrength: { value: 0.4 },
    uReliefScale: { value: 1.8 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#365d2d') },
    uSaturation: { value: 1 },
    uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMoonColor: { value: new THREE.Color('#d9e4ff') },
    uMoonIntensity: { value: 1 },
    uEnvironmentAmbientColor: { value: new THREE.Color('#30465b') },
    uEnvironmentDiffuse: { value: 1 },
    uWaterScatteringColor: { value: new THREE.Color('#496d72') },
    uWaterTurbidity: { value: 0 },
    uPlantAoStrength: { value: 0.5 },
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    geometry.instanceCount = Math.round(
      THREE.MathUtils.clamp(settings.underwaterAlgaeAmount, 0, 1) * maxInstances,
    );
  }, [geometry, maxInstances, settings.underwaterAlgaeAmount]);

  useEffect(() => {
    uniforms.uCenter.value.set(settings.underwaterAlgaeCenterX, settings.underwaterAlgaeCenterZ);
    uniforms.uRadius.value = settings.underwaterAlgaeRadius;
    uniforms.uLength.value = settings.underwaterAlgaeLength;
    uniforms.uSway.value = settings.underwaterAlgaeSway;
    uniforms.uPatchiness.value = settings.underwaterAlgaePatchiness;
    uniforms.uSpeciesMix.value = settings.underwaterAlgaeSpeciesMix;
    uniforms.uFlowDirection.value.set(
      Math.cos(THREE.MathUtils.degToRad(settings.underwaterAlgaeFlowDirection)),
      Math.sin(THREE.MathUtils.degToRad(settings.underwaterAlgaeFlowDirection)),
    );
    uniforms.uFlowStrength.value = settings.underwaterAlgaeFlowStrength;
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uReliefStrength.value = settings.seabedReliefStrength;
    uniforms.uReliefScale.value = settings.seabedReliefScale;
    uniforms.uColor.value.set(settings.underwaterAlgaeColor);
    uniforms.uSaturation.value = settings.underwaterAlgaeSaturation;
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.color.linear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
    uniforms.uEnvironmentAmbientColor.value.fromArray(lighting.environment.ambient.linear);
    uniforms.uEnvironmentDiffuse.value = lighting.environment.exposure;
    uniforms.uWaterScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uPlantAoStrength.value = settings.plantAoStrength;
  }, [lightDirection, lighting, settings, uniforms]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
  }, -2);

  if (settings.debugView !== 'beauty' || maxInstances <= 0) {
    return null;
  }

  return (
    <mesh
      name="underwater-algae"
      geometry={geometry}
      renderOrder={0}
      frustumCulled={false}
    >
      <shaderMaterial
        vertexShader={underwaterAlgaeVertexShader}
        fragmentShader={underwaterAlgaeFragmentShader}
        uniforms={uniforms}
        transparent={false}
        depthWrite
        depthTest
        side={THREE.DoubleSide}
        toneMapped
        dithering
        alphaToCoverage
      />
    </mesh>
  );
}
