import { useEffect, useState } from 'react';
import { publishedHomeSceneSettings } from '../data/publishedHomeSceneSettings';
import { publishedHomeSceneKeys } from '../data/publishedHomeSceneKeys';
import {
  clampLayoutFrameInset,
  DEFAULT_LAYOUT_FRAME_INSETS,
} from '../lib/layout';

export const HOME_SCENE_SETTINGS_STORAGE_KEY = 'ddg_home_scene_settings_v1';
const HOME_SCENE_WATER_DEFAULT_MIGRATION_KEY = 'ddg_home_scene_water_default_128_v1';
export const LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS = ['ddg_snake_settings_v4', 'ddg_snake_settings_v3'];
const OBSOLETE_PUBLISHED_HOME_SCENE_STORAGE_KEYS = [
  'ddg_published_home_scene_settings_v1',
  'ddg_published_snake_settings_v1',
];

export const HOME_SCENE_HDRI_PRESETS = [
  { value: 'night', label: 'Night' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'city', label: 'City' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'studio', label: 'Studio' },
];

export const HOME_SCENE_DEBUG_VIEWS = [
  { value: 'beauty', label: 'Beauty' },
  { value: 'height', label: 'Height' },
  { value: 'normals', label: 'Normals' },
  { value: 'caustics', label: 'Caustics' },
  { value: 'seabed-depth', label: 'Seabed Depth' },
];

export const HOME_SCENE_FOG_MODES = [
  { value: 'off', label: 'Off' },
  { value: 'cheap', label: 'Cheap' },
  { value: 'volumetric', label: 'Volumetric' },
];

export const HOME_SCENE_LIGHT_TYPES = [
  { value: 'sun', label: 'Sun' },
  { value: 'moon', label: 'Moon' },
];

const DEFAULT_HDRI_PRESET = HOME_SCENE_HDRI_PRESETS[0].value;
const DEFAULT_DEBUG_VIEW = HOME_SCENE_DEBUG_VIEWS[0].value;
const DEFAULT_LANDSCAPE_CAMERA_POSITION = { x: 0, y: 5.8, z: 8.9 };
const DEFAULT_PORTRAIT_CAMERA_POSITION = { x: 0, y: 5.1, z: 7.3 };
const DEFAULT_CAMERA_TARGET = { x: 0, y: 0, z: 0 };
const DEFAULT_SCULPTURE_POSITION = { x: 0.6, z: 1.2 };
const DEFAULT_BOAT_POSITION = { x: 2.1, z: -1.4 };
const DEFAULT_CAMERA_FOV = 36;

// One composition bucket (see features/home-scene/lib/layout.js for selection logic).
const buildLayout = (cameraPosition, cameraFov, frameInset) => ({
  customized: false,
  cameraPosition: { ...cameraPosition },
  cameraTarget: { ...DEFAULT_CAMERA_TARGET },
  cameraFov,
  frameInset: clampLayoutFrameInset(frameInset),
  boatPosition: { ...DEFAULT_BOAT_POSITION },
  sculpturePosition: { ...DEFAULT_SCULPTURE_POSITION },
});
const VALID_HDRI_PRESETS = new Set(HOME_SCENE_HDRI_PRESETS.map((option) => option.value));
const VALID_DEBUG_VIEWS = new Set(HOME_SCENE_DEBUG_VIEWS.map((option) => option.value));
const VALID_FOG_MODES = new Set(HOME_SCENE_FOG_MODES.map((option) => option.value));
const VALID_LIGHT_TYPES = new Set(HOME_SCENE_LIGHT_TYPES.map((option) => option.value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampResolution = (value) => {
  const requested = Number(value);

  if (!Number.isFinite(requested)) {
    return 128;
  }

  if (requested <= 192) {
    return 128;
  }

  if (requested <= 320) {
    return 256;
  }

  if (requested <= 448) {
    return 384;
  }

  return 512;
};
const clampFloat = (value, min, max, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? clamp(nextValue, min, max) : fallback;
};
const clampInt = (value, min, max, fallback) => Math.round(
  clampFloat(value, min, max, fallback),
);
const pickBoolean = (value, fallback) => (
  typeof value === 'boolean' ? value : fallback
);
const pickVector2 = (value, fallback) => {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }

  return {
    x: clampFloat(value.x, -80, 80, fallback.x),
    z: clampFloat(value.z, -80, 80, fallback.z),
  };
};
const pickVector3 = (value, fallback) => {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }

  return {
    x: clampFloat(value.x, -120, 120, fallback.x),
    y: clampFloat(value.y, -120, 120, fallback.y),
    z: clampFloat(value.z, -120, 120, fallback.z),
  };
};
const pickColor = (value, fallback) => (
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
);
const pickLayout = (value, fallback) => {
  const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};

  return {
    customized: pickBoolean(source.customized, fallback.customized),
    cameraPosition: pickVector3(source.cameraPosition, fallback.cameraPosition),
    cameraTarget: pickVector3(source.cameraTarget, fallback.cameraTarget),
    cameraFov: clampInt(source.cameraFov, 24, 75, fallback.cameraFov),
    frameInset: clampLayoutFrameInset(source.frameInset ?? fallback.frameInset),
    boatPosition: pickVector2(source.boatPosition, fallback.boatPosition),
    sculpturePosition: pickVector2(source.sculpturePosition, fallback.sculpturePosition),
  };
};

