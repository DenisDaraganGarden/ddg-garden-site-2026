import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { reflectionContext } from './reflectionContext';
import {
  surfaceVegetationFragmentShader,
  surfaceVegetationVertexShader,
} from '../shaders/vegetationShaders';
import {
  createCursorFlashlightUniforms,
  syncCursorFlashlightUniforms,
} from '../shaders/cursorFlashlightShader';
import { createSurfaceVegetationGeometry } from './vegetationGeometry';
import {
  createSurfacePlantContactMap,
  updateSurfaceVegetationAnchors,
} from './surfaceVegetationAnchors';

// Lily pads riding the surface. They read the same height field the water does,
// so a pad sits on the wave rather than through it.

export function SurfaceVegetation({ settings, runtime, qualityProfile, lighting }) {
  const materialRef = useRef();
  const stemMeshRef = useRef();
  const contactMeshRef = useRef();
  const reflectionDataRef = React.useContext(reflectionContext);
  const maxInstances = qualityProfile?.surfacePlantMaxInstances ?? 560;
  const leafTextures = useLoader(THREE.TextureLoader, [
    '/textures/lily/lily_atlas_albedo.webp',
    '/textures/lily/lily_atlas_normal.webp',
    '/textures/lily/lily_atlas_material.webp',
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
  const anchorSettings = useMemo(() => ({
    surfacePlantAmount: settings.surfacePlantAmount,
    surfacePlantCenterX: settings.surfacePlantCenterX,
    surfacePlantCenterZ: settings.surfacePlantCenterZ,
    surfacePlantClustering: settings.surfacePlantClustering,
    surfacePlantFloatOffset: settings.surfacePlantFloatOffset,
    surfacePlantRadius: settings.surfacePlantRadius,
    surfacePlantSize: settings.surfacePlantSize,
    seabedReliefScale: settings.seabedReliefScale,
    seabedReliefStrength: settings.seabedReliefStrength,
    waterDepthMeters: settings.waterDepthMeters,
    waterExtent: settings.waterExtent,
    waveAmplitude: settings.waveAmplitude,
  }), [
    settings.surfacePlantAmount,
    settings.surfacePlantCenterX,
    settings.surfacePlantCenterZ,
    settings.surfacePlantClustering,
    settings.surfacePlantFloatOffset,
    settings.surfacePlantRadius,
    settings.surfacePlantSize,
    settings.seabedReliefScale,
    settings.seabedReliefStrength,
    settings.waterDepthMeters,
    settings.waterExtent,
    settings.waveAmplitude,
  ]);
  const stemGeometry = useMemo(
    () => new THREE.CylinderGeometry(1, 0.72, 1, 5, 1, true),
    [],
  );
  const contactGeometry = useMemo(
    () => new THREE.CircleGeometry(1, 20),
    [],
  );
  const contactMap = useMemo(() => createSurfacePlantContactMap(), []);
  const stemMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#1a2b1a',
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
  }), []);
  const contactMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    alphaMap: contactMap,
    color: '#07100b',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  }), [contactMap]);
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
    uFloatOffset: { value: 0.022 },
    uStiffness: { value: 0.3 },
    // Raised by the refraction pass so the capture holds only what is
    // actually under the water. See WaterReflections.
    uSubmergedOnly: { value: 0 },
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
    ...createCursorFlashlightUniforms(),
  }), [leafAlbedoMap, leafMaterialMap, leafNormalMap]);

  useEffect(() => () => {
    geometry.dispose();
    stemGeometry.dispose();
    contactGeometry.dispose();
    stemMaterial.dispose();
    contactMaterial.dispose();
    contactMap.dispose();
  }, [contactGeometry, contactMap, contactMaterial, geometry, stemGeometry, stemMaterial]);

  useLayoutEffect(() => {
    const count = Math.round(
      THREE.MathUtils.clamp(anchorSettings.surfacePlantAmount, 0, 1) * maxInstances,
    );
    geometry.instanceCount = count;
    updateSurfaceVegetationAnchors({
      geometry,
      stemMesh: stemMeshRef.current,
      contactMesh: contactMeshRef.current,
      maxInstances,
      settings: anchorSettings,
    });
  }, [anchorSettings, geometry, maxInstances]);

  useEffect(() => {
    uniforms.uCenter.value.set(settings.surfacePlantCenterX, settings.surfacePlantCenterZ);
    uniforms.uRadius.value = settings.surfacePlantRadius;
    uniforms.uClustering.value = settings.surfacePlantClustering;
    uniforms.uSize.value = settings.surfacePlantSize;
    uniforms.uFloatOffset.value = settings.surfacePlantFloatOffset;
    uniforms.uStiffness.value = settings.surfacePlantStiffness;
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uWaveAmplitude.value = settings.waveAmplitude;
    uniforms.uWaveChoppiness.value = settings.waveChoppiness;
    uniforms.uColor.value.set(settings.surfacePlantColor);
    uniforms.uSaturation.value = settings.surfacePlantSaturation;
    uniforms.uSubsurfaceStrength.value = settings.surfacePlantTranslucency;
    uniforms.uReflectionStrength.value = settings.surfacePlantReflection;
    uniforms.uEnvironmentExposure.value = lighting.environment.exposure;
    uniforms.uEnvironmentReflection.value = lighting.environment.reflection;
    uniforms.uEnvironmentAmbientColor.value.fromArray(lighting.fill.colorLinear);
    uniforms.uEnvironmentDiffuse.value = lighting.fill.intensity;
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.colorLinear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
  }, [lightDirection, lighting, settings, uniforms]);

  useFrame(({ clock }) => {
    syncCursorFlashlightUniforms(uniforms);
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

    [material, stemMaterial, contactMaterial].forEach((activeMaterial) => {
      activeMaterial.stencilWrite = true;
      activeMaterial.stencilRef = BOAT_CUTOUT_STENCIL_REF;
      activeMaterial.stencilFunc = THREE.NotEqualStencilFunc;
      activeMaterial.stencilFail = THREE.KeepStencilOp;
      activeMaterial.stencilZFail = THREE.KeepStencilOp;
      activeMaterial.stencilZPass = THREE.KeepStencilOp;
      activeMaterial.needsUpdate = true;
    });
  }, [contactMaterial, settings.debugView, stemMaterial]);

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
      <instancedMesh
        ref={stemMeshRef}
        name="surface-vegetation-stems"
        args={[stemGeometry, stemMaterial, maxInstances]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh
        ref={contactMeshRef}
        name="surface-vegetation-contacts"
        args={[contactGeometry, contactMaterial, maxInstances]}
        frustumCulled={false}
        renderOrder={1}
      />
    </mesh>
  );
}
