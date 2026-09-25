import TopiaryObjects from '../../topiary/TopiaryObjects.jsx';
import PlacedObjects from '../../placed/PlacedObjects.jsx';
import TopiaryBrush from '../../topiary/TopiaryBrush.jsx';
import PlantingLayer from '../../planting/PlantingLayer.jsx';
import GardenWind from '../../planting/GardenWind.jsx';
import PlantingBrush from '../../planting/PlantingBrush.jsx';
import AnnotationLayer from '../../annotations/AnnotationLayer.jsx';
import GardenLighting from '../../lighting/GardenLighting.jsx';
import ConnectionsLayer from '../../lighting/ConnectionsLayer.jsx';
import { useLoadedSketchupModels } from '../../placed/sketchupModel.js';
import CoastShrubs from '../../plants/CoastShrubs.jsx';
import CoastTrees from '../../plants/CoastTrees.jsx';
import CoastGrass from '../../plants/CoastGrass.jsx';
import CoastDriftwood from '../../shore/CoastDriftwood.jsx';
import {createCoastPlanting,createCoastTreePlanting} from '../../plants/coastPlanting.js';
import {shrubAssetSettings,treeAssetSettings,grassAssetSettings} from '../../plants/settings.js';
import {createPlantCover} from '../../plants/plantCover.js';
import {coastWeather,terrainGeometryKey} from '../../terrain/settings.js';
import { createTerrainCollider } from '../../terrain/terrainCollider.js';
import { buildCoastRocks, attachRockCollisions } from '../../terrain/terrainRocks.js';
import AzovTerrain from '../../terrain/AzovTerrain.jsx';
import { coastBandCoversPond, createTerrainDefinition, createTerrainQuery } from '../../terrain/terrainModel.js';
import HomeTanker from '../../tanker/HomeTanker.jsx';
import React, {
  Suspense,
  lazy,
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
import { buildRuntimeQualityProfile, QUALITY_TIER } from './qualityProfile';
import { useRenderBudget } from './useRenderBudget';
import { getRenderTargetCapabilities } from './renderTargetCapabilities';
import WaterCameraRig from './water/WaterCameraRig';
import { useWaterRuntime } from './water/useWaterRuntime';
import WaterInteractionPlane from './water/WaterInteractionPlane';
import WaterReflections from './water/WaterReflections';
import WaterLights from './water/WaterLights';
import Seabed from './water/Seabed';
import { SurfaceVegetation } from './water/SurfaceVegetation';
import { UnderwaterAlgae } from './water/UnderwaterAlgae';
import FloatingBoat from './water/FloatingBoat';
import SeaWater from './water/SeaWater.jsx';
import { createSeaCausticNormalsHolder } from './water/seaCausticNormals.js';
import { createFoamFieldHolder } from './water/foamField.js';
import { resolveEffectiveSeaSettings, resolveSeaSettings } from './water/seaSettings.js';
import StaticSculpture from './water/StaticSculpture';
import GroundPlane from './GroundPlane';
import SceneLightObjects from './water/SceneLightObjects';
import {
  PUBLIC_CAMERA_POSITION,
} from './water/constants';
import {
} from './water/renderTargets';
import EditorGizmo from '../../features/home-scene/components/editor/EditorGizmo';
import EditorPicker from '../../features/home-scene/components/editor/EditorPicker';
import EditorAxes from '../../features/home-scene/components/editor/EditorAxes';
import { sceneObjectOn } from '../../features/home-scene/lib/sceneObjects';
import ScenePostProcessing from './ScenePostProcessing';
import PainterlyClouds from './sky/painterly/PainterlyClouds';
import CloudShadowReceivers from './sky/painterly/CloudShadowReceivers';
import { CloudSceneContext } from './sky/painterly/CloudSceneContext';
import { resolvePainterlyCloudSettings } from '../../features/home-scene/lib/painterlyCloudSettings';
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
import Surfboard from '../surfboard/Surfboard.jsx';
import WalkMode from '../../walk/WalkMode.jsx';
import WalkStartMarker from '../../walk/WalkStartMarker.jsx';
import SurfPlayCamera from '../surfboard/SurfPlayCamera.jsx';
import { createSurfRibbons } from './water/surfRibbons.js';
import UnderwaterView from './water/UnderwaterView.jsx';

// Loaded only once a scene switches the house on: the site does not pay for it.
const BeachHouseScene = lazy(() => import('../house/BeachHouseScene.jsx'));
// Окружение участка по адресу — только в проекте «Участок» с загруженной картой.
const Surroundings = lazy(() => import('../../surroundings/Surroundings.jsx'));

// Wireframe is a material flag, not a shader mode, so it cannot be one more
// entry in the debug view list. Sweeping the scene rather than threading a prop
// into every material also covers what arrives late: the boat and the sculpture
// only get their materials once their models finish loading.
//
// The view is about the meshes on screen. Every other pass drawn through it —
// the shadow maps, the mirror and the refraction (WaterReflections reads
// scene.userData.ddgWireframe) — drew each mesh again as lines, which made it
// twenty times slower than the scene itself; they keep what they last drew.
function DebugWireframe({ enabled }) {
  const { gl, scene } = useThree();
  const touchedRef = useRef(new Set());

  const skirtedRef = useRef(new Set());
  const shadowsRef = useRef(null);

  useFrame(() => {
    const touched = touchedRef.current;
    const skirted = skirtedRef.current;

    if (!enabled) {
      if (shadowsRef.current !== null) {
        gl.shadowMap.autoUpdate = shadowsRef.current;
        shadowsRef.current = null;
        delete scene.userData.ddgWireframe;
      }
      if (touched.size === 0) {
        return;
      }

      touched.forEach((material) => {
        material.wireframe = false;
      });
      touched.clear();
      skirted.forEach((geometry) => geometry.setDrawRange(0, Infinity));
      skirted.clear();
      return;
    }

    if (shadowsRef.current === null) {
      shadowsRef.current = gl.shadowMap.autoUpdate;
      gl.shadowMap.autoUpdate = false;
      scene.userData.ddgWireframe = true;
    }

    scene.traverse((object) => {
      // The terrain's skirts hang under the ground to hide strip cracks; the
      // topology view is about the surface, so they stay out of the wireframe.
      const geometry = object.geometry;
      if (geometry?.userData?.topTriangles && !skirted.has(geometry)) {
        geometry.setDrawRange(0, geometry.userData.topTriangles * 3);
        skirted.add(geometry);
      }
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
    if (shadowsRef.current !== null) {
      gl.shadowMap.autoUpdate = shadowsRef.current;
      shadowsRef.current = null;
      delete scene.userData.ddgWireframe;
    }
    touchedRef.current.forEach((material) => {
      material.wireframe = false;
    });
    touchedRef.current.clear();
    skirtedRef.current.forEach((geometry) => geometry.setDrawRange(0, Infinity));
    skirtedRef.current.clear();
  }, [gl, scene]);

  return null;
}

// The editor's «Посмотреть кадр сайта» is on while FocusEditor marks the page
// (data-focus-preview); the scene follows the mark rather than a prop, since
// the preview lives in the editor's shell, not in the scene's settings.
function useSitePreview() {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.focusPreview === 'true');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setOn(root.dataset.focusPreview === 'true'));
    observer.observe(root, { attributes: true, attributeFilter: ['data-focus-preview'] });
    return () => observer.disconnect();
  }, []);
  return on;
}