export const getBaseHomeSceneSettings = () => ({
  waterExtent: 24,
  simulationResolution: 128,
  waterMeshDensity: 288,
  waveAmplitude: 0.055,
  waveLength: 0.72,
  waveChoppiness: 0.18,
  rippleDamping: 0.965,
  rippleRadius: 0.45,
  rippleImpulse: 0.22,
  normalStrength: 1.2,
  normalBlur: 0.85,
  hdrPreset: DEFAULT_HDRI_PRESET,
  hdrRotation: 210,
  hdrExposure: 64,
  envReflectionIntensity: 84,
  envTint: '#6b7484',
  keyLightType: 'sun',
  lightDiscEnabled: true,
  lightDiscSize: 1.6,
  moonIntensity: 0.95,
  moonColor: '#d9e4ff',
  moonAzimuth: 42,
  moonElevation: 18,
  moonSpecularStrength: 0.18,
  moonSpecularPower: 38,
  showHdriBackground: false,
  shadowsEnabled: true,
  shadowIntensity: 1,
  shadowRadius: 3,
  shadowBias: -0.0002,
  ambientIntensity: 0.11,
  ambientColor: '#202635',
  hemisphereIntensity: 0.26,
  hemisphereSkyColor: '#314762',
  hemisphereGroundColor: '#020305',
  waterDepthMeters: 5,
  seabedReliefStrength: 0.42,
  seabedReliefScale: 1.8,
  causticsIntensity: 0.55,
  causticsScale: 1.2,
  causticsSharpness: 0.45,
  cameraFov: 36,
  cameraCustomPose: false,
  cameraPosition: { ...DEFAULT_LANDSCAPE_CAMERA_POSITION },
  cameraTarget: { ...DEFAULT_CAMERA_TARGET },
  cameraCustomPoseLandscape: false,
  cameraPositionLandscape: { ...DEFAULT_LANDSCAPE_CAMERA_POSITION },
  cameraTargetLandscape: { ...DEFAULT_CAMERA_TARGET },
  cameraCustomPosePortrait: false,
  cameraPositionPortrait: { ...DEFAULT_PORTRAIT_CAMERA_POSITION },
  cameraTargetPortrait: { ...DEFAULT_CAMERA_TARGET },
  layouts: {
    portrait: buildLayout(
      DEFAULT_PORTRAIT_CAMERA_POSITION,
      DEFAULT_CAMERA_FOV,
      DEFAULT_LAYOUT_FRAME_INSETS.portrait,
    ),
    desktop: buildLayout(
      DEFAULT_LANDSCAPE_CAMERA_POSITION,
      DEFAULT_CAMERA_FOV,
      DEFAULT_LAYOUT_FRAME_INSETS.desktop,
    ),
  },
  debugView: DEFAULT_DEBUG_VIEW,
  boatColor: '#ffffff',
  boatMetalness: 0.15,
  boatRoughness: 0.20,
  boatClearcoat: 0.8,
  boatClearcoatRoughness: 0.1,
  boatReflectionIntensity: 1.15,
  boatPosition: { x: 2.1, z: -1.4 },
  boatYaw: 18,
  boatScale: 0.001,
  boatHeightOffset: 0,
  boatCutoutFitWidth: 0.72,
  boatCutoutFitLength: 0.92,
  boatCutoutDebug: false,
  sculptureColor: '#b7bcc7',
  sculptureMetalness: 0.08,
  sculptureRoughness: 0.78,
  sculptureClearcoat: 0.12,
  sculptureClearcoatRoughness: 0.82,
  sculpturePosition: { ...DEFAULT_SCULPTURE_POSITION },
  sculptureScale: 0.045,
  sculptureRotationX: 0,
  sculptureRotationY: 0,
  sculptureRotationZ: 0,
  sculptureBottomOffset: 0.08,
  seabedTextureScale: 1.0,
  seabedSaturation: 1.0,
  seabedBrightness: 1.0,
  waterTurbidity: 0.3,
  waterScatteringStrength: 0.85,
  waterScatteringColor: '#6f8d91',
  seabedVariation: 0.55,
  seabedAoStrength: 0.62,
  plantAoStrength: 0.55,
  surfacePlantAmount: 0.72,
  surfacePlantCenterX: -3.6,
  surfacePlantCenterZ: 1.6,
  surfacePlantRadius: 7.8,
  surfacePlantClustering: 0.76,
  surfacePlantSize: 0.36,
  surfacePlantColor: '#667b32',
  surfacePlantSaturation: 0.96,
  surfacePlantTranslucency: 0.62,
  surfacePlantReflection: 0.72,
  underwaterAlgaeAmount: 0.72,
  underwaterAlgaeCenterX: 2.6,
  underwaterAlgaeCenterZ: 1.6,
  underwaterAlgaeRadius: 11,
  underwaterAlgaeLength: 1.65,
  underwaterAlgaeSway: 0.75,
  underwaterAlgaeColor: '#29462a',
  underwaterAlgaeSaturation: 0.88,
  underwaterAlgaeFlowDirection: 24,
  underwaterAlgaeFlowStrength: 1.1,
  underwaterAlgaeSpeciesMix: 0.68,
  underwaterAlgaePatchiness: 0.42,
  postProcessingEnabled: true,
  filmGrainEnabled: true,
  filmGrainIntensity: 0.028,
  // 1 = the automatic pixel budget. Raise for a sharper frame, lower to buy
  // back GPU time; the budget still adapts to the window on top of this.
  renderScale: 1,
  // Site chrome shown over the scene. Authored per published scene so the frame
  // can be cleared for a screenshot or a bare cinematic view.
  uiBrandVisible: true,
  uiSubtitleVisible: true,
  uiMenuVisible: true,
  uiLanguageVisible: true,
  uiSoundVisible: true,
  uiFrameVisible: true,
  filmGrainSize: 1.15,
  filmGrainSpeed: 0.85,
  bloomEnabled: true,
  bloomStrength: 0.18,
  bloomThreshold: 0.72,
  bloomRadius: 0.58,
  waterGlintStrength: 0.48,
  waterGlintDensity: 0.5,
  waterGlintSharpness: 0.72,
  colorContrast: 1.03,
  colorSaturation: 1.02,
  colorHue: 0,
  colorGamma: 1,
  colorExposure: 0,
  sunRaysEnabled: true,
  sunRaysIntensity: 0.14,
  sunRaysDecay: 0.93,
  sunRaysDensity: 0.72,
  fogMode: 'cheap',
  fogColor: '#46545d',
  fogDensity: 0.08,
  fogNear: 2.5,
  fogFar: 36,
  fogNoiseScale: 2.1,
  fogSpeed: 0.05,
  fogScattering: 0.25,
  ambientWaveIntensity: 0.12,
  ambientWaveSpeed: 0.85,
  showPerformanceHud: false,
  showPointerDebug: false,
});

