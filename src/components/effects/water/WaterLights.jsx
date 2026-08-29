import React, { useMemo } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SELF_HOSTED_HDRI } from './constants';

// Every light in the scene, plus the environment map. The key light doubles as the
// visible disc, which is why the two are described together rather than apart.

export default function WaterLights({ settings, mode, qualityProfile, lighting }) {
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
        <sprite
          name="celestial-disc"
          position={lightDirection.clone().multiplyScalar(46).toArray()}
          scale={[
            settings.lightDiscSize * (lighting.key.type === 'sun' ? 1.35 : 1),
            settings.lightDiscSize * (lighting.key.type === 'sun' ? 1.35 : 1),
            1,
          ]}
          renderOrder={-5}
        >
          <spriteMaterial
            color={lighting.key.type === 'sun' ? '#fff1c4' : lighting.key.color.hex}
            transparent
            opacity={lighting.key.type === 'sun' ? 0.92 : 0.78}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
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
