import { createCoastUniforms,syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { sceneDepthVertex, sceneDepthFragment } from '../shaders/sceneDepth';
import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  underwaterAlgaeFragmentShader,
  underwaterAlgaeVertexShader,
} from '../shaders/vegetationShaders';
import {
  createCursorFlashlightUniforms,
  syncCursorFlashlightUniforms,
} from '../shaders/cursorFlashlightShader';
import { createUnderwaterAlgaeGeometry } from './vegetationGeometry';

// Algae standing on the bed and swaying with the flow. Below the surface, so it
// has no stencil business with the boat.

export function UnderwaterAlgae({ settings, qualityProfile, lighting }) {
  const maxInstances = qualityProfile?.underwaterAlgaeMaxInstances ?? 240;
  // Density multiplies the tier's count; the tier also says how far it may go.
  const densityCap = qualityProfile?.underwaterAlgaeDensityCap ?? 1;
  const capacity = Math.round(maxInstances * densityCap);
  const geometry = useMemo(
    () => createUnderwaterAlgaeGeometry(capacity),
    [capacity],
  );
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  const uniforms = useMemo(() => ({
    ...createCoastUniforms(),
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uLength: { value: 1 },
    uSway: { value: 0.5 },
    uPatchiness: { value: 0.5 },
    uSpeciesMix: { value: 0.5 },
    uFlowDirection: { value: new THREE.Vector2(1, 0) },
    uFlowStrength: { value: 0.7 },
    uWidthScale: { value: 1 },
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
    ...createCursorFlashlightUniforms(),
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const density = THREE.MathUtils.clamp(settings.underwaterAlgaeDensity ?? 1, 1, densityCap);
    geometry.instanceCount = Math.min(capacity, Math.round(
      THREE.MathUtils.clamp(settings.underwaterAlgaeAmount, 0, 1) * maxInstances * density,
    ));
  }, [capacity, densityCap, geometry, maxInstances, settings.underwaterAlgaeAmount, settings.underwaterAlgaeDensity]);

  useEffect(() => {
    syncCoastUniforms(uniforms,settings);
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
    uniforms.uWidthScale.value = settings.underwaterAlgaeWidth ?? 1;
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uReliefStrength.value = settings.seabedReliefStrength;
    uniforms.uReliefScale.value = settings.seabedReliefScale;
    uniforms.uColor.value.set(settings.underwaterAlgaeColor);
    uniforms.uSaturation.value = settings.underwaterAlgaeSaturation;
    uniforms.uMoonDirection.value.copy(lightDirection);
    uniforms.uMoonColor.value.fromArray(lighting.key.colorLinear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
    uniforms.uEnvironmentAmbientColor.value.fromArray(lighting.fill.colorLinear);
    uniforms.uEnvironmentDiffuse.value = lighting.fill.intensity;
    uniforms.uWaterScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uPlantAoStrength.value = settings.plantAoStrength;
  }, [lightDirection, lighting, settings, uniforms]);

  useFrame(({ clock }) => {
    syncCursorFlashlightUniforms(uniforms);
    uniforms.uTime.value = clock.elapsedTime;
  }, -2);

  if (capacity <= 0) {
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
        vertexShader={sceneDepthVertex(underwaterAlgaeVertexShader)}
        fragmentShader={sceneDepthFragment(underwaterAlgaeFragmentShader)}
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
