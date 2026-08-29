import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOAT_CUTOUT_STENCIL_REF, DEBUG_VIEW_IDS } from './constants';
import { reflectionContext } from './reflectionContext';
import { waterV2FragmentShader, waterV2VertexShader } from '../shaders/waterV2Shaders';

// The water surface itself: displaced by the simulation height field, shaded with
// the reflection and refraction textures, and the mesh that writes the stencil the
// boat's dry cockpit is cut from.

export default function WaterSurfaceV2({ settings, runtime, qualityProfile, lighting, sky }) {
  const materialRef = useRef();
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
  const uniforms = useMemo(() => ({
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
    uWaterTint: { value: new THREE.Color(settings.envTint) },
    uMoonDirection: { value: lightDirection.clone() },
    uMoonColor: { value: new THREE.Color().fromArray(lighting.key.color.linear) },
    uMoonIntensity: { value: lighting.key.intensity },
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
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: 1 },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 0.35 },
  }), [
    debugView,
    lightDirection,
    lighting,
    settings.boatReflectionIntensity,
    settings.envTint,
    settings.moonSpecularPower,
    settings.moonSpecularStrength,
    settings.waterDepthMeters,
    settings.waterGlintDensity,
    settings.waterGlintSharpness,
    settings.waterGlintStrength,
    settings.waterScatteringStrength,
    settings.waterTurbidity,
    settings.waveAmplitude,
    settings.waveChoppiness,
  ]);

  useEffect(() => {
    uniforms.uWaveAmplitude.value = settings.waveAmplitude;
    uniforms.uWaveChoppiness.value = settings.waveChoppiness;
    uniforms.uWaterTint.value.set(settings.envTint);
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.color.linear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
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
  }, [
    lightDirection,
    lighting,
    settings.boatReflectionIntensity,
    settings.debugView,
    settings.envTint,
    settings.moonSpecularPower,
    settings.moonSpecularStrength,
    settings.waterDepthMeters,
    settings.waterGlintDensity,
    settings.waterGlintSharpness,
    settings.waterGlintStrength,
    settings.waterScatteringStrength,
    settings.waterTurbidity,
    settings.waveAmplitude,
    settings.waveChoppiness,
    uniforms,
  ]);

  useFrame(({ clock }) => {
    uniforms.uSkyLut.value = sky?.texture ?? null;
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
    <mesh name="water-surface" rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, meshDensity, meshDensity]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={waterV2VertexShader}
        fragmentShader={waterV2FragmentShader}
        uniforms={uniforms}
        transparent={false}
        depthWrite
        depthTest
        side={THREE.DoubleSide}
        toneMapped
        dithering
      />
    </mesh>
  );
}
