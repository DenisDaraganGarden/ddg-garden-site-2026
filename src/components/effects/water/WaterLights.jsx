import React, { useMemo } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SELF_HOSTED_HDRI } from './constants';
import SkyDome from './SkyDome';

// Every light in the scene, plus the sky. The key light and the visible disc are
// the same direction by construction now: the disc is a dot product against the
// light vector inside the sky shader, not a sprite parked at a finite distance
// that missed it by 12.6 degrees.

export default function WaterLights({ settings, mode, qualityProfile, lighting, sky }) {
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  // Legacy drafts often contain very strong unshadowed fill. Cap it so the
  // directional shadow remains readable without adding more editor controls.
  const ambientIntensity = Math.min(Math.sqrt(Math.max(settings.ambientIntensity, 0)) * 0.36, 0.32);
  const hemisphereIntensity = Math.min(Math.sqrt(Math.max(settings.hemisphereIntensity, 0)) * 0.55, 0.68);
  const canRunHighShadowCost = (qualityProfile?.shadowMapSize ?? 0) >= 640;
  const shadowsEnabled = settings.shadowsEnabled !== false
    && settings.debugView === 'beauty'
    && (mode === 'editor' || canRunHighShadowCost);
  const shadowMapSize = qualityProfile?.shadowMapSize ?? (mode === 'editor' ? 1024 : 768);
  const shadowFrustum = THREE.MathUtils.clamp((settings.waterExtent * Math.SQRT1_2) + 1.25, 10, 24);
  const localHdriFile = SELF_HOSTED_HDRI[settings.hdrPreset];
  const environmentSource = localHdriFile
    ? { files: `${import.meta.env.BASE_URL}${localHdriFile}` }
    : { preset: settings.hdrPreset };

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={settings.ambientColor} />
      <hemisphereLight
        intensity={hemisphereIntensity}
        color={settings.hemisphereSkyColor}
        groundColor={settings.hemisphereGroundColor}
      />
      <directionalLight
        position={lightDirection.clone().multiplyScalar(18).toArray()}
        intensity={lighting.key.intensity}
        color={lighting.key.color.hex}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={52}
        shadow-camera-left={-shadowFrustum}
        shadow-camera-right={shadowFrustum}
        shadow-camera-top={shadowFrustum}
        shadow-camera-bottom={-shadowFrustum}
        shadow-bias={-0.0002}
        shadow-normalBias={0.007}
        shadow-radius={settings.shadowRadius}
        shadow-intensity={settings.shadowIntensity}
      />
      {settings.lightDiscEnabled ? (
        <SkyDome
          sky={{
            texture: sky.texture,
            keyDirection: lighting.sky.keyDirection,
            keyRadiance: lighting.sky.discRadiance,
            keyCosRadius: lighting.sky.keyCosRadius,
            keyGlowPower: lighting.sky.keyGlowPower,
            keyGlowStrength: lighting.sky.keyGlowStrength,
            skyLevel: lighting.environment.exposure,
          }}
        />
      ) : null}
      <Environment
        {...environmentSource}
        background={Boolean(settings.showHdriBackground)}
        backgroundIntensity={settings.hdrExposure / 100}
        environmentIntensity={settings.hdrExposure / 100}
        environmentRotation={[0, THREE.MathUtils.degToRad(settings.hdrRotation), 0]}
      />
    </>
  );
}
