import React, { useEffect, useMemo, useRef } from 'react';
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
import WaterCameraRig from './water/WaterCameraRig';
import { useWaterRuntime } from './water/useWaterRuntime';
import WaterInteractionPlane from './water/WaterInteractionPlane';
import WaterReflections from './water/WaterReflections';
import WaterLights from './water/WaterLights';
import WaterSurfaceV2 from './water/WaterSurface';
import Seabed from './water/Seabed';
import { SurfaceVegetation } from './water/SurfaceVegetation';
import { UnderwaterAlgae } from './water/UnderwaterAlgae';
import FloatingBoat from './water/FloatingBoat';
import StaticSculpture from './water/StaticSculpture';
import {
  PUBLIC_CAMERA_POSITION,
} from './water/constants';
import {
} from './water/renderTargets';
import EditorGizmo from '../../features/home-scene/components/editor/EditorGizmo';
import ScenePostProcessing from './ScenePostProcessing';
import { buildHomeSceneLighting } from './homeSceneLighting';
import { useSkyEnvironment } from './water/skyEnvironment';
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
}) {
  const { gl, size } = useThree();
  const qualityProfile = useMemo(
    () => buildRuntimeQualityProfile(mode, size.width),
    [mode, size.width],
  );
  const lighting = useMemo(() => buildHomeSceneLighting(settings), [settings]);
  // One sky, built once, handed to everything that has to agree about it: the
  // visible dome, the water that reflects it, and (from Phase 2) the image-based
  // light on every material.
  const sky = useSkyEnvironment(lighting.sky, {
    width: qualityProfile.isLowPower ? 128 : 256,
    height: qualityProfile.isLowPower ? 64 : 128,
    applyToScene: (settings.envMode ?? 'sky') !== 'hdri',
  });
  const runtime = useWaterRuntime(settings, qualityProfile, mode);
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
  const activeLayoutKey = layoutOverride
    ?? resolveLayoutKey(
      hasWindow ? window.innerWidth : size.width,
      hasWindow ? window.innerHeight : size.height,
    );
  const activeLayout = resolveLayout(settings.layouts, activeLayoutKey);

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgWaterEngine = 'v2';
    dataset.ddgSimulationRequested = String(settings.simulationResolution);
    dataset.ddgSimulationEffective = String(runtime.effectiveResolution);
    dataset.ddgRefractionMode = qualityProfile.refractionTextureType === THREE.UnsignedByteType
      ? 'rgba8-analytic-depth'
      : 'half-float-depth';
    dataset.ddgReflectionMode = reflectionsEnabled ? 'planar-generic' : 'procedural-sky';
    dataset.ddgWaterMeshDensity = String(Math.min(settings.waterMeshDensity, qualityProfile.waterMeshDensityCap));
    dataset.ddgSeabedMeshDensity = String(qualityProfile.seabedMeshDensity);
    dataset.ddgPostRenderScale = String(qualityProfile.postRenderScale);

    return () => {
      delete dataset.ddgWaterEngine;
      delete dataset.ddgSimulationRequested;
      delete dataset.ddgSimulationEffective;
      delete dataset.ddgRefractionMode;
      delete dataset.ddgReflectionMode;
      delete dataset.ddgWaterMeshDensity;
      delete dataset.ddgSeabedMeshDensity;
      delete dataset.ddgPostRenderScale;
    };
  }, [
    gl,
    qualityProfile.refractionTextureType,
    qualityProfile.postRenderScale,
    qualityProfile.seabedMeshDensity,
    qualityProfile.waterMeshDensityCap,
    reflectionsEnabled,
    runtime.effectiveResolution,
    settings.simulationResolution,
    settings.waterMeshDensity,
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
        freeCamera={mode === 'editor' && Boolean(settings.freeCamera)}
      />
      <WaterReflections
        enabled={opticsEnabled}
        reflectionEnabled={reflectionsEnabled}
        refractionEnabled={refractionEnabled}
        refractionTextureType={qualityProfile.refractionTextureType}
        refractionDepthEnabled={qualityProfile.refractionDepthEnabled}
        textureSize={qualityProfile.reflectionTextureSize}
        activeFps={qualityProfile.reflectionActiveFps}
        idleFps={qualityProfile.reflectionIdleFps}
      >
        <WaterLights
          settings={settings}
          mode={mode}
          qualityProfile={qualityProfile}
          lighting={lighting}
          sky={sky}
        />
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
          />
        ) : null}
        {settings.sculptureVisible ? (
          <StaticSculpture
            settings={settings}
            lighting={lighting}
            layout={activeLayout}
            mode={mode}
            orbitRef={orbitRef}
            onSculpturePositionChange={onSculpturePositionChange}
          />
        ) : null}
        <WaterInteractionPlane
          debug={Boolean(settings.showPointerDebug)}
          settings={settings}
          pointerStateRef={runtime.pointerStateRef}
          sampleBoatProbes={runtime.sampleBoatProbes}
          enableSurfaceRefine={mode !== 'editor' && !qualityProfile.isLowPower}
        />
      </WaterReflections>
      <ScenePostProcessing settings={settings} qualityProfile={qualityProfile} />
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
      />
    </SceneCanvas>
  );
};

export default WaterScene;
