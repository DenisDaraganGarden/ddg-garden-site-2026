import { useContext, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCloudScene } from '../sky/painterly/CloudSceneContext.jsx';
import {
  createCloudShadowUniforms,
  updateCloudShadowUniforms,
} from '../sky/painterly/cloudShadowRuntime.js';
import { reflectionContext } from './reflectionContext';
import {
  createCursorFlashlightUniforms,
  syncCursorFlashlightUniforms,
} from '../shaders/cursorFlashlightShader';

// The new sea uses hand-written shaders, so Three cannot attach the scene's
// optics and shadows to it automatically. Keep that bridge in one place and
// make its names match the established WaterSurface contract. This also lets a
// lab omit the hook entirely: its own sky/light uniforms remain sufficient.
export function createWaterSceneBindingUniforms() {
  return {
    uSkyLut: { value: null },
    uSkyLutTexel: { value: new THREE.Vector2(1 / 256, 1 / 128) },
    uWaterSceneSkyActive: { value: 0 },
    uReflectionTexture: { value: null },
    uRefractionTexture: { value: null },
    uRefractionDepthTexture: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uRefractionMatrix: { value: new THREE.Matrix4() },
    uRefractionViewMatrix: { value: new THREE.Matrix4() },
    uRefractionCameraRange: { value: new THREE.Vector2(0.1, 1000) },
    uReflectionActive: { value: 0 },
    uRefractionActive: { value: 0 },
    uRefractionDepthActive: { value: 0 },
    uSeaObjectReflectionStrength: { value: 1 },
    uSeaRefractionDepth: { value: 5 },
    uSeaRefractionTurbidity: { value: 0.3 },
    uSeaRefractionScattering: { value: 0.85 },
    uSeaRefractionScatteringColor: { value: new THREE.Color(0.05, 0.08, 0.09) },
    uSeaRefractionEnvironment: { value: 1 },
    uKeyShadowMap: { value: null },
    uKeyShadowMapFar: { value: null },
    uKeyShadowMatrix: { value: new THREE.Matrix4() },
    uKeyShadowMatrixFar: { value: new THREE.Matrix4() },
    uKeyShadowActive: { value: 0 },
    uKeyShadowFarActive: { value: 0 },
    uKeyShadowBias: { value: 0 },
    uKeyShadowFarBias: { value: 0 },
    uKeyShadowTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uKeyShadowFarTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uKeyShadowRadius: { value: 1 },
    uKeyShadowFarRadius: { value: 1 },
    uKeyShadowSplit: { value: 25 },
    uKeyDirectShare: { value: 0 },
    uShadowIntensity: { value: 1 },
    uWaterShadowStrength: { value: 1 },
    // The established height-field runtime remains the local interaction layer
    // over the sea: cursor impacts, wakes and their normal detail are not
    // discarded when the large-scale surface changes to Gerstner waves.
    uSeaRippleNormalMap: { value: null },
    uSeaRippleStateMap: { value: null },
    uSeaRippleActive: { value: 0 },
    uSeaRippleExtent: { value: 24 },
    uSeaRippleStrength: { value: 1 },
    uSeaRippleAmplitude: { value: 0 },
    ...createCursorFlashlightUniforms(),
    ...createCloudShadowUniforms(),
  };
}

