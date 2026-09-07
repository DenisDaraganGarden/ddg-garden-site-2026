import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SELF_HOSTED_HDRI } from './constants';
import { useFrame, useThree } from '@react-three/fiber';
import { reflectionContext } from './reflectionContext';
import SkyDome from './SkyDome';
import {fitTerrainShadow} from '../../../terrain/terrainShadow.js';
import { resolveDirectionalShadowContact } from '../shadowContactContract.js';
import { resolveShadowCascadeCount } from '../shadowCascadePolicy.js';
import { createCsmAdapter } from '../csmAdapter.js';

// Every light in the scene, plus the sky. The key light and the visible disc are
// the same direction by construction now: the disc is a dot product against the
// light vector inside the sky shader, not a sprite parked at a finite distance
// that missed it by 12.6 degrees.

export default function WaterLights({ settings, mode, qualityProfile, lighting, sky, layout, terrainQuery }) {
  const { scene, camera } = useThree();
  const reflectionDataRef = useContext(reflectionContext);
  const keyLightRef = useRef();
  const keyTarget=useMemo(()=>new THREE.Object3D(),[]),shadowTimer=useRef(1);
  const cameraDirection=useMemo(()=>new THREE.Vector3(),[]);
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
  const shadowMapSize = qualityProfile?.shadowMapSize ?? (mode === 'editor' ? 1024 : 768);
  const cascadeCount = resolveShadowCascadeCount({
    requested: settings.shadowCascades ?? 'auto',
    isLowPower: qualityProfile?.isLowPower,
    isMobileDevice: qualityProfile?.isMobileDevice,
    // This adapter owns the material registry and is therefore a real CSM path,
    // not a feature flag that silently creates duplicate direct lights.
    csmReady: true,
  });
  const [csmAdapter, setCsmAdapter] = useState(null);
  useEffect(() => {
    if (cascadeCount !== 2 || !lighting.shadow.enabled) return undefined;
    const reflectionData = reflectionDataRef.current;
    // Only topology changes recreate CSM. Artistic light values are applied by
    // configure() below, so moving the sun does not thrash maps or materials.
    const adapter = createCsmAdapter({
      scene,
      camera,
      cascades: 2,
      // Runtime configure() applies the authored values before CSM lights render.
      // Keep construction structural so slider movement never reallocates maps.
      maxFar: 160,
      nearDistance: 25,
      shadowMapSize,
      lightDirection: new THREE.Vector3(0, -1, 0),
      lightColor: new THREE.Color(0xffffff),
      lightIntensity: 0,
      shadowRadius: 1,
      shadowIntensity: 1,
      contactOffsetMeters: 0,
      legacyBias: 0,
    });
    setCsmAdapter(adapter);
    return () => {
      setCsmAdapter(null);
      adapter.dispose();
      // Water keeps its uniforms stable, but must not retain a released far map
      // for the render between a CSM cleanup and the single-light fallback.
      reflectionData.keyShadowCascades = [];
      reflectionData.keyShadowSplit = 1e9;
    };
  }, [camera, cascadeCount, lighting.shadow.enabled, reflectionDataRef, scene, shadowMapSize]);
  // The 640-texel gate is gone. It silently switched shadows off on every phone
  // while the editor bypassed it, so the scene was authored in a view the
  // visitor never got. What made it affordable is the frustum refit below.
  const shadowsEnabled = lighting.shadow.enabled && settings.debugView === 'beauty';
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
  // The water is a hand-written ShaderMaterial, so three will never hand it a
  // shadow. Publishing the two handles the sampler needs on the ref the water
  // already reads each frame is the whole plumbing - no second shadow map, no
  // lights:true recompile. Read every frame: the map is null until the first
  // shadow render and is recreated when its size changes.
  useFrame(({camera,gl},delta) => {
    if (csmAdapter) {
      csmAdapter.configure({
        maxFar: settings.shadowDistance ?? 160,
        nearDistance: settings.shadowNearDistance ?? 25,
        lightDirection: lightDirection.clone().negate(),
        lightColor: keyColor,
        lightIntensity: lighting.key.sceneIntensity,
        shadowRadius: lighting.shadow.radius,
        shadowIntensity: lighting.shadow.intensity,
        contactOffsetMeters: lighting.shadow.contactOffsetMeters,
        legacyBias: lighting.shadow.bias,
      });
      // CSM creates its own DirectionalLights, so this mirrors the single
      // light's castShadow/debug contract without rebuilding its maps.
      csmAdapter.csm.lights.forEach((light) => { light.castShadow = shadowsEnabled; });
      csmAdapter.update();
      const [nearCascade, farCascade] = csmAdapter.getShadowHandles();
      const active = nearCascade ?? farCascade;
      reflectionDataRef.current.keyShadowMap = active?.map ?? null;
      reflectionDataRef.current.keyShadowMatrix = active?.matrix ?? null;
      reflectionDataRef.current.keyShadowBias = active?.waterBias ?? 0;
      reflectionDataRef.current.keyShadowRadius = active?.radius ?? lighting.shadow.radius;
      reflectionDataRef.current.keyShadowCascades = [nearCascade, farCascade].filter(Boolean);
      reflectionDataRef.current.keyShadowSplit = csmAdapter.getSplitDistance();
      if (active?.mapSize) reflectionDataRef.current.keyShadowTexelSize.set(1 / active.mapSize.x, 1 / active.mapSize.y);
      reflectionDataRef.current.keyDirectShare = sky?.directShare ?? 0;
      if (import.meta.env.DEV) gl.domElement.dataset.ddgTerrainShadow = JSON.stringify({
        enabled: shadowsEnabled,
        csm: true,
        mapReady: Boolean(nearCascade?.map || farCascade?.map),
        mapsReady: [Boolean(nearCascade?.map), Boolean(farCascade?.map)],
        split: csmAdapter.getSplitDistance(),
        contacts: [nearCascade, farCascade].filter(Boolean).map(({ bias, waterBias }) => ({ bias, waterBias })),
      });
      return;
    }
    // A previous CSM effect may have published a second map. Clear it before
    // the single directional light publishes its first new handle.
    reflectionDataRef.current.keyShadowCascades = [];
    reflectionDataRef.current.keyShadowSplit = 1e9;
    shadowTimer.current+=delta;
    const light=keyLightRef.current;
    // A paused frame has delta=0 but can still be an editor slider/camera
    // invalidation. Refit immediately so contact bias never lags that view.
    if(light&&(shadowTimer.current>.08||delta<=0)){
      shadowTimer.current=0;camera.getWorldDirection(cameraDirection);
      const fit=fitTerrainShadow(camera.position,cameraDirection,lightDirection,terrainQuery,shadowFrustum,shadowMapSize);
      keyTarget.position.copy(fit.centre);keyTarget.updateMatrixWorld();
      light.position.copy(fit.centre).addScaledVector(lightDirection,fit.standoff);light.updateMatrixWorld();
      const c=light.shadow.camera;c.left=c.bottom=-fit.radius;c.right=c.top=fit.radius;c.near=fit.near;c.far=fit.far;c.updateProjectionMatrix();
      const contact=resolveDirectionalShadowContact({
        legacyBias: lighting.shadow.bias,
        contactOffsetMeters: lighting.shadow.contactOffsetMeters,
        near: fit.near,
        far: fit.far,
        radius: fit.radius,
        mapSize: shadowMapSize,
      });
      light.shadow.bias=contact.bias;
      light.shadow.normalBias=contact.normalBias;
      reflectionDataRef.current.keyShadowBias=contact.waterBias;
      reflectionDataRef.current.keyShadowRadius=lighting.shadow.radius;
      if(import.meta.env.DEV)gl.domElement.dataset.ddgTerrainShadow=JSON.stringify({enabled:shadowsEnabled,mapReady:!!light.shadow.map,rendererEnabled:gl.shadowMap.enabled,target:fit.centre.toArray(),radius:fit.radius,weight:fit.weight,contactOffsetMeters:contact.offsetMeters,worldTexelSize:contact.worldTexelSize,bias:contact.bias,normalBias:contact.normalBias});
    }
    const shadow = keyLightRef.current?.shadow;
    reflectionDataRef.current.keyShadowMap = shadow?.map?.depthTexture ?? null;
    reflectionDataRef.current.keyShadowMatrix = shadow?.matrix ?? null;
    if (shadow?.mapSize) {
      const texelSize = reflectionDataRef.current.keyShadowTexelSize
        ?? new THREE.Vector2();
      texelSize.set(
        1 / Math.max(shadow.mapSize.x, 1),
        1 / Math.max(shadow.mapSize.y, 1),
      );
      reflectionDataRef.current.keyShadowTexelSize = texelSize;
    }
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
      <primitive object={keyTarget}/>
      {!csmAdapter ? <directionalLight
        target={keyTarget}
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
        shadow-bias={0}
        shadow-normalBias={0.0015}
        shadow-radius={lighting.shadow.radius}
        shadow-intensity={lighting.shadow.intensity}
      /> : null}
      <ambientLight
        color={lighting.fill.ambient.color.hex}
        intensity={lighting.fill.ambient.intensity}
      />
      <hemisphereLight
        color={lighting.fill.hemisphere.skyColor.hex}
        groundColor={lighting.fill.hemisphere.groundColor.hex}
        intensity={lighting.fill.hemisphere.intensity}
      />
      {/* The disc toggle hides the body, not the sky - that is what the sky
          switch below is for, and turning it off leaves the clear colour where
          the dome was, which is the point of a visibility switch. */}
      {settings.skyVisible === false ? null : (
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
            lowerSurfaceColor: lighting.surface.color.linear,
          }}
        />
      )}
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
