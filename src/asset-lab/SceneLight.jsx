import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Environment } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { resolveDirectionalShadowContact } from '../components/effects/shadowContactContract';
import { useSkyEnvironment } from '../components/effects/water/skyEnvironment';
import SkyDome from '../components/effects/water/SkyDome';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

const PUBLISHED = getPublishedHomeSceneSettings();

// The home scene's light in the laboratory, the way WaterLights builds it: one
// sky table feeds the visible dome, the image-based light and the key's colour,
// so a tuft under this light looks as it will on the site. `overrides` are the
// collection's own knobs (time of day, cloud cover) on top of the published
// settings; `lighting` replaces the whole solution (the tanker's night preview).
export default function SceneLight({ overrides, lighting: given, shadowRadius = 9, environmentIntensity = 1, onSky = null, shadowDataRef = null }) {
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
  // A specialised collection can sample this exact LUT in a custom material.
  // Do not rebuild it beside the scene light: separate sky tables are how an
  // object starts reflecting a different atmosphere than the visible dome.
  React.useEffect(() => { onSky?.(sky); }, [onSky, sky]);
  const standoff = shadowRadius * 2.2;
  const keyLightRef = React.useRef(null);
  const publishedShadowRef = React.useRef({
    keyShadowMap: null,
    keyShadowMatrix: null,
    keyShadowBias: 0,
    keyShadowRadius: 1,
    keyShadowTexelSize: new THREE.Vector2(1 / 2048, 1 / 2048),
    keyShadowCascades: [],
    keyShadowSplit: 1e9,
    keyDirectShare: 0,
  });
  const shadowContact = useMemo(() => resolveDirectionalShadowContact({
    legacyBias: lighting.shadow.bias,
    contactOffsetMeters: lighting.shadow.contactOffsetMeters,
    near: 0.5,
    far: standoff + shadowRadius * 2,
    radius: shadowRadius,
    mapSize: 2048,
  }), [lighting.shadow.bias, lighting.shadow.contactOffsetMeters, shadowRadius, standoff]);

  // The sea shader cannot receive Three's automatic shadow uniforms. Publish
  // this very same directional map after it has been allocated, with the
  // physical water bias used by WaterLights. A ref avoids a React render every
  // frame and leaves the lab controls/storage entirely untouched.
  useFrame(() => {
    if (!shadowDataRef) return;
    const shadow = keyLightRef.current?.shadow;
    const map = shadow?.map?.depthTexture ?? null;
    const data = publishedShadowRef.current;
    data.keyShadowMap = map;
    data.keyShadowMatrix = shadow?.matrix ?? null;
    data.keyShadowBias = shadowContact.waterBias;
    data.keyShadowRadius = lighting.shadow.radius;
    if (shadow?.mapSize) data.keyShadowTexelSize.set(1 / Math.max(shadow.mapSize.x, 1), 1 / Math.max(shadow.mapSize.y, 1));
    data.keyDirectShare = sky?.directShare ?? 0;
    shadowDataRef.current = data;
  }, -4);
  return (
    <>
      <directionalLight
        ref={keyLightRef}
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
        shadow-bias={shadowContact.bias}
        shadow-normalBias={shadowContact.normalBias}
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
