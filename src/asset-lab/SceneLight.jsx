import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { useSkyEnvironment } from '../components/effects/water/skyEnvironment';
import SkyDome from '../components/effects/water/SkyDome';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

const PUBLISHED = getPublishedHomeSceneSettings();

// The home scene's light in the laboratory, the way WaterLights builds it: one
// sky table feeds the visible dome, the image-based light and the key's colour,
// so a tuft under this light looks as it will on the site. `overrides` are the
// collection's own knobs (time of day, cloud cover) on top of the published
// settings; `lighting` replaces the whole solution (the tanker's night preview).
export default function SceneLight({ overrides, lighting: given, shadowRadius = 9, environmentIntensity = 1 }) {
  const { scene } = useThree();
  const lighting = useMemo(() => given ?? buildHomeSceneLighting({ ...PUBLISHED, ...overrides }), [given, overrides]);
  const sky = useSkyEnvironment(lighting.sky, { width: 2048, height: 1024 });
  const keyColor = useMemo(() => new THREE.Color().fromArray(lighting.key.colorLinear), [lighting]);
  const direction = useMemo(() => new THREE.Vector3().fromArray(lighting.key.direction), [lighting]);
  // Distant things fade into the sky at the horizon: the fog takes its colour
  // from the sky table's own horizon row, so the ground meets the dome seamlessly.
  const fogColor = useMemo(() => {
    const image = sky.texture?.image;
    const color = new THREE.Color();
    if (image?.data) {
      const { width, height, data } = image;
      const row = Math.min(height - 1, Math.floor(height * 0.515));
      let r = 0, g = 0, b = 0;
      for (let x = 0; x < width; x += 8) {
        const i = (row * width + x) * 4;
        r += THREE.DataUtils.fromHalfFloat(data[i]); g += THREE.DataUtils.fromHalfFloat(data[i + 1]); b += THREE.DataUtils.fromHalfFloat(data[i + 2]);
      }
      const n = Math.ceil(width / 8);
      color.setRGB(r / n, g / n, b / n).multiplyScalar(lighting.sky.skyLevel);
    } else {
      color.fromArray((sky.skyIrradiance ?? [0.5, 0.6, 0.8]).map((v) => v * lighting.sky.skyLevel));
    }
    return color;
  }, [sky.texture, sky.skyIrradiance, lighting]);
  React.useEffect(() => { if (scene.fog) scene.fog.color.copy(fogColor); }, [scene, fogColor]);
  const standoff = shadowRadius * 2.2;
  return (
    <>
      <directionalLight
        position={direction.clone().multiplyScalar(standoff).toArray()}
        intensity={lighting.key.sceneIntensity}
        color={keyColor}
        castShadow={lighting.shadow.enabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={standoff + shadowRadius * 2}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-bias={lighting.shadow.bias}
        shadow-normalBias={0.01}
        shadow-radius={lighting.shadow.radius}
        shadow-intensity={lighting.shadow.intensity}
      />
      <ambientLight color={lighting.fill.ambient.color.hex} intensity={lighting.fill.ambient.intensity} />
      <hemisphereLight color={lighting.fill.hemisphere.skyColor.hex} groundColor={lighting.fill.hemisphere.groundColor.hex} intensity={lighting.fill.hemisphere.intensity} />
      <SkyDome sky={{
        texture: sky.texture,
        keyDirection: lighting.sky.keyDirection,
        keyRadiance: lighting.sky.discRadiance,
        keyCosRadius: lighting.sky.keyCosRadius,
        keyGlowPower: lighting.sky.keyGlowPower,
        keyGlowStrength: lighting.sky.keyGlowStrength,
        skyLevel: lighting.sky.skyLevel,
        lowerSurfaceColor: lighting.surface.color.linear,
      }} />
      {sky.environment ? <Environment map={sky.environment} background={false} environmentIntensity={lighting.sky.skyLevel * environmentIntensity} /> : null}
    </>
  );
}
