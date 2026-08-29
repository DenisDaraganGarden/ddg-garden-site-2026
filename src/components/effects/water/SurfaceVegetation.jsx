import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { reflectionContext } from './reflectionContext';
import {
  surfaceVegetationFragmentShader,
  surfaceVegetationVertexShader,
} from '../shaders/vegetationShaders';
import { createSurfaceVegetationGeometry } from './vegetationGeometry';

// Lily pads riding the surface. They read the same height field the water does,
// so a pad sits on the wave rather than through it.

export function SurfaceVegetation({ settings, runtime, qualityProfile, lighting }) {
  const materialRef = useRef();
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