// A ShaderMaterial validates its samplers even behind a false branch on WebKit.
// A real uploaded comparison texture keeps the optional CSM path safe before
// WaterLights has produced its first map.
function useEmptyShadow() {
  const [texture] = useState(() => {
    const next = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    next.compareFunction = THREE.LessEqualCompare;
    next.needsUpdate = true;
    return next;
  });
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function useWaterSceneBindings(uniforms, { lighting, sky, runtime = null, sceneSettings = {}, shadowDataRef = null }) {
  const reflectionDataRef = useContext(reflectionContext);
  const cloudScene = useCloudScene();
  const emptyShadow = useEmptyShadow();

  useEffect(() => {
    uniforms.uKeyShadowBias.value = lighting.shadow.waterBias;
    uniforms.uKeyShadowFarBias.value = lighting.shadow.waterBias;
    uniforms.uKeyShadowRadius.value = lighting.shadow.radius;
    uniforms.uKeyShadowFarRadius.value = lighting.shadow.radius;
    uniforms.uShadowIntensity.value = lighting.shadow.intensity;
    uniforms.uWaterShadowStrength.value = lighting.shadow.waterStrength;
    uniforms.uSeaRippleExtent.value = Math.max(Number(sceneSettings.waterExtent) || 24, 0.001);
    uniforms.uSeaRippleStrength.value = THREE.MathUtils.clamp(
      Number(sceneSettings.normalStrength) || 0,
      0,
      3.2,
    );
    uniforms.uSeaRippleAmplitude.value = THREE.MathUtils.clamp(
      Number(sceneSettings.waveAmplitude) || 0,
      0,
      3,
    );
    uniforms.uSeaObjectReflectionStrength.value = THREE.MathUtils.clamp(
      Number(sceneSettings.boatReflectionIntensity) || 0,
      0,
      2,
    );
    uniforms.uSeaRefractionDepth.value = Math.max(Number(sceneSettings.waterDepthMeters) || 5, 0.25);
    // Once the new sea is enabled, its visible "Water turbidity" is the
    // authoring control for both bed reach and captured-object visibility.
    // Keep the old water turbidity only as a migration fallback; scattering
    // strength/colour remain the established physical-water controls.
    const seaTurbidity = Number(sceneSettings.seaBedTurbidity);
    const legacyTurbidity = Number(sceneSettings.waterTurbidity);
    uniforms.uSeaRefractionTurbidity.value = THREE.MathUtils.clamp(
      Number.isFinite(seaTurbidity) ? seaTurbidity : (Number.isFinite(legacyTurbidity) ? legacyTurbidity : 0),
      0,
      1,
    );
    uniforms.uSeaRefractionScattering.value = THREE.MathUtils.clamp(Number(sceneSettings.waterScatteringStrength) || 0, 0, 2);
    uniforms.uSeaRefractionScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uSeaRefractionEnvironment.value = Math.max(
      0,
      lighting.environment.exposure * lighting.environment.reflection,
    );
  }, [lighting, sceneSettings.boatReflectionIntensity, sceneSettings.normalStrength, sceneSettings.seaBedTurbidity, sceneSettings.waterDepthMeters, sceneSettings.waterExtent, sceneSettings.waterScatteringStrength, sceneSettings.waterTurbidity, sceneSettings.waveAmplitude, uniforms]);

  useFrame(() => {
    syncCursorFlashlightUniforms(uniforms);
    const cloudDescriptor = cloudScene?.current;
    updateCloudShadowUniforms(uniforms, cloudDescriptor);
    const activeSky = cloudDescriptor?.enabled && cloudDescriptor?.skyTexture
      ? cloudDescriptor.skyTexture
      : sky?.texture ?? null;
    uniforms.uSkyLut.value = activeSky;
    uniforms.uWaterSceneSkyActive.value = activeSky ? 1 : 0;
    if (activeSky?.image) {
      uniforms.uSkyLutTexel.value.set(
        cloudDescriptor?.enabled && cloudDescriptor?.skyTexel
          ? cloudDescriptor.skyTexel.x : 1 / activeSky.image.width,
        cloudDescriptor?.enabled && cloudDescriptor?.skyTexel
          ? cloudDescriptor.skyTexel.y : 1 / activeSky.image.height,
      );
    }

    // Asset Studio has no WaterReflections pass, but SceneLight publishes its
    // real directional depth texture here. Prefer it only once the map exists;
    // the product keeps its complete reflection/CSM record.
    const studioShadow = shadowDataRef?.current;
    const data = studioShadow?.keyShadowMap ? { ...reflectionDataRef.current, ...studioShadow } : reflectionDataRef.current;
    const nearShadow = data.keyShadowMap ?? null;
    uniforms.uKeyShadowMap.value = nearShadow ?? emptyShadow;
    uniforms.uKeyShadowActive.value = nearShadow && data.keyShadowMatrix ? 1 : 0;
    if (data.keyShadowMatrix) uniforms.uKeyShadowMatrix.value.copy(data.keyShadowMatrix);
    if (data.keyShadowTexelSize) uniforms.uKeyShadowTexelSize.value.copy(data.keyShadowTexelSize);
    uniforms.uKeyShadowBias.value = data.keyShadowBias ?? lighting.shadow.waterBias;
    uniforms.uKeyShadowRadius.value = data.keyShadowRadius ?? lighting.shadow.radius;

    const far = data.keyShadowCascades?.[1] ?? null;
    uniforms.uKeyShadowMapFar.value = far?.map ?? emptyShadow;
    uniforms.uKeyShadowFarActive.value = far?.map && far?.matrix ? 1 : 0;
    if (far?.matrix) uniforms.uKeyShadowMatrixFar.value.copy(far.matrix);
    if (far?.mapSize) uniforms.uKeyShadowFarTexelSize.value.set(1 / far.mapSize.x, 1 / far.mapSize.y);
    uniforms.uKeyShadowFarBias.value = far?.waterBias ?? uniforms.uKeyShadowBias.value;
    uniforms.uKeyShadowFarRadius.value = far?.radius ?? uniforms.uKeyShadowRadius.value;
    uniforms.uKeyShadowSplit.value = data.keyShadowSplit ?? 25;
    uniforms.uKeyDirectShare.value = data.keyDirectShare ?? 0;

    const rippleNormal = runtime?.normalTargetRef?.current?.texture ?? null;
    const rippleState = runtime?.currentStateTargetRef?.current?.texture ?? null;
    uniforms.uSeaRippleNormalMap.value = rippleNormal;
    uniforms.uSeaRippleStateMap.value = rippleState;
    uniforms.uSeaRippleActive.value = rippleNormal && rippleState ? 1 : 0;

    uniforms.uReflectionTexture.value = data.texture ?? null;
    uniforms.uReflectionActive.value = data.texture ? 1 : 0;
    if (data.matrix) uniforms.uReflectionMatrix.value.copy(data.matrix);
    uniforms.uRefractionTexture.value = data.refractionTexture ?? null;
    uniforms.uRefractionDepthTexture.value = data.refractionDepthTexture ?? null;
    uniforms.uRefractionActive.value = data.refractionTexture ? 1 : 0;
    uniforms.uRefractionDepthActive.value = data.refractionDepthTexture ? 1 : 0;
    if (data.refractionMatrix) uniforms.uRefractionMatrix.value.copy(data.refractionMatrix);
    if (data.refractionViewMatrix) uniforms.uRefractionViewMatrix.value.copy(data.refractionViewMatrix);
    if (data.refractionCameraRange) uniforms.uRefractionCameraRange.value.copy(data.refractionCameraRange);
  }, -2);
}