const normalizeLegacySettings = (savedSettings, defaults) => {
  const legacy = {};

  if (savedSettings?.planeMeshDensity !== undefined) {
    legacy.waterMeshDensity = clampInt(savedSettings.planeMeshDensity, 96, 384, defaults.waterMeshDensity);
  }

  if (savedSettings?.cameraFov !== undefined) {
    legacy.cameraFov = clampInt(savedSettings.cameraFov, 24, 75, defaults.cameraFov);
  }

  if (savedSettings?.planeHeight !== undefined) {
    legacy.waveAmplitude = clampFloat(savedSettings.planeHeight / 1200, 0, 0.2, defaults.waveAmplitude);
  }

  if (savedSettings?.planeRadius !== undefined) {
    legacy.waterExtent = clampFloat(savedSettings.planeRadius / 20, 12, 40, defaults.waterExtent);
  }

  if (savedSettings?.planeTrailLength !== undefined) {
    legacy.rippleRadius = clampFloat(savedSettings.planeTrailLength / 40, 0.1, 2.4, defaults.rippleRadius);
    legacy.rippleDamping = clampFloat(1 - (savedSettings.planeTrailLength / 1300), 0.93, 0.992, defaults.rippleDamping);
  }

  if (savedSettings?.planeTrailSpan !== undefined) {
    legacy.rippleRadius = clampFloat(savedSettings.planeTrailSpan / 45, 0.1, 2.4, legacy.rippleRadius ?? defaults.rippleRadius);
  }

  if (savedSettings?.planeTrailPersistence !== undefined) {
    legacy.rippleDamping = clampFloat(1 - (savedSettings.planeTrailPersistence / 1400), 0.93, 0.992, legacy.rippleDamping ?? defaults.rippleDamping);
  }

  if (savedSettings?.hdrExposure !== undefined) {
    legacy.hdrExposure = clampInt(savedSettings.hdrExposure, 0, 220, defaults.hdrExposure);
  }

  if (savedSettings?.lightColor !== undefined) {
    legacy.moonColor = pickColor(savedSettings.lightColor, defaults.moonColor);
  }

  if (savedSettings?.lightIntensity !== undefined) {
    legacy.moonIntensity = clampFloat(savedSettings.lightIntensity / 260, 0, 4, defaults.moonIntensity);
  }

  if (savedSettings?.lightAngle !== undefined) {
    legacy.moonAzimuth = clampFloat(savedSettings.lightAngle, 0, 360, defaults.moonAzimuth);
  }

  if (savedSettings?.lightHeight !== undefined) {
    legacy.moonElevation = clampFloat(savedSettings.lightHeight / 4, 0, 85, defaults.moonElevation);
  }

  return legacy;
};

