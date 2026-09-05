import CoastShrubs from '../../plants/CoastShrubs.jsx';
import {createCoastPlanting} from '../../plants/coastPlanting.js';
import {shrubAssetSettings} from '../../plants/settings.js';
import {createPlantCover} from '../../plants/plantCover.js';
import {coastWeather,terrainGeometryKey} from '../../terrain/settings.js';
import { createTerrainCollider } from '../../terrain/terrainCollider.js';
import { buildCoastRocks, attachRockCollisions } from '../../terrain/terrainRocks.js';
import AzovTerrain from '../../terrain/AzovTerrain.jsx';
import { createTerrainDefinition, createTerrainQuery } from '../../terrain/terrainModel.js';
import HomeTanker from '../../tanker/HomeTanker.jsx';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useProgress } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getBaseHomeSceneSettings,
} from '../../features/home-scene/hooks/useHomeSceneSettings';
import {
  resolveLayout,
  resolveLayoutKey,
} from '../../features/home-scene/lib/layout';
import SceneCanvas from './SceneCanvas';
import { buildRuntimeQualityProfile } from './qualityProfile';
import { getRenderTargetCapabilities } from './renderTargetCapabilities';
import WaterCameraRig from './water/WaterCameraRig';
import { useWaterRuntime } from './water/useWaterRuntime';
import WaterInteractionPlane from './water/WaterInteractionPlane';
import WaterReflections from './water/WaterReflections';
import WaterLights from './water/WaterLights';
import WaterSurfaceV2 from './water/WaterSurface';
import FarWaterSurface from './water/FarWaterSurface';
import Seabed from './water/Seabed';
import { SurfaceVegetation } from './water/SurfaceVegetation';
import { UnderwaterAlgae } from './water/UnderwaterAlgae';
import FloatingBoat from './water/FloatingBoat';
import StaticSculpture from './water/StaticSculpture';
import SceneLightObjects from './water/SceneLightObjects';
import {
  PUBLIC_CAMERA_POSITION,
} from './water/constants';
import {
} from './water/renderTargets';
import EditorGizmo from '../../features/home-scene/components/editor/EditorGizmo';
import ScenePostProcessing from './ScenePostProcessing';
import HomeSoundscapeBridge from '../../features/audio/components/HomeSoundscapeBridge';
import CursorSpotlight from '../../features/cursor/CursorSpotlight';
import {
  getCursorFlashlightServerSnapshot,
  getCursorFlashlightSnapshot,
  subscribeToCursorFlashlight,
  syncCursorFlashlightConfiguration,
} from '../../features/cursor/cursorFlashlightStore';
import { buildHomeSceneLighting } from './homeSceneLighting';
import { useSkyEnvironment } from './water/skyEnvironment';
import HomeSeagullFlock from '../../features/home-scene/creatures/HomeSeagullFlock';
import SeagullLandingHabitat from '../../features/home-scene/creatures/SeagullLandingHabitat.jsx';
import HomeFishSchool from '../../features/home-scene/creatures/HomeFishSchool.jsx';
import {
} from './shaders/waterRuntimeShaders';
import {
} from './shaders/waterV2Shaders';
import {
} from './shaders/vegetationShaders';








// Wireframe is a material flag, not a shader mode, so it cannot be one more
// entry in the debug view list. Sweeping the scene rather than threading a prop
// into every material also covers what arrives late: the boat and the sculpture
// only get their materials once their models finish loading.
function DebugWireframe({ enabled }) {
  const { scene } = useThree();
  const touchedRef = useRef(new Set());

  useFrame(() => {
    const touched = touchedRef.current;

    if (!enabled) {
      if (touched.size === 0) {
        return;
      }

      touched.forEach((material) => {
        material.wireframe = false;
      });
      touched.clear();
      return;
    }

    scene.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((material) => {
        if (!material || material.wireframe) {
          return;
        }

        material.wireframe = true;
        touched.add(material);
      });
    });
  });

  useEffect(() => () => {
    touchedRef.current.forEach((material) => {
      material.wireframe = false;
    });
    touchedRef.current.clear();
  }, []);

  return null;
}

