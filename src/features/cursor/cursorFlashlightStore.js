const MIN_BEAM_DEGREES = 12;
const MAX_BEAM_DEGREES = 70;
const DEFAULT_BEAM_DEGREES = 34;
const DEFAULT_POINT_SIZE = 6;
const DEFAULT_LIGHT_INTENSITY = 1;
const DEFAULT_LIGHT_SOFTNESS = 0.72;

const clamp = (value, min, max, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(max, Math.max(min, numericValue))
    : fallback;
};

let configuredBeamDegrees = DEFAULT_BEAM_DEGREES;

let controls = {
  available: false,
  enabled: false,
  cursorEnabled: true,
  pointSize: DEFAULT_POINT_SIZE,
  lightDefaultEnabled: true,
  beamDegrees: DEFAULT_BEAM_DEGREES,
  lightIntensity: DEFAULT_LIGHT_INTENSITY,
  lightSoftness: DEFAULT_LIGHT_SOFTNESS,
};

const runtime = {
  enabled: controls.enabled,
  beamDegrees: controls.beamDegrees,
  lightIntensity: controls.lightIntensity,
  lightSoftness: controls.lightSoftness,
  clientX: -100,
  clientY: -100,
  pointerInsideFrame: false,
};

// Mutable world-space data is written by CursorSpotlight before the optics
// passes and read by the hand-written water and vegetation shaders afterwards.
// Keeping it outside React avoids rerendering the page for every pointer frame.
const worldRuntime = {
  active: false,
  sourceX: 0,
  sourceY: 0,
  sourceZ: 0,
  directionX: 0,
  directionY: -1,
  directionZ: 0,
  intensity: 0,
  range: 1,
  innerCos: 1,
  outerCos: 1,
  hitsWater: false,
};

const listeners = new Set();

const publishControls = (nextControls) => {
  controls = nextControls;
  runtime.enabled = nextControls.enabled;
  runtime.beamDegrees = nextControls.beamDegrees;
  runtime.lightIntensity = nextControls.lightIntensity;
  runtime.lightSoftness = nextControls.lightSoftness;
  if (!nextControls.enabled) {
    worldRuntime.active = false;
  }
  listeners.forEach((listener) => listener());
};

export const getCursorFlashlightSnapshot = () => controls;
export const getCursorFlashlightServerSnapshot = () => controls;
export const getCursorFlashlightRuntime = () => runtime;
export const getCursorFlashlightWorldRuntime = () => worldRuntime;

export const subscribeToCursorFlashlight = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const syncCursorFlashlightConfiguration = (settings = {}) => {
  const cursorEnabled = settings.cursorEnabled !== false;
  const pointSize = clamp(settings.cursorPointSize, 3, 12, DEFAULT_POINT_SIZE);
  const lightDefaultEnabled = settings.cursorLightEnabled !== false;
  const nextConfiguredBeamDegrees = clamp(
    settings.cursorLightBeamAngle,
    MIN_BEAM_DEGREES,
    MAX_BEAM_DEGREES,
    DEFAULT_BEAM_DEGREES,
  );
  const lightIntensity = clamp(
    settings.cursorLightIntensity,
    0,
    2,
    DEFAULT_LIGHT_INTENSITY,
  );
  const lightSoftness = clamp(
    settings.cursorLightSoftness,
    0,
    1,
    DEFAULT_LIGHT_SOFTNESS,
  );
  const defaultEnabledChanged = lightDefaultEnabled !== controls.lightDefaultEnabled;
  const configuredBeamChanged = nextConfiguredBeamDegrees !== configuredBeamDegrees;
  const nextControls = {
    ...controls,
    cursorEnabled,
    pointSize,
    lightDefaultEnabled,
    beamDegrees: configuredBeamChanged ? nextConfiguredBeamDegrees : controls.beamDegrees,
    enabled: defaultEnabledChanged ? lightDefaultEnabled : controls.enabled,
    lightIntensity,
    lightSoftness,
  };

  configuredBeamDegrees = nextConfiguredBeamDegrees;
  const unchanged = Object.keys(nextControls).every((key) => nextControls[key] === controls[key]);
  if (!unchanged) {
    publishControls(nextControls);
  }
};

export const setCursorFlashlightAvailable = (available) => {
  const nextAvailable = Boolean(available);
  if (nextAvailable === controls.available) {
    return;
  }

  publishControls({
    ...controls,
    available: nextAvailable,
    enabled: nextAvailable ? controls.lightDefaultEnabled : false,
  });
};

export const setCursorFlashlightEnabled = (enabled) => {
  const nextEnabled = Boolean(enabled);
  if (nextEnabled === controls.enabled) {
    return;
  }

  publishControls({ ...controls, enabled: nextEnabled });
};

export const toggleCursorFlashlight = () => {
  publishControls({ ...controls, enabled: !controls.enabled });
};

export const adjustCursorFlashlightBeam = (wheelDelta) => {
  const direction = Math.sign(wheelDelta);
  if (direction === 0) {
    return;
  }

  const beamDegrees = Math.min(
    MAX_BEAM_DEGREES,
    Math.max(MIN_BEAM_DEGREES, controls.beamDegrees + (direction * 3)),
  );

  if (beamDegrees === controls.beamDegrees) {
    return;
  }

  publishControls({ ...controls, beamDegrees });
};

export const updateCursorFlashlightPointer = (clientX, clientY, pointerInsideFrame) => {
  runtime.clientX = clientX;
  runtime.clientY = clientY;
  runtime.pointerInsideFrame = Boolean(pointerInsideFrame);
};

export const hideCursorFlashlight = () => {
  runtime.pointerInsideFrame = false;
  worldRuntime.active = false;
};

export const updateCursorFlashlightWorldRuntime = ({
  source,
  direction,
  intensity,
  range,
  innerCos,
  outerCos,
  hitsWater,
}) => {
  worldRuntime.active = true;
  worldRuntime.sourceX = source.x;
  worldRuntime.sourceY = source.y;
  worldRuntime.sourceZ = source.z;
  worldRuntime.directionX = direction.x;
  worldRuntime.directionY = direction.y;
  worldRuntime.directionZ = direction.z;
  worldRuntime.intensity = intensity;
  worldRuntime.range = range;
  worldRuntime.innerCos = innerCos;
  worldRuntime.outerCos = outerCos;
  worldRuntime.hitsWater = Boolean(hitsWater);
};

export const resetCursorFlashlightWorldRuntime = () => {
  worldRuntime.active = false;
  worldRuntime.hitsWater = false;
};