const normalizeHomeSceneSettings = (savedSettings = {}) => {
  const defaults = getBaseHomeSceneSettings();
  const legacy = normalizeLegacySettings(savedSettings, defaults);
  const merged = {
    ...defaults,
    ...legacy,
    ...savedSettings,
  };
  const legacyLandscapeCustomPose = pickBoolean(
    merged.cameraCustomPose,
    defaults.cameraCustomPoseLandscape,
  );
  const legacyLandscapePosition = pickVector3(
    merged.cameraPosition,
    defaults.cameraPositionLandscape,
  );
  const legacyLandscapeTarget = pickVector3(
    merged.cameraTarget,
    defaults.cameraTargetLandscape,
  );
  const cameraCustomPoseLandscape = pickBoolean(
    merged.cameraCustomPoseLandscape,
    legacyLandscapeCustomPose,
  );
  const cameraPositionLandscape = pickVector3(
    merged.cameraPositionLandscape,
    legacyLandscapePosition,
  );
  const cameraTargetLandscape = pickVector3(
    merged.cameraTargetLandscape,
    legacyLandscapeTarget,
  );
  const cameraCustomPosePortrait = pickBoolean(
    merged.cameraCustomPosePortrait,
    defaults.cameraCustomPosePortrait,
  );
  const cameraPositionPortrait = pickVector3(
    merged.cameraPositionPortrait,
    defaults.cameraPositionPortrait,
  );
  const cameraTargetPortrait = pickVector3(
    merged.cameraTargetPortrait,
    defaults.cameraTargetPortrait,
  );

  const normalizedCameraFov = clampInt(merged.cameraFov, 24, 75, defaults.cameraFov);
  const normalizedBoatPosition = pickVector2(merged.boatPosition, defaults.boatPosition);
  const normalizedSculpturePosition = pickVector2(merged.sculpturePosition, defaults.sculpturePosition);
  const usesLegacyShadowModel = savedSettings.shadowIntensity === undefined;
  const migratedShadowRadius = usesLegacyShadowModel
    ? Math.min(Number(merged.shadowRadius), 3.5)
    : merged.shadowRadius;
  const migratedShadowBias = usesLegacyShadowModel && Number(merged.shadowBias) > 0
    ? defaults.shadowBias
    : merged.shadowBias;

  // Migrate the old flat camera fields into the two responsive composition buckets when
  // a settings blob predates `layouts`. Object positions seed both buckets from the old globals.
  const legacyDesktopLayout = {
    customized: cameraCustomPoseLandscape,
    cameraPosition: cameraPositionLandscape,
    cameraTarget: cameraTargetLandscape,
    cameraFov: normalizedCameraFov,
    frameInset: DEFAULT_LAYOUT_FRAME_INSETS.desktop,
    boatPosition: normalizedBoatPosition,
    sculpturePosition: normalizedSculpturePosition,
  };
  const legacyPortraitLayout = {
    customized: cameraCustomPosePortrait,
    cameraPosition: cameraPositionPortrait,
    cameraTarget: cameraTargetPortrait,
    cameraFov: normalizedCameraFov,
    frameInset: DEFAULT_LAYOUT_FRAME_INSETS.portrait,
    boatPosition: normalizedBoatPosition,
    sculpturePosition: normalizedSculpturePosition,
  };
  // Read layouts from the RAW saved blob, not `merged` — defaults always carry a `layouts`
  // object, so merged.layouts would mask a legacy (pre-layouts) settings file and skip migration.
  const incomingLayouts = (savedSettings.layouts && typeof savedSettings.layouts === 'object' && !Array.isArray(savedSettings.layouts))
    ? savedSettings.layouts
    : {};
  // Use a saved bucket only when it was explicitly locked; otherwise (absent OR a stale
  // default-uncustomised bucket) re-migrate from the legacy flat fields so the real
  // composition is never masked by an empty layouts block.
  const resolveBucket = (incoming, legacyLayout) => (
    (incoming && typeof incoming === 'object' && incoming.customized)
      ? pickLayout(incoming, legacyLayout)
      : pickLayout(legacyLayout, legacyLayout)
  );
  const layouts = {
    portrait: resolveBucket(incomingLayouts.portrait, legacyPortraitLayout),
    desktop: resolveBucket(incomingLayouts.desktop, legacyDesktopLayout),
  };

  return {
    waterExtent: clampFloat(merged.waterExtent, 12, 200, defaults.waterExtent),
    simulationResolution: clampResolution(merged.simulationResolution),
    waterMeshDensity: clampInt(merged.waterMeshDensity, 96, 384, defaults.waterMeshDensity),
    waveAmplitude: clampFloat(merged.waveAmplitude, 0, 0.2, defaults.waveAmplitude),
    waveLength: clampFloat(merged.waveLength, 0.4, 3.2, defaults.waveLength),
    waveChoppiness: clampFloat(merged.waveChoppiness, 0, 1.25, defaults.waveChoppiness),
    rippleDamping: clampFloat(merged.rippleDamping, 0.93, 0.992, defaults.rippleDamping),
    rippleRadius: clampFloat(merged.rippleRadius, 0.1, 2.4, defaults.rippleRadius),
    rippleImpulse: clampFloat(merged.rippleImpulse, 0, 1.2, defaults.rippleImpulse),
    normalStrength: clampFloat(merged.normalStrength, 0, 3.2, defaults.normalStrength),
    normalBlur: clampFloat(merged.normalBlur, 0.2, 2.5, defaults.normalBlur),
    hdrPreset: VALID_HDRI_PRESETS.has(merged.hdrPreset) ? merged.hdrPreset : defaults.hdrPreset,
    hdrRotation: clampFloat(merged.hdrRotation, 0, 360, defaults.hdrRotation),
    hdrExposure: clampInt(merged.hdrExposure, 0, 220, defaults.hdrExposure),
    envReflectionIntensity: clampInt(merged.envReflectionIntensity, 0, 220, defaults.envReflectionIntensity),
    envTint: pickColor(merged.envTint, defaults.envTint),
    keyLightType: VALID_LIGHT_TYPES.has(merged.keyLightType) ? merged.keyLightType : defaults.keyLightType,
    lightDiscEnabled: pickBoolean(merged.lightDiscEnabled, defaults.lightDiscEnabled),
    lightDiscSize: clampFloat(merged.lightDiscSize, 0.25, 6, defaults.lightDiscSize),
    moonIntensity: clampFloat(merged.moonIntensity, 0, 4, defaults.moonIntensity),
    moonColor: pickColor(merged.moonColor, defaults.moonColor),
    moonAzimuth: clampFloat(merged.moonAzimuth, 0, 360, defaults.moonAzimuth),
    moonElevation: clampFloat(merged.moonElevation, 0, 85, defaults.moonElevation),
    moonSpecularStrength: clampFloat(merged.moonSpecularStrength, 0, 2, defaults.moonSpecularStrength),
    moonSpecularPower: clampFloat(merged.moonSpecularPower, 4, 128, defaults.moonSpecularPower),
    showHdriBackground: pickBoolean(merged.showHdriBackground, defaults.showHdriBackground),
    shadowsEnabled: pickBoolean(merged.shadowsEnabled, defaults.shadowsEnabled),
    shadowIntensity: clampFloat(merged.shadowIntensity, 0, 1, defaults.shadowIntensity),
    shadowRadius: clampFloat(migratedShadowRadius, 0, 8, defaults.shadowRadius),
    shadowBias: clampFloat(migratedShadowBias, -0.005, 0.005, defaults.shadowBias),
    ambientIntensity: clampFloat(merged.ambientIntensity, 0, 2, defaults.ambientIntensity),
    ambientColor: pickColor(merged.ambientColor, defaults.ambientColor),
    hemisphereIntensity: clampFloat(merged.hemisphereIntensity, 0, 2, defaults.hemisphereIntensity),
    hemisphereSkyColor: pickColor(merged.hemisphereSkyColor, defaults.hemisphereSkyColor),
    hemisphereGroundColor: pickColor(merged.hemisphereGroundColor, defaults.hemisphereGroundColor),
    waterDepthMeters: clampFloat(merged.waterDepthMeters, 0.25, 12, defaults.waterDepthMeters),
    seabedReliefStrength: clampFloat(merged.seabedReliefStrength, 0, 2, defaults.seabedReliefStrength),
    seabedReliefScale: clampFloat(merged.seabedReliefScale, 0.5, 6, defaults.seabedReliefScale),
    causticsIntensity: clampFloat(merged.causticsIntensity, 0, 3, defaults.causticsIntensity),
    causticsScale: clampFloat(merged.causticsScale, 0.5, 6, defaults.causticsScale),
    causticsSharpness: clampFloat(merged.causticsSharpness, 0, 1, defaults.causticsSharpness),
    cameraFov: normalizedCameraFov,
    layouts,
    cameraCustomPose: cameraCustomPoseLandscape,
    cameraPosition: cameraPositionLandscape,
    cameraTarget: cameraTargetLandscape,
    cameraCustomPoseLandscape,
    cameraPositionLandscape,
    cameraTargetLandscape,
    cameraCustomPosePortrait,
    cameraPositionPortrait,
    cameraTargetPortrait,
    debugView: VALID_DEBUG_VIEWS.has(merged.debugView) ? merged.debugView : defaults.debugView,
    boatColor: pickColor(merged.boatColor, defaults.boatColor),
    boatMetalness: clampFloat(merged.boatMetalness, 0, 1, defaults.boatMetalness),
    boatRoughness: clampFloat(merged.boatRoughness, 0, 1, defaults.boatRoughness),
    boatClearcoat: clampFloat(merged.boatClearcoat, 0, 1, defaults.boatClearcoat),
    boatClearcoatRoughness: clampFloat(merged.boatClearcoatRoughness, 0, 1, defaults.boatClearcoatRoughness),
    boatReflectionIntensity: clampFloat(
      merged.boatReflectionIntensity,
      0,
      2,
      defaults.boatReflectionIntensity,
    ),
    boatPosition: normalizedBoatPosition,
    boatYaw: clampFloat(merged.boatYaw, -180, 180, defaults.boatYaw),
    boatScale: clampFloat(merged.boatScale, 0.001, 0.1, defaults.boatScale),
    boatHeightOffset: clampFloat(merged.boatHeightOffset, -0.6, 0.6, defaults.boatHeightOffset),
    boatCutoutFitWidth: clampFloat(merged.boatCutoutFitWidth, 0.1, 1.6, defaults.boatCutoutFitWidth),
    boatCutoutFitLength: clampFloat(merged.boatCutoutFitLength, 0.1, 1.6, defaults.boatCutoutFitLength),
    boatCutoutDebug: pickBoolean(merged.boatCutoutDebug, defaults.boatCutoutDebug),
    sculptureColor: pickColor(merged.sculptureColor, defaults.sculptureColor),
    sculptureMetalness: clampFloat(merged.sculptureMetalness, 0, 1, defaults.sculptureMetalness),
    sculptureRoughness: clampFloat(merged.sculptureRoughness, 0, 1, defaults.sculptureRoughness),
    sculptureClearcoat: clampFloat(merged.sculptureClearcoat, 0, 1, defaults.sculptureClearcoat),
    sculptureClearcoatRoughness: clampFloat(
      merged.sculptureClearcoatRoughness,
      0,
      1,
      defaults.sculptureClearcoatRoughness,
    ),
    sculpturePosition: normalizedSculpturePosition,
    sculptureScale: clampFloat(merged.sculptureScale, 0.005, 0.2, defaults.sculptureScale),
    sculptureRotationX: clampFloat(merged.sculptureRotationX, -180, 180, defaults.sculptureRotationX),
    sculptureRotationY: clampFloat(merged.sculptureRotationY, -180, 180, defaults.sculptureRotationY),
    sculptureRotationZ: clampFloat(merged.sculptureRotationZ, -180, 180, defaults.sculptureRotationZ),
    sculptureBottomOffset: clampFloat(merged.sculptureBottomOffset, -2, 2, defaults.sculptureBottomOffset),
    seabedTextureScale: clampFloat(merged.seabedTextureScale, 0.1, 10.0, defaults.seabedTextureScale),
    seabedSaturation: clampFloat(merged.seabedSaturation, 0, 2, defaults.seabedSaturation),
    seabedBrightness: clampFloat(merged.seabedBrightness, 0, 2, defaults.seabedBrightness),
    waterTurbidity: clampFloat(merged.waterTurbidity, 0, 1, defaults.waterTurbidity),
    waterScatteringStrength: clampFloat(
      merged.waterScatteringStrength,
      0,
      2,
      defaults.waterScatteringStrength,
    ),
    waterScatteringColor: pickColor(merged.waterScatteringColor, defaults.waterScatteringColor),
    seabedVariation: clampFloat(merged.seabedVariation, 0, 1, defaults.seabedVariation),
    seabedAoStrength: clampFloat(merged.seabedAoStrength, 0, 1.5, defaults.seabedAoStrength),
    plantAoStrength: clampFloat(merged.plantAoStrength, 0, 1.5, defaults.plantAoStrength),
    surfacePlantAmount: clampFloat(merged.surfacePlantAmount, 0, 1, defaults.surfacePlantAmount),
    surfacePlantCenterX: clampFloat(merged.surfacePlantCenterX, -40, 40, defaults.surfacePlantCenterX),
    surfacePlantCenterZ: clampFloat(merged.surfacePlantCenterZ, -40, 40, defaults.surfacePlantCenterZ),
    surfacePlantRadius: clampFloat(merged.surfacePlantRadius, 0, 40, defaults.surfacePlantRadius),
    surfacePlantClustering: clampFloat(
      merged.surfacePlantClustering,
      0,
      1,
      defaults.surfacePlantClustering,
    ),
    surfacePlantSize: clampFloat(merged.surfacePlantSize, 0, 0.8, defaults.surfacePlantSize),
    surfacePlantColor: pickColor(merged.surfacePlantColor, defaults.surfacePlantColor),
    surfacePlantSaturation: clampFloat(
      merged.surfacePlantSaturation,
      0,
      2,
      defaults.surfacePlantSaturation,
    ),
    surfacePlantTranslucency: clampFloat(
      merged.surfacePlantTranslucency,
      0,
      1,
      defaults.surfacePlantTranslucency,
    ),
    surfacePlantReflection: clampFloat(
      merged.surfacePlantReflection,
      0,
      1,
      defaults.surfacePlantReflection,
    ),
    underwaterAlgaeAmount: clampFloat(
      merged.underwaterAlgaeAmount,
      0,
      1,
      defaults.underwaterAlgaeAmount,
    ),
    underwaterAlgaeCenterX: clampFloat(
      merged.underwaterAlgaeCenterX,
      -40,
      40,
      defaults.underwaterAlgaeCenterX,
    ),
    underwaterAlgaeCenterZ: clampFloat(
      merged.underwaterAlgaeCenterZ,
      -40,
      40,
      defaults.underwaterAlgaeCenterZ,
    ),
    underwaterAlgaeRadius: clampFloat(
      merged.underwaterAlgaeRadius,
      0,
      40,
      defaults.underwaterAlgaeRadius,
    ),
    underwaterAlgaeLength: clampFloat(
      merged.underwaterAlgaeLength,
      0,
      4,
      defaults.underwaterAlgaeLength,
    ),
    underwaterAlgaeSway: clampFloat(
      merged.underwaterAlgaeSway,
      0,
      1.5,
      defaults.underwaterAlgaeSway,
    ),
    underwaterAlgaeColor: pickColor(merged.underwaterAlgaeColor, defaults.underwaterAlgaeColor),
    underwaterAlgaeSaturation: clampFloat(
      merged.underwaterAlgaeSaturation,
      0,
      2,
      defaults.underwaterAlgaeSaturation,
    ),
    underwaterAlgaeFlowDirection: clampFloat(
      merged.underwaterAlgaeFlowDirection,
      -180,
      180,
      defaults.underwaterAlgaeFlowDirection,
    ),
    underwaterAlgaeFlowStrength: clampFloat(
      merged.underwaterAlgaeFlowStrength,
      0,
      2,
      defaults.underwaterAlgaeFlowStrength,
    ),
    underwaterAlgaeSpeciesMix: clampFloat(
      merged.underwaterAlgaeSpeciesMix,
      0,
      1,
      defaults.underwaterAlgaeSpeciesMix,
    ),
    underwaterAlgaePatchiness: clampFloat(
      merged.underwaterAlgaePatchiness,
      0,
      1,
      defaults.underwaterAlgaePatchiness,
    ),
    postProcessingEnabled: pickBoolean(
      merged.postProcessingEnabled,
      defaults.postProcessingEnabled,
    ),
    filmGrainEnabled: pickBoolean(merged.filmGrainEnabled, defaults.filmGrainEnabled),
    filmGrainIntensity: clampFloat(
      merged.filmGrainIntensity,
      0,
      0.25,
      defaults.filmGrainIntensity,
    ),
    renderScale: clampFloat(merged.renderScale, 0.5, 2, defaults.renderScale),
    uiBrandVisible: pickBoolean(merged.uiBrandVisible, defaults.uiBrandVisible),
    uiSubtitleVisible: pickBoolean(merged.uiSubtitleVisible, defaults.uiSubtitleVisible),
    uiMenuVisible: pickBoolean(merged.uiMenuVisible, defaults.uiMenuVisible),
    uiLanguageVisible: pickBoolean(merged.uiLanguageVisible, defaults.uiLanguageVisible),
    uiSoundVisible: pickBoolean(merged.uiSoundVisible, defaults.uiSoundVisible),
    uiFrameVisible: pickBoolean(merged.uiFrameVisible, defaults.uiFrameVisible),
    filmGrainSize: clampFloat(merged.filmGrainSize, 0.35, 4, defaults.filmGrainSize),
    filmGrainSpeed: clampFloat(merged.filmGrainSpeed, 0, 3, defaults.filmGrainSpeed),
    bloomEnabled: pickBoolean(merged.bloomEnabled, defaults.bloomEnabled),
    bloomStrength: clampFloat(merged.bloomStrength, 0, 2.5, defaults.bloomStrength),
    bloomThreshold: clampFloat(merged.bloomThreshold, 0, 2, defaults.bloomThreshold),
    bloomRadius: clampFloat(merged.bloomRadius, 0, 1, defaults.bloomRadius),
    waterGlintStrength: clampFloat(merged.waterGlintStrength, 0, 2, defaults.waterGlintStrength),
    waterGlintDensity: clampFloat(merged.waterGlintDensity, 0, 1, defaults.waterGlintDensity),
    waterGlintSharpness: clampFloat(merged.waterGlintSharpness, 0, 1, defaults.waterGlintSharpness),
    colorContrast: clampFloat(merged.colorContrast, 0, 2, defaults.colorContrast),
    colorSaturation: clampFloat(merged.colorSaturation, 0, 2, defaults.colorSaturation),
    colorHue: clampFloat(merged.colorHue, -180, 180, defaults.colorHue),
    colorGamma: clampFloat(merged.colorGamma, 0.35, 2.5, defaults.colorGamma),
    colorExposure: clampFloat(merged.colorExposure, -3, 3, defaults.colorExposure),
    sunRaysEnabled: pickBoolean(merged.sunRaysEnabled, defaults.sunRaysEnabled),
    sunRaysIntensity: clampFloat(
      merged.sunRaysIntensity,
      0,
      2,
      defaults.sunRaysIntensity,
    ),
    sunRaysDecay: clampFloat(merged.sunRaysDecay, 0.72, 0.995, defaults.sunRaysDecay),
    sunRaysDensity: clampFloat(merged.sunRaysDensity, 0, 1.5, defaults.sunRaysDensity),
    fogMode: VALID_FOG_MODES.has(merged.fogMode) ? merged.fogMode : defaults.fogMode,
    fogColor: pickColor(merged.fogColor, defaults.fogColor),
    fogDensity: clampFloat(merged.fogDensity, 0, 1, defaults.fogDensity),
    fogNear: clampFloat(merged.fogNear, 0, 100, defaults.fogNear),
    fogFar: clampFloat(merged.fogFar, 0.1, 200, defaults.fogFar),
    fogNoiseScale: clampFloat(merged.fogNoiseScale, 0.1, 12, defaults.fogNoiseScale),
    fogSpeed: clampFloat(merged.fogSpeed, 0, 2, defaults.fogSpeed),
    fogScattering: clampFloat(merged.fogScattering, 0, 2, defaults.fogScattering),
    ambientWaveIntensity: clampFloat(merged.ambientWaveIntensity, 0, 1, defaults.ambientWaveIntensity),
    ambientWaveSpeed: clampFloat(merged.ambientWaveSpeed, 0, 10, defaults.ambientWaveSpeed),
    showPerformanceHud: pickBoolean(merged.showPerformanceHud, defaults.showPerformanceHud),
    showPointerDebug: pickBoolean(merged.showPointerDebug, defaults.showPointerDebug),
  };
};

