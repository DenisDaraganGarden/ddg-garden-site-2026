// A small, renderer-agnostic lighting contract for the home scene.
//
// Keep this module free of React and Three.js so material factories, shader
// uniform adapters and tests can all consume the exact same authored light.
// Values are plain arrays/numbers: `linear` colours are ready for GLSL.

import {
  SKY,
  buildHomeSceneLightDirection,
  solveMoonElevationAzimuth,
  solveNightWeight,
  solveSunElevationAzimuth,
} from './sky/skyModel.js';

// Re-exported so existing importers keep working; the formula itself now lives
// beside the sun path that has to agree with it.
export { buildHomeSceneLightDirection };

const DEG_TO_RAD = Math.PI / 180;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const finiteNumber = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeHex = (value, fallback) => (
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
);

const srgbChannelToLinear = (channel) => (
  channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
);

export const hexToLightingColor = (value, fallback = '#ffffff') => {
  const hex = normalizeHex(value, fallback);
  const srgb = [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];

  return {
    hex,
    srgb,
    linear: srgb.map(srgbChannelToLinear),
  };
};

// These are deliberately broad palette anchors, not a replacement for a PMREM.
// Custom shaders use them as a cheap shared IBL proxy while standard materials
// continue to receive the real HDR environment from drei's <Environment>.
export const HOME_SCENE_HDRI_PALETTES = Object.freeze({
  night: Object.freeze({
    horizon: '#31445b',
    zenith: '#070c18',
    ambient: '#1c2c42',
    scattering: '#4d7180',
  }),
  dawn: Object.freeze({
    horizon: '#bd8b75',
    zenith: '#26364e',
    ambient: '#695d67',
    scattering: '#d8a47d',
  }),
  sunset: Object.freeze({
    horizon: '#d88f63',
    zenith: '#273044',
    ambient: '#71545a',
    scattering: '#efb36c',
  }),
  city: Object.freeze({
    horizon: '#788da2',
    zenith: '#18202c',
    ambient: '#4b5b70',
    scattering: '#b9c7d6',
  }),
  warehouse: Object.freeze({
    horizon: '#8a8276',
    zenith: '#242321',
    ambient: '#5d5952',
    scattering: '#c6bda7',
  }),
  studio: Object.freeze({
    horizon: '#c7d0d7',
    zenith: '#4c5660',
    ambient: '#9ba6ad',
    scattering: '#e5edf2',
  }),
});

const DEFAULT_HDRI_PALETTE = HOME_SCENE_HDRI_PALETTES.night;


const scaleColor = (color, scalar) => color.map((value) => value * scalar);
const mixColor = (left, right, ratio) => left.map(
  (value, index) => value + (right[index] - value) * ratio,
);

/**
 * Converts persisted editor settings into one shared lighting vocabulary.
 * Existing `moon*` field names are intentionally accepted until the editor
 * migrates to neutral `keyLight*` names.
 */
