import * as THREE from 'three';
import {
  DEVICE_PERFORMANCE_TIER,
  readRuntimeDevicePerformanceTier,
} from './deviceCapabilityProfile';

// How much of the scene a given device is asked to draw.
//
// Kept out of WaterScene on purpose: it is the part that gets retuned most often,
// and it answers one question - what can this device afford - without touching the
// scene graph or React. The only Three.js it needs is the texture type constants.

export const QUALITY_TIER = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
});

let qualityTierCache = null;

export function detectQualityTier() {
  if (qualityTierCache) {
    return qualityTierCache;
  }

  if (typeof navigator === 'undefined') {
    qualityTierCache = QUALITY_TIER.high;
    return qualityTierCache;
  }

  const tier = readRuntimeDevicePerformanceTier();
  qualityTierCache = tier === DEVICE_PERFORMANCE_TIER.low
    ? QUALITY_TIER.low
    : tier === DEVICE_PERFORMANCE_TIER.medium
      ? QUALITY_TIER.medium
      : QUALITY_TIER.high;
  return qualityTierCache;
}

function isTouchPrimaryDevice() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

// A phone is a small screen, not a lesser version of the scene. Only temporary
// GPU allocations shrink here; flora, fauna and mesh density stay authored.
function trimProfileForMobile(profile, isMobileDevice) {
  if (!isMobileDevice) {
    return profile;
  }

  return {
    ...profile,
    simulationMaxResolution: Math.min(profile.simulationMaxResolution, 256),
    // Every probe tick is a synchronous readback, and a tile GPU flushes the
    // whole pipeline for one. 12 Hz is the floor, not a knob: below it the hold
    // aliases the scene's own 4.79 Hz ambient drive into the hull's band
    // instead of out of it, and the boat reads as delayed animation again.
    boatProbeInterval: Math.max(profile.boatProbeInterval, 1 / 12),
    // The old 256px cap became a visibly blocky 256×92 capture inside the wide
    // film gate. At DPR 2, a 512px long edge keeps refracted reeds and fish
    // coherent while the main canvas saves far more shaded pixels than it costs.
    reflectionTextureSize: 512,
    postSamples: Math.min(profile.postSamples, 2),
    shadowMapSize: Math.min(profile.shadowMapSize, 512),
  };
}

export function applyRenderTargetCapabilities(profile, capabilities) {
  const optics = capabilities?.optics;
  if (!optics || (optics.colorType !== 'half-float' && optics.colorType !== 'rgba8')) {
    return profile;
  }

  const postSupportsHdr = capabilities.post?.halfFloatDepthStencil === true;
  return {
    ...profile,
    // The integration layer can choose a depth renderbuffer when a depth
    // texture is unavailable. Keeping the exact mode here prevents a WebView
    // from being forced into the analytic-depth fallback unnecessarily.
    refractionTextureType: optics.colorType === 'half-float'
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType,
    // A depth renderbuffer keeps the optics pass depth-tested but cannot be
    // sampled by the water shader. Only the texture path enables depth optics;
    // the other modes use the existing analytic-distance fallback.
    refractionDepthEnabled: optics.depthMode === 'texture',
    refractionDepthMode: optics.depthMode,
    postColorType: postSupportsHdr ? 'half-float' : 'rgba8',
    postDepthStencilEnabled: postSupportsHdr || capabilities.post?.rgba8DepthStencil === true,
    postProcessingSupported: postSupportsHdr || capabilities.post?.rgba8DepthStencil === true,
  };
}

export function buildRuntimeQualityProfile(mode, viewportWidth, capabilities = null) {
  const tier = detectQualityTier();
  const isEditor = mode === 'editor';
  // A narrow window is not a weak device. In the editor only a real touch device
  // earns the mobile trim, otherwise resizing the authoring window quietly halved
  // the simulation and the author was judging a downgraded scene.
  const isMobileDevice = isEditor
    ? isTouchPrimaryDevice()
    : (viewportWidth < 768 || isTouchPrimaryDevice());

  if (tier === QUALITY_TIER.low) {
    return applyRenderTargetCapabilities({
      qualityTier: tier,
      isMobileDevice,
      isTouchPrimary: isTouchPrimaryDevice(),
      isLowPower: true,
      simulationTargetFps: isEditor ? 24 : 30,
      simulationMaxResolution: 128,
      // 4/2 fps read as a slideshow rather than as a cheap reflection. Even the
      // weakest tier needs the reflection to move with the water, not step.
      reflectionActiveFps: 20,
      reflectionIdleFps: 10,
      reflectionTextureSize: 160,
      refractionTextureType: THREE.UnsignedByteType,
      refractionDepthEnabled: false,
      postRenderScale: 0.75,
      postSamples: 0,
      waterMeshDensityCap: 104,
      seabedMeshDensity: 96,
      shadowMapSize: 384,
      boatProbeInterval: 1 / 6,
      useGpuBoatProbes: false,
      surfacePlantMaxInstances: 180,
      underwaterAlgaeMaxInstances: 220,
      fishMaxInstances: 14,
      fishBehaviorFps: 15,
    }, capabilities);
  }

  if (tier === QUALITY_TIER.medium) {
    return applyRenderTargetCapabilities(trimProfileForMobile({
      qualityTier: tier,
      isMobileDevice,
      isTouchPrimary: isTouchPrimaryDevice(),
      isLowPower: false,
      simulationTargetFps: isEditor ? 45 : 54,
      simulationMaxResolution: isEditor ? 384 : 512,
      reflectionActiveFps: isEditor ? 30 : 30,
      reflectionIdleFps: isEditor ? 20 : 15,
      reflectionTextureSize: isEditor ? 768 : 384,
      refractionTextureType: THREE.HalfFloatType,
      refractionDepthEnabled: true,
      postRenderScale: 1,
      postSamples: 2,
      waterMeshDensityCap: isEditor ? 224 : 176,
      seabedMeshDensity: 144,
      shadowMapSize: isEditor ? 1024 : 768,
      boatProbeInterval: 1 / 18,
      useGpuBoatProbes: true,
      surfacePlantMaxInstances: 560,
      underwaterAlgaeMaxInstances: 720,
      fishMaxInstances: 30,
      fishBehaviorFps: 24,
    }, isMobileDevice), capabilities);
  }

  return applyRenderTargetCapabilities(trimProfileForMobile({
    qualityTier: tier,
    isMobileDevice,
    isTouchPrimary: isTouchPrimaryDevice(),
    isLowPower: false,
    simulationTargetFps: isEditor ? 50 : 60,
    simulationMaxResolution: 512,
    reflectionActiveFps: isEditor ? 60 : 60,
    reflectionIdleFps: isEditor ? 30 : 20,
    reflectionTextureSize: isEditor ? 1024 : 768,
    refractionTextureType: THREE.HalfFloatType,
    refractionDepthEnabled: true,
    postRenderScale: 1,
    postSamples: 4,
    waterMeshDensityCap: isEditor ? 352 : 224,
    seabedMeshDensity: 176,
    shadowMapSize: isEditor ? 2048 : 1024,
    boatProbeInterval: 1 / 20,
    useGpuBoatProbes: true,
    surfacePlantMaxInstances: 900,
    underwaterAlgaeMaxInstances: 1100,
    fishMaxInstances: 50,
    fishBehaviorFps: 30,
  }, isMobileDevice), capabilities);
}
