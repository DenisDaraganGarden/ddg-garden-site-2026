import { createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import { DEBUG_VIEW_IDS } from './constants';
import { configureMaps } from './pbrMaterial';
import { seabedFragmentShader, seabedVertexShader } from '../shaders/waterRuntimeShaders';

// The lake bed: relief, texture and the caustics the water casts onto it.

export default function Seabed({ settings, runtime, qualityProfile, lighting }) {
  const materialRef = useRef();
  const { gl } = useThree();
  const texture = useLoader(THREE.TextureLoader, '/textures/seabed/seabed_texture.webp');

  useLayoutEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      configureMaps(gl, { color: [texture] });
    }
  }, [gl, texture]);

  const uniforms = useMemo(() => ({
    ...createCoastUniforms(),
    uWaterExtent: { value: 34 },
    uNormalMap: { value: null },
    uStateResolution: { value: new THREE.Vector2(1, 1) },
    uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMoonColor: { value: new THREE.Color('#ffffff') },
    uMoonIntensity: { value: 1 },
    uEnvironmentAmbientColor: { value: new THREE.Color('#000000') },
    uEnvironmentDiffuse: { value: 1 },
    uWaterScatteringColor: { value: new THREE.Color('#000000') },
    uWaterScatteringStrength: { value: 0 },
    uTime: { value: 0 },
    uWaterDepth: { value: 1 },
    uCausticsIntensity: { value: 0 },
    uCausticsScale: { value: 1 },
    uCausticsSharpness: { value: 1 },
    uReliefStrength: { value: 0 },
    uReliefScale: { value: 1 },
    uSeabedTexture: { value: null },
    uSeabedTextureScale: { value: 1 },
    uSeabedSaturation: { value: 1 },
    uSeabedBrightness: { value: 1 },
    uSeabedVariation: { value: 0 },
    uSeabedAoStrength: { value: 0 },
    uWaterTurbidity: { value: 0 },
    uWaterEngine: { value: 1 },
    uDebugView: { value: 0 },
  }), []);

  useEffect(() => {
    syncCoastUniforms(uniforms, settings);
    uniforms.uWaterExtent.value = settings.waterExtent;
    uniforms.uMoonDirection.value.fromArray(lighting.key.direction);
    uniforms.uMoonColor.value.fromArray(lighting.key.colorLinear);
    uniforms.uMoonIntensity.value = lighting.key.intensity;
    uniforms.uEnvironmentAmbientColor.value.fromArray(lighting.fill.colorLinear);
    uniforms.uEnvironmentDiffuse.value = lighting.fill.intensity;
    uniforms.uWaterScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uWaterScatteringStrength.value = settings.waterScatteringStrength;
    uniforms.uWaterDepth.value = settings.waterDepthMeters;
    uniforms.uCausticsIntensity.value = settings.causticsIntensity;
    uniforms.uCausticsScale.value = settings.causticsScale;
    uniforms.uCausticsSharpness.value = settings.causticsSharpness;
    uniforms.uReliefStrength.value = settings.seabedReliefStrength;
    uniforms.uReliefScale.value = settings.seabedReliefScale;
    uniforms.uSeabedTexture.value = texture;
    uniforms.uSeabedTextureScale.value = settings.seabedTextureScale;
    uniforms.uSeabedSaturation.value = settings.seabedSaturation;
    uniforms.uSeabedBrightness.value = settings.seabedBrightness;
    uniforms.uSeabedVariation.value = settings.seabedVariation;
    uniforms.uSeabedAoStrength.value = settings.seabedAoStrength;
    uniforms.uWaterTurbidity.value = settings.waterTurbidity;
    uniforms.uWaterEngine.value = 1;
    uniforms.uDebugView.value = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  }, [
    lighting,
    settings,
    settings.causticsIntensity,
    settings.causticsScale,
    settings.causticsSharpness,
    settings.debugView,
    settings.seabedBrightness,
    settings.seabedAoStrength,
    settings.seabedReliefScale,
    settings.seabedReliefStrength,
    settings.seabedSaturation,
    settings.seabedTextureScale,
    settings.seabedVariation,
    settings.waterDepthMeters,
    settings.waterScatteringStrength,
    settings.waterTurbidity,
    texture,
    uniforms,
  ]);

  useFrame((state) => {
    uniforms.uNormalMap.value = runtime.normalTargetRef.current?.texture ?? null;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uStateResolution.value.set(
      runtime.currentStateTargetRef.current?.width ?? settings.simulationResolution,
      runtime.currentStateTargetRef.current?.height ?? settings.simulationResolution,
    );
  }, -2);

  return (
    <mesh
      name="seabed"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -settings.waterDepthMeters, 0]}
      receiveShadow
      renderOrder={0}
    >
      <planeGeometry args={[
        settings.waterExtent,
        settings.waterExtent,
        qualityProfile?.seabedMeshDensity ?? 144,
        qualityProfile?.seabedMeshDensity ?? 144,
      ]} />
      <CustomShaderMaterial
        ref={materialRef}
        baseMaterial={THREE.MeshStandardMaterial}
        color="#11161d"
        roughness={0.9}
        metalness={0.02}
        envMapIntensity={lighting.environment.reflection}
        vertexShader={seabedVertexShader}
        fragmentShader={seabedFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
