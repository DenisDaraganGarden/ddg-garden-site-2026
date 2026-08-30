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
  const debugView = DEBUG_VIEW_IDS[settings.debugView] ?? 0;
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
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
    uNormalMap: { value: null },
    uStateResolution: { value: new THREE.Vector2(settings.simulationResolution, settings.simulationResolution) },
    uMoonDirection: { value: lightDirection.clone() },
    uMoonColor: { value: new THREE.Color().fromArray(lighting.key.colorLinear) },
    uMoonIntensity: { value: lighting.key.intensity },
    uEnvironmentAmbientColor: {
      value: new THREE.Color().fromArray(lighting.fill.colorLinear),
    },
    uEnvironmentDiffuse: { value: lighting.fill.intensity },
    uWaterScatteringColor: {
      value: new THREE.Color().fromArray(lighting.water.scatteringColor),
    },
    uWaterScatteringStrength: { value: settings.waterScatteringStrength },
    uTime: { value: 0 },
    uWaterDepth: { value: settings.waterDepthMeters },
    uCausticsIntensity: { value: settings.causticsIntensity },
    uCausticsScale: { value: settings.causticsScale },
    uCausticsSharpness: { value: settings.causticsSharpness },
    uReliefStrength: { value: settings.seabedReliefStrength },
    uReliefScale: { value: settings.seabedReliefScale },
    uSeabedTexture: { value: null },
    uSeabedTextureScale: { value: settings.seabedTextureScale },
    uSeabedSaturation: { value: settings.seabedSaturation },
    uSeabedBrightness: { value: settings.seabedBrightness },
    uSeabedVariation: { value: settings.seabedVariation },
    uSeabedAoStrength: { value: settings.seabedAoStrength },
    uWaterTurbidity: { value: settings.waterTurbidity },
    uWaterEngine: { value: 1 },
    uDebugView: { value: debugView },
  }), [
    debugView,
    lightDirection,
    lighting,
    settings.causticsIntensity,
    settings.causticsScale,
    settings.causticsSharpness,
    settings.seabedReliefScale,
    settings.seabedReliefStrength,
    settings.seabedSaturation,
    settings.seabedBrightness,
    settings.seabedAoStrength,
    settings.seabedTextureScale,
    settings.seabedVariation,
    settings.simulationResolution,
    settings.waterDepthMeters,
    settings.waterScatteringStrength,
    settings.waterTurbidity,
  ]);

  useEffect(() => {
    uniforms.uMoonDirection.value.copy(lightDirection);
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
    debugView,
    lightDirection,
    lighting,
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
        // A debug view is a measurement. ACES is a picture-making curve: it
        // compresses the top of every ramp, so 1.0 arrives as 226 rather than
        // 255 and the mode has no white reference. Post is already bypassed for
        // the debug views; this is the last curve between the data and the eye.
        toneMapped={debugView === 0}
      />
    </mesh>
  );
}
