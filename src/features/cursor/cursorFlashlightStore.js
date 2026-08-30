const MIN_BEAM_DEGREES = 12;
const MAX_BEAM_DEGREES = 70;
const DEFAULT_BEAM_DEGREES = 34;

let controls = {
  available: false,
  enabled: false,
  beamDegrees: DEFAULT_BEAM_DEGREES,
};

const runtime = {
  enabled: controls.enabled,
  beamDegrees: controls.beamDegrees,
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

export const setCursorFlashlightAvailable = (available) => {
  const nextAvailable = Boolean(available);
  if (nextAvailable === controls.available) {
    return;
  }

  publishControls({
    ...controls,
    available: nextAvailable,
    enabled: nextAvailable ? controls.enabled : false,
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