function SceneReadyBeacon({ onSceneReady }) {
  const { active } = useProgress();
  const didNotifyRef = useRef(false);
  const stableFramesRef = useRef(0);
  const notifyTimerRef = useRef(null);

  useEffect(() => () => {
    if (notifyTimerRef.current !== null) {
      window.clearTimeout(notifyTimerRef.current);
    }
  }, []);

  useFrame(() => {
    if (typeof onSceneReady !== 'function' || didNotifyRef.current) {
      return;
    }

    if (active) {
      stableFramesRef.current = 0;
      return;
    }

    stableFramesRef.current += 1;
    if (stableFramesRef.current < 3) {
      return;
    }

    didNotifyRef.current = true;
    // Do not update the surrounding React page while drei's Environment is
    // completing its own render. Deferring one task avoids the React warning
    // and keeps scene initialization deterministic.
    notifyTimerRef.current = window.setTimeout(onSceneReady, 0);
  });

  return null;
}

function WaterRuntimeScene({
  settings,
  mode,
  layoutOverride,
  onCameraRigApi,
  onBoatPositionChange,
  onSculpturePositionChange,
  onSceneReady,
  editorGizmo,
  cameraPoseKey,
  audioRuntime,
}) {
  const { gl, size } = useThree();
  const renderTargetCapabilities = useMemo(
    () => getRenderTargetCapabilities(gl),
    [gl],
  );
  const qualityProfile = useMemo(
    () => buildRuntimeQualityProfile(mode, size.width, renderTargetCapabilities),
    [mode, renderTargetCapabilities, size.width],
  );
  const terrainKey = JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('terrain') || key === 'waterDepthMeters')));
  const terrainDefinition = useMemo(() => createTerrainDefinition(JSON.parse(terrainKey)), [terrainKey]);
  const rockKey=JSON.stringify({...JSON.parse(terrainGeometryKey(terrainDefinition)),terrainRocks:terrainDefinition.terrainRocks});
  const rockDefinition=useMemo(()=>createTerrainDefinition(JSON.parse(rockKey)),[rockKey]);
  const terrainRocks=useMemo(()=>buildCoastRocks(rockDefinition),[rockDefinition]);
  const queryKey=JSON.stringify(Object.fromEntries(Object.entries(terrainDefinition).filter(([key])=>!['terrainTextureScale','terrainParallax','terrainGroundCover','terrainBloom'].includes(key))));
  const queryDefinition=useMemo(()=>createTerrainDefinition(JSON.parse(queryKey)),[queryKey]);
  const terrainQuery = useMemo(() => {
    if(!settings.terrainEnabled)return null;
    const query=attachRockCollisions(createTerrainQuery(queryDefinition),terrainRocks);
    query.collisionObject=createTerrainCollider(query);
    return query;
  }, [queryDefinition, terrainRocks, settings.terrainEnabled]);
  const shrubKey=JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key])=>key.startsWith('shrubs'))));
  const shrubSettings=useMemo(()=>JSON.parse(shrubKey),[shrubKey]);
  const shrubAsset=useMemo(()=>shrubAssetSettings(shrubSettings,{speed:coastWeather(terrainDefinition).wind,bearing:terrainDefinition.terrainWindBearing}),[shrubSettings,terrainDefinition]);
  const shrubPlants=useMemo(()=>createCoastPlanting(terrainQuery,queryDefinition,shrubSettings),[terrainQuery,queryDefinition,shrubSettings]);
  const shrubCover=useMemo(()=>createPlantCover(shrubPlants,256),[shrubPlants]);
  useEffect(()=>()=>shrubCover.dispose(),[shrubCover]);
  const lighting = useMemo(() => buildHomeSceneLighting(settings), [settings]);
  // One sky, built once, handed to everything that has to agree about it: the
  // visible dome, the water that reflects it, and (from Phase 2) the image-based
  // light on every material.
  const sky = useSkyEnvironment(lighting.sky, {
    width: qualityProfile.isLowPower ? 128 : 256,
    height: qualityProfile.isLowPower ? 64 : 128,
  });
  const runtime = useWaterRuntime(settings, qualityProfile, mode);
  const landingSitesRef = useRef([]);
  const [landingSurfaces, setLandingSurfaces] = useState({
    boat: null,
    sculpture: null,
    terrain: null,
  });
  const handleLandingSurfaceReady = useCallback((surface) => {
    const key = surface?.surface;
    if (!['boat','sculpture','terrain'].includes(key)) return;
    setLandingSurfaces((current) => {
      const nextSurface = surface.root ? surface : null;
      if (
        current[key]?.root === nextSurface?.root
        && current[key]?.revision === nextSurface?.revision
      ) return current;
      return { ...current, [key]: nextSurface };
    });
  }, []);
  const cursorFlashlight = useSyncExternalStore(
    subscribeToCursorFlashlight,
    getCursorFlashlightSnapshot,
    getCursorFlashlightServerSnapshot,
  );
  useEffect(() => {
    syncCursorFlashlightConfiguration({
      cursorEnabled: settings.cursorEnabled,
      cursorLightBeamAngle: settings.cursorLightBeamAngle,
      cursorLightEnabled: settings.cursorLightEnabled,
      cursorLightIntensity: settings.cursorLightIntensity,
      cursorLightSoftness: settings.cursorLightSoftness,
      cursorPointSize: settings.cursorPointSize,
    });
  }, [
    settings.cursorEnabled,
    settings.cursorLightBeamAngle,
    settings.cursorLightEnabled,
    settings.cursorLightIntensity,
    settings.cursorLightSoftness,
    settings.cursorPointSize,
  ]);
  const orbitRef = useRef();
  const showDebugHelpers = mode === 'editor' && settings.debugView !== 'beauty';
  const reflectionsEnabled = settings.reflectionsEnabled
    && settings.debugView === 'beauty'
    && settings.boatReflectionIntensity > 0.01;
  // Mobile uses a conservative RGBA8 capture without a depth texture. This
  // keeps the meadow visible and avoids incomplete half-float FBOs in WebViews.
  const refractionEnabled = settings.debugView === 'beauty';
  const opticsEnabled = reflectionsEnabled || refractionEnabled;
  // Editor forces the authored frame. Public layout follows the outer browser
  // orientation, while camera fitting uses the actual render band between the
  // cinematic bars.
  const hasWindow = typeof window !== 'undefined';
  const explicitLayout = layoutOverride && typeof layoutOverride === 'object'
    ? layoutOverride
    : null;
  const activeLayoutKey = typeof layoutOverride === 'string'
    ? layoutOverride
    : resolveLayoutKey(
      hasWindow ? window.innerWidth : size.width,
      hasWindow ? window.innerHeight : size.height,
    );
  const activeLayout = explicitLayout ?? resolveLayout(settings.layouts, activeLayoutKey);
  const updateBoatAudioPosition = useMemo(() => (
    audioRuntime?.updateEmitter
      ? (x, y, z) => audioRuntime.updateEmitter('boat', x, y, z)
      : undefined
  ), [audioRuntime]);

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgWaterEngine = 'v2';
    dataset.ddgQualityTier = qualityProfile.qualityTier ?? (qualityProfile.isLowPower ? 'low' : 'high');
    dataset.ddgMobileProfile = qualityProfile.isMobileDevice ? 'on' : 'off';
    dataset.ddgSimulationRequested = String(settings.simulationResolution);
    dataset.ddgSimulationEffective = String(runtime.effectiveResolution);
    const refractionColor = qualityProfile.refractionTextureType === THREE.UnsignedByteType
      ? 'rgba8'
      : 'half-float';
    dataset.ddgRefractionMode = `${refractionColor}-${qualityProfile.refractionDepthEnabled ? 'depth-texture' : 'analytic-depth'}`;
    dataset.ddgReflectionMode = reflectionsEnabled ? 'planar-generic' : 'procedural-sky';
    dataset.ddgWaterMeshDensity = String(Math.min(settings.waterMeshDensity, qualityProfile.waterMeshDensityCap));
    dataset.ddgSeabedMeshDensity = String(qualityProfile.seabedMeshDensity);
    dataset.ddgPostRenderScale = String(qualityProfile.postRenderScale);
    dataset.ddgPostTarget = qualityProfile.postProcessingSupported === false
      ? 'disabled'
      : qualityProfile.postColorType ?? (qualityProfile.isLowPower ? 'rgba8' : 'half-float');
    dataset.ddgWaterShadow = settings.shadowsEnabled === false ? 'off' : 'on';

    return () => {
      delete dataset.ddgWaterEngine;
      delete dataset.ddgQualityTier;
      delete dataset.ddgMobileProfile;
      delete dataset.ddgSimulationRequested;
      delete dataset.ddgSimulationEffective;
      delete dataset.ddgRefractionMode;
      delete dataset.ddgReflectionMode;
      delete dataset.ddgWaterMeshDensity;
      delete dataset.ddgSeabedMeshDensity;
      delete dataset.ddgPostRenderScale;
      delete dataset.ddgPostTarget;
      delete dataset.ddgWaterShadow;
    };
  }, [
    gl,
    qualityProfile.isLowPower,
    qualityProfile.isMobileDevice,
    qualityProfile.qualityTier,
    qualityProfile.refractionTextureType,
    qualityProfile.postRenderScale,
    qualityProfile.postColorType,
    qualityProfile.postProcessingSupported,
    qualityProfile.refractionDepthEnabled,
    qualityProfile.seabedMeshDensity,
    qualityProfile.waterMeshDensityCap,
    reflectionsEnabled,
    runtime.effectiveResolution,
    settings.simulationResolution,
    settings.waterMeshDensity,
    settings.shadowsEnabled,
  ]);

  return (
    <>
      <color attach="background" args={['#040507']} />
      <WaterCameraRig
        mode={mode}
        layout={activeLayout}
        layoutKey={activeLayoutKey}
        onCameraRigApi={onCameraRigApi}
        orbitRef={orbitRef}
        freeCamera={mode === 'editor'}
        poseKey={cameraPoseKey}
      />
      <HomeSoundscapeBridge runtime={audioRuntime} />
      <WaterReflections
        enabled={opticsEnabled}
        reflectionEnabled={reflectionsEnabled}
        refractionEnabled={refractionEnabled}
        refractionTextureType={qualityProfile.refractionTextureType}
        refractionDepthEnabled={qualityProfile.refractionDepthEnabled}
        refractionDepthMode={qualityProfile.refractionDepthMode}
        textureSize={qualityProfile.reflectionTextureSize}
        activeFps={qualityProfile.reflectionActiveFps}
        idleFps={qualityProfile.reflectionIdleFps}
        refractionActiveFps={qualityProfile.refractionActiveFps}
        refractionIdleFps={qualityProfile.refractionIdleFps}
      >
        <WaterLights
          terrainQuery={terrainQuery}
          settings={settings}
          mode={mode}
          qualityProfile={qualityProfile}
          lighting={lighting}
          sky={sky}
          layout={activeLayout}
        />
        {terrainQuery ? <primitive object={terrainQuery.collisionObject}/> : null}
        {terrainQuery&&settings.shrubsEnabled ? <CoastShrubs settings={shrubAsset} plants={shrubPlants} qualityProfile={qualityProfile}/> : null}
        {settings.terrainEnabled ? <AzovTerrain plantCover={shrubCover} rocks={terrainRocks} onTerrainReady={handleLandingSurfaceReady} audioRuntime={audioRuntime} runtime={runtime} definition={terrainDefinition} settings={settings} qualityProfile={qualityProfile} lighting={lighting} sky={sky} /> : null}
        {settings.seabedVisible ? (
          <Seabed
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            lighting={lighting}
          />
        ) : null}
        {refractionEnabled && settings.algaeVisible ? (
          <UnderwaterAlgae
            settings={settings}
            qualityProfile={qualityProfile}
            lighting={lighting}
          />
        ) : null}
        {refractionEnabled
        && settings.waterVisible
        && settings.fishEnabled
        && settings.fishCount > 0 ? (
          <HomeFishSchool
            terrainQuery={terrainQuery}
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            mode={mode}
          />
        ) : null}
        {settings.waterVisible && settings.debugView === 'beauty' ? (
          <FarWaterSurface
            settings={settings}
            lighting={lighting}
            sky={sky}
            qualityProfile={qualityProfile}
          />
        ) : null}
        {settings.waterVisible ? (
          <WaterSurfaceV2
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            lighting={lighting}
            sky={sky}
          />
        ) : null}
        {settings.liliesVisible ? (
          <SurfaceVegetation
            terrainQuery={terrainQuery}
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            lighting={lighting}
          />
        ) : null}
        {settings.boatVisible ? (
          <FloatingBoat
            settings={settings}
            lighting={lighting}
            layout={activeLayout}
            runtime={runtime}
            mode={mode}
            orbitRef={orbitRef}
            onBoatPositionChange={onBoatPositionChange}
            probeInterval={qualityProfile.boatProbeInterval}
            useGpuProbes={qualityProfile.useGpuBoatProbes}
            onWorldPositionChange={updateBoatAudioPosition}
            isWorldPositionReportingActive={audioRuntime?.isActive}
            onLandingSurfaceReady={handleLandingSurfaceReady}
            useOpticsLod
          />
        ) : null}
        {settings.tankerVisible ? <HomeTanker settings={settings} lighting={lighting} audioRuntime={audioRuntime} /> : null}
        {settings.sculptureVisible ? (
          <StaticSculpture
            terrainQuery={terrainQuery}
            settings={settings}
            lighting={lighting}
            layout={activeLayout}
            mode={mode}
            orbitRef={orbitRef}
            onSculpturePositionChange={onSculpturePositionChange}
            onLandingSurfaceReady={handleLandingSurfaceReady}
            useOpticsLod
          />
        ) : null}
        {settings.seagullsEnabled ? (
          <SeagullLandingHabitat
            boatSurface={landingSurfaces.boat}
            sculptureSurface={landingSurfaces.sculpture}
            terrainSurface={landingSurfaces.terrain}
            terrainQuery={terrainQuery}
            landingSitesRef={landingSitesRef}
          />
        ) : null}
        {settings.seagullsEnabled ? (
          <HomeSeagullFlock
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            landingSitesRef={landingSitesRef}
            terrainQuery={terrainQuery}
            mode={mode}
          />
        ) : null}
        <SceneLightObjects settings={settings} />
        {cursorFlashlight.available ? <CursorSpotlight /> : null}
        <WaterInteractionPlane
            terrainQuery={terrainQuery}
          debug={Boolean(settings.showPointerDebug)}
          settings={settings}
          pointerStateRef={runtime.pointerStateRef}
          sampleBoatProbes={runtime.sampleBoatProbes}
          enableSurfaceRefine={mode !== 'editor' && !qualityProfile.isLowPower}
        />
      </WaterReflections>
      <ScenePostProcessing settings={settings} qualityProfile={qualityProfile} lighting={lighting} />
      {mode === 'editor' && editorGizmo?.selection ? (
        <EditorGizmo
          selection={editorGizmo.selection}
          mode={editorGizmo.mode}
          orbitRef={orbitRef}
          onTransform={editorGizmo.onTransform}
        />
      ) : null}
      <DebugWireframe enabled={mode === 'editor' && Boolean(settings.debugWireframe)} />
      <SceneReadyBeacon onSceneReady={onSceneReady} />
      {showDebugHelpers ? <axesHelper args={[2]} /> : null}
      {showDebugHelpers ? (
        <gridHelper
          args={[settings.waterExtent, 12, '#334a64', '#182230']}
          position={[0, -settings.waterDepthMeters, 0]}
        />
      ) : null}
    </>
  );
}

const WaterScene = ({
  settings: settingsProp,
  mode = 'public',
  sceneId = 'water-scene',
  testId,
  fallbackTestId,
  layoutOverride,
  onCameraRigApi,
  onBoatPositionChange,
  onSculpturePositionChange,
  onSceneReady,
  editorGizmo,
  cameraPoseKey,
  audioRuntime,
}) => {
  const settings = settingsProp ?? getBaseHomeSceneSettings();

  return (
    <SceneCanvas
      sceneId={sceneId}
      mode={mode}
      testId={testId}
      fallbackTestId={fallbackTestId}
      settings={settings}
      camera={{ position: PUBLIC_CAMERA_POSITION, fov: settings.cameraFov }}
      style={{ background: '#040507' }}
    >
      <WaterRuntimeScene
        settings={settings}
        mode={mode}
        editorGizmo={editorGizmo}
        layoutOverride={layoutOverride}
        onCameraRigApi={onCameraRigApi}
        onBoatPositionChange={onBoatPositionChange}
        onSculpturePositionChange={onSculpturePositionChange}
        onSceneReady={onSceneReady}
        cameraPoseKey={cameraPoseKey}
        audioRuntime={audioRuntime}
      />
    </SceneCanvas>
  );
};

export default WaterScene;