export const buildHomeSceneLighting = (settings = {}) => {
  const preset = HOME_SCENE_HDRI_PALETTES[settings.hdrPreset] ?? DEFAULT_HDRI_PALETTE;
  const exposure = clamp(finiteNumber(settings.hdrExposure, 64) / 100, 0, 2.2);
  const reflection = clamp(finiteNumber(settings.envReflectionIntensity, 84) / 100, 0, 2.2);
  const keyIntensity = clamp(finiteNumber(settings.moonIntensity, 0.95), 0, 4);
  const keyColor = hexToLightingColor(settings.moonColor, '#d9e4ff');
  const horizon = hexToLightingColor(preset.horizon);
  const zenith = hexToLightingColor(preset.zenith);
  const ambient = hexToLightingColor(preset.ambient);
  const scattering = hexToLightingColor(preset.scattering);
  const authoredScattering = hexToLightingColor(
    settings.waterScatteringColor,
    preset.scattering,
  );
  const waterTint = hexToLightingColor(settings.envTint, '#6b7484');
  const turbidity = clamp(finiteNumber(settings.waterTurbidity, 0), 0, 1);
  const keyLightType = settings.keyLightType === 'moon' ? 'moon' : 'sun';
  const direction = buildHomeSceneLightDirection(settings.moonAzimuth, settings.moonElevation);
  const ambientIntensity = clamp(
    finiteNumber(settings.ambientIntensity, 0.11)
      + finiteNumber(settings.hemisphereIntensity, 0.26) * 0.5,
    0,
    2,
  );

  // Phase 1 derives the sun arc from the existing authored pair, so the frame is
  // unchanged: at noon the arc returns exactly the azimuth and elevation that
  // were authored. Phase 2 replaces these with a real clock.
  const timeOfDay = finiteNumber(settings.timeOfDay, 12);
  const sunBearing = finiteNumber(settings.sunBearing, finiteNumber(settings.moonAzimuth, 42));
  const sunNoonElevation = finiteNumber(
    settings.sunNoonElevation,
    finiteNumber(settings.moonElevation, 18),
  );
  const sun = solveSunElevationAzimuth(timeOfDay, sunBearing, sunNoonElevation);
  const moon = solveMoonElevationAzimuth(
    timeOfDay,
    sunBearing,
    sunNoonElevation,
    finiteNumber(settings.moonPhase, 0.5),
  );
  const night = solveNightWeight(sun.elevationDeg);
  const sunDirection = buildHomeSceneLightDirection(sun.azimuthDeg, sun.elevationDeg);
  const moonDirection = buildHomeSceneLightDirection(moon.azimuthDeg, moon.elevationDeg);
  const skyKeyDirection = [
    sunDirection[0] + (moonDirection[0] - sunDirection[0]) * night,
    sunDirection[1] + (moonDirection[1] - sunDirection[1]) * night,
    sunDirection[2] + (moonDirection[2] - sunDirection[2]) * night,
  ];
  const keyRadiance = scaleColor(keyColor.linear, keyIntensity);
  const cloudCover = clamp(finiteNumber(settings.cloudCover, 0), 0, 1);
  const sunAngularSize = clamp(finiteNumber(settings.sunAngularSize, 1), 0.2, 6);

  return {
    key: {
      type: keyLightType,
      direction,
      color: keyColor,
      intensity: keyIntensity,
      radiance: scaleColor(keyColor.linear, keyIntensity),
    },
    environment: {
      preset: settings.hdrPreset in HOME_SCENE_HDRI_PALETTES ? settings.hdrPreset : 'night',
      rotationRadians: (finiteNumber(settings.hdrRotation, 210) * Math.PI) / 180,
      exposure,
      reflection,
      horizon,
      zenith,
      ambient,
      ambientIntensity,
      // This is the uniform-friendly IBL proxy for custom shaders.
      diffuseIrradiance: scaleColor(ambient.linear, exposure * ambientIntensity),
      specularRadiance: scaleColor(horizon.linear, exposure * reflection),
    },
    sky: {
      // Everything the sky needs, in one place, so the visible sky, the sky the
      // water reflects and the image-based fill are the same sky by construction.
      keyDirection: skyKeyDirection,
      keyRadiance,
      skyTurbidity: clamp(finiteNumber(settings.skyTurbidity, 2.6), 1, 10),
      cloudCover,
      groundAlbedo: [0.08, 0.09, 0.07],
      // A real solar disc is 0.53 deg across; the slider scales that, and the
      // same number drives the glow falloff so a bigger disc is also a softer one.
      keyCosRadius: Math.cos(
        ((SKY.sunAngularSizeDeg * sunAngularSize) * 0.5) * DEG_TO_RAD,
      ),
      keyGlowPower: 2000 + (12 - 2000) * cloudCover,
      keyGlowStrength: 0.35,
      discRadiance: scaleColor(keyRadiance, SKY.discGain),
      night,
      sunElevationDeg: sun.elevationDeg,
      moonIllumination: moon.illumination,
    },
    water: {
      tint: waterTint,
      turbidity,
      // A physically plausible cheap single-scattering tint: HDRI supplies the
      // base colour while the direct key slightly warms/cools its forward lobe.
      scatteringColor: scaleColor(
        mixColor(authoredScattering.linear, scattering.linear, 0.32),
        exposure,
      ),
      scatteringKeyColor: scaleColor(keyColor.linear, keyIntensity),
      scatteringDensity: turbidity * (0.45 + turbidity * 0.55),
      absorptionColor: [0.13, 0.055, 0.018].map((value) => value * turbidity),
    },
  };
};
