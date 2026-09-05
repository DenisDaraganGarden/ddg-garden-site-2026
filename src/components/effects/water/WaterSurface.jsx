import { createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { sceneDepthVertex, sceneDepthFragment } from '../shaders/sceneDepth';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildFarWaterFieldData } from './farWaterGeometry';
import { BOAT_CUTOUT_STENCIL_REF, DEBUG_VIEW_IDS } from './constants';
import { reflectionContext } from './reflectionContext';
import { waterV2FragmentShader, waterV2VertexShader } from '../shaders/waterV2Shaders';
import {
  createCursorFlashlightUniforms,
  syncCursorFlashlightUniforms,
} from '../shaders/cursorFlashlightShader';

// The water surface itself: displaced by the simulation height field, shaded with
// the reflection and refraction textures, and the mesh that writes the stencil the
// boat's dry cockpit is cut from.

export default function WaterSurfaceV2({ settings, runtime, qualityProfile, lighting, sky, geometryOverride, shoreMode = false }) {
  const surfaceEdgeBlendUv = useMemo(
    () => buildFarWaterFieldData(settings.waterExtent).surfaceEdgeBlendUv,
    [settings.waterExtent],
  );
  // The authored hand-over to the far field, in UV of the pond.
  const surfaceOpticalBlendUv = Math.min(
    settings.farWaterBlendWidth / Math.max(settings.waterExtent, 1),
    0.45,
  );
  const materialRef = useRef();
  // WebKit validates every active sampler even when uKeyShadowActive is zero.
  // A null sampler2DShadow can bind three's unallocated placeholder before the
  // first shadow pass, so provide an explicitly uploaded comparison texture.
  const [emptyShadow]=useState(()=>{const texture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);texture.compareFunction=THREE.LessEqualCompare;texture.needsUpdate=true;return texture;});
  useEffect(()=>()=>emptyShadow.dispose(),[emptyShadow]);
  const reflectionDataRef = React.useContext(reflectionContext);
  const debugView = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  const meshDensity = Math.min(
    settings.waterMeshDensity,
    qualityProfile?.waterMeshDensityCap ?? settings.waterMeshDensity,
  );
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  // Three retains the compiled uniform map. Keep its identity across slider edits.
  const [uniforms] = useState(() => ({
    ...createCoastUniforms(),
    uState: { value: null },
    uNormalMap: { value: null },
    uReflectionTexture: { value: null },
    uRefractionTexture: { value: null },
    uRefractionDepthTexture: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uReflectionActive: { value: 0 },
    uRefractionActive: { value: 0 },
    uRefractionDepthActive: { value: 0 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uWaveAmplitude: { value: settings.waveAmplitude },
    uWaveChoppiness: { value: settings.waveChoppiness },
    uSurfaceEdgeBlendUv: { value: surfaceEdgeBlendUv },
    uSurfaceOpticalBlendUv: { value: surfaceOpticalBlendUv },
    uWaterExtent: { value: settings.waterExtent },
    uShoreMode: { value: shoreMode ? 1 : 0 },
    uWaterTint: { value: new THREE.Color(settings.envTint) },
    uDistantSurfaceColor: { value: new THREE.Color(settings.distantSurfaceColor) },
    uMoonDirection: { value: lightDirection.clone() },
    uMoonColor: { value: new THREE.Color().fromArray(lighting.key.colorLinear) },
    uMoonIntensity: { value: lighting.key.intensity },
    uFoamKeyRadiance: { value: new THREE.Vector3().fromArray(lighting.key.sceneRadiance) },
    uFoamFillRadiance: { value: new THREE.Vector3().fromArray(lighting.fill.irradiance) },
    uMoonSpecularStrength: { value: settings.moonSpecularStrength },
    uMoonSpecularPower: { value: settings.moonSpecularPower },
    uReflectionIntensity: { value: settings.boatReflectionIntensity },
    uEnvironmentExposure: { value: lighting.environment.exposure },
    uEnvironmentReflection: { value: lighting.environment.reflection },
    uEnvironmentHorizonColor: {
      value: new THREE.Color().fromArray(lighting.environment.horizon.linear),
    },
    uEnvironmentZenithColor: {
      value: new THREE.Color().fromArray(lighting.environment.zenith.linear),
    },
    uEnvironmentRotation: { value: lighting.environment.rotationRadians },
    uWaterDepth: { value: settings.waterDepthMeters },
    uWaterTurbidity: { value: settings.waterTurbidity },
    uWaterScatteringColor: {
      value: new THREE.Color().fromArray(lighting.water.scatteringColor),
    },
    uWaterScatteringStrength: { value: settings.waterScatteringStrength },
    uWaterGlintStrength: { value: settings.waterGlintStrength },
    uWaterGlintDensity: { value: settings.waterGlintDensity },
    uWaterGlintSharpness: { value: settings.waterGlintSharpness },
    uTime: { value: 0 },
    uDebugView: { value: debugView },
    // The shared sky. Same table the dome samples, so the water cannot reflect
    // a different sky than the one above it.
    uSkyLut: { value: null },
    uSkyLutTexel: { value: new THREE.Vector2(1 / 256, 1 / 128) },
    uKeyShadowMap: { value: emptyShadow },
    uKeyShadowMatrix: { value: new THREE.Matrix4() },
    uKeyShadowActive: { value: 0 },
    uKeyShadowBias: { value: lighting.shadow.waterBias },
    uKeyShadowTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uKeyShadowRadius: { value: lighting.shadow.radius },
    uKeyDirectShare: { value: 0 },
    uShadowIntensity: { value: lighting.shadow.intensity },
    uWaterShadowStrength: { value: lighting.shadow.waterStrength },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: 1 },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 0.35 },
    ...createCursorFlashlightUniforms(),
  }));

  useEffect(() => {
    uniforms.uWaveAmplitude.value = settings.waveAmplitude;
    uniforms.uWaveChoppiness.value = settings.waveChoppiness;
    uniforms.uSurfaceEdgeBlendUv.value = surfaceEdgeBlendUv;
    uniforms.uSurfaceOpticalBlendUv.value = surfaceOpticalBlendUv;
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uShoreMode.value = shoreMode ? 1 : 0;
    uniforms.uWaterTint.value.set(settings.envTint);
    uniforms.uDistantSurfaceColor.value.set(settings.distantSurfaceColor);
    syncCoastUniforms(uniforms, settings);
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.colorLinear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
    uniforms.uFoamKeyRadiance.value.fromArray(lighting.key.sceneRadiance);
    uniforms.uFoamFillRadiance.value.fromArray(lighting.fill.irradiance);
    uniforms.uMoonSpecularStrength.value = settings.moonSpecularStrength;
    uniforms.uMoonSpecularPower.value = settings.moonSpecularPower;
    uniforms.uReflectionIntensity.value = settings.boatReflectionIntensity;
    uniforms.uEnvironmentExposure.value = lighting.environment.exposure;
    uniforms.uEnvironmentReflection.value = lighting.environment.reflection;
    uniforms.uEnvironmentHorizonColor.value.fromArray(lighting.environment.horizon.linear);
    uniforms.uEnvironmentZenithColor.value.fromArray(lighting.environment.zenith.linear);
    uniforms.uEnvironmentRotation.value = lighting.environment.rotationRadians;
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uWaterScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uWaterScatteringStrength.value = settings.waterScatteringStrength;
    uniforms.uWaterGlintStrength.value = settings.waterGlintStrength;
    uniforms.uWaterGlintDensity.value = settings.waterGlintDensity;
    uniforms.uWaterGlintSharpness.value = settings.waterGlintSharpness;
    uniforms.uDebugView.value = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
    uniforms.uKeyDirection.value.fromArray(lighting.sky.keyDirection);
    uniforms.uKeyRadiance.value.fromArray(lighting.sky.discRadiance);
    uniforms.uKeyCosRadius.value = lighting.sky.keyCosRadius;
    uniforms.uKeyGlowPower.value = lighting.sky.keyGlowPower;
    uniforms.uKeyGlowStrength.value = lighting.sky.keyGlowStrength;
    uniforms.uKeyShadowBias.value = lighting.shadow.waterBias;
    uniforms.uKeyShadowRadius.value = lighting.shadow.radius;
    uniforms.uShadowIntensity.value = lighting.shadow.intensity;
    uniforms.uWaterShadowStrength.value = lighting.shadow.waterStrength;
  }, [
    lightDirection,
    lighting,
    settings,
    shoreMode,
    surfaceEdgeBlendUv,
    surfaceOpticalBlendUv,
    uniforms,
  ]);

  useFrame(({ clock }) => {
    syncCursorFlashlightUniforms(uniforms);
    uniforms.uSkyLut.value = sky?.texture ?? null;
    // The bicubic tap pattern needs the table's own size; read it off the
    // texture so nothing has to thread the resolution through props.
    if (sky?.texture?.image) {
      uniforms.uSkyLutTexel.value.set(
        1 / sky?.texture.image.width,
        1 / sky?.texture.image.height,
      );
    }
    // Read every frame: the shadow map does not exist until the first shadow
    // render, and three recreates it whenever the map size changes.
    const shadowMap = reflectionDataRef.current.keyShadowMap ?? null;
    const shadowMatrix = reflectionDataRef.current.keyShadowMatrix ?? null;
    uniforms.uKeyShadowMap.value = shadowMap ?? emptyShadow;
    uniforms.uKeyShadowActive.value = shadowMap && shadowMatrix ? 1 : 0;
    if (shadowMatrix) {
      uniforms.uKeyShadowMatrix.value.copy(shadowMatrix);
    }
    if (reflectionDataRef.current.keyShadowTexelSize) {
      uniforms.uKeyShadowTexelSize.value.copy(
        reflectionDataRef.current.keyShadowTexelSize,
      );
    }
    uniforms.uKeyDirectShare.value = reflectionDataRef.current.keyDirectShare ?? 0;
    uniforms.uState.value = runtime.currentStateTargetRef.current?.texture ?? null;
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;

    const reflectionTexture = reflectionDataRef.current.texture;
    const refractionTexture = reflectionDataRef.current.refractionTexture;
    const refractionDepthTexture = reflectionDataRef.current.refractionDepthTexture;
    uniforms.uReflectionTexture.value = reflectionTexture;
    uniforms.uRefractionTexture.value = refractionTexture;
    uniforms.uRefractionDepthTexture.value = refractionDepthTexture;
    uniforms.uReflectionActive.value = reflectionTexture ? 1 : 0;
    uniforms.uRefractionActive.value = refractionTexture ? 1 : 0;
    uniforms.uRefractionDepthActive.value = refractionDepthTexture ? 1 : 0;
    uniforms.uCameraNear.value = reflectionDataRef.current.cameraNear;
    uniforms.uCameraFar.value = reflectionDataRef.current.cameraFar;
    uniforms.uReflectionMatrix.value.copy(reflectionDataRef.current.matrix);
    uniforms.uTime.value = clock.elapsedTime;
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

  return (
    // The two seabed modes are about the seabed, and the water plate is an
    // opaque same-extent plane drawn over it: from every above-water pose it
    // covers the thing the mode exists to show. Height and normals still need
    // the surface, so the cut is at 3, not at 4.
    <mesh
      name={shoreMode ? "shore-water-surface" : "water-surface"}
      geometry={geometryOverride}
      rotation={shoreMode ? undefined : [-Math.PI / 2, 0, 0]}
      renderOrder={1}
      frustumCulled={shoreMode}
      visible={debugView < 3}
    >
      {!geometryOverride ? <planeGeometry args={[settings.waterExtent, settings.waterExtent, meshDensity, meshDensity]} /> : null}
      <shaderMaterial
        ref={materialRef}
        vertexShader={sceneDepthVertex(waterV2VertexShader)}
        fragmentShader={sceneDepthFragment(waterV2FragmentShader)}
        uniforms={uniforms}
        transparent={false}
        depthWrite
        depthTest
        side={THREE.DoubleSide}
        toneMapped={debugView === 0}
        dithering
      />
    </mesh>
  );
}
