import { useEffect, useState } from 'react';
import { publishedHomeSceneSettings } from '../data/publishedHomeSceneSettings';
import { publishedHomeSceneKeys } from '../data/publishedHomeSceneKeys';
import {
  clampLayoutFrameInset,
  DEFAULT_LAYOUT_FRAME_INSETS,
} from '../lib/layout';
import {
  applySceneSnapshot,
  createSceneSnapshot,
  normalizeSceneCameras,
  normalizeSlideshow,
} from '../lib/sceneCameras';

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

export const HOME_SCENE_FILM_STOCKS = [
  { value: 'neutral', labelKey: 'neutral' },
  { value: '35mm', labelKey: '35mm' },
  { value: '16mm', labelKey: '16mm' },
  { value: '8mm', labelKey: '8mm' },
  { value: 'bw', labelKey: 'bw' },
  { value: 'sepia', labelKey: 'sepia' },
  { value: 'faded', labelKey: 'faded' },
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
const MAX_CAMERA_COORDINATE = 1_000_000;

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
const VALID_FILM_STOCKS = new Set(HOME_SCENE_FILM_STOCKS.map((option) => option.value));
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
    x: clampFloat(value.x, -MAX_CAMERA_COORDINATE, MAX_CAMERA_COORDINATE, fallback.x),
    y: clampFloat(value.y, -MAX_CAMERA_COORDINATE, MAX_CAMERA_COORDINATE, fallback.y),
    z: clampFloat(value.z, -MAX_CAMERA_COORDINATE, MAX_CAMERA_COORDINATE, fallback.z),
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
  // Sky + Sun + Moon. The clock drives the sun; bearing stays authored, because
  // the composition was built around a direction rather than a latitude.
  timeOfDay: 12,
  sunBearing: 42,
  sunNoonElevation: 18,
  sunTint: '#fff5ea',
  sunIntensity: 1.6,
  sunAngularSize: 1,
  skyTurbidity: 2.6,
  cloudCover: 0,
  moonPhase: 0.5,
  moonBrightness: 1,
  envMode: 'sky',
  hdriIntensity: 1,
  showHdriBackground: false,
  shadowsEnabled: true,
  shadowIntensity: 1,
  shadowRadius: 3,
  // Two light objects. Flat keys rather than an array: publishing, clamping and
  // the smoke test's key coverage all stay simple, and two is the cap the frame
  // budget allows anyway (they never cast shadows).
  light1Enabled: false,
  light1Color: '#ffd9a0',
  light1Intensity: 12,
  light1X: 3,
  light1Y: 2.5,
  light1Z: -2,
  light1TargetX: 0,
  light1TargetY: 0,
  light1TargetZ: 0,
  light1ConeAngle: 38,
  light1Softness: 0.4,
  light1SourceVisible: true,
  light1InReflections: true,
  light2Enabled: false,
  light2Color: '#ffd9a0',
  light2Intensity: 12,
  light2X: 3,
  light2Y: 2.5,
  light2Z: -2,
  light2TargetX: 0,
  light2TargetY: 0,
  light2TargetZ: 0,
  light2ConeAngle: 38,
  light2Softness: 0.4,
  light2SourceVisible: true,
  light2InReflections: true,
  // How much of the water's own scattered light a shadow may take. Separate
  // from surface shadowing because murky water is where it reads at all.
  waterShadowStrength: 1,
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
  // How far the pad rides above the water it samples. Small, but it is what
  // keeps a leaf off the surface instead of inside it.
  surfacePlantFloatOffset: 0.022,
  // 0 = the pad takes the shape of the wave and is never washed over;
  // 1 = a flat disc tangent to the wave, whose edge a short wave laps over.
  surfacePlantStiffness: 0.3,
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
  // Show flags: what the scene draws at all. Every other control shapes a part
  // that is already on, so these live together instead of one per section.
  waterVisible: true,
  seabedVisible: true,
  liliesVisible: true,
  algaeVisible: true,
  boatVisible: true,
  sculptureVisible: true,
  reflectionsEnabled: true,
  postProcessingEnabled: true,
  filmEnabled: false,
  filmStock: '16mm',
  filmGrainAmount: 0.28,
  filmGrainSize: 1.05,
  filmDustAmount: 0.04,
  filmScratchAmount: 0.025,
  filmFlickerAmount: 0.018,
  filmFlickerRate: 7,
  filmGateWeaveAmount: 0.18,
  filmGateWeaveRate: 5,
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
  freeCamera: false,
  debugWireframe: false,
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

const migrateLegacyFilmSettings = (savedSettings, defaults) => {
  if (!savedSettings || typeof savedSettings !== 'object' || Array.isArray(savedSettings)) {
    return {};
  }

  const hasModernFilmSettings = [
    'filmEnabled',
    'filmStock',
    'filmGrainAmount',
    'filmDustAmount',
    'filmScratchAmount',
    'filmFlickerAmount',
    'filmFlickerRate',
    'filmGateWeaveAmount',
    'filmGateWeaveRate',
  ].some((key) => Object.prototype.hasOwnProperty.call(savedSettings, key));
  const hasLegacyGrainSettings = [
    'filmGrainEnabled',
    'filmGrainIntensity',
    'filmGrainSize',
    'filmGrainSpeed',
  ].some((key) => Object.prototype.hasOwnProperty.call(savedSettings, key));

  if (hasModernFilmSettings || !hasLegacyGrainSettings) {
    return {};
  }

  return {
    filmEnabled: pickBoolean(savedSettings.filmGrainEnabled, defaults.filmEnabled),
    filmStock: defaults.filmStock,
    filmGrainAmount: clampFloat(
      Number(savedSettings.filmGrainIntensity) / 0.25,
      0,
      1,
      defaults.filmGrainAmount,
    ),
    filmGrainSize: clampFloat(
      savedSettings.filmGrainSize,
      0.45,
      3,
      defaults.filmGrainSize,
    ),
  };
};

const normalizeHomeSceneSettings = (savedSettings = {}, includeCameraSystem = true) => {
  const defaults = getBaseHomeSceneSettings();
  const legacy = normalizeLegacySettings(savedSettings, defaults);
  const legacyFilm = migrateLegacyFilmSettings(savedSettings, defaults);
  const merged = {
    ...defaults,
    ...legacy,
    ...legacyFilm,
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

  const normalizedScene = {
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
    // The sun arc replaces the raw azimuth/elevation pair. Legacy drafts carry
    // the old names, so the bearing and the noon height migrate out of them and
    // a scene authored before the clock existed opens exactly where it was.
    timeOfDay: clampFloat(merged.timeOfDay, 0, 24, defaults.timeOfDay),
    sunBearing: clampFloat(
      merged.sunBearing ?? merged.moonAzimuth,
      0,
      360,
      defaults.sunBearing,
    ),
    sunNoonElevation: clampFloat(
      merged.sunNoonElevation ?? merged.moonElevation,
      0,
      85,
      defaults.sunNoonElevation,
    ),
    sunTint: pickColor(merged.sunTint, defaults.sunTint),
    sunIntensity: clampFloat(
      merged.sunIntensity ?? merged.moonIntensity,
      0,
      8,
      defaults.sunIntensity,
    ),
    sunAngularSize: clampFloat(merged.sunAngularSize, 0.2, 6, defaults.sunAngularSize),
    skyTurbidity: clampFloat(merged.skyTurbidity, 1, 10, defaults.skyTurbidity),
    cloudCover: clampFloat(merged.cloudCover, 0, 1, defaults.cloudCover),
    moonPhase: clampFloat(merged.moonPhase, 0, 1, defaults.moonPhase),
    moonBrightness: clampFloat(merged.moonBrightness, 0, 4, defaults.moonBrightness),
    envMode: ['sky', 'sky+hdri', 'hdri'].includes(merged.envMode)
      ? merged.envMode
      : defaults.envMode,
    hdriIntensity: clampFloat(merged.hdriIntensity, 0, 2, defaults.hdriIntensity),
    showHdriBackground: pickBoolean(merged.showHdriBackground, defaults.showHdriBackground),
    shadowsEnabled: pickBoolean(merged.shadowsEnabled, defaults.shadowsEnabled),
    shadowIntensity: clampFloat(merged.shadowIntensity, 0, 1, defaults.shadowIntensity),
    shadowRadius: clampFloat(migratedShadowRadius, 0, 8, defaults.shadowRadius),
    light1Enabled: pickBoolean(merged.light1Enabled, defaults.light1Enabled),
    light1Color: pickColor(merged.light1Color, defaults.light1Color),
    light1Intensity: clampFloat(merged.light1Intensity, 0, 200, defaults.light1Intensity),
    light1X: clampFloat(merged.light1X, -40, 40, defaults.light1X),
    light1Y: clampFloat(merged.light1Y, -10, 40, defaults.light1Y),
    light1Z: clampFloat(merged.light1Z, -40, 40, defaults.light1Z),
    light1TargetX: clampFloat(merged.light1TargetX, -40, 40, defaults.light1TargetX),
    light1TargetY: clampFloat(merged.light1TargetY, -10, 40, defaults.light1TargetY),
    light1TargetZ: clampFloat(merged.light1TargetZ, -40, 40, defaults.light1TargetZ),
    light1ConeAngle: clampFloat(merged.light1ConeAngle, 4, 180, defaults.light1ConeAngle),
    light1Softness: clampFloat(merged.light1Softness, 0, 1, defaults.light1Softness),
    light1SourceVisible: pickBoolean(merged.light1SourceVisible, defaults.light1SourceVisible),
    light1InReflections: pickBoolean(merged.light1InReflections, defaults.light1InReflections),
    light2Enabled: pickBoolean(merged.light2Enabled, defaults.light2Enabled),
    light2Color: pickColor(merged.light2Color, defaults.light2Color),
    light2Intensity: clampFloat(merged.light2Intensity, 0, 200, defaults.light2Intensity),
    light2X: clampFloat(merged.light2X, -40, 40, defaults.light2X),
    light2Y: clampFloat(merged.light2Y, -10, 40, defaults.light2Y),
    light2Z: clampFloat(merged.light2Z, -40, 40, defaults.light2Z),
    light2TargetX: clampFloat(merged.light2TargetX, -40, 40, defaults.light2TargetX),
    light2TargetY: clampFloat(merged.light2TargetY, -10, 40, defaults.light2TargetY),
    light2TargetZ: clampFloat(merged.light2TargetZ, -40, 40, defaults.light2TargetZ),
    light2ConeAngle: clampFloat(merged.light2ConeAngle, 4, 180, defaults.light2ConeAngle),
    light2Softness: clampFloat(merged.light2Softness, 0, 1, defaults.light2Softness),
    light2SourceVisible: pickBoolean(merged.light2SourceVisible, defaults.light2SourceVisible),
    light2InReflections: pickBoolean(merged.light2InReflections, defaults.light2InReflections),
    waterShadowStrength: clampFloat(merged.waterShadowStrength, 0, 1, defaults.waterShadowStrength),
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
    surfacePlantFloatOffset: clampFloat(merged.surfacePlantFloatOffset, -0.05, 0.2, defaults.surfacePlantFloatOffset),
    surfacePlantStiffness: clampFloat(merged.surfacePlantStiffness, 0, 1, defaults.surfacePlantStiffness),
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
    waterVisible: pickBoolean(merged.waterVisible, defaults.waterVisible),
    seabedVisible: pickBoolean(merged.seabedVisible, defaults.seabedVisible),
    liliesVisible: pickBoolean(merged.liliesVisible, defaults.liliesVisible),
    algaeVisible: pickBoolean(merged.algaeVisible, defaults.algaeVisible),
    boatVisible: pickBoolean(merged.boatVisible, defaults.boatVisible),
    sculptureVisible: pickBoolean(merged.sculptureVisible, defaults.sculptureVisible),
    reflectionsEnabled: pickBoolean(merged.reflectionsEnabled, defaults.reflectionsEnabled),
    postProcessingEnabled: pickBoolean(
      merged.postProcessingEnabled,
      defaults.postProcessingEnabled,
    ),
    filmEnabled: pickBoolean(merged.filmEnabled, defaults.filmEnabled),
    filmStock: VALID_FILM_STOCKS.has(merged.filmStock)
      ? merged.filmStock
      : defaults.filmStock,
    filmGrainAmount: clampFloat(merged.filmGrainAmount, 0, 1, defaults.filmGrainAmount),
    filmGrainSize: clampFloat(merged.filmGrainSize, 0.45, 3, defaults.filmGrainSize),
    filmDustAmount: clampFloat(merged.filmDustAmount, 0, 1, defaults.filmDustAmount),
    filmScratchAmount: clampFloat(
      merged.filmScratchAmount,
      0,
      1,
      defaults.filmScratchAmount,
    ),
    filmFlickerAmount: clampFloat(
      merged.filmFlickerAmount,
      0,
      0.2,
      defaults.filmFlickerAmount,
    ),
    filmFlickerRate: clampFloat(
      merged.filmFlickerRate,
      0.5,
      24,
      defaults.filmFlickerRate,
    ),
    filmGateWeaveAmount: clampFloat(
      merged.filmGateWeaveAmount,
      0,
      2,
      defaults.filmGateWeaveAmount,
    ),
    filmGateWeaveRate: clampFloat(
      merged.filmGateWeaveRate,
      0.25,
      12,
      defaults.filmGateWeaveRate,
    ),
    renderScale: clampFloat(merged.renderScale, 0.5, 2, defaults.renderScale),
    uiBrandVisible: pickBoolean(merged.uiBrandVisible, defaults.uiBrandVisible),
    uiSubtitleVisible: pickBoolean(merged.uiSubtitleVisible, defaults.uiSubtitleVisible),
    uiMenuVisible: pickBoolean(merged.uiMenuVisible, defaults.uiMenuVisible),
    uiLanguageVisible: pickBoolean(merged.uiLanguageVisible, defaults.uiLanguageVisible),
    uiSoundVisible: pickBoolean(merged.uiSoundVisible, defaults.uiSoundVisible),
    uiFrameVisible: pickBoolean(merged.uiFrameVisible, defaults.uiFrameVisible),
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
    freeCamera: pickBoolean(merged.freeCamera, defaults.freeCamera),
    debugWireframe: pickBoolean(merged.debugWireframe, defaults.debugWireframe),
  };

  if (!includeCameraSystem) {
    return normalizedScene;
  }

  const fallbackScene = createSceneSnapshot(normalizedScene, publishedHomeSceneKeys);
  const normalizeSnapshot = (snapshot, fallback = fallbackScene) => {
    const migratedFilm = migrateLegacyFilmSettings(snapshot, fallback);

    return createSceneSnapshot(
      normalizeHomeSceneSettings({ ...fallback, ...migratedFilm, ...snapshot }, false),
      publishedHomeSceneKeys,
    );
  };
  const sceneCameras = normalizeSceneCameras(
    savedSettings.sceneCameras,
    fallbackScene,
    normalizeSnapshot,
  );
  const requestedActiveCameraId = typeof savedSettings.activeCameraId === 'string'
    ? savedSettings.activeCameraId
    : '';
  const activeCameraId = sceneCameras.some((camera) => camera.id === requestedActiveCameraId)
    ? requestedActiveCameraId
    : sceneCameras[0].id;

  return {
    ...normalizedScene,
    sceneCameras,
    slideshow: normalizeSlideshow(savedSettings.slideshow),
    activeCameraId,
  };
};

export const HOME_SCENE_SNAPSHOT_KEYS = Object.freeze(
  publishedHomeSceneKeys.filter((key) => key !== 'sceneCameras' && key !== 'slideshow'),
);

export const createHomeSceneSnapshot = (settings = {}) => (
  createSceneSnapshot(settings, HOME_SCENE_SNAPSHOT_KEYS)
);

export const applyHomeSceneSnapshot = (settings = {}, snapshot = {}) => (
  applySceneSnapshot(settings, snapshot)
);

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