export const sanitizeHomeSceneSettingsForPublish = (settings = {}) => {
  const normalizedSettings = normalizeHomeSceneSettings(settings);

  return publishedHomeSceneKeys.reduce((accumulator, key) => {
    accumulator[key] = normalizedSettings[key];
    return accumulator;
  }, {});
};

export const getPublishedHomeSceneSettings = () => normalizeHomeSceneSettings(publishedHomeSceneSettings);

export const normalizePublishedHomeSceneSettings = (settings = {}) => normalizeHomeSceneSettings(settings);

export const normalizeHomeSceneDraftSettings = (savedSettings = {}) => normalizeHomeSceneSettings(savedSettings);

function removeLegacyHomeSceneKeys() {
  if (typeof window === 'undefined') {
    return;
  }

  LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  OBSOLETE_PUBLISHED_HOME_SCENE_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function readHomeSceneDraftSettings() {
  if (typeof window === 'undefined') {
    return null;
  }

  const saved = window.localStorage.getItem(HOME_SCENE_SETTINGS_STORAGE_KEY)
    ?? LEGACY_HOME_SCENE_SETTINGS_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find(Boolean);

  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    const hasAppliedWaterDefault = window.localStorage.getItem(
      HOME_SCENE_WATER_DEFAULT_MIGRATION_KEY,
    ) === '1';
    let migrated = !hasAppliedWaterDefault && Number(parsed?.simulationResolution) === 512
      ? { ...parsed, simulationResolution: 128 }
      : parsed;

    // Expand the old single algae tuft into the meadow system once. Presence
    // of the new flow control acts as the schema marker and preserves every
    // subsequent artistic adjustment made by the user.
    if (parsed?.underwaterAlgaeFlowDirection === undefined) {
      const waterExtent = Number(parsed?.waterExtent) || 24;
      migrated = {
        ...migrated,
        underwaterAlgaeRadius: Math.max(
          Number(parsed?.underwaterAlgaeRadius) || 0,
          Math.min(waterExtent * 0.47, 18),
        ),
        underwaterAlgaeSaturation: Math.max(
          Number(parsed?.underwaterAlgaeSaturation) || 0,
          0.72,
        ),
        underwaterAlgaeFlowDirection: 24,
        underwaterAlgaeFlowStrength: 1.1,
        underwaterAlgaeSpeciesMix: 0.68,
        underwaterAlgaePatchiness: 0.42,
        surfacePlantAmount: Math.min(Number(parsed?.surfacePlantAmount) || 0.76, 0.82),
        surfacePlantSize: Math.max(Number(parsed?.surfacePlantSize) || 0, 0.36),
      };
    }

    if (!hasAppliedWaterDefault) {
      window.localStorage.setItem(HOME_SCENE_WATER_DEFAULT_MIGRATION_KEY, '1');
    }

    return normalizeHomeSceneDraftSettings(migrated);
  } catch (error) {
    console.error('Failed to parse home scene draft settings', error);
    return null;
  }
}

export const usePublishedHomeSceneSettings = () => {
  return {
    settings: getPublishedHomeSceneSettings(),
  };
};

export const useHomeSceneDraftSettings = () => {
  const [settings, setSettings] = useState(() => readHomeSceneDraftSettings() ?? getPublishedHomeSceneSettings());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(HOME_SCENE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    removeLegacyHomeSceneKeys();
  }, [settings]);

  return {
    settings,
    setSettings,
  };
};

export const useHomeSceneSettings = useHomeSceneDraftSettings;
