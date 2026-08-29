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
  // The key's hue is the sunlight that survived the air; three wants it as a
  // colour plus a scalar, so the contract hands over both halves of the same
  // radiance rather than a hex somebody picked.
  const keyColor = useMemo(
    () => new THREE.Color().fromArray(lighting.key.colorLinear),
    [lighting],
  );
  const lightDirection = useMemo(
    () => new THREE.Vector3().fromArray(lighting.key.direction),
    [lighting],
  );
  const canRunHighShadowCost = (qualityProfile?.shadowMapSize ?? 0) >= 640;
  const shadowsEnabled = settings.shadowsEnabled !== false
    && settings.debugView === 'beauty'
    && (mode === 'editor' || canRunHighShadowCost);
  const shadowMapSize = qualityProfile?.shadowMapSize ?? (mode === 'editor' ? 1024 : 768);
  const shadowFrustum = THREE.MathUtils.clamp((settings.waterExtent * Math.SQRT1_2) + 1.25, 10, 24);
  // HDRI is auxiliary now. 'sky' is the default and costs no download; 'hdri'
  // brings the file back for the cases where a photographed environment is what
  // the shot needs.
  const envMode = settings.envMode ?? 'sky';
  const useHdri = envMode === 'hdri' || envMode === 'sky+hdri';
  const localHdriFile = SELF_HOSTED_HDRI[settings.hdrPreset];
  const environmentSource = localHdriFile
    ? { files: `${import.meta.env.BASE_URL}${localHdriFile}` }
    : { preset: settings.hdrPreset };

  return (
    <>
      <directionalLight
        position={lightDirection.clone().multiplyScalar(18).toArray()}
        intensity={lighting.key.intensity * 3.2}
        color={keyColor}
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
      {useHdri ? (
        <Environment
          {...environmentSource}
          background={Boolean(settings.showHdriBackground)}
          backgroundIntensity={settings.hdriIntensity ?? 1}
          environmentIntensity={settings.hdriIntensity ?? 1}
          environmentRotation={[0, THREE.MathUtils.degToRad(settings.hdrRotation), 0]}
        />
      ) : null}
    </>
  );
}
