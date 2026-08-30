import React, { useContext, useMemo, useRef } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SELF_HOSTED_HDRI } from './constants';
import { useFrame } from '@react-three/fiber';
import { reflectionContext } from './reflectionContext';
import SkyDome from './SkyDome';

// Every light in the scene, plus the sky. The key light and the visible disc are
// the same direction by construction now: the disc is a dot product against the
// light vector inside the sky shader, not a sprite parked at a finite distance
// that missed it by 12.6 degrees.

export default function WaterLights({ settings, mode, qualityProfile, lighting, sky, layout }) {
  const reflectionDataRef = useContext(reflectionContext);
  const keyLightRef = useRef();
  const layoutBoat = layout?.boatPosition ?? settings.boatPosition ?? { x: 0, z: 0 };
  const layoutSculpture = layout?.sculpturePosition ?? settings.sculpturePosition ?? { x: 0, z: 0 };
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
  // The 640-texel gate is gone. It silently switched shadows off on every phone
  // while the editor bypassed it, so the scene was authored in a view the
  // visitor never got. What made it affordable is the frustum refit below.
  const shadowsEnabled = settings.shadowsEnabled !== false && settings.debugView === 'beauty';
  const shadowMapSize = qualityProfile?.shadowMapSize ?? (mode === 'editor' ? 1024 : 768);
  // Fit the box to what actually casts, not to the pond. The old box was ~4x
  // larger than the casters, so most of the map resolved empty water: 47 mm per
  // texel at 1024. Fitted, it is ~13 mm - sharper on a 512 phone map than the
  // desktop used to be.
  const casterRadius = Math.max(
    Math.hypot(layoutBoat.x, layoutBoat.z),
    Math.hypot(layoutSculpture.x, layoutSculpture.z),
  ) + 3;
  const shadowFrustum = THREE.MathUtils.clamp(casterRadius, 4, 16);
  const standoff = shadowFrustum + 6;
  // HDRI is auxiliary now. 'sky' is the default and costs no download; 'hdri'
  // brings the file back for the cases where a photographed environment is what
  // the shot needs.
  // Cloud softens and fades the shadow together, because that is one physical
  // fact: an overcast sky is a bigger, dimmer source. Two sliders for it would be
  // two answers to the same question.
  const cloudCover = THREE.MathUtils.clamp(settings.cloudCover ?? 0, 0, 1);
  const shadowRadius = THREE.MathUtils.clamp(
    settings.shadowRadius * (1 + cloudCover * 2.4),
    0.5,
    4,
  );
  const shadowIntensity = settings.shadowIntensity * (1 - 0.75 * cloudCover);

  // The water is a hand-written ShaderMaterial, so three will never hand it a
  // shadow. Publishing the two handles the sampler needs on the ref the water
  // already reads each frame is the whole plumbing - no second shadow map, no
  // lights:true recompile. Read every frame: the map is null until the first
  // shadow render and is recreated when its size changes.
  useFrame(() => {
    const shadow = keyLightRef.current?.shadow;
    reflectionDataRef.current.keyShadowMap = shadow?.map?.depthTexture ?? null;
    reflectionDataRef.current.keyShadowMatrix = shadow?.matrix ?? null;
    reflectionDataRef.current.keyDirectShare = sky?.directShare ?? 0;
  }, -4);

  const envMode = settings.envMode ?? 'sky';
  const useHdri = envMode === 'hdri' || envMode === 'sky+hdri';
  const showHdriBackground = useHdri && Boolean(settings.showHdriBackground);
  const hdriEnvironmentIntensity = (settings.hdriIntensity ?? 1)
    * lighting.environment.exposure;
  const localHdriFile = SELF_HOSTED_HDRI[settings.hdrPreset];
  const environmentSource = localHdriFile
    ? { files: `${import.meta.env.BASE_URL}${localHdriFile}` }
    : { preset: settings.hdrPreset };

  return (
    <>
      <directionalLight
        ref={keyLightRef}
        position={lightDirection.clone().multiplyScalar(standoff).toArray()}
        intensity={lighting.key.sceneIntensity}
        color={keyColor}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={Math.max(0.5, standoff - shadowFrustum - 1)}
        shadow-camera-far={standoff + shadowFrustum + 1}
        shadow-camera-left={-shadowFrustum}
        shadow-camera-right={shadowFrustum}
        shadow-camera-top={shadowFrustum}
        shadow-camera-bottom={-shadowFrustum}
        shadow-bias={settings.shadowBias}
        shadow-normalBias={0.007}
        shadow-radius={shadowRadius}
        shadow-intensity={shadowIntensity}
      />
      <ambientLight
        color={lighting.fill.ambient.color.hex}
        intensity={lighting.fill.ambient.intensity}
      />
      <hemisphereLight
        color={lighting.fill.hemisphere.skyColor.hex}
        groundColor={lighting.fill.hemisphere.groundColor.hex}
        intensity={lighting.fill.hemisphere.intensity}
      />
      {/* The sky is always drawn; the disc toggle hides the body, not the sky. */}
      <SkyDome
          sky={{
            texture: showHdriBackground ? null : sky.texture,
            keyDirection: lighting.sky.keyDirection,
            keyRadiance: settings.lightDiscEnabled === false
              ? [0, 0, 0]
              : lighting.sky.discRadiance,
            keyCosRadius: lighting.sky.keyCosRadius,
            keyGlowPower: lighting.sky.keyGlowPower,
            keyGlowStrength: lighting.sky.keyGlowStrength,
            skyLevel: lighting.sky.skyLevel,
          }}
      />
      {useHdri ? (
        <Environment
          {...environmentSource}
          background={showHdriBackground}
          backgroundIntensity={settings.hdriIntensity ?? 1}
          environmentIntensity={hdriEnvironmentIntensity}
          environmentRotation={[0, THREE.MathUtils.degToRad(settings.hdrRotation), 0]}
        />
      ) : sky.environment ? (
        <Environment
          map={sky.environment}
          background={false}
          environmentIntensity={lighting.sky.skyLevel}
        />
      ) : null}
    </>
  );
}