function SceneReadyBeacon({ onSceneReady, waiting }) {
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

    if (active || waiting) {
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
  playing = false,
  onSurfboardCheckpoint,
  walking = false,
  onWalkExit,
}) {
  const { gl, size } = useThree();
  const cloudSceneRef = useRef(null);
  const publishCloudRuntime = useCallback(value => { cloudSceneRef.current = value; }, []);
  const renderTargetCapabilities = useMemo(
    () => getRenderTargetCapabilities(gl),
    [gl],
  );
  const baseQualityProfile = useMemo(
    () => buildRuntimeQualityProfile(mode, size.width, renderTargetCapabilities),
    [mode, renderTargetCapabilities, size.width],
  );
  const sitePreview = useSitePreview();
  // Отметки уровня ищут поверхность заново, когда модель пришла, заменена или сдвинута.
  const loadedModels = useLoadedSketchupModels();
  const annotationGeometryKey = `${loadedModels}|${JSON.stringify(settings.placedObjects ?? [])}|${JSON.stringify(settings.sketchupModels ?? {})}`;
  const postEnabled = baseQualityProfile.postProcessingSupported !== false
    && baseQualityProfile.postDepthStencilEnabled !== false
    && settings.postProcessingEnabled
    // В редакторе постобработка по умолчанию выключена: открывать редактор и
    // видеть готовый кадр мешает работе. Значение сцены при этом не меняется.
    // «Посмотреть кадр сайта» показывает готовый кадр всегда.
    && (mode !== 'editor' || Boolean(settings.editorPostProcessing) || sitePreview)
    && settings.debugView === 'beauty';
  const qualityProfile = useRenderBudget({
    baseProfile: baseQualityProfile,
    enabled: settings.adaptiveQuality !== false,
    postEnabled,
  });
  const terrainKey = JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('terrain') || key === 'waterDepthMeters')));
  const terrainDefinition = useMemo(() => createTerrainDefinition(JSON.parse(terrainKey)), [terrainKey]);
  const rockKey=JSON.stringify({...JSON.parse(terrainGeometryKey(terrainDefinition)),terrainRocks:terrainDefinition.terrainRocks,terrainRocksEnabled:terrainDefinition.terrainRocksEnabled,terrainRockSize:terrainDefinition.terrainRockSize,terrainDebris:terrainDefinition.terrainDebris});
  const rockDefinition=useMemo(()=>createTerrainDefinition(JSON.parse(rockKey)),[rockKey]);
  const terrainRocks=useMemo(()=>buildCoastRocks(rockDefinition),[rockDefinition]);
  const queryKey=JSON.stringify(Object.fromEntries(Object.entries(terrainDefinition).filter(([key])=>!['terrainTextureScale','terrainParallax','terrainGroundCover','terrainBloom','terrainWeed','terrainSilt','terrainMussels','terrainBedScale','terrainRipples'].includes(key))));
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
  // The grove reads the same colour ecology as the shrubs (the landscape's),
  // so its keys ride along with them; only the tree keys are its own.
  const treeKey=JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key])=>key.startsWith('trees')||key.startsWith('shrubs'))));
  const treeSettings=useMemo(()=>JSON.parse(treeKey),[treeKey]);
  const treeAsset=useMemo(()=>treeAssetSettings(treeSettings,{speed:coastWeather(terrainDefinition).wind,bearing:terrainDefinition.terrainWindBearing}),[treeSettings,terrainDefinition]);
  const treePlants=useMemo(()=>createCoastTreePlanting(terrainQuery,queryDefinition,treeSettings),[terrainQuery,queryDefinition,treeSettings]);
  // The meadow reads the shrubs' colour ecology too; it plants itself around the camera.
  const grassKey=JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key])=>key.startsWith('grass')||key.startsWith('shrubs'))));
  const grassSettings=useMemo(()=>JSON.parse(grassKey),[grassKey]);
  const grassAsset=useMemo(()=>grassAssetSettings(grassSettings,{speed:coastWeather(terrainDefinition).wind,bearing:terrainDefinition.terrainWindBearing}),[grassSettings,terrainDefinition]);
  const coverPlants=useMemo(()=>[...shrubPlants,...treePlants],[shrubPlants,treePlants]);
  // The boulders shade the sand too: their halos join the cover map where it reaches.
  const boulderHalos=useMemo(()=>terrainRocks.filter(r=>!r.debris).map(r=>({x:r.x,z:r.z,radius:1.2+Math.max(...r.scale)*1.2})),[terrainRocks]);
  const shrubCover=useMemo(()=>createPlantCover(coverPlants,256,boulderHalos),[coverPlants,boulderHalos]);
  useEffect(()=>()=>shrubCover.dispose(),[shrubCover]);
  // Under the coast the terrain shelf is the bed; the old plane would only be
  // rasterized to discard every pixel, in the frame and in the refraction.
  const seabedCovered = useMemo(() => coastBandCoversPond(terrainDefinition, settings.waterExtent), [terrainDefinition, settings.waterExtent]);
  const lighting = useMemo(() => buildHomeSceneLighting(settings), [settings]);
  const cloudSettingsKey = JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('painterlyCloud'))));
  const cloudSettings = useMemo(() => resolvePainterlyCloudSettings(JSON.parse(cloudSettingsKey), qualityProfile), [cloudSettingsKey, qualityProfile]);
  const cloudLightingKey = JSON.stringify({ sky: lighting.sky, key: lighting.key, environment: { exposure: lighting.environment.exposure, tint: lighting.environment.tint } });
  const cloudLighting = useMemo(() => JSON.parse(cloudLightingKey), [cloudLightingKey]);
  // One sky, built once, handed to everything that has to agree about it: the
  // visible dome, the water that reflects it, and (from Phase 2) the image-based
  // light on every material.
  // The table is built on a worker now, so its size stopped being a stall and
  // became a memory question - and PMREM reads a 256x128 downsample of it
  // rather than the table itself, so the blur no longer scales with it either.
  // High desktop therefore gets enough angular detail that the wide cameras
  // read cloud instead of the grid the cloud was sampled on; the tiers below
  // still step down, because texture bytes and worker seconds are not free.
  const sky = useSkyEnvironment(lighting.sky, {
    width: cloudSettings.enabled ? 256 : qualityProfile.isLowPower
      ? 512
      : qualityProfile.isMobileDevice
        ? 1024
        : (qualityProfile.qualityTier === QUALITY_TIER.medium ? 1024 : 2048),
    height: cloudSettings.enabled ? 128 : qualityProfile.isLowPower
      ? 256
      : qualityProfile.isMobileDevice
        ? 512
        : (qualityProfile.qualityTier === QUALITY_TIER.medium ? 512 : 1024),
    tint: lighting.environment.tint,
  });
  const seaSettings = useMemo(() => resolveSeaSettings(settings), [settings]);
  const effectiveSeaSettings = useMemo(
    () => resolveEffectiveSeaSettings(seaSettings, qualityProfile),
    [qualityProfile, seaSettings],
  );
  const seaSwash = useMemo(() => createFoamFieldHolder(), []);
  const seaCaustics = useMemo(() => createSeaCausticNormalsHolder(), []);
  // What the breakers do each frame, for the surfboard to ride (BreakingWaves fills it).
  const surfRibbons = useMemo(() => createSurfRibbons(), []);
  // Whether the camera is under the sea this frame, and the murk it sees:
  // UnderwaterView decides, the sea surfaces turn their undersides to it.
  const underwater = useMemo(() => ({ active: false, murk: new THREE.Color() }), []);
  // Play needs the board even while it is switched off in the scene; never without water.
  const surfboardOn = sceneObjectOn(settings, 'surfboard') || (playing && sceneObjectOn(settings, 'water'));
  // Bikini Point stands on the terrain where there is one, else on y = 0.
  const houseOn = sceneObjectOn(settings, 'house');
  const houseGround = useMemo(() => (terrainQuery ? (x, z) => terrainQuery.heightAt(x, z) : null), [terrainQuery]);
  const runtime = useWaterRuntime(settings, qualityProfile, mode, effectiveSeaSettings);
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
      // In the editor the cursor is an editor preference (off by default);
      // the published switch alone decides on the site.
      cursorEnabled: mode === 'editor'
        ? Boolean(settings.editorCursor) && settings.cursorEnabled !== false
        : settings.cursorEnabled,
      cursorLightBeamAngle: settings.cursorLightBeamAngle,
      cursorLightEnabled: settings.cursorLightEnabled,
      cursorLightIntensity: settings.cursorLightIntensity,
      cursorLightSoftness: settings.cursorLightSoftness,
      cursorPointSize: settings.cursorPointSize,
    });
  }, [
    mode,
    settings.cursorEnabled,
    settings.editorCursor,
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
  // Editor forces the authored frame. Public layout follows the device (a phone
  // keeps its bucket in either orientation), while camera fitting uses the
  // actual render band between the cinematic bars.
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
  // Both work and site cameras apply a complete snapshot to settings. The rig
  // must use the same selected format as objects, frame and editor controls.
  const rigLayout = activeLayout;
  const updateBoatAudioPosition = useMemo(() => (
    audioRuntime?.updateEmitter
      ? (x, y, z) => audioRuntime.updateEmitter('boat', x, y, z)
      : undefined
  ), [audioRuntime]);

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgWaterEngine = 'sea';
    dataset.ddgQualityTier = qualityProfile.qualityTier ?? (qualityProfile.isLowPower ? 'low' : 'high');
    dataset.ddgMobileProfile = qualityProfile.isMobileDevice ? 'on' : 'off';
    dataset.ddgSkyLut = `${sky.width}x${sky.height}`;
    dataset.ddgSkyPmremSource = `${sky.environmentWidth}x${sky.environmentHeight}`;
    dataset.ddgSimulationRequested = String(settings.simulationResolution);
    dataset.ddgSimulationEffective = String(runtime.effectiveResolution);
    const refractionColor = qualityProfile.refractionTextureType === THREE.UnsignedByteType
      ? 'rgba8'
      : 'half-float';
    dataset.ddgRefractionMode = `${refractionColor}-${qualityProfile.refractionDepthEnabled ? 'depth-texture' : 'analytic-depth'}`;
    dataset.ddgReflectionMode = reflectionsEnabled ? 'planar-generic' : 'procedural-sky';
    dataset.ddgWaterMeshDensity = String(effectiveSeaSettings.meshSegments);
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
      delete dataset.ddgSkyLut;
      delete dataset.ddgSkyPmremSource;
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
    effectiveSeaSettings.meshSegments,
    settings.simulationResolution,
    settings.shadowsEnabled,
    sky.height,
    sky.environmentHeight,
    sky.environmentWidth,
    sky.width,
  ]);

  return (
    <CloudSceneContext.Provider value={cloudSceneRef}>
      <color attach="background" args={['#040507']} />
      <WaterCameraRig
        mode={mode}
        layout={rigLayout}
        layoutKey={activeLayoutKey}
        onCameraRigApi={onCameraRigApi}
        orbitRef={orbitRef}
        freeCamera={mode === 'editor'}
        poseKey={cameraPoseKey}
        playActive={mode === 'editor' && (playing || walking)}
      />
      <HomeSoundscapeBridge runtime={audioRuntime} />
      {cloudSettings.enabled && <PainterlyClouds
        settings={cloudSettings}
        lighting={cloudLighting}
        onShadow={publishCloudRuntime}
        product
        environmentEnabled={!lighting.environment.hdri}
        sunPower={(settings.sunIntensity ?? 1.4) / 1.4}
        discVisible={settings.lightDiscEnabled !== false}
        visible={settings.skyVisible !== false && !lighting.environment.hdriBackdrop}
        onStrike={(clap) => audioRuntime?.playThunder?.({ gain: clap.gain })}
      />}
      <CloudShadowReceivers />
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
        {terrainQuery && settings.shoreEnabled ? <React.Suspense fallback={null}><CoastDriftwood query={terrainQuery} definition={queryDefinition} settings={settings} qualityProfile={qualityProfile} envMapIntensity={lighting.environment.reflection}/></React.Suspense> : null}
        {settings.topiaryEnabled && settings.topiaryObjects?.length ? <TopiaryObjects objects={settings.topiaryObjects} selectedId={mode === 'editor' ? editorGizmo?.topiary?.selectedId : null} qualityProfile={qualityProfile} envMapIntensity={lighting.environment.reflection} /> : null}
        {terrainQuery&&settings.shrubsEnabled ? <CoastShrubs settings={shrubAsset} plants={shrubPlants} qualityProfile={qualityProfile} envMapIntensity={lighting.environment.reflection}/> : null}
        {terrainQuery&&settings.treesEnabled ? <CoastTrees settings={treeAsset} plants={treePlants} qualityProfile={qualityProfile} envMapIntensity={lighting.environment.reflection}/> : null}
        {settings.placedEnabled && settings.placedObjects?.length ? <PlacedObjects objects={settings.placedObjects} selectedId={mode === 'editor' ? editorGizmo?.placed?.selectedId : null} selectedPart={mode === 'editor' ? editorGizmo?.placed?.part : null} sketchupModels={settings.sketchupModels} modelMaterials={settings.modelMaterials} plan={settings.plantingPlan} treeAsset={treeAsset} shrubAsset={shrubAsset} qualityProfile={qualityProfile} lighting={lighting} envMapIntensity={lighting.environment.reflection} settings={settings} /> : null}
        <GardenWind terrain={terrainDefinition} sway={settings.plantingSway ?? 1} />
        {settings.lightingEnabled && settings.lightingFixtures?.length ? <GardenLighting settings={settings} night={lighting.sky.night} selectedId={mode === 'editor' ? editorGizmo?.lighting?.selectedId : null} geometryKey={annotationGeometryKey} /> : null}
        {settings.plantingEnabled && (settings.plantingBeds?.length || settings.plantingPoints?.length || settings.plantingVines?.length) ? <PlantingLayer settings={settings} selectedBedId={mode === 'editor' ? editorGizmo?.planting?.selectedId : null} selectedVineId={mode === 'editor' ? editorGizmo?.planting?.vineId : null} envMapIntensity={lighting.environment.reflection} keyDirection={lighting.key.direction} /> : null}
        {terrainQuery&&settings.grassEnabled ? <CoastGrass query={terrainQuery} definition={queryDefinition} settings={grassSettings} asset={grassAsset} qualityProfile={qualityProfile} envMapIntensity={lighting.environment.reflection}/> : null}
        {settings.terrainEnabled ? <AzovTerrain plantCover={shrubCover} rocks={terrainRocks} onTerrainReady={handleLandingSurfaceReady} audioRuntime={audioRuntime} runtime={runtime} definition={terrainDefinition} settings={settings} qualityProfile={qualityProfile} lighting={lighting} swash={seaSwash} seaCaustics={seaCaustics} /> : null}
        {settings.seabedVisible && !seabedCovered ? (
          <Seabed
            settings={settings}
            runtime={runtime}
            seaCaustics={seaCaustics}
            qualityProfile={qualityProfile}
            lighting={lighting}
          />
        ) : null}
        {refractionEnabled && sceneObjectOn(settings, 'algae') ? (
          <UnderwaterAlgae
            settings={settings}
            qualityProfile={qualityProfile}
            lighting={lighting}
          />
        ) : null}
        {refractionEnabled
        && sceneObjectOn(settings, 'fish')
        && settings.fishCount > 0 ? (
          <HomeFishSchool
            terrainQuery={terrainQuery}
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            mode={mode}
          />
        ) : null}
        {settings.waterVisible ? (
          <SeaWater
            settings={effectiveSeaSettings}
            sceneSettings={settings}
            definition={terrainDefinition}
            lighting={lighting}
            sky={sky}
            runtime={runtime}
            swash={seaSwash}
            seaCaustics={seaCaustics}
            surfRibbons={surfRibbons}
            qualityProfile={qualityProfile}
            underwater={underwater}
          />
        ) : null}
        {sceneObjectOn(settings, 'lilies') ? (
          <SurfaceVegetation
            terrainQuery={terrainQuery}
            settings={settings}
            runtime={runtime}
            qualityProfile={qualityProfile}
            lighting={lighting}
            seaSettings={effectiveSeaSettings}
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
        {surfboardOn ? (
          <Surfboard
            settings={settings}
            lighting={lighting}
            seaSettings={effectiveSeaSettings}
            terrainDefinition={terrainDefinition}
            terrainQuery={terrainQuery}
            surfRibbons={surfRibbons}
            orbitRef={orbitRef}
            playing={mode === 'editor' && playing}
            onCheckpoint={onSurfboardCheckpoint}
          />
        ) : null}
        {houseOn ? (
          <Suspense fallback={null}>
            <BeachHouseScene
              settings={settings}
              night={lighting.sky.night}
              lowPower={Boolean(qualityProfile.isLowPower || qualityProfile.isMobileDevice)}
              groundAt={houseGround}
              hdri={lighting.environment.hdri}
              sunElevation={THREE.MathUtils.radToDeg(Math.asin(lighting.sky.sunDirection[1]))}
            />
          </Suspense>
        ) : null}
        {settings.tankerVisible ? <HomeTanker settings={settings} seaSettings={effectiveSeaSettings.enabled ? effectiveSeaSettings : null} lighting={lighting} audioRuntime={audioRuntime} /> : null}
        {settings.planeEnabled ? <GroundPlane settings={settings} lighting={lighting} /> : null}
        {settings.surroundingsEnabled && settings.surroundingsStamp ? <Suspense fallback={null}><Surroundings settings={settings} lighting={lighting} /></Suspense> : null}
        {settings.sculptureVisible ? (
          <StaticSculpture
            terrainQuery={terrainQuery}
            qualityProfile={qualityProfile}
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
        {sceneObjectOn(settings, 'seagulls') ? (
          <SeagullLandingHabitat
            boatSurface={landingSurfaces.boat}
            sculptureSurface={landingSurfaces.sculpture}
            terrainSurface={landingSurfaces.terrain}
            terrainQuery={terrainQuery}
            landingSitesRef={landingSitesRef}
            perch={{
              centerX: settings.seagullTerritoryX,
              centerZ: settings.seagullTerritoryZ,
              radius: settings.seagullTerritoryRadius,
              terrain: settings.seagullPerchTerrain,
              rocks: settings.seagullPerchRocks,
              objects: settings.seagullPerchObjects,
              count: settings.seagullPerchCount,
            }}
          />
        ) : null}
        {sceneObjectOn(settings, 'seagulls') ? (
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
          sampleSeaSurface={runtime.sampleSeaSurface}
          // A narrow desktop window is not a finger. isMobileDevice folds in
          // viewport width; the refine pass costs a readback per drag frame,
          // and only a touch drag can afford to lose it.
          enableSurfaceRefine={mode !== 'editor'
            && !qualityProfile.isLowPower
            && !qualityProfile.isTouchPrimary}
        />
      </WaterReflections>
      <ScenePostProcessing settings={settings} qualityProfile={qualityProfile} lighting={lighting} sky={sky} enabled={postEnabled} />
      {/* The editor's cameras can dive; the site's authored ones stay above the water. */}
      {mode === 'editor' && settings.waterVisible && settings.debugView === 'beauty' ? (
        <UnderwaterView
          seaSettings={effectiveSeaSettings}
          lighting={lighting}
          terrainDefinition={terrainDefinition}
          terrainQuery={terrainQuery}
          surfRibbons={surfRibbons}
          underwater={underwater}
        />
      ) : null}
      {mode === 'editor' && playing && surfboardOn ? (
        <SurfPlayCamera
          settings={settings}
          orbitRef={orbitRef}
          seaSettings={effectiveSeaSettings}
          terrainDefinition={terrainDefinition}
          terrainQuery={terrainQuery}
          surfRibbons={surfRibbons}
        />
      ) : null}
      {mode === 'editor' && walking ? (
        <WalkMode orbitRef={orbitRef} planeY={settings.planeEnabled ? settings.planeHeight : null} terrain={houseGround} start={settings.walkStart} onSetStart={editorGizmo?.planting?.onStart} onExit={onWalkExit} />
      ) : null}
      {mode === 'editor' && editorGizmo?.selection ? (
        <EditorGizmo
          selection={editorGizmo.selection}
          mode={editorGizmo.mode}
          pose={editorGizmo.pose}
          orbitRef={orbitRef}
          onTransform={editorGizmo.onTransform}
        />
      ) : null}
      {mode === 'editor' ? <EditorPicker enabled={Boolean(editorGizmo?.picking)} onPick={editorGizmo?.onPick} onContextMenu={editorGizmo?.onContextMenu} /> : null}
      {mode === 'editor' ? <TopiaryBrush enabled={Boolean(editorGizmo?.topiary?.drawing)} settings={settings} orbitRef={orbitRef} onStroke={editorGizmo?.topiary?.onStroke} /> : null}
      {mode === 'editor' ? <PlantingBrush mode={editorGizmo?.planting?.mode ?? null} groundY={settings.planeHeight ?? 0} orbitRef={orbitRef} onBed={editorGizmo?.planting?.onBed} onBedSurface={editorGizmo?.planting?.onBedSurface} onPlant={editorGizmo?.planting?.onPlant} onVine={editorGizmo?.planting?.onVine} onMark={editorGizmo?.planting?.onMark} onStart={editorGizmo?.planting?.onStart} onLight={editorGizmo?.planting?.onLight} onAim={editorGizmo?.planting?.onAim} lightMount={editorGizmo?.planting?.lightMount} /> : null}
      {mode === 'editor' ? <WalkStartMarker start={settings.walkStart} ghost={!walking} /> : null}
      {mode === 'editor' && settings.lightingEnabled && (settings.lightingFixtures?.length || settings.lightingPanels?.length || editorGizmo?.lighting?.open) ? <ConnectionsLayer settings={settings} geometryKey={annotationGeometryKey} show={Boolean(editorGizmo?.lighting?.connections)} modelsReady={(settings.placedObjects ?? []).filter((o) => o.kind === 'model' && !o.hidden && settings.sketchupModels?.[o.id]).every((o) => loadedModels.split(',').includes(o.id))} /> : null}
      {mode === 'editor' && settings.annotationsEnabled && settings.annotationMarks?.length ? <AnnotationLayer settings={settings} selectedId={editorGizmo?.annotations?.selectedId} onResnap={editorGizmo?.annotations?.onResnap} geometryKey={annotationGeometryKey} /> : null}
      {mode === 'editor' && !playing && !walking ? <EditorAxes /> : null}
      <DebugWireframe enabled={mode === 'editor' && Boolean(settings.debugWireframe)} />
      <SceneReadyBeacon onSceneReady={onSceneReady} waiting={sky.isPlaceholder} />
      {showDebugHelpers ? <axesHelper args={[2]} /> : null}
      {showDebugHelpers ? (
        <gridHelper
          args={[settings.waterExtent, 12, '#334a64', '#182230']}
          position={[0, -settings.waterDepthMeters, 0]}
        />
      ) : null}
    </CloudSceneContext.Provider>
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
  playing = false,
  onSurfboardCheckpoint,
  walking = false,
  onWalkExit,
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
        playing={playing}
        onSurfboardCheckpoint={onSurfboardCheckpoint}
        walking={walking}
        onWalkExit={onWalkExit}
      />
    </SceneCanvas>
  );
};

export default WaterScene;
